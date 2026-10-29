// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type * as FsModule from 'node:fs';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import type * as FsPromisesModule from 'node:fs/promises';
import type { ClientRequest, Server, ServerResponse } from 'node:http';
import { IncomingMessage, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { Transform } from 'node:stream';
import type * as ZlibModule from 'node:zlib';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ErrorRequestHandler, Express, RequestHandler } from 'express';
import express from 'express';

/**
 * Seams over the file system and zlib that `compressedStatic` reaches through its imports. Each delegates to the
 * real implementation unless a test arms it: `heldStat` parks one metadata `stat` until the test releases it,
 * `failingRead` makes the source stream for one path fail, and every created source/encoder stream is recorded.
 */
const seams = vi.hoisted(() => ({
  heldStat: undefined as { path: string; entered: () => void; released: Promise<void> } | undefined,
  failingRead: undefined as { path: string; error: NodeJS.ErrnoException } | undefined,
  streams: [] as Array<Readable | Transform>,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>();
  const stat = async (...args: Parameters<typeof actual.stat>): ReturnType<typeof actual.stat> => {
    const hold = seams.heldStat;
    if (hold?.path === String(args[0])) {
      seams.heldStat = undefined;
      hold.entered();
      await hold.released;
    }
    return actual.stat(...args);
  };
  return { ...actual, stat };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FsModule>();
  const createReadStream = (...args: Parameters<typeof actual.createReadStream>): Readable => {
    const failure = seams.failingRead;
    const stream =
      failure?.path === String(args[0])
        ? new Readable({
            read() {
              this.destroy(failure.error);
            },
          })
        : actual.createReadStream(...args);
    seams.streams.push(stream);
    return stream;
  };
  return { ...actual, createReadStream };
});

vi.mock('node:zlib', async (importOriginal) => {
  const actual = await importOriginal<typeof ZlibModule>();
  const record = <T extends Transform>(stream: T): T => {
    seams.streams.push(stream);
    return stream;
  };
  return {
    ...actual,
    createBrotliCompress: (...args: Parameters<typeof actual.createBrotliCompress>) =>
      record(actual.createBrotliCompress(...args)),
    createGzip: (...args: Parameters<typeof actual.createGzip>) => record(actual.createGzip(...args)),
  };
});

const buildServerEntry = resolve(import.meta.dirname, 'build/server/index.js');
const buildClientAssets = resolve(import.meta.dirname, 'build/client/assets');
const requiredHeaders = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
} as const;

function findFirstWorkerAsset(): string | undefined {
  if (!existsSync(buildClientAssets)) {
    return undefined;
  }
  const entries = readdirSync(buildClientAssets);
  return entries.find((name) => /\.worker-[^.]+\.js$/.test(name));
}

function findFirstWasmAsset(): string | undefined {
  if (!existsSync(buildClientAssets)) {
    return undefined;
  }
  return readdirSync(buildClientAssets).find((name) => name.endsWith('.wasm'));
}

function findLargeKclWasmAsset(): string | undefined {
  if (!existsSync(buildClientAssets)) {
    return undefined;
  }
  return readdirSync(buildClientAssets).find(
    (name) =>
      /^kcl_wasm_lib_bg-[A-Za-z0-9_-]{8,}\.wasm$/u.test(name) &&
      statSync(resolve(buildClientAssets, name)).size >= 8 * 1024 * 1024,
  );
}

const buildExists = existsSync(buildServerEntry);
const describeIfBuilt = buildExists ? describe : describe.skip;

if (!buildExists) {
  console.warn(
    `[server.test.ts] Skipping cross-origin isolation parity tests: ${buildServerEntry} not found. ` +
      'Run `pnpm nx build ui` first to enable this regression guard.',
  );
}

const workerAsset = buildExists ? findFirstWorkerAsset() : undefined;
const wasmAsset = buildExists ? findFirstWasmAsset() : undefined;
const largeKclWasmAsset = buildExists ? findLargeKclWasmAsset() : undefined;

describeIfBuilt('apps/ui build asset compression', () => {
  it.runIf(largeKclWasmAsset !== undefined)('emits both sidecars for large hashed KCL WASM', () => {
    const asset = largeKclWasmAsset!;
    expect(existsSync(resolve(buildClientAssets, `${asset}.br`)), `Missing Brotli sidecar for ${asset}`).toBe(true);
    expect(existsSync(resolve(buildClientAssets, `${asset}.gz`)), `Missing gzip sidecar for ${asset}`).toBe(true);
  });
});

