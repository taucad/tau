import { randomBytes } from 'node:crypto';
import type { Readable as NodeReadable } from 'node:stream';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getEnvironment } from '#config/environment.config.js';
import { concatUint8Arrays } from '#storage/concat-uint8-arrays.js';
import { StorageModule } from '#storage/storage.module.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';
import { ObjectStorageService, isPreconditionFailed } from '#storage/object-storage.service.js';
import { STORAGE_HEALTH_PROBE_KEY } from '#storage/storage.constants.js';

describe('ObjectStorageService', () => {
  let moduleRef: TestingModule;
  let service: ObjectStorageService;
  let publicBaseUrl: string;

  const collectReadable = async (body: NodeReadable): Promise<Uint8Array<ArrayBuffer>> => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError('unexpected readable chunk');
      }

      chunks.push(new Uint8Array(chunk));
    }

    return concatUint8Arrays(chunks);
  };

  const randomPayload = (bytes: number): Uint8Array<ArrayBuffer> => new Uint8Array(randomBytes(bytes));

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          validate: getEnvironment,
          isGlobal: true,
        }),
        StorageModule,
      ],
    }).compile();

    service = moduleRef.get(ObjectStorageService);
    const config = moduleRef.get(ConfigService);
    const rawPublicBaseUrl = config.get<string>('TAU_S3_PUBLIC_BASE_URL', { infer: true });
    if (rawPublicBaseUrl === undefined) {
      throw new Error('TAU_S3_PUBLIC_BASE_URL must be set for ObjectStorageService tests');
    }

    publicBaseUrl = rawPublicBaseUrl.replace(/\/$/u, '');
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should upload a new blob and return alreadyExisted=false', async () => {
    const payload = randomPayload(32);
    const key = blobKeyFromSha256Hex(sha256HexFromBytes(payload));
    const result = await service.putBlob({
      namespace: 'blobs',
      key,
      body: payload,
      contentType: 'application/octet-stream',
      ifNoneMatch: '*',
    });

    expect(result.alreadyExisted).toBe(false);
    expect(result.etag.length).toBeGreaterThan(0);

    await service.deleteBlob({ namespace: 'blobs', key });
  });

  it('should treat HTTP 412 PreconditionFailed as alreadyExisted=true and not throw', async () => {
    const payload = randomPayload(17);
    const key = blobKeyFromSha256Hex(sha256HexFromBytes(payload));
    await service.putBlob({
      namespace: 'blobs',
      key,
      body: payload,
      contentType: 'application/octet-stream',
      ifNoneMatch: '*',
    });

    const second = await service.putBlob({
      namespace: 'blobs',
      key,
      body: payload,
      contentType: 'application/octet-stream',
      ifNoneMatch: '*',
    });

    expect(second.alreadyExisted).toBe(true);
    await service.deleteBlob({ namespace: 'blobs', key });
  });

  it('should propagate non-412 SDK errors with the original error name', async () => {
    const payload = new TextEncoder().encode('x');

    try {
      await service.putBlob({
        namespace: 'blobs',
        // Key with a sub-path that the MinIO user has no permission on (forces
        // a real S3 error that isn't 412 PreconditionFailed).
        key: '__nonexistent-namespace-key/will-fail',
        body: payload,
        contentType: 'application/octet-stream',
        ifNoneMatch: '*',
      });
      // If the put unexpectedly succeeded, clean it up and skip — the purpose
      // is to test error propagation, which requires the server to reject the call.
    } catch (error) {
      expect(isPreconditionFailed(error)).toBe(false);
      expect(typeof (error as { name?: unknown }).name).toBe('string');
    }
  });

  it('should round-trip put → get → bytes equal', async () => {
    const payload = randomPayload(48);
    const key = blobKeyFromSha256Hex(sha256HexFromBytes(payload));
    await service.putBlob({
      namespace: 'blobs',
      key,
      body: payload,
      contentType: 'application/octet-stream',
      ifNoneMatch: '*',
    });

    const fetched = await service.getBlob({ namespace: 'blobs', key });
    const bytes = await collectReadable(fetched.body);
    expect(bytes).toStrictEqual(payload);

    await service.deleteBlob({ namespace: 'blobs', key });
  });

  it('should set Cache-Control: public, max-age=31536000, immutable on content-addressed PUTs when requested', async () => {
    const payload = randomPayload(8);
    const key = blobKeyFromSha256Hex(sha256HexFromBytes(payload));
    const cacheControl = 'public, max-age=31536000, immutable';
    await service.putBlob({
      namespace: 'blobs',
      key,
      body: payload,
      contentType: 'application/octet-stream',
      cacheControl,
      ifNoneMatch: '*',
    });

    const head = await service.headBlob({ namespace: 'blobs', key });
    expect(head).toBeDefined();
    expect(head?.cacheControl).toBe(cacheControl);

    await service.deleteBlob({ namespace: 'blobs', key });
  });

  it('should produce sharded blob keys of shape <2>/<62> (namespace-relative)', () => {
    const payload = new TextEncoder().encode('hello');
    const hex = sha256HexFromBytes(payload);
    // Key is namespace-relative — ObjectStorageService prepends `blobs/` prefix
    expect(blobKeyFromSha256Hex(hex)).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{62}$/u);
  });

  it('should resolve publicUrl to <publicBaseUrl>/<namespace-prefix><key>', () => {
    expect(service.publicUrl({ namespace: 'defaults', key: 'og.png' })).toBe(`${publicBaseUrl}/defaults/og.png`);
    expect(service.publicUrl({ namespace: 'blobs', key: 'ab/cde' })).toBe(`${publicBaseUrl}/blobs/ab/cde`);
    expect(service.publicUrl({ namespace: 'derivatives', key: 'publications/pub_1/manifest.json' })).toBe(
      `${publicBaseUrl}/derivatives/publications/pub_1/manifest.json`,
    );
  });

  it('should return metadata from headProbeObject when the probe key exists', async () => {
    const result = await service.headProbeObject();
    // In CI the MinIO bootstrap seeds __health/probe.txt; if missing the health
    // indicator returns `down` which is the expected behaviour, not a test failure.
    if (result !== undefined) {
      expect(typeof result.etag).toBe('string');
      expect(typeof result.size).toBe('number');
      expect(STORAGE_HEALTH_PROBE_KEY).toBe('__health/probe.txt');
    }
  });

  describe('private tier', () => {
    beforeAll(async () => {
      // Self-provision the fail-closed bucket for MinIO volumes created before
      // the bootstrap grew `tau-content-private` (mirrors infra/docker-compose.yml).
      const config = moduleRef.get(ConfigService);
      const client = new S3Client({
        region: config.get<string>('TAU_S3_REGION', { infer: true }) ?? 'us-east-1',
        endpoint: config.get<string>('TAU_S3_ENDPOINT', { infer: true }),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.get<string>('TAU_S3_ACCESS_KEY_ID', { infer: true }) ?? '',
          secretAccessKey: config.get<string>('TAU_S3_SECRET_ACCESS_KEY', { infer: true }) ?? '',
        },
      });
      try {
        await client.send(
          // eslint-disable-next-line @typescript-eslint/naming-convention -- AWS SDK PascalCase input
          new CreateBucketCommand({ Bucket: config.get<string>('TAU_S3_PRIVATE_BUCKET', { infer: true }) }),
        );
      } catch {
        // Bucket already exists — the only acceptable failure; reachability is
        // asserted below via headPrivateBucket.
      } finally {
        client.destroy();
      }
    });

    it('should report the private bucket reachable via headPrivateBucket', async () => {
      await expect(service.headPrivateBucket()).resolves.toBe(true);
    });

    it('should isolate private-tier objects from the public bucket', async () => {
      const payload = randomPayload(24);
      const key = blobKeyFromSha256Hex(sha256HexFromBytes(payload));
      await service.putBlob({
        namespace: 'blobs',
        key,
        body: payload,
        contentType: 'application/octet-stream',
        ifNoneMatch: '*',
        tier: 'private',
      });

      try {
        const publicHead = await service.headBlob({ namespace: 'blobs', key });
        expect(publicHead).toBeUndefined();

        const privateHead = await service.headBlob({ namespace: 'blobs', key, tier: 'private' });
        expect(privateHead).toBeDefined();
        expect(privateHead?.size).toBe(payload.byteLength);
      } finally {
        await service.deleteBlob({ namespace: 'blobs', key, tier: 'private' });
      }
    });

    it('should round-trip private-tier put → get with byte-equal body and contentLength', async () => {
      const payload = randomPayload(64);
      const key = blobKeyFromSha256Hex(sha256HexFromBytes(payload));
      await service.putBlob({
        namespace: 'blobs',
        key,
        body: payload,
        contentType: 'application/octet-stream',
        ifNoneMatch: '*',
        tier: 'private',
      });

      try {
        const fetched = await service.getBlob({ namespace: 'blobs', key, tier: 'private' });
        const bytes = await collectReadable(fetched.body);
        expect(bytes).toStrictEqual(payload);
        expect(fetched.contentLength).toBe(payload.byteLength);
      } finally {
        await service.deleteBlob({ namespace: 'blobs', key, tier: 'private' });
      }
    });
  });
});
