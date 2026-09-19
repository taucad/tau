import { createHash, randomBytes } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import { blobRef } from '#database/schema.js';
import * as schema from '#database/schema.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex } from '#storage/sha256.utils.js';
import { StorageModule } from '#storage/storage.module.js';
import { collectZeroCountBlobs } from '#api/git/maintenance/blob-collector.js';
import { applyBlobReferences } from '#api/publications/publication-materializer.js';
import { databaseReachable } from '#testing/database-reachable.js';
import { createScratchDatabase } from '#testing/scratch-database.js';
import type { ScratchDatabase } from '#testing/scratch-database.js';

/**
 * S6's publication half (charter D10): a content-addressed blob nothing
 * references any more is removed, a referenced one is not, and one pass is
 * bounded. Publications are derived state, so the worst case of an over-eager
 * collection is a re-materialization, never a loss (north star,
 * "Publications and LFS on the Same Discipline").
 */

describe.skipIf(!(await databaseReachable(process.env.DATABASE_URL)))('zero-count blob collector', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let scratch: ScratchDatabase;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const shas: string[] = [];

  /** One blob in the private tier plus its `blob_ref` row at `refcount`. */
  const seedBlob = async (refcount: number): Promise<string> => {
    const body = new Uint8Array(randomBytes(32));
    const sha256 = createHash('sha256').update(body).digest('hex');
    shas.push(sha256);

    await driver.putBlob({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(sha256),
      body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database.insert(blobRef).values({ sha256, sizeBytes: BigInt(body.byteLength), refcount });

    return sha256;
  };

  const exists = async (sha256: string): Promise<boolean> =>
    (await driver.headBlob({ namespace: 'blobs', key: blobKeyFromSha256Hex(sha256), tier: 'private' })) !== undefined;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the W6 blob collector suite');
    /* Its own database, because the job under test is scoped by state rather
       than by identity: a seeded id cannot bound "every `refcount = 0` row",
       and the objects it deletes are whichever rows it found. Every blob the
       passes below can reach is therefore one this suite put there. */
    scratch = await createScratchDatabase('blob_collector');
    /* More than one connection: the fence cases below hold a publisher's
       transaction open while a pass runs on another. */
    client = postgres(scratch.url, { max: 4, prepare: false });
    database = drizzle(client, { schema });
  }, 300_000);

  afterAll(async () => {
    /* The rows go with the database; the bucket is shared, so its objects do not. */
    if (shas.length > 0) {
      await driver.deleteBlobs({
        namespace: 'blobs',
        keys: shas.map((sha256) => blobKeyFromSha256Hex(sha256)),
        tier: 'private',
      });
    }
    await client.end();
    await scratch.drop();
  }, 60_000);

  it('should delete a blob nothing references and keep one that is referenced', async () => {
    const orphan = await seedBlob(0);
    const referenced = await seedBlob(1);

    const result = await collectZeroCountBlobs({ database, driver });

    expect(result.collected).toStrictEqual(expect.arrayContaining([orphan]));
    expect(result.collected).not.toStrictEqual(expect.arrayContaining([referenced]));
    expect(await exists(orphan)).toBe(false);
    expect(await exists(referenced)).toBe(true);
  }, 120_000);

  it('should drop the row of every blob it collected', async () => {
    const orphan = await seedBlob(0);

    await collectZeroCountBlobs({ database, driver });

    expect(await database.query.blobRef.findFirst({ where: inArray(blobRef.sha256, [orphan]) })).toBeUndefined();
  }, 120_000);

  it('should collect no more than one bounded batch per pass', async () => {
    await seedBlob(0);
    await seedBlob(0);
    await seedBlob(0);

    const result = await collectZeroCountBlobs({ database, driver, batchSize: 2 });

    expect(result.collected.length).toBe(2);
  }, 120_000);

  /*
   * W4c review F1: a publisher that arrives while a pass is running must never
   * find the row gone and the bytes still there — it would skip its upload and
   * publish a version pointing at an object this pass then deletes. The bytes
   * therefore go inside the transaction that deleted the row, and this asserts
   * the ordering the fence rests on rather than the outcome alone.
   */
  it('should delete the bytes inside the transaction that deleted the row', async () => {
    const orphan = await seedBlob(0);
    const rowsSeenByOtherConnections: boolean[] = [];

    /* A second connection, which sees only committed rows: while the delete is
       uncommitted the row is still visible to it, and the bytes must already be
       gone by the time it disappears. */
    const observer = postgres(scratch.url, { max: 1, prepare: false });
    const observing = drizzle(observer, { schema });
    const watchedDriver = {
      ...driver,
      deleteBlobs: async (deleteArguments: Parameters<ObjectStorageService['deleteBlobs']>[0]) => {
        const stillVisible = await observing.query.blobRef.findFirst({
          where: inArray(blobRef.sha256, [orphan]),
        });
        rowsSeenByOtherConnections.push(stillVisible !== undefined);
        return driver.deleteBlobs(deleteArguments);
      },
    } as unknown as ObjectStorageService;

    try {
      const result = await collectZeroCountBlobs({ database, driver: watchedDriver });

      expect(result.collected).toStrictEqual(expect.arrayContaining([orphan]));
      /* Both tier sweeps ran while the row delete was still uncommitted, which
         is the window a publisher blocks in. */
      expect(rowsSeenByOtherConnections).toStrictEqual([true, true]);
      expect(await exists(orphan)).toBe(false);
    } finally {
      await observer.end();
    }
  }, 120_000);

  /*
   * W4c review F1 and F5: the publisher's half of the fence, against real row
   * locks. A publisher takes the `blob_ref` row inside its transaction and only
   * then looks at the bytes, so whichever order it and a pass arrive in, the
   * version it publishes keeps its object.
   */
  const publishBlob = async (
    sha256: string,
    body: Uint8Array<ArrayBuffer>,
    hooks: { afterReference?: () => Promise<void> } = {},
  ): Promise<void> => {
    await database.transaction(async (transaction) => {
      await applyBlobReferences(transaction, [{ sha256, sizeBytes: body.byteLength, count: 1 }]);
      await hooks.afterReference?.();
      if (!(await exists(sha256))) {
        await driver.putBlob({
          namespace: 'blobs',
          key: blobKeyFromSha256Hex(sha256),
          body,
          contentType: 'application/octet-stream',
          tier: 'private',
        });
      }
    });
  };

  const sleep = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });

  it('should let a publisher that arrived mid-pass put the bytes back', async () => {
    const body = new Uint8Array(randomBytes(32));
    const sha256 = createHash('sha256').update(body).digest('hex');
    shas.push(sha256);
    await driver.putBlob({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(sha256),
      body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database.insert(blobRef).values({ sha256, sizeBytes: BigInt(body.byteLength), refcount: 0 });

    let publishing: Promise<void> | undefined;
    const racingDriver = {
      ...driver,
      deleteBlobs: async (deleteArguments: Parameters<ObjectStorageService['deleteBlobs']>[0]) => {
        /* A publisher arrives with the row deleted and the bytes still there —
           the window the old, non-transactional collector left open. Inside the
           transaction its upsert blocks on the deleted row instead, so it
           cannot observe the bytes until they are gone. Started rather than
           awaited, because blocking is the expected outcome. */
        publishing ??= publishBlob(sha256, body);
        await sleep(300);
        return driver.deleteBlobs(deleteArguments);
      },
    } as unknown as ObjectStorageService;

    await collectZeroCountBlobs({ database, driver: racingDriver });
    await publishing;

    expect(await exists(sha256)).toBe(true);
    const row = await database.query.blobRef.findFirst({ where: inArray(blobRef.sha256, [sha256]) });
    expect(row?.refcount).toBe(1);
  }, 120_000);

  it('should leave a blob alone when a publisher referenced it first', async () => {
    const body = new Uint8Array(randomBytes(32));
    const sha256 = createHash('sha256').update(body).digest('hex');
    shas.push(sha256);
    await driver.putBlob({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(sha256),
      body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database.insert(blobRef).values({ sha256, sizeBytes: BigInt(body.byteLength), refcount: 0 });

    let pass: Promise<Awaited<ReturnType<typeof collectZeroCountBlobs>>> | undefined;
    await publishBlob(sha256, body, {
      afterReference: async () => {
        /* The reference is taken and uncommitted, so this pass's conditional
           delete blocks on the row and then finds it no longer at zero. */
        pass = collectZeroCountBlobs({ database, driver });
        await sleep(300);
      },
    });
    const collected = await pass;

    expect(collected?.collected ?? []).not.toStrictEqual(expect.arrayContaining([sha256]));
    expect(await exists(sha256)).toBe(true);
  }, 120_000);

  /*
   * Review R1. `collectZeroCountBlobs` selects by *state*, not by identity:
   * every `refcount = 0` row there is, then the matching objects out of both
   * tiers. Nothing a seeded id can do bounds that, so the boundary has to be
   * the database — and this is the row that proves it is one. A developer who
   * unpublishes a publication leaves exactly this behind, and `nx test api`
   * must not be the thing that collects it.
   */
  it('should leave a zero-count blob in the configured database untouched', async () => {
    const body = new Uint8Array(randomBytes(32));
    const foreignSha = createHash('sha256').update(body).digest('hex');
    const foreignClient = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    const configured = drizzle(foreignClient, { schema });
    try {
      await driver.putBlob({
        namespace: 'blobs',
        key: blobKeyFromSha256Hex(foreignSha),
        body,
        contentType: 'application/octet-stream',
        tier: 'private',
      });
      await configured.insert(blobRef).values({ sha256: foreignSha, sizeBytes: BigInt(body.byteLength), refcount: 0 });
      // Something of its own to collect, so a pass that did nothing cannot pass this.
      const orphan = await seedBlob(0);

      const result = await collectZeroCountBlobs({ database, driver });

      expect(result.collected).toStrictEqual(expect.arrayContaining([orphan]));
      expect(result.planned).not.toContain(foreignSha);
      expect(await configured.query.blobRef.findFirst({ where: inArray(blobRef.sha256, [foreignSha]) })).toBeDefined();
      expect(await exists(foreignSha)).toBe(true);
    } finally {
      await configured.delete(blobRef).where(inArray(blobRef.sha256, [foreignSha]));
      await driver.deleteBlobs({ namespace: 'blobs', keys: [blobKeyFromSha256Hex(foreignSha)], tier: 'private' });
      await foreignClient.end();
    }
  }, 120_000);

  it('should plan without deleting under a dry run', async () => {
    const orphan = await seedBlob(0);

    const result = await collectZeroCountBlobs({ database, driver, dryRun: true });

    expect(result.collected).toStrictEqual([]);
    expect(result.planned).toStrictEqual(expect.arrayContaining([orphan]));
    expect(await exists(orphan)).toBe(true);
  }, 120_000);
});
