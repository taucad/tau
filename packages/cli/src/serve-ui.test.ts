import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HostIndicators } from '@taucad/runtime/preparation/node';

// oxlint-disable-next-line no-restricted-imports -- the layer producer is a script; scripts have no `#` alias.
import { buildLayer, layerAsset } from '../scripts/serve-ui-layer.mjs';
// oxlint-disable-next-line no-restricted-imports -- the CLI's pin sits beside package.json; `#` reaches only src.
import pinned from '../serve-ui-layer.json' with { type: 'json' };
import { isPlaceholderPin, prepareServeUi, readServeUiPin, serveUiDeployment, serveUiSelection } from '#serve-ui.js';
import type { ServeUiLayerPin } from '#serve-ui.js';

const roots: string[] = [];

afterEach(async () => {
  /* A cancelled preparation may still be removing its staging directory when the test ends. */
  await Promise.all(
    roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })),
  );
});

const scratch = async (): Promise<string> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-serve-ui-')));
  roots.push(root);
  return root;
};

const linuxHost: HostIndicators = {
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  libcVersion: '2.39',
  translated: false,
  wasm: { threads: true },
};

const cdn = 'https://cdn.example/blobs/sha256/';

/** A published layer: a built client, its archive and the pin it gives. */
const publishedLayer = async (root: string): Promise<{ pin: ServeUiLayerPin; bytes: Uint8Array<ArrayBuffer> }> => {
  const client = join(root, 'client-build');
  await mkdir(join(client, 'assets'), { recursive: true });
  await writeFile(join(client, 'index.html'), '<!doctype html><title>Tau</title>');
  await writeFile(join(client, 'assets', 'entry.client-a.js'), 'export {};\n');
  await writeFile(join(client, 'assets', 'entry.client-a.js.map'), '{}');
  const record = await buildLayer({ client, out: join(root, 'layer') });
  const bytes = new Uint8Array(await readFile(join(root, 'layer', layerAsset)));
  return {
    bytes,
    pin: {
      integrity: `sha256-${Buffer.from(record.sha256, 'hex').toString('base64')}`,
      byteLength: record.byteLength,
      unpackedByteLength: record.unpackedByteLength,
      urls: [`${cdn}${record.sha256}`],
    },
  };
};

/** A transport that serves the layer's bytes at its CDN URL and counts every request. */
const serving = (bytes: Uint8Array<ArrayBuffer>) =>
  vi.fn<typeof fetch>(async (input) =>
    String(input instanceof Request ? input.url : input).startsWith(cdn)
      ? new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } })
      : new Response('not found', { status: 404 }),
  );

describe('readServeUiPin', () => {
  it('should read the shipped pin, which is the fail-closed placeholder until a layer is published', () => {
    const pin = readServeUiPin(pinned);

    expect(pin.integrity).toBe(`sha256-${createHash('sha256').digest('base64')}`);
    expect(isPlaceholderPin(pin)).toBe(true);
  });

  it.each([
    ['a missing schema version', { integrity: 'sha256-x' }],
    [
      'a sha512 integrity',
      { schemaVersion: 1, integrity: `sha512-${'A'.repeat(86)}==`, byteLength: 1, unpackedByteLength: 1, urls: [] },
    ],
    [
      'a zero size',
      { schemaVersion: 1, integrity: `sha256-${'A'.repeat(43)}=`, byteLength: 0, unpackedByteLength: 1, urls: [] },
    ],
    ['no URL list', { schemaVersion: 1, integrity: `sha256-${'A'.repeat(43)}=`, byteLength: 1, unpackedByteLength: 1 }],
    ['nothing at all', undefined],
  ])('should refuse %s', (_label, value) => {
    expect(() => readServeUiPin(value)).toThrow('is not a schema v1 serve UI layer pin');
  });

  it('should refuse an http URL, a URL with credentials, and a published pin with no URL', () => {
    const base = { schemaVersion: 1, integrity: `sha256-${'A'.repeat(43)}=`, byteLength: 1, unpackedByteLength: 1 };

    expect(() => readServeUiPin({ ...base, urls: ['http://cdn.example/x'] })).toThrow('which is not an https URL');
    expect(() => readServeUiPin({ ...base, urls: ['https://user:secret@cdn.example/x'] })).toThrow('not an https URL');
    expect(() => readServeUiPin({ ...base, urls: [42] })).toThrow('not an https URL');
    expect(() => readServeUiPin({ ...base, urls: [] })).toThrow('with no URL to download it from');
    expect(readServeUiPin({ ...base, urls: ['https://cdn.example/x'] }).urls).toEqual(['https://cdn.example/x']);
  });
});

