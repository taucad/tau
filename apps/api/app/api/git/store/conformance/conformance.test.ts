import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getEnvironment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import {
  conformanceAccountFromEnvironment,
  describeRepositoryStoreConformance,
} from '#api/git/store/conformance/repository-store-conformance.js';

/**
 * The charter's V3 row: the store contract runs against MinIO on every CI run
 * through `nx test api`, and against R2 only when the `TAU_S3_CONFORMANCE_*`
 * family names a dedicated scratch bucket (D32).
 */
describe('repository store conformance', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    driver = moduleRef.get(ObjectStorageService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('endpoint guard', () => {
    const environmentFor = (bucket: string): Record<string, string> => ({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable names
      TAU_S3_CONFORMANCE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable names
      TAU_S3_CONFORMANCE_BUCKET: bucket,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable names
      TAU_S3_CONFORMANCE_ACCESS_KEY_ID: 'never-used',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable names
      TAU_S3_CONFORMANCE_SECRET_ACCESS_KEY: 'never-used',
    });

    it.each(['tau-staging-content', 'tau-staging-content-private', 'TAU-Staging-Content-Private'])(
      'should refuse the %j bucket while parsing the environment, before any credential is used (D32)',
      (bucket) => {
        expect(() => conformanceAccountFromEnvironment(environmentFor(bucket))).toThrow(/scratch bucket/u);
      },
    );

    it('should accept a dedicated scratch bucket', () => {
      expect(conformanceAccountFromEnvironment(environmentFor('tau-staging-conformance'))).toMatchObject({
        bucket: 'tau-staging-conformance',
        endpoint: 'https://account.r2.cloudflarestorage.com',
      });
    });

    it('should produce no account when the TAU_S3_CONFORMANCE_ family is unset', () => {
      expect(conformanceAccountFromEnvironment({})).toBeUndefined();
    });
  });

  describeRepositoryStoreConformance('minio (default account)', () => driver);

  const conformanceAccount = conformanceAccountFromEnvironment(process.env);

  describe.skipIf(conformanceAccount === undefined)('env-gated endpoint', () => {
    describeRepositoryStoreConformance('TAU_S3_CONFORMANCE endpoint', () => {
      if (conformanceAccount === undefined) {
        throw new Error('unreachable: the env-gated leg is skipped without an account');
      }

      return driver.forAccount(conformanceAccount);
    });
  });
});
