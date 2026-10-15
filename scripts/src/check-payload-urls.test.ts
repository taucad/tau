import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkPayloadUrls, isPlaceholderIntegrity, pinnedUrls } from '#check-payload-urls.js';

const bytes = new TextEncoder().encode('tau layer');
const integrity = (algorithm: 'sha256' | 'sha512', data: Uint8Array<ArrayBuffer>) =>
  `${algorithm}-${createHash(algorithm).update(data).digest('base64')}`;
const manifest = (urls: readonly string[], pin = integrity('sha512', bytes), byteLength = bytes.byteLength) => ({
  schemaVersion: 1,
  kernels: { picogk: { requires: ['runtime'], extensions: ['cs'] } },
  dependencies: {
    runtime: [
      {
        target: { runtime: 'native', os: 'darwin', arch: 'arm64' },
        payloads: [
          {
            name: 'worker',
            integrity: pin,
            byteLength,
            format: 'tar.gz',
            origin: { kind: 'url', urls },
            destination: 'w',
          },
          {
            name: 'script',
            integrity: pin,
            byteLength,
            format: 'raw',
            origin: { kind: 'packagePath', path: 'x' },
            destination: '.',
          },
        ],
      },
    ],
  },
});
const serve =
  (routes: Readonly<Record<string, Uint8Array<ArrayBuffer> | number>>): typeof fetch =>
  async (input) => {
    const route = routes[input instanceof Request ? input.url : input instanceof URL ? input.href : input];
    if (route === undefined) {
      throw new TypeError('fetch failed');
    }
    return typeof route === 'number' ? new Response(undefined, { status: route }) : new Response(route);
  };

describe('check-payload-urls', () => {
  const roots: string[] = [];
  const write = async (value: unknown): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-payload-urls-'));
    roots.push(root);
    const path = join(root, 'tau-plugin.json');
    await writeFile(path, JSON.stringify(value));
    return path;
  };

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  it('lists every url origin and skips package-relative payloads', () => {
    expect(pinnedUrls(manifest(['https://a.test/x', 'https://b.test/x'])).map(({ url }) => url)).toEqual([
      'https://a.test/x',
      'https://b.test/x',
    ]);
    expect(() => pinnedUrls({ schemaVersion: 2 })).toThrow('Not a tau-plugin.json schema v1 manifest.');
    expect(() => pinnedUrls(manifest(['https://a.test/x'], 'md5-x'))).toThrow('runtime/worker has no SRI integrity');
  });

  it('passes when every url serves the pinned bytes', async () => {
    const path = await write(manifest(['https://a.test/x', 'https://b.test/x']));

    await expect(
      checkPayloadUrls([path], serve({ 'https://a.test/x': bytes, 'https://b.test/x': bytes })),
    ).resolves.toEqual([]);
  });

  it('skips a placeholder pin with a notice naming the package and still checks every real pin', async () => {
    const placeholder = integrity('sha256', new Uint8Array());
    const value = manifest(['https://real.test/x']);
    value.dependencies.runtime[0]!.payloads.push({
      name: 'layer',
      integrity: placeholder,
      byteLength: 1,
      format: 'tar.gz',
      origin: { kind: 'url', urls: ['https://cdn.test/blobs/sha256/e3b0'] },
      destination: 'l',
    });
    const path = await write(value);
    await writeFile(join(path, '..', 'package.json'), JSON.stringify({ name: '@taucad/example' }));
    const notices: string[] = [];

    await expect(
      checkPayloadUrls([path], serve({ 'https://real.test/x': 404 }), (message) => notices.push(message)),
    ).resolves.toEqual(['runtime/worker: https://real.test/x answered HTTP 404']);
    expect(notices).toEqual([
      '@taucad/example pins runtime/layer to the fail-closed placeholder (the digest of zero bytes); its URLs are not checked until a real pin lands.',
    ]);
    expect(isPlaceholderIntegrity(integrity('sha512', new Uint8Array()))).toBe(true);
    expect(isPlaceholderIntegrity(integrity('sha512', bytes))).toBe(false);
    expect(isPlaceholderIntegrity('md5-x')).toBe(false);
  });

  it('names each url that is missing, unreachable, short, long or different', async () => {
    const other = new TextEncoder().encode('tau lager');
    const path = await write(
      manifest([
        'https://missing.test/x',
        'https://down.test/x',
        'https://short.test/x',
        'https://long.test/x',
        'https://other.test/x',
      ]),
    );

    await expect(
      checkPayloadUrls(
        [path],
        serve({
          'https://missing.test/x': 404,
          'https://short.test/x': bytes.slice(1),
          'https://long.test/x': new Uint8Array([...bytes, 0]),
          'https://other.test/x': other,
        }),
      ),
    ).resolves.toEqual([
      'runtime/worker: https://missing.test/x answered HTTP 404',
      'runtime/worker: https://down.test/x could not be fetched: fetch failed',
      'runtime/worker: https://short.test/x served 8 bytes, not the pinned 9',
      'runtime/worker: https://long.test/x serves more than the pinned 9 bytes',
      `runtime/worker: https://other.test/x does not match ${integrity('sha512', bytes)}`,
    ]);
  });
});
