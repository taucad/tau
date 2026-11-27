/**
 * The daemon's static UI handler, driven over a real loopback socket: the SPA shell and the WebAssembly mounts that
 * serve `cadmpeg-ts`'s engines same-origin to a `tau serve` page (cadmpeg engine delivery charter W6, D12, I9).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isolationHeaders, serveStaticUi } from '#static-ui.js';
import type { StaticUiOptions } from '#static-ui.js';

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      async (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** A UI build, an engine directory beside a secret file, and a daemon serving both. */
const startUi = async (
  mounts?: (engines: string) => StaticUiOptions['wasmMounts'],
): Promise<{ readonly origin: string; readonly engines: string }> => {
  const base = await mkdtemp(join(tmpdir(), 'tau-static-ui-'));
  directories.push(base);
  const ui = join(base, 'ui');
  const engines = join(base, 'cadmpeg-ts', 'dist', 'wasm');
  await mkdir(join(ui, 'assets'), { recursive: true });
  await mkdir(engines, { recursive: true });
  await writeFile(join(ui, 'index.html'), '<!doctype html><title>Tau</title>');
  await writeFile(join(ui, 'assets', 'entry.js'), 'export {};');
  await writeFile(join(engines, 'sldprt_bg.wasm'), wasmBytes);
  await writeFile(join(engines, 'sldprt.js'), 'export {};');
  await writeFile(join(base, 'cadmpeg-ts', 'package.json'), '{"name":"cadmpeg-ts"}');
  await writeFile(join(base, 'secret.wasm'), wasmBytes);
  const handler = serveStaticUi({
    root: ui,
    cookieName: 'tau_host_session',
    cookieValue: 'cookie',
    ...(mounts ? { wasmMounts: mounts(engines) } : {}),
  });
  const server = createServer((request, response) => {
    handler.handle(request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  return { origin: `http://127.0.0.1:${String(address.port)}`, engines };
};

/** One request with the path sent exactly as written: `fetch` would normalize `..` before it leaves. */
const rawGet = async (
  origin: string,
  path: string,
  method = 'GET',
): Promise<{
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array<ArrayBuffer>;
}> =>
  new Promise((resolve, reject) => {
    const outgoing = httpRequest(`${origin}/`, { path, method }, (response) => {
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      response.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers as Record<string, string>,
          body: new Uint8Array(Buffer.concat(chunks)),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });

const engineMount = (engines: string): StaticUiOptions['wasmMounts'] => [{ path: '/cadmpeg-engines/', root: engines }];

describe('serveStaticUi wasm mounts', () => {
  it('answers a mounted engine as application/wasm with the isolation headers', async () => {
    const { origin } = await startUi(engineMount);
    const response = await rawGet(origin, '/cadmpeg-engines/sldprt_bg.wasm');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/wasm');
    expect(response.headers['content-length']).toBe(String(wasmBytes.byteLength));
    for (const [name, value] of Object.entries(isolationHeaders)) {
      expect(response.headers[name]).toBe(value);
    }
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(new Uint8Array(response.body)).toEqual(wasmBytes);
  });

  it('answers HEAD with the headers and no body', async () => {
    const { origin } = await startUi(engineMount);
    const response = await rawGet(origin, '/cadmpeg-engines/sldprt_bg.wasm', 'HEAD');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/wasm');
    expect(response.body.byteLength).toBe(0);
  });

  it.each([
    ['an encoded separator', '/cadmpeg-engines/..%2f..%2fsecret.wasm'],
    ['an encoded backslash', '/cadmpeg-engines/..%5csecret.wasm'],
    ['a nested path', '/cadmpeg-engines/nested/sldprt_bg.wasm'],
    ['another extension', '/cadmpeg-engines/sldprt.js'],
    ['a name without an extension', '/cadmpeg-engines/sldprt_bg'],
    ['the mount itself', '/cadmpeg-engines/'],
    ['the mount without its slash', '/cadmpeg-engines'],
  ])('refuses %s with 403 and never falls back to the UI', async (_case, path) => {
    const { origin } = await startUi(engineMount);
    const response = await rawGet(origin, path);
    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(new TextDecoder().decode(response.body)).toBe('Forbidden\n');
  });

  it.each([
    '/cadmpeg-engines/../package.json',
    '/cadmpeg-engines/%2e%2e/package.json',
    '/cadmpeg-engines/../../secret.wasm',
  ])('resolves the dot segments of %s before the mount, so they never reach the engine directory', async (path) => {
    const { origin } = await startUi(engineMount);
    const response = await rawGet(origin, path);
    /* The URL parser removes `..` (and `%2e%2e`) first: what is left is a UI path the build does not hold. */
    expect(response.status).toBe(404);
    expect(new TextDecoder().decode(response.body)).toBe('Not found\n');
  });

  it('answers a module the mount does not hold with 404, not the SPA shell', async () => {
    const { origin } = await startUi(engineMount);
    const response = await rawGet(origin, '/cadmpeg-engines/usd_bg.wasm');
    expect(response.status).toBe(404);
    expect(new TextDecoder().decode(response.body)).toBe('Not found\n');
  });

  it('serves no engine without a mount', async () => {
    const { origin } = await startUi();
    const response = await rawGet(origin, '/cadmpeg-engines/sldprt_bg.wasm');
    expect(response.status).toBe(404);
  });

  it('keeps serving the UI and its SPA fallback beside a mount', async () => {
    const { origin } = await startUi(engineMount);
    const shell = await rawGet(origin, '/w/workspace/project');
    expect(shell.status).toBe(200);
    expect(shell.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(String(shell.headers['set-cookie'])).toContain('tau_host_session=cookie');
    const asset = await rawGet(origin, '/assets/entry.js');
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8');
    /* A path that merely starts like the mount is the UI's. */
    const lookalike = await rawGet(origin, '/cadmpeg-engines-old/sldprt_bg.wasm');
    expect(lookalike.status).toBe(404);
  });

  it.each(['cadmpeg-engines/', '/cadmpeg-engines', '/', '/a/b/', '/../'])(
    'refuses a mount path %s that is not one segment',
    (path) => {
      expect(() =>
        serveStaticUi({ root: '/ui', cookieName: 'c', cookieValue: 'v', wasmMounts: [{ path, root: '/engines' }] }),
      ).toThrow(TypeError);
    },
  );
});
