import { randomUUID, createHash } from 'node:crypto';
import type * as fsPromises from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import { GoneException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { getEnvironment } from '#config/environment.config.js';
import type { Environment } from '#config/environment.config.js';
import * as schema from '#database/schema.js';
import type { Database } from '#database/owner-lock.js';
import { readOwnerUsage, withOwnerLock } from '#database/owner-lock.js';
import type { DatabaseService } from '#database/database.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { assertProjectActive } from '#database/project-lifecycle.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { requestProjectDeletion, completeProjectDeletion } from '#api/projects/project-deletion.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { purgeDeletedProject, projectPurgeObjectBound } from '#api/git/maintenance/project-purge.js';
import { purgeTombstonedTenants } from '#api/git/maintenance/purge.js';
import { restoreRepository } from '#api/git/maintenance/restore.js';
import { createDeletionDatabase } from '#testing/project-deletion.fixture.js';

const planWrites = vi.hoisted(() => ({ calls: 0, lines: 0, maxLines: 0, maxBytes: 0 }));
vi.mock('node:fs/promises', async (original) => {
  const filesystem = await original<typeof fsPromises>();
  return {
    ...filesystem,
    appendFile: async (...args: Parameters<typeof filesystem.appendFile>) => {
      const [file, body] = args;
      if (typeof file === 'string' && file.endsWith('/keys.jsonl') && typeof body === 'string') {
        const lines = body.split('\n').length - 1;
        planWrites.calls += 1;
        planWrites.lines += lines;
        planWrites.maxLines = Math.max(planWrites.maxLines, lines);
        planWrites.maxBytes = Math.max(planWrites.maxBytes, Buffer.byteLength(body));
      }
      await filesystem.appendFile(...args);
    },
  };
});

/** Explicit owned containers only; retain fixture databases and bytes as acceptance evidence. */
describe.skipIf(!process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER'])('project purge and account closure', () => {
  let client: postgres.Sql | undefined;
  let database: Database;
  let databaseUrl: string;
  let driver: ObjectStorageService;
  let store: S3RepositoryStore;
  const fencedAt = new Date('2026-08-01T00:00:00Z');
  const at = new Date('2026-10-01T00:00:00Z');
  beforeAll(async () => {
    const environment = getEnvironment();
    if (
      !environment.TAU_S3_BUCKET.startsWith('tau-staging-conformance-cpd-storage-') ||
      !environment.TAU_S3_PRIVATE_BUCKET.startsWith('tau-staging-conformance-cpd-storage-')
    ) {
      throw new Error('Storage acceptance requires its owned buckets');
    }
    const fixture = await createDeletionDatabase();
    client = fixture.client;
    database = fixture.database;
    databaseUrl = fixture.url;
    driver = new ObjectStorageService(new ConfigService<Environment, true>(environment));
    store = new S3RepositoryStore(driver);
  });
  afterAll(async () => {
    await client?.end();
  });

  const seed = async () => {
    const suffix = randomUUID();
    const ownerId = `storage-owner-${suffix}`;
    const projectId = `storage-project-${suffix}`;
    await database
      .insert(schema.user)
      .values({ id: ownerId, name: 'Storage acceptance', email: `${suffix}@test.invalid` });
    await database.insert(schema.project).values({ id: projectId, ownerId, name: 'Disposable storage project' });
    await database.insert(schema.projectGit).values({ projectId, storageBytes: 50, lfsBytes: 20 });
    return repositoryLocator({ ownerId, projectId });
  };
  const putPack = async (locator: ReturnType<typeof repositoryLocator>, key = 'packs/fixture.pack') => {
    const body = new Uint8Array([1, 2, 3]);
    await store.putObject(locator, key, body, {
      contentLength: body.byteLength,
      sha256: createHash('sha256').update(body).digest('base64'),
    });
  };
  const intent = async (locator: ReturnType<typeof repositoryLocator>) => {
    await requestProjectDeletion({ database, projectId: locator.projectId, userId: locator.ownerId, enabled: true });
    await completeProjectDeletion({ database, store, projectId: locator.projectId, at: fencedAt });
  };
  const receipt = async (projectId: string) =>
    database.query.projectDeletion.findFirst({ where: eq(schema.projectDeletion.projectId, projectId) });

  it('should defer account purge until captured work survives cascade, then keep both permanent fences and shared bytes', async () => {
    const locator = await seed();
    const neighbor = await seed();
    const publicationId = `publication-${randomUUID()}`;
    const manifestKey = `publications/${publicationId}/${'a'.repeat(40)}.json`;
    const digest = createHash('sha256').update(randomUUID()).digest('hex');
    await database.insert(schema.publication).values({
      id: publicationId,
      projectId: locator.projectId,
      ownerId: locator.ownerId,
      tag: 'v1',
      revisionId: 'a'.repeat(40),
      visibility: 'private',
      manifestKey,
      runtimePin: '0.1.0',
      kernels: [],
      entryPath: 'main.ts',
      title: 'Captured',
      ownerSnapshot: { id: locator.ownerId, name: 'Owner' },
      thumbnailKey: 'defaults/thumb.webp',
    });
    await driver.putBlob({
      namespace: 'derivatives',
      key: manifestKey,
      tier: 'private',
      contentType: 'application/json',
      body: new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          projectId: locator.projectId,
          entryPath: 'main.ts',
          files: { 'main.ts': `sha256:${digest}`, 'copy.ts': `sha256:${digest}` },
          kernels: [],
          runtime: '@taucad/runtime@0.1.0',
          parameters: {},
          createdAt: fencedAt.toISOString(),
        }),
      ),
    });
    await database.insert(schema.blobRef).values({ sha256: digest, refcount: 3, sizeBytes: 3n });
    await driver.putBlob({
      namespace: 'blobs',
      key: `sha256/${digest}`,
      tier: 'private',
      contentType: 'application/octet-stream',
      body: new Uint8Array([1, 2, 3]),
    });
    await putPack(locator);
    await putPack(locator, 'packs/second.pack');
    await putPack(locator, 'packs/third.pack');
    await putPack(neighbor);
    for (const target of [
      { namespace: 'tenants', key: tenantLfsObjectKey(locator.ownerId, locator.projectId, digest) },
      { namespace: 'blobs', key: gitLfsObjectKey(locator.projectId, digest) },
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- seed the two independent legacy/current namespaces.
      await driver.putBlob({
        ...target,
        tier: 'private',
        contentType: 'application/octet-stream',
        body: new Uint8Array([1]),
      });
    }
    await intent(locator);
    const original = decodeManifest((await store.readManifest(locator))!.manifest);
    await database
      .insert(schema.storageTombstone)
      .values({ ownerId: locator.ownerId, purgeAfter: fencedAt, erasure: false });
    await database.delete(schema.user).where(eq(schema.user.id, locator.ownerId));
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, publicationId) }),
    ).toBeUndefined();
    expect(
      await database.query.projectDeletionManifest.findFirst({
        where: eq(schema.projectDeletionManifest.projectId, locator.projectId),
      }),
    ).toMatchObject({ manifestKey, releasedAt: null });
    const account = async () =>
      Array.fromAsync(purgeTombstonedTenants({ database, driver, store, ownerIds: [locator.ownerId], now: () => at }));
    expect(await account()).toMatchObject([{ status: 'refused', deleted: 0 }]);
    const pendingReceipt = await receipt(locator.projectId);
    expect(pendingReceipt?.purgedAt).toBeNull();
    const pendingManifest = await store.readManifest(locator);
    expect(pendingManifest?.manifest).toBeDefined();
    const failedRead = vi.spyOn(driver, 'getBlob').mockRejectedValueOnce(new Error('Fixture manifest unavailable'));
    await expect(purgeDeletedProject({ database, driver, store, projectId: locator.projectId, at })).rejects.toThrow(
      'Fixture manifest unavailable',
    );
    failedRead.mockRestore();
    const unreleased = await database.query.blobRef.findFirst({ where: eq(schema.blobRef.sha256, digest) });
    expect(unreleased?.refcount).toBe(3);
    expect(await Array.fromAsync(store.listObjects(locator, 'packs/'))).toHaveLength(3);
    expect(await account()).toMatchObject([{ status: 'refused', deleted: 0 }]);
    const partialDelete = vi.spyOn(store, 'deleteObjects').mockImplementationOnce(async (location, keys) => {
      expect(keys).toHaveLength(3);
      await new S3RepositoryStore(driver).deleteObjects(location, keys.slice(0, 1));
      throw new Error('Fixture partial object batch failure');
    });
    await expect(purgeDeletedProject({ database, driver, store, projectId: locator.projectId, at })).rejects.toThrow(
      'Fixture partial object batch failure',
    );
    partialDelete.mockRestore();
    expect(await Array.fromAsync(store.listObjects(locator, 'packs/'))).toHaveLength(2);
    const failedReceipt = await receipt(locator.projectId);
    expect(failedReceipt?.purgedAt).toBeNull();
    const releasedWork = await database.query.projectDeletionManifest.findFirst({
      where: eq(schema.projectDeletionManifest.projectId, locator.projectId),
    });
    expect(releasedWork?.releasedAt).toBeInstanceOf(Date);
    expect(await account()).toMatchObject([{ status: 'refused', deleted: 0 }]);
    // A fresh database connection and adapter have only durable state; the failed plan file is gone.
    const restartedClient = postgres(databaseUrl, { max: 1 });
    try {
      expect(
        await purgeDeletedProject({
          database: drizzle(restartedClient, { schema }),
          driver,
          store: new S3RepositoryStore(driver),
          projectId: locator.projectId,
          at,
        }),
      ).toMatchObject({ status: 'purged' });
    } finally {
      await restartedClient.end();
    }

    const released = await database.query.blobRef.findFirst({ where: eq(schema.blobRef.sha256, digest) });
    expect(released?.refcount).toBe(1);
    expect(await driver.headBlob({ namespace: 'blobs', key: `sha256/${digest}`, tier: 'private' })).toBeDefined();
    expect(await account()).toMatchObject([{ status: 'purged' }]);
    const sentinel = decodeManifest((await store.readManifest(locator))!.manifest);
    expect(sentinel).toMatchObject({
      incarnation: original.incarnation,
      tombstone: original.tombstone,
      refs: {},
      packs: [],
      pushes: [],
      earlierPushes: null,
    });
    expect(await Array.fromAsync(store.listObjects(locator, ''))).toHaveLength(1);
    expect(await Array.fromAsync(store.listObjects(neighbor, ''))).toHaveLength(1);
    await expect(assertProjectActive(database, locator.projectId)).rejects.toBeInstanceOf(GoneException);
    // A URL issued before fencing can finish late. The audit must reopen and drain this identity.
    await putPack(locator, 'packs/late.pack');
    expect(await purgeDeletedProject({ database, driver, store, projectId: locator.projectId, at })).toMatchObject({
      status: 'purged',
    });
    expect(await Array.fromAsync(store.listObjects(locator, ''))).toHaveLength(1);
    const audited = await database.query.blobRef.findFirst({ where: eq(schema.blobRef.sha256, digest) });
    expect(audited?.refcount).toBe(1);
  });

  it('should keep pending failed-fence quota and retained totals until successful completion', async () => {
    const locator = await seed();
    await database
      .update(schema.projectGit)
      .set({ storageBytes: 1000, lfsBytes: 300, retainedBytes: 70 })
      .where(eq(schema.projectGit.projectId, locator.projectId));
    const repositories = new GitRepositoryService(
      Object.assign(mock<DatabaseService>(), { database }),
      mock(),
      driver,
      mock(),
      store,
      mock(),
      mock(),
    );
    const quota = async () =>
      withOwnerLock(database, locator.ownerId, async (transaction) => readOwnerUsage(transaction, locator.ownerId));
    try {
      await requestProjectDeletion({ database, projectId: locator.projectId, userId: locator.ownerId, enabled: true });
      const unavailable = mock<RepositoryStore>({
        readManifest: async () => {
          throw new Error('Fixture fence unavailable');
        },
      });
      expect(
        await completeProjectDeletion({ database, store: unavailable, projectId: locator.projectId, at: fencedAt }),
      ).toMatchObject({ state: 'deleting' });
      expect(await quota()).toEqual({ storageBytes: 1000, lfsBytes: 300 });
      expect(await repositories.readOwnerUsage(locator.ownerId)).toEqual({
        storageBytes: 1000,
        lfsBytes: 300,
        retainedBytes: 70,
      });
      expect(
        await completeProjectDeletion({ database, store, projectId: locator.projectId, at: fencedAt }),
      ).toMatchObject({ state: 'deleted' });
      expect(await quota()).toEqual({ storageBytes: 0, lfsBytes: 0 });
      expect(await repositories.readOwnerUsage(locator.ownerId)).toEqual({
        storageBytes: 0,
        lfsBytes: 0,
        retainedBytes: 1370,
      });
      const completed = await receipt(locator.projectId);
      await completeProjectDeletion({ database, store, projectId: locator.projectId, at });
      const retried = await receipt(locator.projectId);
      expect(retried?.purgeAfter).toEqual(completed?.purgeAfter);
      expect(await repositories.readOwnerUsage(locator.ownerId)).toEqual({
        storageBytes: 0,
        lfsBytes: 0,
        retainedBytes: 1370,
      });
    } finally {
      await repositories.settled();
    }
  });

  it('should leave missing and not-yet-due identities untouched without reading storage', async () => {
    const locator = await seed();
    await intent(locator);
    const listing = vi.spyOn(store, 'listObjects');
    try {
      expect(
        await purgeDeletedProject({ database, driver, store, projectId: locator.projectId, at: fencedAt }),
      ).toMatchObject({ status: 'pending' });
      expect(await purgeDeletedProject({ database, driver, store, projectId: 'unknown-project', at })).toMatchObject({
        status: 'pending',
      });
      expect(listing).not.toHaveBeenCalled();
    } finally {
      listing.mockRestore();
    }
  });

  it('should refuse restoring a deleted identity before touching either store', async () => {
    const locator = await seed();
    await intent(locator);
    const source = mock<RepositoryStore>();
    const primary = mock<RepositoryStore>();
    await expect(
      restoreRepository({ database, locator, source, primary, operator: 'acceptance' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(source.readManifest).not.toHaveBeenCalled();
    expect(primary.readManifest).not.toHaveBeenCalled();
  });

  it('should refuse a streamed 10001-object inventory at the real default bound with at most 500 buffered plan rows', async () => {
    const locator = await seed();
    await intent(locator);
    Object.assign(planWrites, { calls: 0, lines: 0, maxLines: 0, maxBytes: 0 });
    const streamed = mock<RepositoryStore>({
      async *listObjects() {
        for (let index = 0; index < 10_001; index += 1) {
          yield { key: `packs/fixture-${String(index).padStart(6, '0')}.pack`, bytes: 1, modifiedAt: fencedAt };
        }
      },
    });
    const outcome = await purgeDeletedProject({ database, driver, store: streamed, projectId: locator.projectId, at });
    expect(projectPurgeObjectBound).toBe(10_000);
    expect(outcome).toMatchObject({ status: 'refused', plan: { objects: 10_001, bytes: 10_001 } });
    expect(planWrites.lines).toBe(10_001);
    expect(planWrites.calls).toBe(21);
    expect(planWrites.maxLines).toBe(500);
    expect(planWrites.maxBytes).toBeLessThan(100_000);
    expect(streamed.commitManifest).not.toHaveBeenCalled();
    expect(streamed.deleteObjects).not.toHaveBeenCalled();
  });

  it('should enforce the exact inventory approval and refuse a foreign captured account', async () => {
    const locator = await seed();
    await putPack(locator);
    await intent(locator);
    const args = { database, driver, store, projectId: locator.projectId, at, objectBound: 0 };
    const preview = await purgeDeletedProject({ ...args, dryRun: true });
    const plan = preview.plan!;
    expect(await purgeDeletedProject(args)).toMatchObject({ status: 'refused' });
    const confirmation = { ownerId: locator.ownerId, projectId: locator.projectId, fingerprint: plan.fingerprint };
    await putPack(locator, 'packs/changed.pack');
    expect(await purgeDeletedProject({ ...args, confirmation })).toMatchObject({ status: 'refused' });
    const freshPreview = await purgeDeletedProject({ ...args, dryRun: true });
    const current = freshPreview.plan!;
    expect(
      await purgeDeletedProject({ ...args, confirmation: { ...confirmation, fingerprint: current.fingerprint } }),
    ).toMatchObject({ status: 'purged' });
    await database
      .update(schema.projectDeletion)
      .set({ storageAccountId: 'foreign-account' })
      .where(eq(schema.projectDeletion.projectId, locator.projectId));
    const listing = vi.spyOn(store, 'listObjects');
    await expect(purgeDeletedProject(args)).rejects.toThrow('storage account unavailable');
    expect(listing).not.toHaveBeenCalled();
    listing.mockRestore();
  });
});
