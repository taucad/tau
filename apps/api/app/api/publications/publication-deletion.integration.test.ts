import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { text as readStreamText } from 'node:stream/consumers';
import { GoneException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { RepositoryLease } from '#api/git/store/lease.js';
import {
  releaseDeletedProjectPublicationReferences,
  publicationManifestReadTimeout,
} from '#api/publications/publication-deletion.js';
import { collectZeroCountBlobs } from '#api/git/maintenance/blob-collector.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import { materializePublication, materializePublishedTags } from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import { PublicationsService } from '#api/publications/publications.service.js';
import type { StoredPublicationManifest } from '#api/publications/publications.dto.js';
import type { DatabaseService, DatabaseType } from '#database/database.service.js';
import { lockProjectLifecycle } from '#database/project-lifecycle.js';
import * as schema from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { createScratchDatabase } from '#testing/scratch-database.js';
import type { ScratchDatabase } from '#testing/scratch-database.js';
import { databaseReachable } from '#testing/database-reachable.js';

/** Real transactions and independent pooled connections; all data lives in a disposable database. */
describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('publication deletion lifecycle', () => {
  let scratch: ScratchDatabase | undefined;
  let client: postgres.Sql | undefined;
  let database: DatabaseType;
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const storage = mock<ObjectStorageService>({
    async getBlob(args) {
      const bytes = objects.get(args.key);
      if (bytes === undefined) {
        throw new Error('Manifest is missing');
      }
      return {
        body: Readable.from([bytes]),
        contentType: 'application/json',
        contentLength: bytes.byteLength,
        etag: 'fixture',
      };
    },
    publicUrl: ({ key }) => `https://cdn.example/${key}`,
  });

  beforeAll(async () => {
    scratch = await createScratchDatabase('cpd_publications');
    client = postgres(scratch.url, { max: 5 });
    database = drizzle(client, { schema });
  });
  afterAll(async () => {
    await client?.end();
    await scratch?.drop();
  });

  const seed = async () => {
    const suffix = randomUUID();
    const ownerId = `owner_${suffix}`;
    const projectId = `project_${suffix}`;
    const publicationId = `publication_${suffix}`;
    const revisionId = 'a'.repeat(40);
    const manifestKey = `publications/${publicationId}/${revisionId}.json`;
    await database
      .insert(schema.user)
      .values({ id: ownerId, name: 'Owner', email: `${suffix}@test.invalid`, emailVerified: true });
    await database.insert(schema.project).values({ id: projectId, ownerId, name: 'Disposable publication project' });
    const [publication] = await database
      .insert(schema.publication)
      .values({
        id: publicationId,
        projectId,
        ownerId,
        tag: 'v1',
        revisionId,
        visibility: 'private',
        manifestKey,
        runtimePin: '0.1.0',
        kernels: [],
        entryPath: 'main.ts',
        title: 'Publication',
        ownerSnapshot: { id: ownerId, name: 'Owner' },
        thumbnailKey: 'defaults/thumb.webp',
      })
      .returning();
    if (publication === undefined) {
      throw new Error('Publication fixture failed');
    }
    const manifest: StoredPublicationManifest = {
      version: 1,
      projectId,
      entryPath: 'main.ts',
      files: {},
      kernels: [],
      runtime: '@taucad/runtime@0.1.0',
      parameters: {},
      createdAt: new Date().toISOString(),
    };
    return { projectId, ownerId, publicationId, manifestKey, manifest, publication };
  };
  type Fixture = Awaited<ReturnType<typeof seed>>;

  const storeManifest = (fixture: Fixture) => {
    objects.set(fixture.manifestKey, new TextEncoder().encode(JSON.stringify(fixture.manifest)));
  };
  const purgeAfter = new Date('2026-11-01T00:00:00Z');
  const intent = async (fixture: Fixture, completed = true) => {
    await database.transaction(async (transaction) => {
      await lockProjectLifecycle(transaction, fixture.projectId);
      await transaction.insert(schema.projectDeletion).values({
        projectId: fixture.projectId,
        ownerId: fixture.ownerId,
        requestedBy: fixture.ownerId,
        requestedAt: new Date('2026-10-01T00:00:00Z'),
        ...(completed
          ? { fencedAt: new Date('2026-10-01T00:00:00Z'), deletedAt: new Date('2026-10-01T00:00:00Z'), purgeAfter }
          : {}),
      });
      await transaction.insert(schema.projectDeletionManifest).values({
        projectId: fixture.projectId,
        publicationId: fixture.publicationId,
        manifestKey: fixture.manifestKey,
      });
      await transaction
        .update(schema.publication)
        .set({ unpublishedAt: new Date() })
        .where(eq(schema.publication.id, fixture.publicationId));
    });
  };
  const release = async (fixture: Fixture) =>
    releaseDeletedProjectPublicationReferences({ database, storage, projectId: fixture.projectId, at: purgeAfter });
  const refcount = async (digest: string) => {
    const row = await database.query.blobRef.findFirst({ where: eq(schema.blobRef.sha256, digest) });
    return row?.refcount;
  };
  const receipt = async (fixture: Fixture) =>
    database.query.projectDeletionManifest.findFirst({
      where: and(
        eq(schema.projectDeletionManifest.projectId, fixture.projectId),
        eq(schema.projectDeletionManifest.manifestKey, fixture.manifestKey),
      ),
    });
  const digest = () => randomUUID().replaceAll('-', '').repeat(2);

  it('should release duplicate paths exactly once under concurrent retries and preserve a shared fork and thumbnail', async () => {
    const source = await seed();
    const fork = await seed();
    const shared = digest();
    source.manifest.files = {
      'main.ts': `sha256:${shared}`,
      'duplicate.ts': `sha256:${shared}`,
      'thumbnail.webp': `sha256:${shared}`,
    };
    fork.manifest.files = { 'main.ts': `sha256:${shared}` };
    storeManifest(source);
    storeManifest(fork);
    await database.insert(schema.blobRef).values({ sha256: shared, sizeBytes: 7n, refcount: 4 });
    await database
      .update(schema.project)
      .set({ forkedFrom: source.publicationId })
      .where(eq(schema.project.id, fork.projectId));
    await database
      .update(schema.publication)
      .set({ parentPublicationId: source.publicationId })
      .where(eq(schema.publication.id, fork.publicationId));
    await intent(source);
    const results = await Promise.all([release(source), release(source), release(source)]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await refcount(shared)).toBe(1);
    const sourceReceipt = await receipt(source);
    expect(sourceReceipt?.releasedAt).toBeInstanceOf(Date);
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, source.publicationId) }),
    ).toMatchObject({ manifestKey: '', thumbnailKey: 'defaults/thumb.webp' });
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, fork.publicationId) }),
    ).toMatchObject({ parentPublicationId: source.publicationId, manifestKey: fork.manifestKey, unpublishedAt: null });
    expect(await database.query.project.findFirst({ where: eq(schema.project.id, fork.projectId) })).toMatchObject({
      forkedFrom: source.publicationId,
    });
    const viewer = service();
    expect(
      await viewer.getPublicationForViewer({ publicationId: fork.publicationId, viewerUserId: fork.ownerId }),
    ).toMatchObject({ manifest: fork.manifest });
    expect(storage.deleteBlobs).not.toHaveBeenCalled();
    const orphan = digest();
    const sharedBytes = new TextEncoder().encode('surviving fork content');
    objects.set(blobKeyFromSha256Hex(shared), sharedBytes);
    objects.set(blobKeyFromSha256Hex(orphan), new TextEncoder().encode('orphan'));
    await database.insert(schema.blobRef).values({ sha256: orphan, sizeBytes: 6n, refcount: 0 });
    const collector = mock<ObjectStorageService>({
      async deleteBlobs(args) {
        for (const key of args.keys) {
          objects.delete(key);
        }
        return { deleted: args.keys.length };
      },
    });
    expect(await collectZeroCountBlobs({ database, driver: collector })).toMatchObject({ collected: [orphan] });
    const file = await viewer.openPublicationFile(shared, 'main.ts');
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of file.body) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unexpected file stream');
      }
      chunks.push(new Uint8Array(chunk));
    }
    expect(new Uint8Array(Buffer.concat(chunks))).toEqual(sharedBytes);
    expect(objects.has(blobKeyFromSha256Hex(orphan))).toBe(false);
  });

  it('should retire a repeatedly published revision without leaving duplicate references', async () => {
    const fixture = await seed();
    const bytes = new TextEncoder().encode('code');
    const shared = sha256HexFromBytes(bytes);
    const git: MaterializerDependencies['git'] = async (_directory, args) => {
      if (args[0] === 'rev-parse') {
        return new TextEncoder().encode(fixture.publication.revisionId);
      }
      if (args[0] === 'ls-tree') {
        return new TextEncoder().encode(`100644 blob ${'b'.repeat(40)} 4\tmain.ts\0`);
      }
      return new TextEncoder().encode(`${'b'.repeat(40)} blob 4\ncode\n`);
    };
    const writer = mock<ObjectStorageService>({
      async putBlob(args) {
        objects.set(args.key, args.body);
        return { lost: false, alreadyExisted: false, etag: 'fixture' };
      },
      async headBlob() {
        return undefined;
      },
    });
    const dependencies = {
      databaseService: Object.assign(mock<DatabaseService>(), { database }),
      storage: writer,
      git,
      resolveLfsObject: async () => undefined,
    };
    const input: Parameters<typeof materializePublication>[1] = {
      publicationId: fixture.publicationId,
      projectId: fixture.projectId,
      ownerId: fixture.ownerId,
      directory: 'unused',
      tag: 'v1',
      visibility: 'private',
      entryPath: 'main.ts',
    };
    await database.transaction(async (transaction) => {
      await lockProjectLifecycle(transaction, fixture.projectId);
      await materializePublication(dependencies, input, transaction);
    });
    await database.transaction(async (transaction) => {
      await lockProjectLifecycle(transaction, fixture.projectId);
      await materializePublication(dependencies, { ...input, heldManifestKey: fixture.manifestKey }, transaction);
    });
    expect(await refcount(shared)).toBe(1);
    await intent(fixture);
    expect(await release(fixture)).toBe(1);
    expect(await refcount(shared)).toBe(0);
  });

  it('should roll back all decrements when a crash occurs before the release receipt commits', async () => {
    const fixture = await seed();
    const shared = digest();
    fixture.manifest.files = { 'main.ts': `sha256:${shared}` };
    storeManifest(fixture);
    await database.insert(schema.blobRef).values({ sha256: shared, sizeBytes: 1n, refcount: 2 });
    await intent(fixture);
    await database.execute(
      sql`CREATE FUNCTION cpd_release_crash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected receipt crash'; END $$`,
    );
    await database.execute(
      sql`CREATE TRIGGER cpd_release_crash BEFORE UPDATE OF released_at ON project_deletion_manifest FOR EACH ROW EXECUTE FUNCTION cpd_release_crash()`,
    );
    try {
      await expect(release(fixture)).rejects.toThrow();
      expect(await refcount(shared)).toBe(2);
      expect(await receipt(fixture)).toMatchObject({ releasedAt: null });
      expect(
        await database.query.publication.findFirst({ where: eq(schema.publication.id, fixture.publicationId) }),
      ).toMatchObject({ manifestKey: fixture.manifestKey });
    } finally {
      await database.execute(sql`DROP TRIGGER cpd_release_crash ON project_deletion_manifest`);
      await database.execute(sql`DROP FUNCTION cpd_release_crash()`);
    }
    expect(await release(fixture)).toBe(1);
    expect(await release(fixture)).toBe(0);
    expect(await refcount(shared)).toBe(1);
  });

  it.each(['missing manifest', 'wrong project', 'bad digest', 'missing count', 'insufficient count'])(
    'should keep retirement pending for %s',
    async (fault) => {
      const fixture = await seed();
      const first = `0${digest().slice(1)}`;
      const last = `f${digest().slice(1)}`;
      fixture.manifest.files = {
        'main.ts': `sha256:${first}`,
        'other.ts': `sha256:${last}`,
        'repeated.ts': `sha256:${last}`,
      };
      await database.insert(schema.blobRef).values({ sha256: first, sizeBytes: 1n, refcount: 2 });
      if (fault !== 'missing count') {
        await database
          .insert(schema.blobRef)
          .values({ sha256: last, sizeBytes: 1n, refcount: fault === 'insufficient count' ? 1 : 3 });
      }
      if (fault === 'wrong project') {
        fixture.manifest.projectId = 'another-project';
      }
      if (fault === 'bad digest') {
        fixture.manifest.files['other.ts'] = 'invalid';
      }
      if (fault !== 'missing manifest') {
        storeManifest(fixture);
      }
      await intent(fixture);
      const failure = release(fixture);
      await expect(failure).rejects.toBeInstanceOf(Error);
      await expect(failure).rejects.toThrow(/missing|another project|invalid blob digest|insufficient/u);
      expect(await refcount(first)).toBe(2);
      expect(await receipt(fixture)).toMatchObject({ releasedAt: null });
    },
  );

  it.each(['pending', 'retained'])('should refuse reference release while deletion is %s', async (state) => {
    const fixture = await seed();
    const shared = digest();
    fixture.manifest.files = { 'main.ts': `sha256:${shared}` };
    storeManifest(fixture);
    await database.insert(schema.blobRef).values({ sha256: shared, sizeBytes: 1n, refcount: 1 });
    await intent(fixture, state !== 'pending');
    const attempt = releaseDeletedProjectPublicationReferences({
      database,
      storage,
      projectId: fixture.projectId,
      at: state === 'pending' ? purgeAfter : new Date(purgeAfter.getTime() - 1),
    });
    await expect(attempt).rejects.toThrow('requires a completed deletion past its retention deadline');
    expect(await refcount(shared)).toBe(1);
    expect(await receipt(fixture)).toMatchObject({ releasedAt: null, lastError: 'lifecycle-check' });
  });

  it('should release valid manifests larger than 1 MiB without imposing a new path limit', async () => {
    const fixture = await seed();
    const shared = digest();
    fixture.manifest.files = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`${'a'.repeat(6000)}${index}.ts`, `sha256:${shared}`]),
    );
    storeManifest(fixture);
    expect(objects.get(fixture.manifestKey)?.byteLength).toBeGreaterThan(1024 * 1024);
    await database.insert(schema.blobRef).values({ sha256: shared, sizeBytes: 1n, refcount: 201 });
    await intent(fixture);
    expect(await release(fixture)).toBe(1);
    expect(await refcount(shared)).toBe(1);
  });

  it.each(['oversize', 'parse'])(
    'should destroy a %s manifest stream and persist a sanitized retry diagnostic',
    async (fault) => {
      const fixture = await seed();
      await intent(fixture);
      const body = Readable.from([new TextEncoder().encode('{private-contents')]);
      const reader = {
        async getBlob() {
          return {
            body,
            contentType: 'application/json',
            etag: 'fixture',
            contentLength: fault === 'oversize' ? 1 : 17,
          };
        },
      };
      await expect(
        releaseDeletedProjectPublicationReferences({
          database,
          storage: reader,
          projectId: fixture.projectId,
          at: purgeAfter,
        }),
      ).rejects.toBeInstanceOf(Error);
      expect(body.destroyed).toBe(true);
      expect(await receipt(fixture)).toMatchObject({ releasedAt: null, lastError: 'manifest-read-or-validation' });
    },
  );

  it('should abort a stalled manifest body and release its transaction lock', async () => {
    const fixture = await seed();
    await intent(fixture);
    const controller = new AbortController();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const opened = Promise.withResolvers<void>();
    const body = new Readable({
      read() {
        /* Deliberately stalled storage stream. */
      },
    });
    let receivedSignal: AbortSignal | undefined;
    const reader = {
      async getBlob(args: Parameters<ObjectStorageService['getBlob']>[0]) {
        receivedSignal = args.signal;
        opened.resolve();
        return { body, contentType: 'application/json', etag: 'fixture', contentLength: 10 };
      },
    };
    try {
      const attempt = releaseDeletedProjectPublicationReferences({
        database,
        storage: reader,
        projectId: fixture.projectId,
        at: purgeAfter,
      });
      const rejected = expect(attempt).rejects.toMatchObject({ name: 'AbortError' });
      await opened.promise;
      controller.abort();
      await rejected;
      expect(receivedSignal).toBe(controller.signal);
      expect(timer).toHaveBeenCalledWith(publicationManifestReadTimeout);
      expect(body.destroyed).toBe(true);
      expect(await receipt(fixture)).toMatchObject({ releasedAt: null, lastError: 'manifest-read-or-validation' });
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`set local lock_timeout = '1s'`);
        await lockProjectLifecycle(transaction, fixture.projectId);
      });
    } finally {
      timer.mockRestore();
      body.destroy();
    }
  });

  it.each([
    { link: 'project', deleted: false },
    { link: 'publication', deleted: false },
    { link: 'project', deleted: true },
    { link: 'publication', deleted: true },
  ])(
    'should detach $link lineage on account closure and preserve the independent fork with deleted=$deleted',
    async ({ link, deleted }) => {
      const source = await seed();
      const fork = await seed();
      const shared = digest();
      source.manifest.files = { 'main.ts': `sha256:${shared}` };
      fork.manifest.files = { 'main.ts': `sha256:${shared}` };
      storeManifest(source);
      storeManifest(fork);
      const content = 'independent fork content';
      objects.set(blobKeyFromSha256Hex(shared), new TextEncoder().encode(content));
      await database.insert(schema.blobRef).values({ sha256: shared, sizeBytes: 1n, refcount: 2 });
      if (link === 'project') {
        await database
          .update(schema.project)
          .set({ forkedFrom: source.publicationId })
          .where(eq(schema.project.id, fork.projectId));
      } else {
        await database
          .update(schema.publication)
          .set({ parentPublicationId: source.publicationId })
          .where(eq(schema.publication.id, fork.publicationId));
      }
      if (deleted) {
        await intent(source);
      }
      await database.delete(schema.user).where(eq(schema.user.id, source.ownerId));
      expect(await database.query.user.findFirst({ where: eq(schema.user.id, source.ownerId) })).toBeUndefined();
      expect(
        await database.query.project.findFirst({ where: eq(schema.project.id, source.projectId) }),
      ).toBeUndefined();
      expect(
        await database.query.publication.findFirst({ where: eq(schema.publication.id, source.publicationId) }),
      ).toBeUndefined();
      expect(await database.query.project.findFirst({ where: eq(schema.project.id, fork.projectId) })).toMatchObject({
        ownerId: fork.ownerId,
        forkedFrom: null,
      });
      expect(
        await database.query.publication.findFirst({ where: eq(schema.publication.id, fork.publicationId) }),
      ).toMatchObject({
        ownerId: fork.ownerId,
        parentPublicationId: null,
        revisionId: fork.publication.revisionId,
        manifestKey: fork.manifestKey,
        unpublishedAt: null,
      });
      expect(await refcount(shared)).toBe(2);
      if (deleted) {
        expect(
          await database.query.projectDeletion.findFirst({
            where: eq(schema.projectDeletion.projectId, source.projectId),
          }),
        ).toMatchObject({ ownerId: source.ownerId, purgeAfter, deletedAt: new Date('2026-10-01T00:00:00Z') });
        expect(await receipt(source)).toMatchObject({ manifestKey: source.manifestKey, releasedAt: null });
        expect(await release(source)).toBe(1);
        expect(await receipt(source)).toMatchObject({ releasedAt: purgeAfter, lastError: null });
        expect(await release(source)).toBe(0);
      } else {
        expect(await receipt(source)).toBeUndefined();
      }
      const viewer = service();
      expect(
        await viewer.getPublicationForViewer({ publicationId: fork.publicationId, viewerUserId: fork.ownerId }),
      ).toMatchObject({ manifest: fork.manifest });
      const file = await viewer.openPublicationFile(shared, 'main.ts');
      expect(await readStreamText(file.body)).toBe(content);
      expect(await refcount(shared)).toBe(deleted ? 1 : 2);
    },
  );

  it('should release captured references after the account and project rows have cascaded away', async () => {
    const fixture = await seed();
    const shared = digest();
    fixture.manifest.files = { 'main.ts': `sha256:${shared}` };
    storeManifest(fixture);
    await database.insert(schema.blobRef).values({ sha256: shared, sizeBytes: 1n, refcount: 1 });
    await intent(fixture);
    await database.delete(schema.user).where(eq(schema.user.id, fixture.ownerId));
    expect(await release(fixture)).toBe(1);
    expect(await refcount(shared)).toBe(0);
    const releasedReceipt = await receipt(fixture);
    expect(releasedReceipt?.releasedAt).toBeInstanceOf(Date);
  });

  type Dependencies = ConstructorParameters<typeof PublicationsService>;
  const service = (
    options: { repositories?: Dependencies[9]; store?: Dependencies[8]; redis?: Dependencies[3] } = {},
  ) => {
    return new PublicationsService(
      Object.assign(mock<DatabaseService>(), { database }),
      storage,
      mock<Dependencies[2]>({ get: vi.fn().mockReturnValue('https://tau.example') }),
      options.redis ?? mockDeep<Dependencies[3]>(),
      mock<Dependencies[4]>({ consumePublicationViewSlot: async () => ({ allowed: true, count: 1 }) }),
      mockDeep<Dependencies[5]>(),
      mock<Dependencies[6]>(),
      mock<Dependencies[7]>({
        getEntitlements: async () => ({
          canSyncFiles: true,
          canCreatePrivateShares: true,
          storageLimitBytes: 1_000_000,
          canUseProKernels: true,
          tier: 'pro',
        }),
      }),
      options.store ?? mock<Dependencies[8]>(),
      options.repositories ?? mock<Dependencies[9]>(),
    );
  };

  it('should refuse a warm manifest cache after deletion without serving its cached keyring', async () => {
    const fixture = await seed();
    fixture.manifest.files = { 'main.ts': `sha256:${digest()}` };
    storeManifest(fixture);
    const viewer = service();
    expect(
      await viewer.resolvePublicationFile({
        publicationId: fixture.publicationId,
        viewerUserId: fixture.ownerId,
        path: 'main.ts',
      }),
    ).toMatchObject({ path: 'main.ts' });
    await intent(fixture);
    const rejected = viewer.resolvePublicationFile({
      publicationId: fixture.publicationId,
      viewerUserId: fixture.ownerId,
      path: 'main.ts',
    });
    await expect(rejected).rejects.toBeInstanceOf(GoneException);
    await expect(rejected).rejects.toThrow('Publication is no longer available');
  });

  it('should refuse publication grants and visibility changes for a deleted project', async () => {
    const fixture = await seed();
    storeManifest(fixture);
    await intent(fixture);
    const viewer = service();
    await expect(
      viewer.inviteAccess({
        publicationId: fixture.publicationId,
        ownerId: fixture.ownerId,
        recipientEmail: 'friend@test.invalid',
      }),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      viewer.updateVisibility({ publicationId: fixture.publicationId, ownerId: fixture.ownerId, visibility: 'public' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(
      await database.query.publicationAccess.findMany({
        where: eq(schema.publicationAccess.publicationId, fixture.publicationId),
      }),
    ).toEqual([]);
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, fixture.publicationId) }),
    ).toMatchObject({ visibility: 'private' });
  });

  it('should reject a publish whose lease finished hydrating after deletion', async () => {
    const fixture = await seed();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const repositories = mock<Dependencies[9]>({
      async withLease(_access, body) {
        entered.resolve();
        await resume.promise;
        return body(mock<RepositoryLease>());
      },
    });
    const publishing = service({ repositories }).publishFromRevision({
      ownerId: fixture.ownerId,
      request: {
        projectId: fixture.projectId,
        projectName: 'Disposable',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        entryPath: 'main.ts',
        visibility: 'public',
        title: 'Late publish',
      },
    });
    const rejected = expect(publishing).rejects.toBeInstanceOf(GoneException);
    await entered.promise;
    try {
      await intent(fixture);
    } finally {
      resume.resolve();
    }
    await rejected;
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, fixture.publicationId) }),
    ).toMatchObject({ title: 'Publication', manifestKey: fixture.manifestKey });
    expect(storage.putBlob).not.toHaveBeenCalled();
  });

  it('should reject a view counter update that resumes after deletion', async () => {
    const fixture = await seed();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const redis = mockDeep<Dependencies[3]>();
    redis.client.pfadd.mockImplementation(async () => {
      entered.resolve();
      await resume.promise;
      return 1;
    });
    const recording = service({ redis }).recordView({
      publicationId: fixture.publicationId,
      identity: { viewerHash: 'disposable-viewer' },
    });
    const rejected = expect(recording).rejects.toBeInstanceOf(GoneException);
    await entered.promise;
    try {
      await intent(fixture);
    } finally {
      resume.resolve();
    }
    await rejected;
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, fixture.publicationId) }),
    ).toMatchObject({ viewCount: 0 });
  });

  it('should refuse stale serving when a repair read crosses deletion and falls back', async () => {
    const fixture = await seed();
    storeManifest(fixture);
    await database
      .insert(schema.projectGit)
      .values({ projectId: fixture.projectId, generation: 2, derivedGeneration: 1 });
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const store = mock<Dependencies[8]>({
      async readManifest() {
        entered.resolve();
        await resume.promise;
        throw new Error('Storage unavailable during repair');
      },
    });
    const reading = service({ store }).resolvePublicationFile({
      publicationId: fixture.publicationId,
      viewerUserId: fixture.ownerId,
      path: 'main.ts',
    });
    const rejected = expect(reading).rejects.toBeInstanceOf(GoneException);
    await entered.promise;
    try {
      await intent(fixture);
    } finally {
      resume.resolve();
    }
    await rejected;
  });

  it('should refuse a repair that observed an active row before deletion won the project lock', async () => {
    const fixture = await seed();
    storeManifest(fixture);
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const git = vi.fn<MaterializerDependencies['git']>(async () => {
      entered.resolve();
      await resume.promise;
      return new TextEncoder().encode('b'.repeat(40));
    });
    const repair = materializePublishedTags(
      {
        databaseService: Object.assign(mock<DatabaseService>(), { database }),
        storage,
        git,
        resolveLfsObject: async () => undefined,
      },
      {
        projectId: fixture.projectId,
        ownerId: fixture.ownerId,
        directory: 'unused',
        tags: [{ ref: 'refs/tags/v1', oid: 'b'.repeat(40) }],
      },
    );
    await entered.promise;
    await intent(fixture);
    resume.resolve();
    await expect(repair).rejects.toMatchObject({ name: 'AggregateError', errors: [expect.any(GoneException)] });
    expect(git).toHaveBeenCalledTimes(1);
    expect(
      await database.query.publication.findFirst({ where: eq(schema.publication.id, fixture.publicationId) }),
    ).toMatchObject({ manifestKey: fixture.manifestKey });
    expect(storage.putBlob).not.toHaveBeenCalled();
  });
});
