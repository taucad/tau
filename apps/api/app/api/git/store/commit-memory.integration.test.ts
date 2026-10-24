import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import {
  incompressibleClient,
  largePackMebibytes,
  measureGrowth,
  mebibytes,
  recordMeasurement,
  sha256OfStream,
  streamedGrowthBoundMebibytes,
} from '#api/git/store/pack-memory.fixture.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';

/**
 * DA4 on the write path: a pack commits in memory that does not grow with the
 * pack. Before DA4 `putFile` read the whole file and hashed it in memory, so a
 * pack at the D20 ceiling was a gigabyte in a 1 GB VM.
 */

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const admitted = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: tmpdir(),
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  TAU_GIT_PUSH_ADMITTED: '1',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

describe('streamed pack upload (DA4)', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let store: S3RepositoryStore;
  const locators: RepositoryLocator[] = [];
  const scratchDirectories: string[] = [];

  const scratch = (label: string): string => {
    const directory = mkdtempSync(path.join(tmpdir(), `tau-da4-${label}-`));
    scratchDirectories.push(directory);
    return directory;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();
    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the DA4 commit memory suite');
    store = new S3RepositoryStore(driver);
  }, 60_000);

  afterAll(async () => {
    await Promise.all(
      locators.map(async (locator) =>
        driver.deleteEntirePrefixForPurgeJob({
          namespace: 'tenants',
          keyPrefix: `${locator.ownerId}/`,
          tier: 'private',
        }),
      ),
    );
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    await moduleRef.close();
  }, 120_000);

  it(`should commit a ${String(largePackMebibytes)} MiB pack with retained memory growth under ${String(streamedGrowthBoundMebibytes)} MiB`, async () => {
    const locator = repositoryLocator({
      ownerId: `user-da4-${randomBytes(6).toString('hex')}`,
      projectId: `proj-${randomBytes(6).toString('hex')}`,
    });
    locators.push(locator);
    const client = incompressibleClient(scratch('client'), largePackMebibytes);
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
    try {
      execFileSync('git', ['push', '--quiet', lease.directory, 'main'], {
        cwd: client,
        stdio: 'ignore',
        env: admitted,
      });
      const pack = readdirSync(path.join(lease.directory, 'objects/pack')).find((name) => name.endsWith('.pack'));
      const packFile = path.join(lease.directory, 'objects/pack', pack ?? '');

      const { result: outcome, growth } = await measureGrowth(async () =>
        commitLease({ store, lease, committedBy: 'user_da4' }),
      );
      recordMeasurement(
        `da4 commit pack=${String(largePackMebibytes)}MiB retained heap+arrayBuffers peak growth=${mebibytes(growth.heapAndBuffers)}MiB rss peak growth=${mebibytes(growth.rss)}MiB`,
      );

      expect(outcome.committed).toBe(true);
      expect(growth.heapAndBuffers).toBeLessThan(streamedGrowthBoundMebibytes * 1024 * 1024);
      // The store holds the pack git wrote, byte for byte.
      const read = await store.readManifest(locator);
      const stored = read === undefined ? undefined : decodeManifest(read.manifest).packs[0];
      expect(stored?.bytes).toBe(statSync(packFile).size);
      expect(await sha256OfStream(await store.getObject(locator, stored?.key ?? ''))).toBe(
        await sha256OfStream(createReadStream(packFile)),
      );
    } finally {
      await lease.dispose();
    }
  }, 600_000);
});
