// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync, utimesSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';

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

      /* Node's fetch() turns a conditional request into `cache-control: no-cache` unless one is given, and a
       * no-cache request is never fresh; `max-age=0` revalidates as a browser reload does. */
      const fresh = await fetch(url, {
        headers: { 'accept-encoding': 'br', 'if-none-match': etag, 'cache-control': 'max-age=0' },
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
