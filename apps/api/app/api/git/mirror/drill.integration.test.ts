import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { S3Client } from '@aws-sdk/client-s3';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import * as schema from '#database/schema.js';
import { mirrorDrillRun, project, projectGit, projectGitLfsObject, storageTombstone, user } from '#database/schema.js';
import { installMirrorRole } from '#database/service-roles.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { copyRepository } from '#api/git/mirror/copier.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { S3MirrorDestination } from '#api/git/mirror/destination.js';
import { PostgresDrillLedger, gitPackChecker, runVerifyDrill } from '#api/git/mirror/drill.js';
import type { DrillContext, DrillLedger } from '#api/git/mirror/drill.js';
import { repositoryKey } from '#api/git/mirror/keys.js';
import { MirrorMetrics } from '#api/git/mirror/metrics.js';
import { recordingMeter, total } from '#api/git/mirror/mirror.fixture.js';
import { R2MirrorSource } from '#api/git/mirror/source.js';
import {
  git,
  lockedCopyBucket,
  newClient,
  pushReal,
  scratchDirectories,
} from '#api/git/mirror/real-repository.fixture.js';
import { PostgresMirrorLedger, copyPendingOnAdvance } from '#api/git/mirror/watermark.js';

/**
 * DR2-lite end to end: a real repository (packs git wrote) pushed through the
 * store, copied by the copier as `tau_mirror` into MinIO under Object Lock, then
 * read back by the drill as `tau_mirror` through a read-only client, every pack
 * through a real `git index-pack`. The run lands in `mirror_drill_run`.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
const databaseUrl = process.env.DATABASE_URL;
const copyBucket = process.env['TAU_S3_COPY_BUCKET'] ?? 'tau-content-second-copy';
const copyEndpoint = process.env['TAU_S3_COPY_ENDPOINT'] ?? process.env.TAU_S3_ENDPOINT;
const copyCredentials = {
  accessKeyId: process.env['TAU_S3_COPY_ACCESS_KEY_ID'] ?? process.env.TAU_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env['TAU_S3_COPY_SECRET_ACCESS_KEY'] ?? process.env.TAU_S3_SECRET_ACCESS_KEY,
};
/* eslint-enable @typescript-eslint/naming-convention -- end environment variable names */

const run = randomUUID().slice(0, 8);
const ownerId = `user_dr2_${run}`;
const goneOwnerId = `user_dr2_gone_${run}`;
const projectId = `proj_dr2_${run}`;
const goneProjectId = `proj_dr2_gone_${run}`;
const locator = repositoryLocator({ ownerId, projectId });
const environment = `drill-test-${run}`;