describeIfBuilt('apps/ui server (cross-origin isolation parity)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { createApp } = (await import('./server.js')) as { createApp: () => Promise<Express> | Express };
    const app = await createApp();
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        resolve();
      });
      server.on('error', reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it('should serve the SSR HTML document with all three COI headers', async () => {
    const response = await fetch(baseUrl + '/');
    expect(response.status).toBeLessThan(500);
    for (const [name, value] of Object.entries(requiredHeaders)) {
      expect(response.headers.get(name), `${name} on /`).toBe(value);
    }
  });

  it.runIf(workerAsset !== undefined)('should serve worker script assets with all three COI headers', async () => {
    const response = await fetch(`${baseUrl}/assets/${workerAsset}`);
    expect(response.status).toBe(200);
    for (const [name, value] of Object.entries(requiredHeaders)) {
      expect(response.headers.get(name), `${name} on /assets/${workerAsset}`).toBe(value);
    }
  });

  it('should re-read the SSR build when a rebuild lands under the running server', async () => {
    const { loadServerBuild } = (await import('./server.js')) as { loadServerBuild: () => Promise<unknown> };
    const pinned = await loadServerBuild();

    // Stands in for `react-router build` rewriting build/; the mtime is all the loader watches.
    const rebuiltAt = new Date(Date.now() + 1000);
    utimesSync(buildServerEntry, rebuiltAt, rebuiltAt);

    // Pinning the build here is what leaves a serve emitting HTML for chunk hashes the rebuild deleted.
    expect(await loadServerBuild()).not.toBe(pinned);
  });

  it.runIf(wasmAsset !== undefined)('should serve WASM static assets with all three COI headers', async () => {
    const response = await fetch(`${baseUrl}/assets/${wasmAsset}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/wasm');
    for (const [name, value] of Object.entries(requiredHeaders)) {
      expect(response.headers.get(name), `${name} on /assets/${wasmAsset}`).toBe(value);
    }
  });

  it.runIf(wasmAsset !== undefined).each([
    { accept: 'br, gzip', encoding: 'br' },
    { accept: 'gzip', encoding: 'gzip' },
    { accept: 'identity', encoding: null },
  ])(
    'should negotiate $accept for WASM with a varying, isolated, byte-identical response',
    async ({ accept, encoding }) => {
      const response = await fetch(`${baseUrl}/assets/${wasmAsset}`, { headers: { 'accept-encoding': accept } });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-encoding')).toBe(encoding);
      expect(response.headers.get('vary')).toMatch(/accept-encoding/i);
      expect(response.headers.get('content-type')).toBe('application/wasm');
      expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      for (const [name, value] of Object.entries(requiredHeaders)) {
        expect(response.headers.get(name), `${name} on ${accept}`).toBe(value);
      }
      // Fetch decodes the content encoding, so the body must be the file itself.
      expect(
        Buffer.from(await response.arrayBuffer()).equals(readFileSync(resolve(buildClientAssets, wasmAsset!))),
      ).toBe(true);
    },
  );

  it.runIf(largeKclWasmAsset !== undefined)(
    'serves a precompressed asset with validators and range fallback',
    async () => {
      const asset = largeKclWasmAsset!;
      const url = `${baseUrl}/assets/${asset}`;
      const original = readFileSync(resolve(buildClientAssets, asset));
      const sidecar = resolve(buildClientAssets, `${asset}.br`);
      const brotli = await fetch(url, { headers: { 'accept-encoding': 'br' } });
      expect(brotli.status).toBe(200);
      expect(brotli.headers.get('content-encoding')).toBe('br');
      expect(brotli.headers.get('content-length')).toBe(String(statSync(sidecar).size));
      expect(brotli.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(Buffer.from(await brotli.arrayBuffer()).equals(original)).toBe(true);

      const etag = brotli.headers.get('etag')!;
      const head = await fetch(url, { method: 'HEAD', headers: { 'accept-encoding': 'br' } });
      expect(head.status).toBe(200);
      expect(head.headers.get('etag')).toBe(etag);
      expect(head.headers.get('content-length')).toBe(String(statSync(sidecar).size));

      // Explicit revalidation avoids Fetch's default no-store request, which Express treats as a forced reload.
      const fresh = await fetch(url, {
        cache: 'no-cache',
        headers: { 'accept-encoding': 'br', 'if-none-match': etag },
      });
      expect(fresh.status).toBe(304);
      expect(fresh.headers.get('etag')).toBe(etag);

      const gzip = await fetch(url, { headers: { 'accept-encoding': 'gzip' } });
      expect(gzip.headers.get('content-encoding')).toBe('gzip');
      expect(gzip.headers.get('etag')).not.toBe(etag);
      expect(Buffer.from(await gzip.arrayBuffer()).equals(original)).toBe(true);

      const range = await fetch(url, { headers: { 'accept-encoding': 'br', range: 'bytes=0-31' } });
      expect(range.status).toBe(206);
      expect(range.headers.get('content-encoding')).toBeNull();
      expect(Buffer.from(await range.arrayBuffer()).equals(original.subarray(0, 32))).toBe(true);

      const identity = await fetch(url, { headers: { 'accept-encoding': 'identity' } });
      expect(identity.headers.get('content-encoding')).toBeNull();
      expect(Buffer.from(await identity.arrayBuffer()).equals(original)).toBe(true);
    },
  );
});

type ServedRequest = { readonly response: ServerResponse; readonly settled: Promise<void> };

type ClientOutcome = {
  readonly status: number;
  readonly headers: IncomingMessage['headers'];
  readonly body: Uint8Array<ArrayBuffer>;
};

/** Resolves once the static handler under test has been entered for the next request. */
type NextServed = () => Promise<ServedRequest>;

describe('compressedStatic response lifecycle', () => {
  let root: string;
  // Incompressible content keeps both encoders producing far more than socket buffers hold, so an abort lands mid-body.
  const streamedName = 'streamed.js';
  const streamedBytes = randomBytes(16 * 1024 * 1024);
  const precompressedName = 'kcl_wasm_lib_bg-abcdefgh.wasm';
  const precompressedBytes = randomBytes(16 * 1024 * 1024);
  const routes = {
    streaming: { name: streamedName, bytes: streamedBytes, held: streamedName },
    precompressed: {
      name: precompressedName,
      bytes: precompressedBytes,
      // The sidecar `stat` is the last metadata await before the precompressed pipeline starts.
      held: `${precompressedName}.br`,
    },
  } as const;

  const errors: unknown[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  const waiters: Array<(served: ServedRequest) => void> = [];
  const nextServed: NextServed = async () =>
    new Promise<ServedRequest>((resolve) => {
      waiters.push(resolve);
    });
  let server: Server;
  let origin: string;
  const clients: ClientRequest[] = [];

  beforeAll(async () => {
    root = mkdtempSync(resolve(tmpdir(), 'tau-ui-compressed-static-'));
    writeFileSync(resolve(root, streamedName), streamedBytes);
    writeFileSync(resolve(root, precompressedName), precompressedBytes);
    writeFileSync(
      resolve(root, `${precompressedName}.br`),
      brotliCompressSync(precompressedBytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 1 } }),
    );

    const { compressedStatic } = (await import('./server.js')) as {
      compressedStatic: (root: string, cacheControl: string) => RequestHandler;
    };
    const handler = compressedStatic(root, 'public, max-age=3600');
    const app = express();
    // Mirrors Express 5's promise handling while letting each test await the handler's own settlement.
    app.use((request, response, next) => {
      const settle = async (): Promise<void> => {
        try {
          await handler(request, response, next);
        } catch (error) {
          next(error);
        }
      };
      const settled = settle();
      waiters.shift()?.({ response, settled });
    });
    app.use(express.static(root));
    // oxlint-disable-next-line eslint/max-params -- Express recognises error middleware by its four parameters.
    const recordError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
      errors.push(error);
      if (response.headersSent) {
        response.destroy();
      } else {
        response.status(500).end();
      }
    };
    app.use(recordError);

    // Streams recorded by earlier describes belong to finished requests; this block only judges its own.
    seams.streams.length = 0;
    process.on('unhandledRejection', onUnhandled);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.destroy();
    }
    for (const stream of seams.streams.splice(0)) {
      stream.destroy();
    }
    seams.heldStat = undefined;
    seams.failingRead = undefined;
    errors.length = 0;
    unhandled.length = 0;
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandled);
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    rmSync(root, { recursive: true, force: true });
  });

  /** Opens a real HTTP request without consuming it, so the test decides when the client leaves. */
  const open = (
    name: string,
    encoding: string,
  ): { client: ClientRequest; response: Promise<IncomingMessage | Error> } => {
    const client = httpRequest(`${origin}/${name}`, { headers: { 'accept-encoding': encoding } });
    clients.push(client);
    // Settles with the socket error instead of rejecting, so a test that never awaits it leaves no unhandled rejection.
    const response = new Promise<IncomingMessage | Error>((resolve) => {
      client.once('response', resolve);
      client.once('error', resolve);
    });
    client.end();
    return { client, response };
  };

  const fetchDecoded = async (name: string, encoding: string): Promise<ClientOutcome> => {
    const response = await fetch(`${origin}/${name}`, { headers: { 'accept-encoding': encoding } });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: new Uint8Array(await response.arrayBuffer()),
    };
  };

  const expectNoOpenStreams = (): void => {
    for (const stream of seams.streams) {
      expect(stream.destroyed, `${stream.constructor.name} left open`).toBe(true);
    }
  };

  const holdStat = (name: string): { entered: Promise<void>; release: () => void } => {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    seams.heldStat = {
      path: resolve(root, name),
      entered,
      released: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    return { entered: enteredPromise, release };
  };

  it.each([
    { route: 'streaming', encoding: 'gzip' },
    { route: 'streaming', encoding: 'br' },
    { route: 'precompressed', encoding: 'br' },
  ] as const)(
    'should stop without an error when the client leaves during the metadata await ($route, $encoding)',
    async ({ route, encoding }) => {
      const { name, bytes, held } = routes[route];
      const hold = holdStat(held);
      const served = nextServed();
      const { client } = open(name, encoding);
      const { response, settled } = await served;
      await hold.entered;

      client.destroy();
      await once(response, 'close');
      hold.release();
      await settled;

      expect(errors).toEqual([]);
      expect(unhandled).toEqual([]);
      expectNoOpenStreams();

      const following = await fetchDecoded(name, encoding);
      expect(following.status).toBe(200);
      expect(following.headers['content-encoding']).toBe(encoding);
      expect(Buffer.compare(following.body, bytes)).toBe(0);
    },
  );

  it.each([
    { route: 'streaming', encoding: 'br' },
    { route: 'precompressed', encoding: 'br' },
  ] as const)(
    'should end cleanly when the client leaves mid-transfer and serve the next request whole ($route)',
    async ({ route, encoding }) => {
      const { name, bytes } = routes[route];
      const served = nextServed();
      const { client, response: clientResponse } = open(name, encoding);
      const { response, settled } = await served;
      const message = await clientResponse;
      expect(message).toBeInstanceOf(IncomingMessage);
      expect((message as IncomingMessage).statusCode).toBe(200);
      await once(message as IncomingMessage, 'data');

      client.destroy();
      await settled;

      // The body was still being written when the client left.
      expect(response.writableFinished).toBe(false);
      expect(errors).toEqual([]);
      expect(unhandled).toEqual([]);
      expectNoOpenStreams();

      const following = await fetchDecoded(name, encoding);
      expect(following.status).toBe(200);
      expect(following.headers['content-encoding']).toBe(encoding);
      expect(following.headers.vary).toMatch(/accept-encoding/i);
      expect(following.headers.etag).toMatch(new RegExp(`-${encoding}"$`, 'u'));
      expect(Buffer.compare(following.body, bytes)).toBe(0);
    },
  );

  it.each([
    { route: 'streaming', encoding: 'gzip', read: streamedName },
    { route: 'precompressed', encoding: 'br', read: `${precompressedName}.br` },
  ] as const)(
    'should report a source read failure for a connected client ($route)',
    async ({ route, encoding, read }) => {
      const { name } = routes[route];
      const failure: NodeJS.ErrnoException = Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' });
      seams.failingRead = { path: resolve(root, read), error: failure };
      const served = nextServed();
      const { response: clientResponse } = open(name, encoding);
      const { settled } = await served;
      await settled;

      expect(errors).toHaveLength(1);
      expect((errors[0] as NodeJS.ErrnoException).code).toBe('EIO');
      expect((errors[0] as Error).message).toBe('EIO: i/o error, read');
      expect(unhandled).toEqual([]);
      expectNoOpenStreams();
      const outcome = await clientResponse;
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as NodeJS.ErrnoException).code).toBe('ECONNRESET');
    },
  );
});
