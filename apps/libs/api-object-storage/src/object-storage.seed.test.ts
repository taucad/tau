import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import type { Environment } from '@taucad/api-core';
import { ObjectStorageService } from '#object-storage.service.js';
import { storageSeedKeys } from '#storage.constants.js';

type Received = Readonly<{ method: string; path: string; headers: IncomingHttpHeaders; body: string }>;

const preconditionFailed =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>PreconditionFailed</Code><Message>At least one of the pre-conditions you specified did not hold</Message></Error>';

/** A loopback S3 endpoint that answers every put with `status` and records it. */
const answeringStore = async (
  status: number,
): Promise<{ storage: ObjectStorageService; received: Received[]; close: () => Promise<void> }> => {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    request.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        method: request.method ?? '',
        path: new URL(request.url ?? '/', 'http://localhost').pathname,
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      if (status === 200) {
        response.writeHead(200, { etag: '"seeded"' });
        response.end();
        return;
      }
      response.writeHead(status, { 'content-type': 'application/xml' });
      response.end(status === 412 ? preconditionFailed : '<Error><Code>InternalError</Code></Error>');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a loopback port');
  }
  /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
  const config = new ConfigService<Environment, true>({
    TAU_S3_ENDPOINT: `http://127.0.0.1:${String(address.port)}`,
    TAU_S3_REGION: 'us-east-1',
    TAU_S3_ACCESS_KEY_ID: 'test',
    TAU_S3_SECRET_ACCESS_KEY: 'test',
    TAU_S3_FORCE_PATH_STYLE: true,
    TAU_S3_BUCKET: 'seed-test-public',
    TAU_S3_PRIVATE_BUCKET: 'seed-test-private',
    TAU_S3_PUBLIC_BASE_URL: 'https://cdn.example.invalid',
  });
  /* eslint-enable @typescript-eslint/naming-convention -- end of the environment map */
  return {
    storage: new ObjectStorageService(config),
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

const probe = {
  key: storageSeedKeys.healthProbe,
  body: new TextEncoder().encode('ok\n'),
  contentType: 'text/plain',
  cacheControl: 'no-store',
};

describe('ObjectStorageService.seedObject', () => {
  it('should create the object at its bucket-root key in the public bucket, only when absent', async () => {
    const store = await answeringStore(200);
    closers.push(store.close);

    await expect(store.storage.seedObject(probe)).resolves.toBe('created');

    expect(store.received).toHaveLength(1);
    const [put] = store.received;
    expect(put?.method).toBe('PUT');
    expect(put?.path).toBe('/seed-test-public/__health/probe.txt');
    expect(put?.headers['if-none-match']).toBe('*');
    expect(put?.headers['content-type']).toBe('text/plain');
    expect(put?.headers['cache-control']).toBe('no-store');
    expect(put?.body).toBe('ok\n');
  });

  it('should report an object the store refuses with 412 as already present', async () => {
    const store = await answeringStore(412);
    closers.push(store.close);

    await expect(
      store.storage.seedObject({ ...probe, key: storageSeedKeys.ogImage, contentType: 'image/png' }),
    ).resolves.toBe('present');
    expect(store.received[0]?.path).toBe('/seed-test-public/defaults/og.png');
  });

  it('should throw any other refusal for the caller to retry', async () => {
    const store = await answeringStore(403);
    closers.push(store.close);

    await expect(store.storage.seedObject(probe)).rejects.toThrow();
  });
});
