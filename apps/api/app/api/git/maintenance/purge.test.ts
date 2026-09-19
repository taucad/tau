import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import { storageTombstone, user } from '#database/schema.js';
import * as schema from '#database/schema.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { maxPurgeObjectsWithoutConfirmation, purgeTombstonedTenants } from '#api/git/maintenance/purge.js';
import { databaseReachable } from '#testing/database-reachable.js';

/**
 * S5 and S10 on MinIO and PostgreSQL: a tombstoned tenant's prefixes are
 * removed after the ruled window, immediately on a verified erasure, never
 * without a tombstone, and never unbounded without an explicit confirmation.
 *
 * The suite needs `pnpm infra:up` (MinIO and PostgreSQL) and a migrated
 * database: `storage_tombstone` is the gate the whole job turns on, and
 * mocking it away would test the mock.
 */

// === harness =============================================================

const databaseUrl = process.env.DATABASE_URL;

const shortLivedClient = (): postgres.Sql => postgres(databaseUrl, { max: 1, prepare: false });

describe.skipIf(!(await databaseReachable(databaseUrl)))('tenant purge', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let store: S3RepositoryStore;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const owners: string[] = [];

  /** A tenant holding one repository (manifest + two packs) and one LFS object. */
  const seedTenant = async (): Promise<{ locator: RepositoryLocator; objects: number; bytes: number }> => {
    const locator = repositoryLocator({
      ownerId: `user-w6p-${randomBytes(6).toString('hex')}`,
      projectId: `proj-${randomBytes(6).toString('hex')}`,
    });
    owners.push(locator.ownerId);

    for (const name of ['pack-a', 'pack-b']) {
      const body = new Uint8Array(new ArrayBuffer(16));
      // oxlint-disable-next-line no-await-in-loop -- two fixture objects, written in order
      await store.putObject(locator, `packs/${name}-${randomBytes(4).toString('hex')}.pack`, body, {
        contentLength: body.byteLength,
        sha256: createHash('sha256').update(body).digest('base64'),
      });
    }

    const manifest = succeedManifest(undefined, { refs: {}, packs: [], retired: [], committedBy: 'seed' });
    await store.commitManifest(locator, encodeManifest(manifest), 'absent');

    const lfs = new Uint8Array(new ArrayBuffer(8));
    await driver.putBlob({
      namespace: 'tenants',
      key: `${locator.ownerId}/lfs/${locator.projectId}/objects/${randomBytes(8).toString('hex')}`,
      body: lfs,
      contentType: 'application/octet-stream',
      tier: 'private',
    });

    // Two packs of 16 bytes, one manifest and one 8-byte LFS object.
    const listed = await objectsWithBytes(locator.ownerId);
    return { locator, objects: listed.length, bytes: listed.reduce((total, object) => total + object.bytes, 0) };
  };

  const seedTombstone = async (ownerId: string, args: { purgeAfter: Date; erasure?: boolean }): Promise<void> => {
    await database
      .insert(storageTombstone)
      .values({ ownerId, purgeAfter: args.purgeAfter, erasure: args.erasure ?? false });
  };

  const objectsWithBytes = async (ownerId: string): Promise<Array<{ key: string; bytes: number }>> => {
    const listed: Array<{ key: string; bytes: number }> = [];
    for await (const object of driver.listObjects({
      namespace: 'tenants',
      keyPrefix: `${ownerId}/`,
      tier: 'private',
    })) {
      listed.push({ key: object.key, bytes: object.bytes });
    }
    return listed.sort((left, right) => (left.key < right.key ? -1 : 1));
  };

  const objectsUnder = async (ownerId: string): Promise<string[]> => {
    const listed = await objectsWithBytes(ownerId);
    return listed.map((object) => object.key);
  };

  const tombstoneRow = async (ownerId: string): Promise<typeof storageTombstone.$inferSelect | undefined> =>
    database.query.storageTombstone.findFirst({ where: eq(storageTombstone.ownerId, ownerId) });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the W6 purge suite');
    store = new S3RepositoryStore(driver);
    client = shortLivedClient();
    database = drizzle(client, { schema });
  }, 60_000);

  afterAll(async () => {
    await Promise.all(
      owners.map(async (ownerId) =>
        driver.deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix: `${ownerId}/`, tier: 'private' }),
      ),
    );
    if (owners.length > 0) {
      await database.delete(storageTombstone).where(inArray(storageTombstone.ownerId, owners));
      await database.delete(user).where(inArray(user.id, owners));
    }
    await client.end();
  }, 60_000);

  it('should remove every prefix of a tenant whose window has passed', async () => {
    const { locator, objects } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });

    const outcomes = await purgeTombstonedTenants({ database, driver, ownerIds: owners });

    const outcome = outcomes.find((candidate) => candidate.ownerId === locator.ownerId);
    expect(outcome?.status).toBe('purged');
    expect(outcome?.plan?.objects).toBe(objects);
    expect(await objectsUnder(locator.ownerId)).toStrictEqual([]);
  }, 120_000);

  it('should record what it removed on the tombstone row', async () => {
    const { locator, bytes } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });

    await purgeTombstonedTenants({ database, driver, ownerIds: owners });

    const row = await tombstoneRow(locator.ownerId);
    expect(row?.purgedAt).toBeInstanceOf(Date);
    expect(row?.purgedObjects).toBe(4);
    expect(row?.purgedBytes).toBe(bytes);
    expect(await objectsUnder(locator.ownerId)).toStrictEqual([]);
  }, 120_000);

  it('should leave a tenant whose window has not passed untouched', async () => {
    const { locator } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() + 60_000) });
    const before = await objectsUnder(locator.ownerId);

    const outcomes = await purgeTombstonedTenants({ database, driver, ownerIds: owners });

    expect(outcomes.some((candidate) => candidate.ownerId === locator.ownerId)).toBe(false);
    expect(await objectsUnder(locator.ownerId)).toStrictEqual(before);
  }, 120_000);

  it('should purge a verified erasure immediately, before its window', async () => {
    const { locator } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() + 60_000), erasure: true });

    await purgeTombstonedTenants({ database, driver, ownerIds: owners });

    expect(await objectsUnder(locator.ownerId)).toStrictEqual([]);
  }, 120_000);

  it('should refuse a tenant above the object bound without an explicit confirmation', async () => {
    const { locator } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });
    const before = await objectsUnder(locator.ownerId);

    const outcomes = await purgeTombstonedTenants({ database, driver, ownerIds: owners, objectBound: 1 });

    expect(outcomes.find((candidate) => candidate.ownerId === locator.ownerId)?.status).toBe('refused');
    expect(await objectsUnder(locator.ownerId)).toStrictEqual(before);
  }, 120_000);

  it('should purge above the bound once that owner is confirmed', async () => {
    const { locator } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });

    const outcomes = await purgeTombstonedTenants({
      database,
      driver,
      ownerIds: owners,
      objectBound: 1,
      confirmOwnerId: locator.ownerId,
    });

    expect(outcomes.find((candidate) => candidate.ownerId === locator.ownerId)?.status).toBe('purged');
    expect(await objectsUnder(locator.ownerId)).toStrictEqual([]);
  }, 120_000);

  it('should plan without deleting under a dry run', async () => {
    const { locator, objects } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });
    const before = await objectsUnder(locator.ownerId);

    const outcomes = await purgeTombstonedTenants({ database, driver, ownerIds: owners, dryRun: true });

    const outcome = outcomes.find((candidate) => candidate.ownerId === locator.ownerId);
    expect(outcome?.status).toBe('planned');
    expect(outcome?.plan?.objects).toBe(objects);
    expect(outcome?.plan?.prefixes).toStrictEqual([`${locator.ownerId}/repos/`, `${locator.ownerId}/lfs/`]);
    expect(await objectsUnder(locator.ownerId)).toStrictEqual(before);
  }, 120_000);

  it('should tombstone every manifest while its bytes are still present', async () => {
    const { locator } = await seedTenant();
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });
    const observed: Array<{ ownerId: string; projectId: string; objects: number }> = [];

    // The fence only helps an in-flight lease if it lands *before* the bytes go
    // (NI12), so the wrapper records what the store still held at that moment.
    const fencing: RepositoryStore = {
      capabilities: store.capabilities,
      readManifest: async (target) => store.readManifest(target),
      // oxlint-disable-next-line max-params -- the port's putObject signature, delegated verbatim
      putObject: async (target, key, body, options) => store.putObject(target, key, body, options),
      getObject: async (target, key, range) => store.getObject(target, key, range),
      listObjects: (target, prefix) => store.listObjects(target, prefix),
      deleteObjects: async (target, keys) => store.deleteObjects(target, keys),
      commitManifest: async (target, next, expected) => {
        const present = await objectsUnder(target.ownerId);
        observed.push({ ownerId: target.ownerId, projectId: target.projectId, objects: present.length });
        return store.commitManifest(target, next, expected);
      },
    };

    await purgeTombstonedTenants({ database, driver, ownerIds: owners, store: fencing });

    expect(observed.filter((entry) => entry.ownerId === locator.ownerId)).toStrictEqual([
      { ownerId: locator.ownerId, projectId: locator.projectId, objects: 4 },
    ]);
    expect(await objectsUnder(locator.ownerId)).toStrictEqual([]);
  }, 120_000);

  it('should skip a tombstoned owner whose user row is still live', async () => {
    const { locator } = await seedTenant();
    await database
      .insert(user)
      .values({ id: locator.ownerId, name: 'Live owner', email: `${locator.ownerId}@example.invalid` });
    await seedTombstone(locator.ownerId, { purgeAfter: new Date(Date.now() - 1000) });
    const before = await objectsUnder(locator.ownerId);

    const outcomes = await purgeTombstonedTenants({ database, driver, ownerIds: owners });

    expect(outcomes.find((candidate) => candidate.ownerId === locator.ownerId)?.status).toBe('live-owner');
    expect(await objectsUnder(locator.ownerId)).toStrictEqual(before);
    const row = await tombstoneRow(locator.ownerId);
    expect(row?.purgedAt).toBeNull();
  }, 120_000);

  it('should refuse an owner id that is not a storable identifier', async () => {
    const ownerId = 'not.a.storable.id';
    owners.push(ownerId);
    const body = new Uint8Array(new ArrayBuffer(8));
    await driver.putBlob({
      namespace: 'tenants',
      key: `${ownerId}/repos/proj/packs/pack.pack`,
      body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await seedTombstone(ownerId, { purgeAfter: new Date(Date.now() - 1000) });

    const outcomes = await purgeTombstonedTenants({ database, driver, ownerIds: owners });

    expect(outcomes.find((candidate) => candidate.ownerId === ownerId)?.status).toBe('refused');
    expect(await objectsUnder(ownerId)).toHaveLength(1);
  }, 120_000);

  it('should bound the default plan at the charter constant', () => {
    expect(maxPurgeObjectsWithoutConfirmation).toBe(10_000);
  });

  it('should keep the prefix delete reachable from the purge job alone', () => {
    // D31: exactly one caller outside the driver that defines it. Test files are
    // excluded because D32 confines them to disposable buckets by the guard.
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const listed = execFileSync('grep', ['-rl', 'deleteEntirePrefixForPurgeJob', apiRoot], { encoding: 'utf8' });
    const callers = listed
      .split('\n')
      .filter((file) => file.endsWith('.ts') && !file.includes('.test.') && !file.includes('/conformance/'))
      .map((file) => path.relative(apiRoot, file))
      .sort();

    expect(callers).toStrictEqual(['api/git/maintenance/purge.ts', 'storage/object-storage.service.ts']);
  });
});