describe('the verify drill against MinIO with Object Lock, PostgreSQL and git', () => {
  const scratch = scratchDirectories('tau-dr2');
  let moduleRef: TestingModule;
  let store: S3RepositoryStore;
  let driver: ObjectStorageService;
  let ownerClient: postgres.Sql;
  let mirrorClient: postgres.Sql;
  let raw: S3Client;
  let writer: S3MirrorDestination;
  let reader: S3MirrorDestination;
  let copier: CopierContext;

  const ownerDatabase = () => drizzle(ownerClient, { schema });

  /** The real ledger as `tau_mirror`, its sample narrowed to this run's repository: the CI database is shared. */
  const drillContext = (): DrillContext & { recorded: ReturnType<typeof recordingMeter>['recorded'] } => {
    const ledger = new PostgresDrillLedger(drizzle(mirrorClient, { schema }));
    const narrowed: DrillLedger = Object.assign(Object.create(ledger) as DrillLedger, {
      async sample(limit: number) {
        const all = await ledger.sample(100_000);
        return all.filter((found) => found.projectId === projectId).slice(0, limit);
      },
      // Rows go under this run's own environment name, so the suite reads and removes only its own.
      async start(_environment: string, at: Date) {
        return ledger.start(environment, at);
      },
    });
    const { meter, recorded } = recordingMeter();
    return {
      copy: reader,
      ledger: narrowed,
      metrics: new MirrorMetrics(meter),
      environment: 'development',
      sample: 3,
      recorded,
    };
  };

  const record = async (generation: number): Promise<void> => {
    await ownerDatabase()
      .update(projectGit)
      .set({ generation, copyPendingSince: copyPendingOnAdvance(generation) })
      .where(eq(projectGit.projectId, projectId));
  };

  const copy = async (target: RepositoryLocator = locator): Promise<void> => {
    const candidate = await copier.ledger.candidate(target.projectId);
    const result = await copyRepository(copier, candidate!);
    expect(result.outcome).toBe('copied');
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();
    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the DR2 drill suite');
    store = new S3RepositoryStore(driver);
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
    reader = new S3MirrorDestination(account, undefined, { readOnly: true });

    ownerClient = postgres(databaseUrl, { max: 2, prepare: false, onnotice: () => undefined });
    await installMirrorRole(ownerClient);
    mirrorClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_mirror' } });
    await ownerDatabase()
      .insert(user)
      .values([
        { id: ownerId, name: 'DR2', email: `${ownerId}@tau.test` },
        { id: goneOwnerId, name: 'DR2 gone', email: `${goneOwnerId}@tau.test` },
      ]);
    await ownerDatabase()
      .insert(project)
      .values([
        { id: projectId, ownerId, name: 'dr2 drill' },
        { id: goneProjectId, ownerId: goneOwnerId, name: 'dr2 erased' },
      ]);
    await ownerDatabase()
      .insert(projectGit)
      .values([{ projectId }, { projectId: goneProjectId }]);

    const { meter } = recordingMeter();
    copier = {
      source: new R2MirrorSource(store, driver),
      destination: writer,
      ledger: new PostgresMirrorLedger(drizzle(mirrorClient, { schema })),
      metrics: new MirrorMetrics(meter),
      retentionDays: 15 / (24 * 60),
      extendBelowDays: 10 / (24 * 60),
    };

    const client = newClient(scratch);
    const first = await pushReal(store, locator, client.directory, scratch);
    await record(first.generation);
    client.revise(2);
    const second = await pushReal(store, locator, client.directory, scratch);
    await record(second.generation);
    const content = new Uint8Array(Buffer.from(`dr2 lfs ${run}`));
    const oid = createHash('sha256').update(content).digest('hex');
    await driver.putBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(ownerId, projectId, oid),
      body: content,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await ownerDatabase()
      .insert(projectGitLfsObject)
      .values({ projectId, oid, sizeBytes: content.byteLength, finalizedAt: new Date(Date.now() - 60_000) });
    await copy();
  }, 120_000);

  afterAll(async () => {
    await ownerDatabase().delete(mirrorDrillRun).where(eq(mirrorDrillRun.environment, environment));
    await ownerDatabase().delete(storageTombstone).where(eq(storageTombstone.ownerId, goneOwnerId));
    await ownerDatabase()
      .delete(user)
      .where(inArray(user.id, [ownerId, goneOwnerId]));
    await driver
      .deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix: `${ownerId}/`, tier: 'private' })
      .catch(() => undefined);
    writer.destroy();
    reader.destroy();
    raw.destroy();
    await mirrorClient.end();
    await ownerClient.end();
    await moduleRef.close();
    scratch.remove();
  }, 60_000);

  it('should accept a pack git wrote and name it, and refuse bytes that only hash to their name', async () => {
    const client = newClient(scratch);
    git(client.directory, 'repack', '-a', '-d', '-q');
    const packDirectory = path.join(client.directory, '.git/objects/pack');
    const file = readdirSync(packDirectory).find((name) => name.endsWith('.pack'))!;
    const bytes = readFileSync(path.join(packDirectory, file));
    const check = await gitPackChecker();
    for await (const chunk of Readable.from([bytes.subarray(0, 7), bytes.subarray(7)])) {
      await check.write(chunk as Uint8Array<ArrayBuffer>);
    }
    expect(await check.end()).toBe(/pack-([\da-f]{40})\.pack/u.exec(file)?.[1]);

    const body = Buffer.from('PACK not a pack at all');
    const forged = Buffer.concat([body, createHash('sha1').update(body).digest()]);
    const refused = await gitPackChecker();
    await refused.write(forged);
    expect(await refused.end()).toBeUndefined();
  });

  it('should pass a real copy as tau_mirror with read calls only, and record the run', async () => {
    const context = drillContext();

    const result = await runVerifyDrill(context);

    expect(result.failed).toStrictEqual({});
    expect(result).toMatchObject({ outcome: 'pass', repositories: 1 });
    // The snapshot, two packs and their indexes, and the LFS object.
    expect(result.objects).toBe(6);
    expect(total(context.recorded, 'tau.mirror.drill_runs', { outcome: 'pass' })).toBe(1);
    const rows = await ownerDatabase().select().from(mirrorDrillRun).where(eq(mirrorDrillRun.environment, environment));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'pass', failedChecks: [], restoredBytes: result.bytes });
    expect(rows[0]?.finishedAt).not.toBeNull();
  }, 120_000);

  it('should skip a forged later version of a pack for the one that verifies', async () => {
    const read = await store.readManifest(locator);
    const manifest = decodeManifest(read!.manifest);
    const key = repositoryKey(locator, manifest.packs[0]!.key);
    const truncated = new Uint8Array(Buffer.from('PACK truncated'));
    await writer.put(key, truncated, {
      contentLength: truncated.byteLength,
      sha256: createHash('sha256').update(truncated).digest('base64'),
      retainUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    const result = await runVerifyDrill(drillContext());

    expect(result.failed).toStrictEqual({});
    expect(result.outcome).toBe('pass');
  }, 120_000);

  it('should fail snapshot when no version matches the trust root Postgres holds', async () => {
    const [before] = await ownerDatabase()
      .select({ sha: projectGit.copiedManifestSha256 })
      .from(projectGit)
      .where(eq(projectGit.projectId, projectId));
    await ownerDatabase()
      .update(projectGit)
      .set({ copiedManifestSha256: '0'.repeat(64) })
      .where(eq(projectGit.projectId, projectId));
    try {
      const result = await runVerifyDrill(drillContext());

      expect(result).toMatchObject({ outcome: 'fail', failed: { snapshot: 1 } });
    } finally {
      await ownerDatabase()
        .update(projectGit)
        .set({ copiedManifestSha256: before?.sha ?? null })
        .where(eq(projectGit.projectId, projectId));
    }
  }, 120_000);

  it('should sample only copied repositories of owners that are not erased, and read the last pass back', async () => {
    await ownerDatabase()
      .update(projectGit)
      .set({ copiedGeneration: 1, copiedManifestSha256: 'f'.repeat(64) })
      .where(eq(projectGit.projectId, goneProjectId));
    await ownerDatabase()
      .insert(storageTombstone)
      .values({ ownerId: goneOwnerId, purgeAfter: new Date(), erasure: true });
    const ledger = new PostgresDrillLedger(drizzle(mirrorClient, { schema }));

    const all = await ledger.sample(100_000);
    const sampled = all.map((found) => found.projectId);

    expect(sampled).toContain(projectId);
    expect(sampled).not.toContain(goneProjectId);
    expect(await ledger.lastPass(environment)).toBeInstanceOf(Date);
    expect(await ledger.lastPass(`never-${run}`)).toBeUndefined();
  });
});
