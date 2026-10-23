// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mapWithConcurrency,
  planRetention,
  retainPreviousAssets,
  servedAssetsIndexFileName,
  servedAssetsIndexSchema,
} from '#scripts/retain-previous-assets.mts';
import type { ServedAsset, ServedAssetsIndex } from '#scripts/retain-previous-assets.mts';

const integrityOf = (bytes: string | Uint8Array<ArrayBuffer>): string =>
  `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

const indexOf = (assets: readonly ServedAsset[]): ServedAssetsIndex => ({ schema: servedAssetsIndexSchema, assets });

const fixtureRoot = resolve(import.meta.dirname, '../node_modules/.cache');
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

/** A client build directory holding `files` (paths relative to it). */
const createClient = async (files: Readonly<Record<string, string>>): Promise<string> => {
  await mkdir(fixtureRoot, { recursive: true });
  const directory = await mkdtemp(join(fixtureRoot, 'tau-retain-'));
  cleanups.push(async () => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), content);
    }),
  );
  return directory;
};

/** The live deploy: serves `files` by path and its index, and counts requests. */
const startLiveDeploy = async (
  files: Readonly<Record<string, string>>,
  index: ServedAssetsIndex | undefined,
  misbehave: (
    path: string,
    attempt: number,
  ) => 'hang' | 'unavailable' | { readonly status: number; readonly retryAfter?: string } | undefined = () => undefined,
): Promise<{ readonly origin: string; readonly requests: string[] }> => {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').slice(1));
    requests.push(path);
    const fault = misbehave(path, requests.filter((requested) => requested === path).length);
    if (fault === 'hang') {
      return;
    }
    if (fault === 'unavailable') {
      response.writeHead(503).end();
      return;
    }
    if (typeof fault === 'object') {
      response.writeHead(fault.status, fault.retryAfter === undefined ? {} : { 'retry-after': fault.retryAfter }).end();
      return;
    }
    const body = path === servedAssetsIndexFileName && index ? JSON.stringify(index) : files[path];
    if (body === undefined) {
      response.writeHead(404, { 'content-type': 'text/html' }).end('<!DOCTYPE html>');
      return;
    }
    response.writeHead(200).end(body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(
    async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  );
  return { origin: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, requests };
};

const readIndex = async (clientDirectory: string): Promise<ServedAssetsIndex> =>
  JSON.parse(await readFile(join(clientDirectory, servedAssetsIndexFileName), 'utf8')) as ServedAssetsIndex;

describe('mapWithConcurrency', () => {
  it('should keep at most the limit in flight and return results in input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency(
      Array.from({ length: 20 }, (_, index) => index),
      3,
      async (value) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        inFlight -= 1;
        return value * 2;
      },
    );

    expect(peak).toBe(3);
    expect(results).toStrictEqual(Array.from({ length: 20 }, (_, index) => index * 2));
  });
});

describe('planRetention', () => {
  const previous = indexOf([
    { path: 'assets/shared-AAAA.js', integrity: integrityOf('shared'), generation: 0 },
    { path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 },
    { path: 'assets/route-OLD2.js', integrity: integrityOf('old2'), generation: 1 },
    { path: 'assets/route-OLD3.js', integrity: integrityOf('old3'), generation: 2 },
  ]);

  it('should keep the previous builds’ assets the new build lacks, one generation older', () => {
    expect(planRetention(previous, new Set(['assets/shared-AAAA.js']), 2)).toStrictEqual([
      { path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 1 },
      { path: 'assets/route-OLD2.js', integrity: integrityOf('old2'), generation: 2 },
    ]);
  });

  it('should keep nothing when retention is off', () => {
    expect(planRetention(previous, new Set(), 0)).toStrictEqual([]);
  });

  it.each([
    ['escapes the asset directory', 'assets/../server/index.js'],
    ['is outside the asset directory', 'index.html'],
    ['is absolute', '/assets/a-1.js'],
    ['carries a query', 'assets/a-1.js?raw'],
    ['carries a backslash', String.raw`assets/a\b.js`],
  ])('should refuse an index whose path %s', (_label, path) => {
    expect(() => planRetention(indexOf([{ path, integrity: integrityOf('x'), generation: 0 }]), new Set(), 2)).toThrow(
      /refuses the path/u,
    );
  });
});

describe('retainPreviousAssets', () => {
  it('should carry the live deploy’s assets into the new build, verified, and publish the new index', async () => {
    const live = await startLiveDeploy(
      { 'assets/route-OLD1.js': 'old1', 'assets/route-OLD2.js': 'old2' },
      indexOf([
        { path: 'assets/shared-AAAA.js', integrity: integrityOf('shared'), generation: 0 },
        { path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 },
        { path: 'assets/route-OLD2.js', integrity: integrityOf('old2'), generation: 1 },
        { path: 'assets/route-OLD3.js', integrity: integrityOf('old3'), generation: 2 },
      ]),
    );
    const client = await createClient({ 'assets/shared-AAAA.js': 'shared', 'assets/route-NEW1.js': 'new1' });

    const result = await retainPreviousAssets({ clientDirectory: client, origin: live.origin });

    expect(await readFile(join(client, 'assets/route-OLD1.js'), 'utf8')).toBe('old1');
    expect(await readFile(join(client, 'assets/route-OLD2.js'), 'utf8')).toBe('old2');
    expect(live.requests).not.toContain('assets/route-OLD3.js');
    expect(live.requests).not.toContain('assets/shared-AAAA.js');
    expect(result.retained).toBe(2);
    expect(await readIndex(client)).toStrictEqual(
      indexOf([
        { path: 'assets/route-NEW1.js', integrity: integrityOf('new1'), generation: 0 },
        { path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 1 },
        { path: 'assets/route-OLD2.js', integrity: integrityOf('old2'), generation: 2 },
        { path: 'assets/shared-AAAA.js', integrity: integrityOf('shared'), generation: 0 },
      ]),
    );
  });

  it('should refuse to publish an asset whose bytes do not match the live index', async () => {
    const live = await startLiveDeploy(
      { 'assets/route-OLD1.js': 'tampered' },
      indexOf([{ path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 }]),
    );
    const client = await createClient({ 'assets/route-NEW1.js': 'new1' });

    await expect(retainPreviousAssets({ clientDirectory: client, origin: live.origin })).rejects.toThrow(
      'assets/route-OLD1.js does not match its integrity',
    );
    await expect(readFile(join(client, 'assets/route-OLD1.js'), 'utf8')).rejects.toThrow('ENOENT');
  });

  it('should fail when the live deploy no longer serves an asset its index lists', async () => {
    const live = await startLiveDeploy(
      {},
      indexOf([{ path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 }]),
    );
    const client = await createClient({ 'assets/route-NEW1.js': 'new1' });

    await expect(retainPreviousAssets({ clientDirectory: client, origin: live.origin })).rejects.toThrow(
      'assets/route-OLD1.js answered 404',
    );
  });

  it('should publish an index of its own assets when the live deploy has none yet', async () => {
    const live = await startLiveDeploy({}, undefined);
    const client = await createClient({ 'assets/route-NEW1.js': 'new1' });

    const result = await retainPreviousAssets({ clientDirectory: client, origin: live.origin });

    expect(result.retained).toBe(0);
    expect(await readIndex(client)).toStrictEqual(
      indexOf([{ path: 'assets/route-NEW1.js', integrity: integrityOf('new1'), generation: 0 }]),
    );
  });

  it('should retry an unavailable live deploy, waiting longer each time, before giving up', async () => {
    const live = await startLiveDeploy(
      { 'assets/route-OLD1.js': 'old1' },
      indexOf([{ path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 }]),
      (path, attempt) => (path === 'assets/route-OLD1.js' && attempt < 3 ? 'unavailable' : undefined),
    );
    const client = await createClient({ 'assets/route-NEW1.js': 'new1' });
    const waits: number[] = [];

    await retainPreviousAssets({
      clientDirectory: client,
      origin: live.origin,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    expect(await readFile(join(client, 'assets/route-OLD1.js'), 'utf8')).toBe('old1');
    expect(waits).toStrictEqual([1000, 2000]);
  });

  it.each([
    ['a throttle that names its wait', { status: 429, retryAfter: '3' }, [3000]],
    ['a throttle that asks for longer than the cap', { status: 429, retryAfter: '120' }, [30_000]],
    ['a throttle without a wait', { status: 429 }, [1000]],
    ['a request timeout', { status: 408 }, [1000]],
  ])('should retry %s instead of failing the deploy', async (_label, fault, expectedWaits) => {
    const live = await startLiveDeploy(
      { 'assets/route-OLD1.js': 'old1' },
      indexOf([{ path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 }]),
      (path, attempt) => (path === 'assets/route-OLD1.js' && attempt === 1 ? fault : undefined),
    );
    const client = await createClient({ 'assets/route-NEW1.js': 'new1' });
    const waits: number[] = [];

    await retainPreviousAssets({
      clientDirectory: client,
      origin: live.origin,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    expect(await readFile(join(client, 'assets/route-OLD1.js'), 'utf8')).toBe('old1');
    expect(waits).toStrictEqual(expectedWaits);
  });

  it('should give up on an asset the live deploy never finishes sending', async () => {
    const live = await startLiveDeploy(
      {},
      indexOf([{ path: 'assets/route-OLD1.js', integrity: integrityOf('old1'), generation: 0 }]),
      (path) => (path === 'assets/route-OLD1.js' ? 'hang' : undefined),
    );
    const client = await createClient({ 'assets/route-NEW1.js': 'new1' });

    await expect(
      retainPreviousAssets({
        clientDirectory: client,
        origin: live.origin,
        requestTimeout: 50,
        wait: async () => undefined,
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('should fail when the new build has no asset directory to publish', async () => {
    const client = await createClient({ 'index.html': '<!DOCTYPE html>' });

    await expect(retainPreviousAssets({ clientDirectory: client, origin: undefined })).rejects.toThrow('ENOENT');
  });

  it('should leave files no page loads out of the index and out of retention', async () => {
    const live = await startLiveDeploy(
      { 'assets/kcl-OLD1.wasm': 'wasm' },
      indexOf([
        { path: 'assets/kcl-OLD1.wasm', integrity: integrityOf('wasm'), generation: 0 },
        { path: 'assets/kcl-OLD1.wasm.br', integrity: integrityOf('br'), generation: 0 },
        { path: 'assets/route-OLD1.js.map', integrity: integrityOf('map'), generation: 0 },
        { path: 'assets/tau-module-graph-OLD1.json', integrity: integrityOf('graph'), generation: 0 },
      ]),
    );
    const client = await createClient({
      'assets/kcl-NEW1.wasm': 'new',
      'assets/kcl-NEW1.wasm.br': 'br',
      'assets/kcl-NEW1.wasm.gz': 'gz',
      'assets/route-NEW1.js.map': 'map',
      'assets/tau-module-graph-NEW1.json': 'graph',
    });

    await retainPreviousAssets({ clientDirectory: client, origin: live.origin });

    const index = await readIndex(client);
    expect(index.assets.map((asset) => asset.path)).toStrictEqual(['assets/kcl-NEW1.wasm', 'assets/kcl-OLD1.wasm']);
    expect(live.requests).not.toContain('assets/kcl-OLD1.wasm.br');
    expect(live.requests).not.toContain('assets/route-OLD1.js.map');
    expect(live.requests).not.toContain('assets/tau-module-graph-OLD1.json');
  });

  it('should publish an unusual but valid asset name and retain it in the next deploy', async () => {
    const name = 'assets/chunk@1~(copy) é+$.js';
    const previous = await createClient({ [name]: 'odd' });
    const { index } = await retainPreviousAssets({ clientDirectory: previous, origin: undefined });
    const live = await startLiveDeploy({ [name]: 'odd' }, index);
    const next = await createClient({ 'assets/route-NEW1.js': 'new1' });

    await retainPreviousAssets({ clientDirectory: next, origin: live.origin });

    expect(await readFile(join(next, name), 'utf8')).toBe('odd');
  });

  it('should fail the deploy that would publish an asset name the next deploy could not read', async () => {
    const client = await createClient({ 'assets/bad\\name.js': 'bad' });

    await expect(retainPreviousAssets({ clientDirectory: client, origin: undefined })).rejects.toThrow(
      /refuses the path/u,
    );
    await expect(readFile(join(client, servedAssetsIndexFileName), 'utf8')).rejects.toThrow('ENOENT');
  });

  it('should publish an index of its own assets when no live deploy is named', async () => {
    const client = await createClient({ 'assets/nested/worker-NEW1.js': 'worker' });

    await retainPreviousAssets({ clientDirectory: client, origin: undefined });

    expect(await readIndex(client)).toStrictEqual(
      indexOf([{ path: 'assets/nested/worker-NEW1.js', integrity: integrityOf('worker'), generation: 0 }]),
    );
  });
});
