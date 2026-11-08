import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

type Received = Readonly<{ method: string; path: string; headers: IncomingHttpHeaders }>;

/** A loopback S3 endpoint that answers every request as a successful copy and records it. */
const copyingStore = async (): Promise<{
  storage: ObjectStorageService;
  received: Received[];
  close: () => Promise<void>;
}> => {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    request.resume();
    received.push({
      method: request.method ?? '',
      path: new URL(request.url ?? '/', 'http://localhost').pathname,
      headers: request.headers,
    });
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(
      '<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult><ETag>"copied"</ETag><LastModified>2026-11-08T00:00:00.000Z</LastModified></CopyObjectResult>',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a loopback port');
  }
  /* The default account: a public and a private bucket, which a copy crosses. */
  /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
  const config = new ConfigService<Environment, true>({
    TAU_S3_ENDPOINT: `http://127.0.0.1:${String(address.port)}`,
    TAU_S3_REGION: 'us-east-1',
    TAU_S3_ACCESS_KEY_ID: 'test',
    TAU_S3_SECRET_ACCESS_KEY: 'test',
    TAU_S3_FORCE_PATH_STYLE: true,
    TAU_S3_BUCKET: 'copy-test-public',
    TAU_S3_PRIVATE_BUCKET: 'copy-test-private',
    TAU_S3_PUBLIC_BASE_URL: 'https://cdn.example.invalid',
  });
  /* eslint-enable @typescript-eslint/naming-convention -- end of the environment map */
  const storage = new ObjectStorageService(config);
  return {
    storage,
    received,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
};

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map(async (close) => close()));
});

describe('ObjectStorageService.copyObject', () => {
  it('should copy across namespaces and tier buckets in one request, replacing the metadata', async () => {
    const store = await copyingStore();
    closers.push(store.close);

    await store.storage.copyObject({
      source: { namespace: 'tenants', key: 'owner/lfs/project/ab/cd/abcd', tier: 'private' },
      destination: { namespace: 'blobs', key: 'ab/cd/abcd', tier: 'public' },
      contentType: 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    expect(store.received).toHaveLength(1);
    const [copy] = store.received;
    expect(copy?.method).toBe('PUT');
    expect(copy?.path).toBe('/copy-test-public/blobs/ab/cd/abcd');
    expect(copy?.headers['x-amz-copy-source']).toBe('copy-test-private/tenants/owner/lfs/project/ab/cd/abcd');
    expect(copy?.headers['x-amz-metadata-directive']).toBe('REPLACE');
    expect(copy?.headers['content-type']).toBe('application/octet-stream');
    expect(copy?.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('should encode each segment of the source key', async () => {
    const store = await copyingStore();
    closers.push(store.close);

    await store.storage.copyObject({
      source: { namespace: 'blobs', key: 'legacy/a key+with?marks', tier: 'private' },
      destination: { namespace: 'blobs', key: 'ab/cd/abcd', tier: 'private' },
      contentType: 'image/webp',
    });

    const [copy] = store.received;
    expect(copy?.path).toBe('/copy-test-private/blobs/ab/cd/abcd');
    expect(copy?.headers['x-amz-copy-source']).toBe('copy-test-private/blobs/legacy/a%20key%2Bwith%3Fmarks');
    expect(copy?.headers['cache-control']).toBeUndefined();
  });
});
