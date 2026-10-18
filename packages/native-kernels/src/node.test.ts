/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are SCREAMING_SNAKE_CASE. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type * as PreparationNode from '@taucad/runtime/preparation/node';
import { readManagedPreparation } from '@taucad/runtime/preparation/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { composedRow, nativeKernelAdopters } from '#adopters.js';
import type { ComposedNativeKernel } from '#adopters.js';
import { fixtureClosure } from '#native-kernels.fixture.js';
import {
  composeNativeKernels,
  composeNativePlugins,
  nativeKernelFor,
  nativeKernelIdsSupportedOn,
  nativePreparationPlugins,
  openNativePreparation,
  UnknownNativeKernelError,
  verifyStoreClosure,
} from '#node.js';

/* The stores each preparation host is opened over; the hosts themselves are the real ones. */
const opened = vi.hoisted(() => ({ stores: [] as string[] }));
vi.mock('@taucad/runtime/preparation/node', async (importOriginal) => {
  const actual = await importOriginal<typeof PreparationNode>();
  return {
    ...actual,
    createPreparationHost: (options: Parameters<typeof actual.createPreparationHost>[0]) => {
      opened.stores.push(options.store);
      return actual.createPreparationHost(options);
    },
  };
});

describe('native kernels from the payload store', () => {
  let directory: string;
  let store: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-native-kernels-'));
    store = join(directory, 'payloads');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const storeEntries = async (): Promise<string[]> => {
    const entries = await readdir(directory, { recursive: true });
    return entries.filter((entry) => entry.includes('closures') || entry.includes('blobs'));
  };

  it('should give the preparation roster each adopter seal step and launch set, in roster order', () => {
    const plugins = nativePreparationPlugins();
    const [build123d, picogk] = plugins;

    expect(plugins.map((plugin) => plugin.package)).toEqual(nativeKernelAdopters.map((adopter) => adopter.package));
    expect(build123d?.deployment.kernels).toHaveProperty('build123d');
    expect(build123d?.seal).toBeTypeOf('function');
    expect(build123d).not.toHaveProperty('directory');
    expect(picogk).not.toHaveProperty('seal');
    expect(build123d?.launchSet?.([])).toEqual([
      'python/bin/python3',
      'tau-worker/worker.py',
      'tau-worker/analyzer.py',
      'tau-worker/glb.py',
      'tau-worker/native_materials.py',
      'tau-worker/mechanisms.py',
    ]);
    expect(picogk?.launchSet).toBeTypeOf('function');
  });

  it("should resolve each package's root when preparing needs payloads shipped inside it", () => {
    const plugins = nativePreparationPlugins({ directory: 'resolve' });

    expect(plugins.map(({ directory: root }) => root)).toEqual([
      expect.stringMatching(/[/\\]plugins[/\\]build123d$/u),
      expect.stringMatching(/[/\\]plugins[/\\]picogk$/u),
    ]);
  });

  it('should name what differs when a worker exits before its handshake, and the repair', async () => {
    const root = join(directory, 'closure');
    await mkdir(join(root, 'lib'), { recursive: true });
    const sha256 = createHash('sha256').update('bytes').digest('hex');
    await writeFile(join(root, 'lib', 'a.pyc'), 'bytes', { mode: 0o644 });
    await writeFile(
      join(root, 'receipt.json'),
      JSON.stringify({ files: [{ path: 'lib/a.pyc', byteLength: 5, sha256, mode: 0o644 }] }),
    );
    const signal = AbortSignal.timeout(10_000);
    const verify = verifyStoreClosure((files, closureRoot) =>
      files === undefined ? `Remove ${closureRoot} and prepare again.` : 'Run `tau prepare --verify` to repair it.',
    );

    await expect(verify(root, signal)).resolves.toBeUndefined();
    await writeFile(join(root, 'lib', 'a.pyc'), 'BYTES');
    await expect(verify(root, signal)).resolves.toEqual({
      files: ['lib/a.pyc'],
      remedy: 'Run `tau prepare --verify` to repair it.',
    });
    await rm(join(root, 'receipt.json'));
    await expect(verify(root, signal)).resolves.toEqual({
      files: ['receipt.json'],
      remedy: `Remove ${root} and prepare again.`,
    });
  });

  it('should report an unprepared Build123d model as unavailable, downloading nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const row = await nativeKernelFor({ extension: 'py', store, managed: readManagedPreparation({}) });

    expect(row).toMatchObject({
      kernel: 'build123d',
      package: '@taucad/build123d',
      extensions: ['py'],
      reason: 'not-prepared',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(storeEntries()).resolves.toEqual([]);
  });

  it('should report a model whose kernel declares no variant for the forced target as unsupported', async () => {
    const managed = readManagedPreparation({ TAU_PAYLOAD_TARGET: 'win32-x64' });

    const row = await nativeKernelFor({ extension: 'py', store, managed });

    expect(row).toMatchObject({ kernel: 'build123d', reason: 'unsupported-target', byteLength: 0 });
    expect(row).toHaveProperty('detail', expect.stringContaining('@taucad/build123d'));
  });

  it('should leave the store alone for an input no native kernel handles', async () => {
    await expect(
      nativeKernelFor({ extension: 'scad', store, managed: readManagedPreparation({}) }),
    ).resolves.toBeUndefined();
  });

  it('should compose every declared kernel as unavailable on a cold store, with the bytes preparing downloads', async () => {
    const managed = readManagedPreparation({ TAU_PAYLOAD_TARGET: 'linux-x64-glibc' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const [build123d] = nativePreparationPlugins();
    const variant = build123d?.deployment.dependencies['engine']?.find(
      ({ target }) => target.runtime === 'native' && target.os === 'linux' && target.arch === 'x64',
    );
    const expectedBytes = (variant?.payloads ?? []).reduce((sum, payload) => sum + payload.byteLength, 0);

    const composition = await composeNativeKernels({ store, managed });

    expect(expectedBytes).toBeGreaterThan(0);
    expect(composition.kernels).toEqual([]);
    expect(composition.closureRoots).toEqual([]);
    expect(composition.unavailable).toEqual([
      {
        kernel: 'build123d',
        package: '@taucad/build123d',
        extensions: ['py'],
        reason: 'not-prepared',
        byteLength: expectedBytes,
      },
      expect.objectContaining({ kernel: 'picogk', extensions: ['cs'], reason: 'unsupported-target', byteLength: 0 }),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(storeEntries()).resolves.toEqual([]);
  });

  it('should compose from the store by its real path when the store is reached through a link', async () => {
    /* As under macOS's `/tmp` (a link to `/private/tmp`), whose spelling a sandboxed worker cannot start through. */
    const realDirectory = join(directory, 'real');
    await mkdir(join(realDirectory, 'payloads'), { recursive: true });
    const linkedDirectory = join(directory, 'linked');
    await symlink(realDirectory, linkedDirectory);
    opened.stores.length = 0;

    await composeNativeKernels({ store: join(linkedDirectory, 'payloads'), managed: readManagedPreparation({}) });

    const realStore = await realpath(join(linkedDirectory, 'payloads'));
    expect(realStore).not.toBe(join(linkedDirectory, 'payloads'));
    expect(opened.stores.length).toBeGreaterThan(0);
    expect(new Set(opened.stores)).toEqual(new Set([realStore]));
  });

  it('should refuse to prepare an unknown kernel, naming the kernels that can be prepared', async () => {
    const preparation = openNativePreparation({
      store,
      managed: readManagedPreparation({}),
      fetch: async () => {
        throw new Error('no request expected');
      },
    });
    try {
      const refusal = preparation.prepare('nope', { signal: new AbortController().signal });

      await expect(refusal).rejects.toThrow(UnknownNativeKernelError);
      await expect(refusal).rejects.toMatchObject({
        code: 'UNKNOWN_KERNEL',
        known: ['build123d', 'picogk'],
        message: "No native kernel is called 'nope'. Kernels that can be prepared: build123d, picogk.",
      });
    } finally {
      await preparation.dispose();
    }
  });

  it('should dispose a preparation that never opened its host', async () => {
    const preparation = openNativePreparation({ store, managed: readManagedPreparation({}) });

    await expect(preparation.dispose()).resolves.toBeUndefined();
    expect(new UnknownNativeKernelError('nope', []).message).toBe(
      "No native kernel is called 'nope'. Kernels that can be prepared: none are installed.",
    );
  });
});

describe('composeNativePlugins', () => {
  const rows: readonly ComposedNativeKernel[] = nativeKernelAdopters.map((adopter) =>
    composedRow(
      adopter,
      adopter.package.slice('@taucad/'.length),
      fixtureClosure(adopter.package, `/store/${adopter.package}`),
    ),
  );

  it("should load each composed kernel's plugin, in order, with the host's bounds over its closure options", async () => {
    const plugins = await composeNativePlugins(rows, { requestTimeout: 120_000, maxArtifactBytes: 1024 });

    expect(plugins.flatMap(({ capabilities }) => capabilities.kernels.map(({ id }) => id))).toEqual([
      'build123d',
      'picogk',
    ]);
    expect(plugins.map(({ capabilities }) => capabilities.kernels[0]?.options)).toEqual([
      expect.objectContaining({ requestTimeout: 120_000, maxArtifactBytes: 1024, runtimePath: rows[0]?.closureRoot }),
      expect.objectContaining({ requestTimeout: 120_000, maxArtifactBytes: 1024, runtimePath: rows[1]?.closureRoot }),
    ]);
  });

  it('should load nothing for no rows and refuse a package outside the roster', async () => {
    await expect(composeNativePlugins([])).resolves.toEqual([]);
    // A row another process sent for a package this roster does not hold.
    const foreign = Object.assign(structuredClone(rows[0]!), { package: '@acme/other' });
    await expect(composeNativePlugins([foreign])).rejects.toThrow(
      "No native kernel package in the roster is called '@acme/other'.",
    );
  });
});

describe('nativeKernelIdsSupportedOn', () => {
  it('should name the kernels whose every dependency has a variant for the host', () => {
    const linux = {
      os: 'linux',
      arch: 'x64',
      libc: 'glibc',
      libcVersion: '2.39',
      translated: false,
      wasm: { threads: true },
    } as const;
    const mac = { os: 'darwin', arch: 'arm64', osVersion: '15.7', translated: false, wasm: { threads: true } } as const;
    const windows = { os: 'win32', arch: 'x64', translated: false, wasm: { threads: true } } as const;

    expect(nativeKernelIdsSupportedOn(linux)).toEqual(['build123d']);
    expect(nativeKernelIdsSupportedOn(mac)).toEqual(['build123d', 'picogk']);
    expect(nativeKernelIdsSupportedOn(windows)).toEqual([]);
  });
});
