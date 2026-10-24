import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';

/**
 * The adapter against a loopback S3 endpoint, for what MinIO cannot be made to
 * do on demand: answer a manifest write with `429` or `503`, or drop a pack
 * upload half way. Counting requests at the socket is the only way to see the
 * AWS SDK's own retries, which never surface to a caller (review FR21).
 */

const locator = { ownerId: 'loopback-owner', projectId: 'loopback-project' };

type Received = { method: string; path: string; headers: IncomingMessage['headers']; body: Uint8Array<ArrayBuffer> };

type Responder = (request: Received, response: ServerResponse) => void;

const s3Error = (response: ServerResponse, status: number, code: string): void => {
  response.writeHead(status, { 'content-type': 'application/xml', 'retry-after': '0' });
  response.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`);
};

const ok = (response: ServerResponse): void => {
  response.writeHead(200, { etag: '"loopback-etag"' });
  response.end();
};

const servers: Array<{ close: () => Promise<void> }> = [];

/** A loopback S3 endpoint that records every request and lets the test answer it. */
const loopbackStore = async (
  respond: Responder,
  options?: { maxObjectBytes?: number },
): Promise<{ store: S3RepositoryStore; requests: Received[] }> => {
  const requests: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    request.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    request.on('end', () => {
      const received = {
        method: request.method ?? '',
        path: new URL(request.url ?? '/', 'http://localhost').pathname,
        headers: request.headers,
        body: new Uint8Array(Buffer.concat(chunks)),
      };
      requests.push(received);
      respond(received, response);
    });
    request.on('error', () => {
      response.destroy();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a loopback port');
  }
  servers.push({
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  });
  const storage = new ObjectStorageService(new ConfigService<Environment, true>(), {
    id: 'tau-default',
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    region: 'us-east-1',
    bucket: 'loopback-test-only',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  return {
    store: new S3RepositoryStore(storage, options),
    requests,
  };
};

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const gitEnvironment = (admitted: boolean): NodeJS.ProcessEnv =>
  ({
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: tmpdir(),
    LANG: 'C',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...(admitted ? { TAU_GIT_PUSH_ADMITTED: '1' } : {}),
  }) as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

/** A lease over `store` that one stock `git push` of a single commit has moved `main` in. */
const leaseWithOnePush = async (store: S3RepositoryStore): Promise<RepositoryLease> => {
  const client = mkdtempSync(path.join(tmpdir(), 'tau-loopback-client-'));
  const parent = mkdtempSync(path.join(tmpdir(), 'tau-loopback-lease-'));
  scratchDirectories.push(client, parent);
  const git = (...args: readonly string[]): void => {
    execFileSync('git', args, { cwd: client, stdio: 'ignore', env: gitEnvironment(false) });
  };
  git('init', '--quiet', '--initial-branch=main', '.');
  writeFileSync(path.join(client, 'main.scad'), 'cube(1);\n');
  git('add', '.');
  git('-c', 'user.name=FR21', '-c', 'user.email=fr21@tau.test', 'commit', '--quiet', '-m', 'one');
  const lease = await hydrateLease({ store, locator, parentDirectory: parent });
  execFileSync('git', ['push', '--quiet', lease.directory, 'main'], {
    cwd: client,
    stdio: 'ignore',
    env: gitEnvironment(true),
  });
  return lease;
};

const manifestPuts = (requests: readonly Received[]): Received[] =>
  requests.filter((request) => request.method === 'PUT' && request.path.endsWith('/manifest.json'));

describe('S3RepositoryStore over a loopback endpoint', () => {
  describe('manifest writes make one request per call (FR21)', () => {
    it.each([
      [429, 'SlowDown'],
      [503, 'ServiceUnavailable'],
      [500, 'InternalError'],
    ])('should send a manifest write the backend answers %i exactly once', async (status, code) => {
      const { store, requests } = await loopbackStore((_request, response) => {
        s3Error(response, status, code);
      });

      await expect(store.commitManifest(locator, new Uint8Array([1]), 'absent')).rejects.toMatchObject({
        $metadata: { httpStatusCode: status },
      });

      expect(manifestPuts(requests)).toHaveLength(1);
    });

    it('should send a manifest write the backend refuses with 412 exactly once and report it lost', async () => {
      const { store, requests } = await loopbackStore((_request, response) => {
        s3Error(response, 412, 'PreconditionFailed');
      });

      await expect(store.commitManifest(locator, new Uint8Array([1]), { token: 'stale' })).resolves.toBe('lost');

      expect(manifestPuts(requests)).toHaveLength(1);
    });

    it("should make commitLease's three logical attempts three manifest requests, not nine, under a 429", async () => {
      const { store, requests } = await loopbackStore((request, response) => {
        if (request.method === 'GET') {
          // The reconcile read: no manifest, so the exhausted limit is a lost race.
          s3Error(response, 404, 'NoSuchKey');
          return;
        }
        if (request.path.endsWith('/manifest.json')) {
          s3Error(response, 429, 'SlowDown');
          return;
        }
        ok(response);
      });
      const lease = await leaseWithOnePush(store);

      try {
        await expect(commitLease({ store, lease, committedBy: 'user_fr21' })).rejects.toMatchObject({
          name: 'RepositoryStoreError',
          code: 'lost',
        });
      } finally {
        await lease.dispose();
      }

      expect(manifestPuts(requests)).toHaveLength(3);
    }, 30_000);
  });
});
