import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { buffer } from 'node:stream/consumers';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import * as schema from '#database/schema.js';
import { project, projectGit, projectGitLfsObject, storageTombstone, user } from '#database/schema.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { writeSpilledPushLog } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest, encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import {
  incompressibleClient,
  largePackMebibytes,
  measureGrowth,
  mebibytes,
  recordMeasurement,
  streamedGrowthBoundMebibytes,
} from '#api/git/store/pack-memory.fixture.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { copyRepository, ensureOwnerMarker } from '#api/git/mirror/copier.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { S3MirrorDestination } from '#api/git/mirror/destination.js';
import { repositoryKey, snapshotKey } from '#api/git/mirror/keys.js';
import { MirrorMetrics } from '#api/git/mirror/metrics.js';
import { indexOf, packOf, recordingMeter } from '#api/git/mirror/mirror.fixture.js';
import {
  git,
  lockedCopyBucket,
  newClient,
  pushReal,
  scratchDirectories,
} from '#api/git/mirror/real-repository.fixture.js';
import { R2MirrorSource } from '#api/git/mirror/source.js';
import { PostgresMirrorLedger, copyPendingOnAdvance } from '#api/git/mirror/watermark.js';
import { listCopySnapshots, restoreFromCopy } from '#api/git/maintenance/restore-copy.js';
import type { CopyRestoreArguments } from '#api/git/maintenance/restore-copy.js';

/**
 * DR1, restore v2, against the B2 stand-in: the copier writes a repository into
 * MinIO under Object Lock exactly as it writes B2, and restore rebuilds it from
 * that bucket alone, through a read-only client, by version listing. Every row
 * of W13's DR1 acceptance is one test here.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and AWS SDK inputs */
const databaseUrl = process.env.DATABASE_URL;
const copyBucket = process.env['TAU_S3_COPY_BUCKET'] ?? 'tau-content-second-copy';
const copyEndpoint = process.env['TAU_S3_COPY_ENDPOINT'] ?? process.env.TAU_S3_ENDPOINT;
const copyCredentials = {
  accessKeyId: process.env['TAU_S3_COPY_ACCESS_KEY_ID'] ?? process.env.TAU_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env['TAU_S3_COPY_SECRET_ACCESS_KEY'] ?? process.env.TAU_S3_SECRET_ACCESS_KEY,
};

const run = randomUUID().slice(0, 8);
const sha256Base64 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('base64');

