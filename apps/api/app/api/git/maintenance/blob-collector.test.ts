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

/**
 * S6's publication half (charter D10): a content-addressed blob nothing
 * references any more is removed, a referenced one is not, and one pass is
 * bounded. Publications are derived state, so the worst case of an over-eager
 * collection is a re-materialization, never a loss (north star,
 * "Publications and LFS on the Same Discipline").
 */

describe('zero-count blob collector', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
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
    client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    database = drizzle(client, { schema });
  }, 60_000);

  afterAll(async () => {
    if (shas.length > 0) {
      await database.delete(blobRef).where(inArray(blobRef.sha256, shas));
      await driver.deleteBlobs({
        namespace: 'blobs',
        keys: shas.map((sha256) => blobKeyFromSha256Hex(sha256)),
        tier: 'private',
      });
    }
    await client.end();
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

  it('should plan without deleting under a dry run', async () => {
    const orphan = await seedBlob(0);

    const result = await collectZeroCountBlobs({ database, driver, dryRun: true });

    expect(result.collected).toStrictEqual([]);
    expect(result.planned).toStrictEqual(expect.arrayContaining([orphan]));
    expect(await exists(orphan)).toBe(true);
  }, 120_000);
});
