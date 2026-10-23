// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
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
): Promise<{ readonly origin: string; readonly requests: string[] }> => {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').slice(1);
    requests.push(path);
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
        server.close(() => {
          resolve();
        });
      }),
  );
  return { origin: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, requests };
};

const readIndex = async (clientDirectory: string): Promise<ServedAssetsIndex> =>
  JSON.parse(await readFile(join(clientDirectory, servedAssetsIndexFileName), 'utf8')) as ServedAssetsIndex;

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

  it('should publish an index of its own assets when no live deploy is named', async () => {
    const client = await createClient({ 'assets/nested/worker-NEW1.js': 'worker' });

    await retainPreviousAssets({ clientDirectory: client, origin: undefined });

    expect(await readIndex(client)).toStrictEqual(
      indexOf([{ path: 'assets/nested/worker-NEW1.js', integrity: integrityOf('worker'), generation: 0 }]),
    );
  });
});
