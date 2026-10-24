import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { buffer } from 'node:stream/consumers';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectLockConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import * as schema from '#database/schema.js';
import { project, projectGit, projectGitLfsObject, storageTombstone, user } from '#database/schema.js';
import { installMaintenanceRole, installMirrorRole } from '#database/service-roles.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { CommitToken } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { copyRepository, markTombstonedOwners } from '#api/git/mirror/copier.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { S3MirrorDestination } from '#api/git/mirror/destination.js';
import { lfsKey, ownerMarkerKey, repositoryKey, repositoryPrefix, snapshotKey } from '#api/git/mirror/keys.js';
import { MirrorMetrics } from '#api/git/mirror/metrics.js';
import { recordingMeter } from '#api/git/mirror/mirror.fixture.js';
import { runRetentionSweep } from '#api/git/mirror/retention.js';
import { R2MirrorSource } from '#api/git/mirror/source.js';
import { PostgresMirrorLedger, copyPendingOnAdvance } from '#api/git/mirror/watermark.js';

/**
 * DM1 end to end on the CI services: the R2 repository store on MinIO's private
 * bucket as the primary, a MinIO bucket under Object Lock as the copy (B2's
 * stand-in), and PostgreSQL migrated by the release job, with the copier
 * connected as `tau_mirror` so every query proves its grant.
 *
 * Compliance-locked versions cannot be removed, so every run writes under fresh
 * owner and project ids and locks for minutes, not days; the copy bucket must be
 * the local `tau-content-second-copy` on a loopback endpoint.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and AWS SDK inputs */
const databaseUrl = process.env.DATABASE_URL;
const copyBucket = process.env['TAU_S3_COPY_BUCKET'] ?? 'tau-content-second-copy';
const copyEndpoint = process.env['TAU_S3_COPY_ENDPOINT'] ?? process.env.TAU_S3_ENDPOINT;
const copyCredentials = {
  accessKeyId: process.env['TAU_S3_COPY_ACCESS_KEY_ID'] ?? process.env.TAU_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env['TAU_S3_COPY_SECRET_ACCESS_KEY'] ?? process.env.TAU_S3_SECRET_ACCESS_KEY,
};

/** Minutes, as fractions of a day: long enough to outlive the suite, short enough not to pile up. */
const retentionDays = 15 / (24 * 60);
const extendBelowDays = 10 / (24 * 60);

const run = randomUUID().slice(0, 8);
const ownerId = `user_dm1_${run}`;
const goneOwnerId = `user_dm1_gone_${run}`;
const projectId = `proj_dm1_${run}`;
const locator = repositoryLocator({ ownerId, projectId });

const sha256Base64 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('base64');

