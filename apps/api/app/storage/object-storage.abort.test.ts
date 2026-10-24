import { createServer } from 'node:http';
import { once } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { encodeManifest, spilledPushLog, succeedManifest, tombstoneManifest } from '#api/git/store/manifest.js';
import { commitTombstone } from '#api/git/store/commit.js';

const locator = { ownerId: 'abort-owner', projectId: 'abort-project' };

/** A loopback S3 endpoint that leaves one operation in flight until its caller cancels it. */
const stalledStore = async (phase: 'read' | 'write', manifest?: Uint8Array<ArrayBuffer>) => {
  const arrived = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const writes: string[] = [];
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const server = createServer((request, response) => {
    request.resume();
    if (request.method === 'PUT') {
      writes.push(new URL(request.url ?? '/', 'http://localhost').pathname);
    }
    if (phase === 'write' && request.method === 'GET') {
      response.writeHead(manifest === undefined ? 404 : 200, { etag: 'base' });
      response.end(manifest);
      return;
    }
    response.once('close', () => {
      disconnected.resolve();
    });
    arrived.resolve();
    // A bounded baseline failure: without propagation the operation finishes instead of aborting.
    timers.push(
      setTimeout(() => {
        response.writeHead(200, { etag: 'finished-too-late' });
        response.end('{}');
      }, 250),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a loopback port');
  }
  const storage = new ObjectStorageService(new ConfigService<Environment, true>(), {
    id: 'tau-default',
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    region: 'us-east-1',
    bucket: 'abort-test-only',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  return {
    storage,
    writes,
    arrived: arrived.promise,
    disconnected: disconnected.promise,
    async close() {
      for (const timer of timers) {
        clearTimeout(timer);
      }
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

describe('repository tombstone cancellation at the S3 transport', () => {
  it.each(['read', 'write'] as const)(
    'should abort an in-flight tombstone %s and await transport termination',
    async (phase) => {
      const endpoint = await stalledStore(phase);
      const controller = new AbortController();
      try {
        const operation = commitTombstone(
          {
            store: new S3RepositoryStore(endpoint.storage),
            locator,
            committedBy: locator.ownerId,
          },
          controller.signal,
        );
        const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
        await endpoint.arrived;
        controller.abort();
        await rejected;
        await endpoint.disconnected;
      } finally {
        await endpoint.close();
      }
    },
  );

  it('should abort a spilled push log before starting the tombstone commit', async () => {
    let manifest = succeedManifest(undefined, { refs: {}, packs: [], committedBy: 'seed' });
    const at = new Date();
    const committedBy = 'deletion'.repeat(100);
    while (spilledPushLog(manifest, tombstoneManifest(manifest, { committedBy, at })) === undefined) {
      manifest = succeedManifest(manifest, { refs: {}, packs: [], committedBy: 'seed' });
    }
    const endpoint = await stalledStore('write', encodeManifest(manifest));
    const controller = new AbortController();
    try {
      const operation = commitTombstone(
        { store: new S3RepositoryStore(endpoint.storage), locator, committedBy, at },
        controller.signal,
      );
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await endpoint.arrived;
      controller.abort();
      await rejected;
      await endpoint.disconnected;
      expect(endpoint.writes).toHaveLength(1);
      expect(endpoint.writes[0]).toContain('/pushes/');
    } finally {
      await endpoint.close();
    }
  });

  it.each(['put', 'delete'] as const)('should abort %sBlob at the SDK transport', async (operationName) => {
    const endpoint = await stalledStore('write');
    const controller = new AbortController();
    try {
      const location = {
        namespace: 'tenants',
        key: 'abort-owner/test',
        tier: 'private',
        signal: controller.signal,
      } as const;
      const operation =
        operationName === 'put'
          ? endpoint.storage.putBlob({
              ...location,
              body: new Uint8Array([1]),
              contentType: 'application/octet-stream',
            })
          : endpoint.storage.deleteBlob(location);
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await endpoint.arrived;
      controller.abort();
      await rejected;
      await endpoint.disconnected;
    } finally {
      await endpoint.close();
    }
  });
});