describe('restore v2 from the second copy (DR1)', () => {
  const scratch = scratchDirectories('tau-dr1');
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let primary: S3RepositoryStore;
  let ownerClient: postgres.Sql;
  let raw: S3Client;
  let writer: S3MirrorDestination;
  let reader: S3MirrorDestination;
  let copier: CopierContext;
  const owners: string[] = [];
  let sequence = 0;

  const database = () => drizzle(ownerClient, { schema });

  /** A fresh owner, project and `project_git` row. */
  const newRepository = async (): Promise<RepositoryLocator> => {
    sequence += 1;
    const ownerId = `user_dr1_${run}_${String(sequence)}`;
    const projectId = `proj_dr1_${run}_${String(sequence)}`;
    owners.push(ownerId);
    await database()
      .insert(user)
      .values({ id: ownerId, name: 'DR1', email: `${ownerId}@tau.test` });
    await database().insert(project).values({ id: projectId, ownerId, name: 'dr1 restore' });
    await database().insert(projectGit).values({ projectId });
    return repositoryLocator({ ownerId, projectId });
  };

  const recordGeneration = async (locator: RepositoryLocator, generation: number): Promise<void> => {
    await database()
      .update(projectGit)
      .set({ generation, copyPendingSince: copyPendingOnAdvance(generation) })
      .where(eq(projectGit.projectId, locator.projectId));
  };

  const readManifest = async (locator: RepositoryLocator): Promise<Manifest | undefined> => {
    const read = await primary.readManifest(locator);
    return read === undefined ? undefined : decodeManifest(read.manifest);
  };

  /**
   * One push of a pack named by its hash, moving 64 refs, through the store's own
   * manifest successor and spill, as `commitLease` writes it. Sixty-four moved
   * refs a push spill the 16 KiB log about every third push.
   */
  const fakePush = async (locator: RepositoryLocator): Promise<Manifest> => {
    const read = await primary.readManifest(locator);
    const base = read === undefined ? undefined : decodeManifest(read.manifest);
    const pack = packOf(`${locator.projectId}-${randomBytes(8).toString('hex')}`);
    await primary.putObject(locator, pack.key, pack.bytes, {
      contentLength: pack.bytes.byteLength,
      sha256: sha256Base64(pack.bytes),
    });
    const index = indexOf(pack.bytes);
    await primary.putObject(locator, `${pack.key.slice(0, -5)}.idx`, index, {
      contentLength: index.byteLength,
      sha256: sha256Base64(index),
    });
    const references = Object.fromEntries(
      Array.from({ length: 64 }, (_, n) => [
        `refs/heads/branch-${String(n).padStart(2, '0')}`,
        { oid: randomBytes(20).toString('hex') },
      ]),
    );
    const next = succeedManifest(base, {
      refs: references,
      packs: [...(base?.packs ?? []), { key: pack.key, bytes: pack.bytes.byteLength, indexStored: true }],
      committedBy: 'user_dr1',
    });
    await writeSpilledPushLog({ store: primary, locator, base, next });
    const committed = await primary.commitManifest(locator, encodeManifest(next), read?.token ?? 'absent');
    if (committed === 'lost') {
      throw new Error('lost a single-writer manifest race');
    }
    await recordGeneration(locator, next.generation);
    return next;
  };

  const copy = async (locator: RepositoryLocator): Promise<void> => {
    const candidate = await copier.ledger.candidate(locator.projectId);
    const result = await copyRepository(copier, candidate!);
    expect(result).toMatchObject({ outcome: 'copied' });
  };

  /** The primary loses the repository: every key of its prefix and of its LFS prefix. */
  const losePrimary = async (locator: RepositoryLocator): Promise<void> => {
    for (const keyPrefix of [`${locator.ownerId}/repos/${locator.projectId}/`, `${locator.ownerId}/lfs/`]) {
      // oxlint-disable-next-line no-await-in-loop -- two prefixes
      await driver.deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix, tier: 'private' });
    }
    expect(await readManifest(locator)).toBeUndefined();
  };

  const restore = async (locator: RepositoryLocator, options: Partial<CopyRestoreArguments> = {}) =>
    restoreFromCopy({
      database: database(),
      copy: reader,
      primary,
      lfs: driver,
      locator,
      operator: 'rifont',
      ...options,
    });

  /** Follows the primary's push-log chain from `earlierPushes`; returns the segments in order. */
  const chainOf = async (locator: RepositoryLocator, manifest: Manifest): Promise<string[]> => {
    const segments: string[] = [];
    let next = manifest.earlierPushes ?? undefined;
    while (next !== undefined) {
      segments.push(next);
      // oxlint-disable-next-line no-await-in-loop -- one link at a time
      const bytes = await buffer(await primary.getObject(locator, next));
      const parsed = JSON.parse(bytes.toString('utf8')) as { previous?: unknown };
      next = typeof parsed.previous === 'string' ? parsed.previous : undefined;
    }
    return segments;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();
    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the DR1 restore suite');
    primary = new S3RepositoryStore(driver);
    raw = new S3Client({
      endpoint: copyEndpoint,
      region: process.env.TAU_S3_REGION,
      forcePathStyle: true,
      credentials: copyCredentials,
    });
    await lockedCopyBucket(raw, copyEndpoint, copyBucket);
    const account = {
      endpoint: copyEndpoint,
      region: process.env.TAU_S3_REGION,
      bucket: copyBucket,
      forcePathStyle: true,
      credentials: copyCredentials,
    };
    writer = new S3MirrorDestination(account);
    // The restore key is read-only (listFiles, readFiles, readFileRetentions); so is this client.
    reader = new S3MirrorDestination(account, undefined, { readOnly: true });
    ownerClient = postgres(databaseUrl, { max: 2, prepare: false, onnotice: () => undefined });
    const { meter } = recordingMeter();
    copier = {
      source: new R2MirrorSource(primary, driver),
      destination: writer,
      ledger: new PostgresMirrorLedger(database()),
      metrics: new MirrorMetrics(meter),
      retentionDays: 15 / (24 * 60),
      extendBelowDays: 10 / (24 * 60),
    };
  }, 60_000);

  afterAll(async () => {
    await database().delete(storageTombstone).where(inArray(storageTombstone.ownerId, owners));
    await database().delete(user).where(inArray(user.id, owners));
    for (const ownerId of owners) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of prefixes
      await driver
        .deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix: `${ownerId}/`, tier: 'private' })
        .catch(() => undefined);
    }
    writer.destroy();
    reader.destroy();
    raw.destroy();
    await ownerClient.end();
    await moduleRef.close();
    scratch.remove();
  }, 60_000);

  it('should restore into an empty prefix with a twice-spilled push log as a complete chain', async () => {
    const locator = await newRepository();
    for (let push = 0; push < 8; push += 1) {
      // oxlint-disable-next-line no-await-in-loop -- pushes are ordered
      await fakePush(locator);
    }
    const copied = (await readManifest(locator))!;
    const sourceChain = await chainOf(locator, copied);
    expect(sourceChain.length).toBeGreaterThanOrEqual(2);
    await copy(locator);
    await losePrimary(locator);

    const result = await restore(locator);

    const restored = (await readManifest(locator))!;
    expect(restored).toStrictEqual(result.manifest);
    expect(restored.refs).toStrictEqual(copied.refs);
    expect(restored.incarnation).not.toBe(copied.incarnation);
    expect(restored.generation).toBe(copied.generation + 1);
    expect(restored.committedBy).toBe('restore:rifont');
    // Every link of the copied chain is in the primary again, so EQ11's attribution survives.
    expect(await chainOf(locator, restored)).toStrictEqual(sourceChain);
    // Fresh pack keys, each one the bytes git named.
    const sourceKeys = new Set(copied.packs.map((pack) => pack.key));
    expect(restored.packs).toHaveLength(copied.packs.length);
    for (const pack of restored.packs) {
      expect(sourceKeys.has(pack.key)).toBe(false);
      expect(pack.indexStored).toBe(true);
    }
  }, 120_000);

  it('should restore every LFS object of the project with a matching SHA-256', async () => {
    const locator = await newRepository();
    const content = new Uint8Array(Buffer.from(`dr1 lfs ${run}`));
    const oid = createHash('sha256').update(content).digest('hex');
    await driver.putBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(locator.ownerId, locator.projectId, oid),
      body: content,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database()
      .insert(projectGitLfsObject)
      .values({
        projectId: locator.projectId,
        oid,
        sizeBytes: content.byteLength,
        finalizedAt: new Date(Date.now() - 60_000),
      });
    await fakePush(locator);
    await copy(locator);
    await losePrimary(locator);

    const result = await restore(locator);

    expect(result.lfs).toStrictEqual({ restored: 1, present: 0 });
    const blob = await driver.getBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(locator.ownerId, locator.projectId, oid),
      tier: 'private',
    });
    expect(
      createHash('sha256')
        .update(await buffer(blob.body))
        .digest('hex'),
    ).toBe(oid);
  }, 120_000);

  it('should find a hidden snapshot and a hidden pack by version listing', async () => {
    const locator = await newRepository();
    const manifest = await fakePush(locator);
    await copy(locator);
    await losePrimary(locator);
    for (const key of [
      snapshotKey(locator, manifest.generation, manifest.incarnation),
      repositoryKey(locator, manifest.packs[0]!.key),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- what a stolen copy key can do: hide a name
      await raw.send(new DeleteObjectCommand({ Bucket: copyBucket, Key: key }));
    }

    const result = await restore(locator);

    expect(result.manifest?.refs).toStrictEqual(manifest.refs);
  }, 120_000);

  it('should refuse an erased owner from Postgres, and from the B2 marker alone', async () => {
    const locator = await newRepository();
    await fakePush(locator);
    await copy(locator);
    await losePrimary(locator);
    const deletedAt = new Date();
    await database()
      .insert(storageTombstone)
      .values({ ownerId: locator.ownerId, purgeAfter: deletedAt, erasure: true, createdAt: deletedAt });

    await expect(restore(locator)).rejects.toThrow(/storage_tombstone/u);

    await ensureOwnerMarker(copier, { ownerId: locator.ownerId, deletedAt, purgeAfter: deletedAt, erasure: true });
    await database().delete(storageTombstone).where(eq(storageTombstone.ownerId, locator.ownerId));

    await expect(restore(locator)).rejects.toThrow(/tombstone marker/u);
    await expect(restore(locator, { dryRun: true })).rejects.toThrow(/tombstone marker/u);
    expect(await readManifest(locator)).toBeUndefined();
  }, 120_000);

  it('should commit above the generation Postgres remembers when the primary is empty', async () => {
    const locator = await newRepository();
    await fakePush(locator);
    await copy(locator);
    await losePrimary(locator);
    await database().update(projectGit).set({ generation: 40 }).where(eq(projectGit.projectId, locator.projectId));

    const result = await restore(locator);

    expect(result.manifest?.generation).toBe(41);
    expect(await restore(locator, { generationFloor: 60 }).then((again) => again.manifest?.generation)).toBe(61);
  }, 120_000);

  it('should restore the trusted snapshot past a newer forged one, and the version of a pack that verifies', async () => {
    const locator = await newRepository();
    const manifest = await fakePush(locator);
    await copy(locator);
    await losePrimary(locator);
    // A stolen copy key writes a newer generation naming its own (correctly named) pack, and a truncated pack version.
    const evil = packOf('the attacker');
    const forged = {
      ...manifest,
      generation: manifest.generation + 5,
      refs: {},
      packs: [{ key: evil.key, bytes: evil.bytes.byteLength, indexStored: false }],
    };
    const forgedBytes = encodeManifest(forged);
    const retainUntil = new Date(Date.now() + 10 * 60 * 1000);
    await writer.put(snapshotKey(locator, forged.generation, forged.incarnation), forgedBytes, {
      contentLength: forgedBytes.byteLength,
      sha256: sha256Base64(forgedBytes),
      retainUntil,
    });
    await writer.put(repositoryKey(locator, evil.key), evil.bytes, {
      contentLength: evil.bytes.byteLength,
      sha256: sha256Base64(evil.bytes),
      retainUntil,
    });
    const truncated = new Uint8Array(Buffer.from('PACK'));
    await writer.put(repositoryKey(locator, manifest.packs[0]!.key), truncated, {
      contentLength: truncated.byteLength,
      sha256: sha256Base64(truncated),
      retainUntil,
    });

    const listed = await listCopySnapshots({ database: database(), copy: reader, locator });
    expect(listed.map((snapshot) => [snapshot.generation, snapshot.trusted])).toStrictEqual([
      [forged.generation, false],
      [manifest.generation, true],
    ]);
    const forgedSha = listed[0]!.sha256;

    const result = await restore(locator);
    expect(result.plan.snapshot).toMatchObject({ generation: manifest.generation, trusted: true });
    expect(result.manifest?.refs).toStrictEqual(manifest.refs);

    await expect(restore(locator, { generation: forged.generation })).rejects.toThrow(/--confirm-snapshot/u);
    await expect(restore(locator, { generation: forged.generation, confirmSnapshot: '0'.repeat(64) })).rejects.toThrow(
      /--confirm-snapshot/u,
    );
    const named = await restore(locator, { generation: forged.generation, confirmSnapshot: forgedSha, dryRun: true });
    expect(named.plan.snapshot).toMatchObject({ generation: forged.generation, trusted: false, sha256: forgedSha });
  }, 120_000);

  it('should plan without writing anything on --dry-run', async () => {
    const locator = await newRepository();
    const manifest = await fakePush(locator);
    await copy(locator);
    await losePrimary(locator);

    const result = await restore(locator, { dryRun: true });

    expect(result.manifest).toBeUndefined();
    expect(result.plan).toMatchObject({
      snapshot: { generation: manifest.generation, trusted: true },
      packs: 1,
      packBytes: manifest.packs[0]!.bytes,
      nextGeneration: manifest.generation + 1,
    });
    expect(await readManifest(locator)).toBeUndefined();
    const keys: string[] = [];
    for await (const object of primary.listObjects(locator, '')) {
      keys.push(object.key);
    }
    expect(keys).toStrictEqual([]);
  }, 120_000);

  it('should roll a live primary forward under new keys, deleting nothing, and fsck clean', async () => {
    const locator = await newRepository();
    const client = newClient(scratch);
    client.revise(2);
    const pushed = await pushReal(primary, locator, client.directory, scratch);
    await recordGeneration(locator, pushed.generation);
    await copy(locator);
    // The primary moves on past the copy (a bad push the operator rolls back).
    const main = git(client.directory, 'rev-parse', 'main');
    client.revise(3);
    const diverged = await pushReal(primary, locator, client.directory, scratch);
    await recordGeneration(locator, diverged.generation);
    const before: string[] = [];
    for await (const object of primary.listObjects(locator, 'packs/')) {
      before.push(object.key);
    }

    const result = await restore(locator);

    expect(result.manifest?.refs).toStrictEqual(pushed.refs);
    expect(result.manifest?.generation).toBe(diverged.generation + 1);
    const after: string[] = [];
    for await (const object of primary.listObjects(locator, 'packs/')) {
      after.push(object.key);
    }
    expect(after).toStrictEqual(expect.arrayContaining(before));
    const lease = await hydrateLease({ store: primary, locator, parentDirectory: scratch.make('verify') });
    try {
      git(lease.directory, 'fsck', '--strict', '--no-progress');
      expect(git(lease.directory, 'rev-parse', 'refs/heads/main')).toBe(main);
    } finally {
      await lease.dispose();
    }
  }, 120_000);

  it(`should restore a ${String(largePackMebibytes)} MiB pack within ${String(streamedGrowthBoundMebibytes)} MiB of retained memory`, async () => {
    const locator = await newRepository();
    const pushed = await pushReal(
      primary,
      locator,
      incompressibleClient(scratch.make('large'), largePackMebibytes),
      scratch,
    );
    await recordGeneration(locator, pushed.generation);
    await copy(locator);
    await losePrimary(locator);

    const { result, growth } = await measureGrowth(async () => restore(locator));
    recordMeasurement(
      `dr1 restore-from-copy pack=${String(largePackMebibytes)}MiB retained heap+arrayBuffers peak growth=${mebibytes(growth.heapAndBuffers)}MiB rss peak growth=${mebibytes(growth.rss)}MiB`,
    );

    expect(result.manifest?.refs).toStrictEqual(pushed.refs);
    expect(growth.heapAndBuffers).toBeLessThan(streamedGrowthBoundMebibytes * 1024 * 1024);
  }, 600_000);
});
/* eslint-enable @typescript-eslint/naming-convention -- end environment variable names and AWS SDK inputs */