describe('the B2 copier against MinIO with Object Lock and PostgreSQL', () => {
  let moduleRef: TestingModule;
  let store: S3RepositoryStore;
  let driver: ObjectStorageService;
  let ownerClient: postgres.Sql;
  let mirrorClient: postgres.Sql;
  let raw: S3Client;
  let destination: S3MirrorDestination;
  let context: CopierContext;
  let token: CommitToken | 'absent' = 'absent';
  let base: Manifest | undefined;
  let clockOffset = 0;

  const ownerDatabase = () => drizzle(ownerClient, { schema });

  /** One push to the primary through the store's own commit, recorded as `recordGeneration` records it. */
  const push = async (): Promise<Manifest> => {
    const body = Buffer.from(`PACK${run}-${String((base?.generation ?? 0) + 1)}-${randomBytes(8).toString('hex')}`);
    const pack = new Uint8Array(Buffer.concat([body, createHash('sha1').update(body).digest()]));
    const packKey = `packs/pack-${createHash('sha1').update(body).digest('hex')}-${randomBytes(4).toString('hex')}.pack`;
    await store.putObject(locator, packKey, pack, {
      contentLength: pack.byteLength,
      sha256: sha256Base64(pack),
    });
    const index = new Uint8Array(Buffer.from(`idx:${packKey}`));
    await store.putObject(locator, `${packKey.slice(0, -5)}.idx`, index, {
      contentLength: index.byteLength,
      sha256: sha256Base64(index),
    });
    const next = succeedManifest(
      base,
      {
        refs: {
          'refs/heads/main': {
            oid: createHash('sha1').update(packKey).digest('hex'),
          },
        },
        packs: [...(base?.packs ?? []), { key: packKey, bytes: pack.byteLength, indexStored: true }],
        committedBy: ownerId,
      },
      new Date(Date.now() + clockOffset),
    );
    const committed = await store.commitManifest(locator, encodeManifest(next), token);
    if (committed === 'lost') {
      throw new Error('lost the manifest race in a single-writer test');
    }
    token = committed;
    base = next;
    await ownerDatabase()
      .update(projectGit)
      .set({
        generation: next.generation,
        copyPendingSince: copyPendingOnAdvance(next.generation),
      })
      .where(eq(projectGit.projectId, projectId));
    return next;
  };

  const row = async () => {
    const [found] = await ownerDatabase().select().from(projectGit).where(eq(projectGit.projectId, projectId));
    return found!;
  };

  const versionsOf = async (prefix: string) => {
    const found = [];
    for await (const version of destination.listVersions(prefix)) {
      found.push(version);
    }
    return found;
  };

  beforeAll(async () => {
    const endpoint = new URL(copyEndpoint);
    if (copyBucket !== 'tau-content-second-copy' || !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
      throw new Error(`Refusing to write compliance-locked objects to '${copyBucket}' at a non-local endpoint`);
    }
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();
    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the DM1 mirror suite');
    store = new S3RepositoryStore(driver);

    raw = new S3Client({
      endpoint: copyEndpoint,
      region: process.env.TAU_S3_REGION,
      forcePathStyle: true,
      credentials: copyCredentials,
    });
    try {
      await raw.send(
        new CreateBucketCommand({
          Bucket: copyBucket,
          ObjectLockEnabledForBucket: true,
        }),
      );
    } catch (error) {
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes((error as Error).name)) {
        throw error;
      }
    }
    const lock = await raw.send(new GetObjectLockConfigurationCommand({ Bucket: copyBucket }));
    expect(lock.ObjectLockConfiguration?.ObjectLockEnabled).toBe('Enabled');

    destination = new S3MirrorDestination({
      endpoint: copyEndpoint,
      region: process.env.TAU_S3_REGION,
      bucket: copyBucket,
      forcePathStyle: true,
      credentials: copyCredentials,
    });

    ownerClient = postgres(databaseUrl, {
      max: 2,
      prepare: false,
      onnotice: () => undefined,
    });
    // The release job installs both; reinstalling proves it idempotent against a migrated database.
    await installMirrorRole(ownerClient);
    await installMaintenanceRole(ownerClient);
    mirrorClient = postgres(databaseUrl, {
      max: 2,
      prepare: false,
      connection: { role: 'tau_mirror' },
    });

    await ownerDatabase()
      .insert(user)
      .values({ id: ownerId, name: 'DM1', email: `${ownerId}@tau.test` });
    await ownerDatabase().insert(project).values({ id: projectId, ownerId, name: 'dm1 mirror' });
    await ownerDatabase().insert(projectGit).values({ projectId });

    const { meter } = recordingMeter();
    context = {
      source: new R2MirrorSource(store, driver),
      destination,
      ledger: new PostgresMirrorLedger(drizzle(mirrorClient, { schema })),
      metrics: new MirrorMetrics(meter),
      now: () => new Date(Date.now() + clockOffset),
      retentionDays,
      extendBelowDays,
    };
  }, 60_000);

  afterAll(async () => {
    await ownerDatabase()
      .delete(storageTombstone)
      .where(inArray(storageTombstone.ownerId, [goneOwnerId]));
    await ownerDatabase().delete(user).where(eq(user.id, ownerId));
    await store.deleteObjects(locator, ['manifest.json']).catch(() => undefined);
    destination.destroy();
    raw.destroy();
    await mirrorClient.end();
    await ownerClient.end();
    await moduleRef.close();
  });

  it('should copy two generations as tau_mirror: objects, then the snapshot, then the watermark', async () => {
    await push();
    const manifest = await push();
    const pending = await row();
    expect(pending.copyPendingSince).not.toBeNull();

    const result = await copyRepository(context, (await context.ledger.candidate(projectId))!);

    expect(result).toMatchObject({
      outcome: 'copied',
      generation: 2,
      objects: 5,
    });
    const snapshot = snapshotKey(locator, 2, manifest.incarnation);
    const versions = await versionsOf(repositoryPrefix(locator));
    expect(versions.map((version) => version.key).sort()).toStrictEqual(
      [
        ...manifest.packs.flatMap((pack) => [
          repositoryKey(locator, pack.key),
          repositoryKey(locator, `${pack.key.slice(0, -5)}.idx`),
        ]),
        snapshot,
      ].sort(),
    );
    const snapshotVersion = versions.find((version) => version.key === snapshot)!;
    const head = await destination.head(snapshot, snapshotVersion.versionId);
    const bytes = new Uint8Array(await buffer(await destination.get(snapshot, snapshotVersion.versionId)));
    expect(head?.sha256).toBe(sha256Base64(bytes));
    expect(head?.retainUntil?.getTime()).toBeGreaterThan(Date.now());

    const copied = await row();
    expect(copied).toMatchObject({
      generation: 2,
      copiedGeneration: 2,
      copyPendingSince: null,
      copiedManifestSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(copied.copyLockedUntil).not.toBeNull();
  });

  it('should copy an LFS object finalized by the commit and mark it copied', async () => {
    const content = new Uint8Array(Buffer.from(`lfs ${run}`));
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
      .values({
        projectId,
        oid,
        sizeBytes: content.byteLength,
        finalizedAt: new Date(Date.now() - 1000),
      });
    await push();

    const result = await copyRepository(context, (await context.ledger.candidate(projectId))!);

    expect(result).toMatchObject({ outcome: 'copied', generation: 3 });
    const lfsVersions = await versionsOf(lfsKey(locator, oid));
    expect(lfsVersions.map((version) => version.key)).toStrictEqual([lfsKey(locator, oid)]);
    const [lfsRow] = await ownerDatabase()
      .select({ copiedAt: projectGitLfsObject.copiedAt })
      .from(projectGitLfsObject)
      .where(eq(projectGitLfsObject.oid, oid));
    expect(lfsRow?.copiedAt).not.toBeNull();
  });

  it('should extend an idle repository through the sweep, and the store should refuse a shortening', async () => {
    const { copyLockedUntil: before } = await row();
    clockOffset = 6 * 60 * 1000;

    const sweep = await runRetentionSweep(context);

    expect(sweep.swept).toBeGreaterThanOrEqual(1);
    const { copyLockedUntil: after } = await row();
    if (before === null || after === null) {
      throw new Error('the copy recorded no lock');
    }
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    const [pack] = await versionsOf(repositoryKey(locator, base!.packs[0]!.key));
    const head = await destination.head(pack!.key, pack!.versionId);
    // MinIO keeps the lock to the second.
    expect(Math.abs((head?.retainUntil?.getTime() ?? 0) - after.getTime())).toBeLessThan(1000);
    await expect(destination.extendRetention(pack!.key, pack!.versionId, before)).rejects.toThrow();
  });

  it('should list a hide marker as one and keep the locked version beside it', async () => {
    const key = repositoryKey(locator, base!.packs[0]!.key);
    await raw.send(new DeleteObjectCommand({ Bucket: copyBucket, Key: key }));

    const versions = await versionsOf(key);

    expect(versions.filter((version) => version.isHideMarker)).toHaveLength(1);
    expect(versions.filter((version) => !version.isHideMarker)).toHaveLength(1);
  });

  it('should write a deleted owner marker and record it as tau_mirror', async () => {
    const deletedAt = new Date();
    await ownerDatabase().insert(storageTombstone).values({
      ownerId: goneOwnerId,
      purgeAfter: deletedAt,
      erasure: true,
      createdAt: deletedAt,
    });

    await markTombstonedOwners(context, 1000);

    const [marked] = await ownerDatabase()
      .select({
        copyMarkedAt: storageTombstone.copyMarkedAt,
        createdAt: storageTombstone.createdAt,
      })
      .from(storageTombstone)
      .where(eq(storageTombstone.ownerId, goneOwnerId));
    expect(marked?.copyMarkedAt).not.toBeNull();
    const markers = await versionsOf(`tenants/${goneOwnerId}/`);
    expect(markers.map((version) => version.key)).toStrictEqual([ownerMarkerKey(goneOwnerId, marked!.createdAt)]);
  });

  it('should hold tau_mirror to the copy columns', async () => {
    await expect(mirrorClient`select email from "user" limit 1`).rejects.toThrow(/permission denied/u);
    await expect(mirrorClient`select name from project limit 1`).rejects.toThrow(/permission denied/u);
    await expect(
      mirrorClient`update project_git set generation = generation where project_id = ${projectId}`,
    ).rejects.toThrow(/permission denied/u);
    await expect(mirrorClient`delete from project_git where project_id = ${projectId}`).rejects.toThrow(
      /permission denied/u,
    );
  });

  it('should give tau_maintenance exactly the runtime role it moves out of the API with', async () => {
    const [membership] = await ownerClient<Array<{ inherits: boolean; billing: boolean }>>`
      select pg_has_role('tau_maintenance', 'tau_api_runtime', 'USAGE') as inherits,
             pg_has_role('tau_maintenance', 'tau_billing_runtime', 'USAGE') as billing`;
    expect(membership).toStrictEqual({ inherits: true, billing: true });
    // The same table privileges as the role the passes run under today, the billing-protected tables included.
    for (const [table, privilege] of [
      ['public.project_deletion', 'DELETE'],
      ['public.storage_tombstone', 'UPDATE'],
      ['public.project_git_lfs_object', 'DELETE'],
      ['public.subscription', 'DELETE'],
      ['public.subscription', 'SELECT'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- five catalogue reads
      const [same] = await ownerClient<Array<{ maintenance: boolean; runtime: boolean }>>`
        select has_table_privilege('tau_maintenance', ${table}, ${privilege}) as maintenance,
               has_table_privilege('tau_api_runtime', ${table}, ${privilege}) as runtime`;
      expect({ table, privilege, granted: same?.maintenance }).toStrictEqual({
        table,
        privilege,
        granted: same?.runtime,
      });
    }
    const [deletion] = await ownerClient<Array<{ granted: boolean }>>`
      select has_table_privilege('tau_maintenance', 'public.project_deletion', 'DELETE') as granted`;
    expect(deletion?.granted).toBe(true);
  });

  it('should set a login from a SCRAM verifier and leave it when the password is unset', async () => {
    const password = randomBytes(24).toString('base64url');
    await installMirrorRole(ownerClient, password);
    await installMirrorRole(ownerClient);

    const url = new URL(databaseUrl);
    url.username = 'tau_mirror';
    url.password = password;
    const login = postgres(url.toString(), { max: 1, prepare: false });
    try {
      const [who] = await login<Array<{ name: string }>>`select current_user as name`;
      expect(who?.name).toBe('tau_mirror');
    } finally {
      await login.end();
    }
    const [role] = await ownerClient<Array<{ rolcanlogin: boolean }>>`
      select rolcanlogin from pg_roles where rolname = 'tau_mirror'`;
    expect(role?.rolcanlogin).toBe(true);
    await expect(installMaintenanceRole(ownerClient, "x' superuser --")).rejects.toThrow(
      /^TAU_MAINTENANCE_DATABASE_PASSWORD must be/u,
    );
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end environment variable names and AWS SDK inputs */
