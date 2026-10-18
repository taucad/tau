/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are SCREAMING_SNAKE_CASE. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type * as PreparationNode from '@taucad/runtime/preparation/node';
import { readManagedPreparation } from '@taucad/runtime/preparation/node';
import type { ClosureLaunch } from '@taucad/runtime/preparation/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withNativeDeployment } from '#native-kernel-adopter.js';
import { deployments, engineNative, fixtureUrl, seal, voxelManifest, voxelNative } from '#store.fixture.js';
import {
  bindNativeKernel,
  defaultPayloadStore,
  inspectionResolver,
  inspectNativeKernels,
  installNativeClosureResolver,
  loadReportedDeployments,
  nativeDeploymentReportSchema,
  nativeDeploymentsOf,
  nativeInspectionSchema,
  nativeKernelIdsSupportedOn,
  openNativePreparation,
  preparableKernels,
  preparationPluginsOf,
  reportNativeDeployments,
  storeClosureResolver,
  UnknownNativeKernelError,
  UnpreparedKernelError,
  verifyStoreClosure,
} from '#store.js';
import type { NativeClosureResolver } from '#store.js';

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

const kernelOf = (id: string, extensions: readonly string[]) =>
  defineKernel({
    id,
    extensions,
    name: id,
    version: '1',
    views: {},
    exports: {},
    async initialize() {
      return undefined;
    },
    async resolve() {
      return { resolved: [], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({ parameters: { schema: {}, defaults: {} } });
    },
    async evaluate() {
      return { handle: undefined };
    },
  });

const closureOf = (root: string): ClosureLaunch => ({
  package: '@acme/engine',
  dependency: 'runtime',
  root,
  closureIntegrity: `sha256-${'A'.repeat(43)}=`,
  files: [{ path: 'bin/worker', byteLength: 1, sha256: '0'.repeat(64), mode: 0o755 }],
});

describe('native deployments of a resolved runtime', () => {
  const runtime = {
    kernels: [
      kernelOf('replicad', ['ts'])(),
      withNativeDeployment(kernelOf('voxel', ['vox']), voxelNative)(),
      withNativeDeployment(kernelOf('engine', ['eng']), engineNative)(),
    ],
  };

  it('should list each native package once, in list order, with the kernels the runtime routes', () => {
    expect(nativeDeploymentsOf(runtime)).toEqual([
      { deployment: voxelNative, kernels: [{ id: 'voxel', extensions: ['vox'], requires: ['runtime'] }] },
      { deployment: engineNative, kernels: [{ id: 'engine', extensions: ['eng'], requires: ['runtime'] }] },
    ]);
    expect(nativeDeploymentsOf({ kernels: [kernelOf('replicad', ['ts'])()] })).toEqual([]);
  });

  it('should report the deployments without kernel code, and load them back by entry', async () => {
    const report = reportNativeDeployments(runtime);

    expect(nativeDeploymentReportSchema.parse(structuredClone(report))).toEqual([
      {
        package: '@acme/voxel',
        entry: fixtureUrl,
        packageRoot: 'file:///packages/voxel/',
        manifest: voxelManifest,
        kernels: ['voxel'],
      },
      expect.objectContaining({ package: '@acme/engine', kernels: ['engine'] }),
    ]);
    const loaded = await loadReportedDeployments(report);
    expect(loaded.map(({ package: name }) => name)).toEqual(['@acme/voxel', '@acme/engine']);
    expect(loaded[1]?.seal).toBe(seal);
  });

  it('should refuse a report whose module exports no deployment of its package', async () => {
    const [row] = reportNativeDeployments(runtime);

    await expect(loadReportedDeployments([{ ...row!, package: '@acme/other' }])).rejects.toThrow(
      new TypeError(`${fixtureUrl} exports no native kernel deployment of @acme/other.`),
    );
  });
});

describe('native kernels from the payload store', () => {
  let directory: string;
  let store: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-native-store-'));
    store = join(directory, 'payloads');
  });

  afterEach(async () => {
    installNativeClosureResolver(undefined);
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  const storeEntries = async (): Promise<string[]> => {
    const entries = await readdir(directory, { recursive: true });
    return entries.filter((entry) => entry.includes('closures') || entry.includes('blobs'));
  };

  it('should give each deployment its manifest, root, seal step and launch set, in order', () => {
    const [engine, voxel] = preparationPluginsOf(deployments);

    expect([engine?.package, voxel?.package]).toEqual(['@acme/engine', '@acme/voxel']);
    expect(engine?.deployment.kernels).toEqual({ engine: { requires: ['runtime'], extensions: ['eng'] } });
    expect(engine?.directory).toBe(join('/', 'packages', 'engine'));
    expect(engine?.seal).toBe(seal);
    expect(voxel).not.toHaveProperty('seal');
    expect(engine?.launchSet?.([])).toEqual(['bin/worker']);
    expect(preparableKernels(deployments)).toEqual([
      { kernel: 'engine', extensions: ['eng'] },
      { kernel: 'voxel', extensions: ['vox'] },
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

  it('should inspect every declared kernel on a cold store, with the bytes preparing downloads, downloading nothing', async () => {
    const managed = readManagedPreparation({ TAU_PAYLOAD_TARGET: 'linux-x64-glibc' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const inspection = await inspectNativeKernels({ deployments, store, managed });

    expect(nativeInspectionSchema.parse(structuredClone(inspection))).toMatchObject([
      {
        package: '@acme/engine',
        kernel: 'engine',
        extensions: ['eng'],
        answer: { status: 'unavailable', reason: 'not-prepared', byteLength: 3000 },
      },
      {
        package: '@acme/voxel',
        kernel: 'voxel',
        extensions: ['vox'],
        answer: { status: 'unavailable', reason: 'unsupported-target', byteLength: 0 },
      },
    ]);
    expect(inspection[1]?.answer).toHaveProperty('detail', expect.stringContaining('@acme/voxel'));
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(storeEntries()).resolves.toEqual([]);
  });

  it('should read the store by its real path when the store is reached through a link', async () => {
    /* As under macOS's `/tmp` (a link to `/private/tmp`), whose spelling a sandboxed worker cannot start through. */
    const realDirectory = join(directory, 'real');
    await mkdir(join(realDirectory, 'payloads'), { recursive: true });
    const linkedDirectory = join(directory, 'linked');
    await symlink(realDirectory, linkedDirectory);
    const linked = join(linkedDirectory, 'payloads');
    opened.stores.length = 0;

    await inspectNativeKernels({ deployments, store: linked, managed: readManagedPreparation({}) });
    await storeClosureResolver({ store: linked, managed: readManagedPreparation({}) })({
      package: '@acme/engine',
      kernel: 'engine',
      dependencies: ['runtime'],
      deployment: engineNative,
    });

    const real = await realpath(linked);
    expect(real).not.toBe(linked);
    expect(opened.stores.length).toBeGreaterThan(1);
    expect(new Set(opened.stores)).toEqual(new Set([real]));
  });

  it('should refuse to bind an unprepared kernel with KERNEL_NOT_PREPARED naming the call that prepares it', async () => {
    vi.stubEnv('TAU_CONFIG_DIR', directory);
    vi.stubEnv('TAU_PAYLOAD_TARGET', 'linux-x64-glibc');

    const binding = bindNativeKernel({ deployment: engineNative, kernel: 'engine', options: { requestTimeout: 0 } });

    await expect(binding).rejects.toThrow(UnpreparedKernelError);
    await expect(binding).rejects.toMatchObject({
      issues: [
        {
          code: 'KERNEL_NOT_PREPARED',
          type: 'kernel',
          severity: 'error',
          message:
            'engine handles ".eng" but its runtime (0 MB) is not prepared on this machine. Call prepare_kernel with { "kernel": "engine" } (or run `tau prepare engine`), then evaluate again.',
          details: {
            kernel: 'engine',
            package: '@acme/engine',
            extension: '.eng',
            byteLength: 3000,
            prepare: { tool: 'prepare_kernel', input: { kernel: 'engine' } },
          },
        },
      ],
    });
    await expect(storeEntries()).resolves.toEqual([]);
  });

  it('should refuse a kernel with no runtime for the host with KERNEL_CAPABILITY_MISSING, or a host wording', async () => {
    installNativeClosureResolver(
      inspectionResolver([
        {
          package: '@acme/voxel',
          kernel: 'voxel',
          extensions: ['vox'],
          answer: { status: 'unavailable', reason: 'unsupported-target', byteLength: 0, detail: 'macOS only.' },
        },
        {
          package: '@acme/engine',
          kernel: 'engine',
          extensions: ['eng'],
          answer: { status: 'unavailable', reason: 'not-prepared', byteLength: 0, refusal: 'Open Tau to prepare.' },
        },
      ]),
    );

    await expect(bindNativeKernel({ deployment: voxelNative, kernel: 'voxel', options: {} })).rejects.toMatchObject({
      issues: [
        {
          code: 'KERNEL_CAPABILITY_MISSING',
          message: 'voxel handles ".vox" but cannot run on this machine. macOS only.',
          details: { kernel: 'voxel', package: '@acme/voxel', extension: '.vox', reason: 'unsupported-target' },
        },
      ],
    });
    await expect(bindNativeKernel({ deployment: engineNative, kernel: 'engine', options: {} })).rejects.toMatchObject({
      issues: [{ code: 'KERNEL_NOT_PREPARED', message: 'Open Tau to prepare.' }],
    });
  });

  it("should bind to the installed resolver's sealed closure with the host's bounds", async () => {
    const resolver = vi.fn<NativeClosureResolver>(async () => ({
      status: 'ready',
      closures: { runtime: closureOf('/store/closures/sha256/abc') },
    }));
    installNativeClosureResolver(resolver);

    const bound = await bindNativeKernel({
      deployment: engineNative,
      kernel: 'engine',
      options: { requestTimeout: 1000, maxArtifactBytes: 64 },
    });

    expect(bound).toEqual({
      options: {
        executable: '/store/closures/sha256/abc/bin/worker',
        runtimePath: '/store/closures/sha256/abc',
        requestTimeout: 1000,
        maxArtifactBytes: 64,
      },
      closureRoot: '/store/closures/sha256/abc',
    });
    expect(resolver).toHaveBeenCalledWith({
      package: '@acme/engine',
      kernel: 'engine',
      dependencies: ['runtime'],
      deployment: engineNative,
    });
  });

  it('should bind an explicit closure without asking any resolver', async () => {
    const resolver = vi.fn<NativeClosureResolver>();
    installNativeClosureResolver(resolver);

    const bound = await bindNativeKernel({
      deployment: engineNative,
      kernel: 'engine',
      options: { closure: { executable: '/tree/bin/worker' }, requestTimeout: 5 },
    });

    expect(bound).toEqual({ options: { executable: '/tree/bin/worker', requestTimeout: 5 } });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('should refuse to prepare an unknown kernel, naming the kernels that can be prepared', async () => {
    const preparation = openNativePreparation({
      deployments,
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
        known: ['engine', 'voxel'],
        message: "No native kernel is called 'nope'. Kernels that can be prepared: engine, voxel.",
      });
    } finally {
      await preparation.dispose();
    }
  });

  it('should dispose a preparation that never opened its host', async () => {
    const preparation = openNativePreparation({ deployments: [], store, managed: readManagedPreparation({}) });

    await expect(preparation.dispose()).resolves.toBeUndefined();
    expect(new UnknownNativeKernelError('nope', []).message).toBe(
      "No native kernel is called 'nope'. Kernels that can be prepared: none are installed.",
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

    expect(nativeKernelIdsSupportedOn(deployments, linux)).toEqual(['engine']);
    expect(nativeKernelIdsSupportedOn(deployments, mac)).toEqual(['engine', 'voxel']);
    expect(nativeKernelIdsSupportedOn(deployments, windows)).toEqual([]);
  });
});

describe('defaultPayloadStore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should put the store under TAU_CONFIG_DIR when it is set, and under the data root otherwise', () => {
    vi.stubEnv('TAU_CONFIG_DIR', '/config/tau');

    expect(defaultPayloadStore()).toBe(join('/config/tau', 'payloads'));

    vi.stubEnv('TAU_CONFIG_DIR', '');
    vi.stubEnv('XDG_DATA_HOME', '/data');
    vi.stubEnv('LOCALAPPDATA', String.raw`C:\Local`);

    expect(defaultPayloadStore()).toMatch(/[/\\]tau[/\\]payloads$/);
  });
});