describe('serveUiDeployment', () => {
  it('should declare one archive, unpacked into client/, for every target the store prepares on, and no kernel', () => {
    const pin: ServeUiLayerPin = {
      integrity: `sha256-${'A'.repeat(43)}=`,
      byteLength: 10,
      unpackedByteLength: 20,
      urls: ['https://cdn.example/x'],
    };
    const deployment = serveUiDeployment(pin);

    expect(deployment.kernels).toEqual({});
    expect(deployment.dependencies['ui']?.map(({ target }) => target)).toHaveLength(6);
    expect(new Set(deployment.dependencies['ui']?.map(({ payloads }) => JSON.stringify(payloads)))).toEqual(
      new Set([
        JSON.stringify([
          {
            name: 'client',
            integrity: pin.integrity,
            byteLength: 10,
            format: 'tar.gz',
            origin: { kind: 'url', urls: ['https://cdn.example/x'] },
            destination: 'client',
            unpackedByteLength: 20,
          },
        ]),
      ]),
    );
  });
});

describe('prepareServeUi', () => {
  const { signal } = new AbortController();

  it('should make no request while the pin is the placeholder', async () => {
    const transport = vi.fn<typeof fetch>();

    await expect(prepareServeUi({ signal, fetch: transport })).resolves.toEqual({
      status: 'unavailable',
      reason: 'unpublished',
      message: 'This release of the Tau CLI pins no published Tau UI yet.',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('should download the layer once by digest, seal it in the store, and serve its client directory', async () => {
    const root = await scratch();
    const { pin, bytes } = await publishedLayer(root);
    const store = join(root, 'store');
    const transport = serving(bytes);
    const progress: number[] = [];
    const options = { signal, pin, store, environment: {}, indicators: linuxHost, fetch: transport };

    const first = await prepareServeUi({
      ...options,
      onProgress: ({ completedBytes }) => progress.push(completedBytes),
    });
    const second = await prepareServeUi(options);

    expect(first).toMatchObject({
      status: 'ready',
      root: expect.stringMatching(/\/closures\/sha256\/[\da-f]{64}\/client$/u) as string,
    });
    expect(second).toEqual(first);
    expect(transport).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toBe(bytes.byteLength);
    const root_ = first.status === 'ready' ? first.root : '';
    await expect(readFile(join(root_, 'index.html'), 'utf8')).resolves.toBe('<!doctype html><title>Tau</title>');
    await expect(readFile(join(root_, 'assets', 'entry.client-a.js.map'))).rejects.toThrow(/ENOENT/u);
    expect(serveUiSelection).toEqual({ package: '@taucad/cli', dependencies: ['ui'] });
  });

  it('should take the store, the profile, the mirror and the seed from the environment by default', async () => {
    const root = await scratch();
    const { pin, bytes } = await publishedLayer(root);
    const hex = Buffer.from(pin.integrity.slice('sha256-'.length), 'base64').toString('hex');
    await mkdir(join(root, 'mirror', 'blobs', 'sha256'), { recursive: true });
    await writeFile(join(root, 'mirror', 'blobs', 'sha256', hex), bytes);
    await mkdir(join(root, 'seed'));
    vi.stubEnv('TAU_CONFIG_DIR', join(root, 'config'));
    vi.stubEnv('TAU_PAYLOAD_MIRROR', `file://${join(root, 'mirror')}/`);
    vi.stubEnv('TAU_PAYLOAD_DIR', join(root, 'seed'));
    try {
      const outcome = await prepareServeUi({ signal, pin });

      expect(outcome).toMatchObject({ status: 'ready' });
      expect(outcome.status === 'ready' && outcome.root.startsWith(join(root, 'config'))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should refuse bytes that do not match the pin, and seal nothing', async () => {
    const root = await scratch();
    const { pin } = await publishedLayer(root);
    const tampered = new Uint8Array(pin.byteLength).fill(1);

    const outcome = await prepareServeUi({
      signal,
      pin,
      store: join(root, 'store'),
      environment: {},
      indicators: linuxHost,
      fetch: serving(tampered),
    });

    expect(outcome).toMatchObject({
      status: 'unavailable',
      reason: 'failed',
      message: expect.stringMatching(/^INTEGRITY_MISMATCH: /u) as string,
    });
  });

  it('should answer an offline miss without a request under the locked profile', async () => {
    const root = await scratch();
    const { pin } = await publishedLayer(root);
    const transport = vi.fn<typeof fetch>();

    const outcome = await prepareServeUi({
      signal,
      pin,
      store: join(root, 'store'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the managed variable keeps its name.
      environment: { TAU_ACQUISITION: 'locked' },
      indicators: linuxHost,
      fetch: transport,
    });

    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'offline-miss' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('should say the layer is not prepared on a host the store has no target for', async () => {
    const root = await scratch();
    const { pin } = await publishedLayer(root);

    const outcome = await prepareServeUi({
      signal,
      pin,
      store: join(root, 'store'),
      environment: {},
      indicators: { os: 'win32', arch: 'x64', osVersion: '10.0.26100', translated: false, wasm: { threads: true } },
      fetch: vi.fn<typeof fetch>(),
    });

    expect(outcome).toEqual({
      status: 'unavailable',
      reason: 'unsupported-target',
      message: `The Tau UI layer is not prepared on ${process.platform}-${process.arch} yet.`,
    });
  });

  it('should answer a malformed managed profile and a cancelled preparation as unavailable', async () => {
    const root = await scratch();
    const { pin, bytes } = await publishedLayer(root);
    const base = { pin, store: join(root, 'store'), indicators: linuxHost, fetch: serving(bytes) };

    await expect(
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the managed variable keeps its name.
      prepareServeUi({ ...base, signal, environment: { TAU_ACQUISITION: 'sometimes' } }),
    ).rejects.toThrow(/TAU_ACQUISITION/u);
    await expect(prepareServeUi({ ...base, signal: AbortSignal.abort(), environment: {} })).resolves.toEqual({
      status: 'unavailable',
      reason: 'cancelled',
      message: 'Preparing the Tau UI was cancelled.',
    });
  });

  it('should answer a download that fails, and a store that cannot be written, with what went wrong', async () => {
    const root = await scratch();
    const { pin } = await publishedLayer(root);
    const base = { signal, pin, environment: {}, indicators: linuxHost };
    const failing = vi.fn<typeof fetch>(async () => {
      throw new TypeError('socket hang up');
    });
    await writeFile(join(root, 'not-a-directory'), '');

    await expect(prepareServeUi({ ...base, store: join(root, 'store'), fetch: failing })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'failed',
      message: expect.stringMatching(/^DOWNLOAD_FAILED: /u) as string,
    });
    await expect(
      prepareServeUi({ ...base, store: join(root, 'not-a-directory', 'store'), fetch: vi.fn<typeof fetch>() }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'failed',
      message: expect.stringMatching(/ENOTDIR/u) as string,
    });
  });
});
