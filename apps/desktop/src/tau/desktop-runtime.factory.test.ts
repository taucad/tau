import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeDeploymentOf } from '@taucad/native-process-core/adopter';
import {
  bindNativeKernel,
  installNativeClosureResolver,
  nativeDeploymentsOf,
  UnpreparedKernelError,
} from '@taucad/native-process-core/store';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { assertKernelRosterCoverage } from '@taucad/runtime-testing/roster';
import { kernelConfigurations } from '@taucad/types/constants';

import { fixturePayloadStore, nativeKernelsFixture } from '#tau/native-kernels.fixture.js';
import { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';
import { desktopNativeDeployments } from '#tau/desktop-native-deployments.js';
import type { NativeKernelsFrame } from '#tau/native-kernels-frame.js';

// Main finds a PicoGK closure where its manifest declares one: Apple Silicon only.
const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';

const resolveDesktopRuntime = async (frame: NativeKernelsFrame = nativeKernelsFixture({ picogk: isAppleSilicon })) =>
  resolveRuntimeDefinition(createDesktopRuntime({ nativeKernels: async () => frame }), {
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  });

describe('desktop runtime kernels', () => {
  it('should cover the product catalog, native kernels included', async () => {
    assertKernelRosterCoverage({ runtime: await resolveDesktopRuntime(), catalog: kernelConfigurations });
  });

  it('should compose PicoVoxel after Manifold with its default wasm option', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const ids = kernels.map((kernel) => kernel.id);

    expect(ids.indexOf('picovoxel')).toBe(ids.indexOf('manifold') + 1);
    // Default 'auto': Node utility processes have shared WebAssembly memory, so the fast lane runs multi-threaded.
    expect(kernels.find((kernel) => kernel.id === 'picovoxel')).not.toHaveProperty('options.wasm');
  });

  it('should route a picovoxel-importing TypeScript file to PicoVoxel and C# to native PicoGK', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const picovoxelKernel = kernels.find((kernel) => kernel.id === 'picovoxel')!;
    const { detectImport } = picovoxelKernel;
    expect(detectImport).toBeDefined();
    const importMatcher = new RegExp(detectImport!.source, detectImport!.flags);

    expect(picovoxelKernel.extensions).toEqual(['ts', 'js']);
    expect(importMatcher.test("import type { Pico } from 'picovoxel';")).toBe(true);
    expect(importMatcher.test("import { makeBox } from 'replicad';")).toBe(false);
    // Native PicoGK is always listed and claims C# alone; where main found no closure it refuses when it initializes.
    expect(kernels.find((kernel) => kernel.id === 'picogk')?.extensions).toEqual(['cs']);
  });

  it('should compose SMLib after PicoVoxel and route only smlibwasm-importing files to it', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const ids = kernels.map((kernel) => kernel.id);
    const smlibKernel = kernels.find((kernel) => kernel.id === 'smlib')!;
    const importMatcher = new RegExp(smlibKernel.detectImport!.source, smlibKernel.detectImport!.flags);

    expect(ids.indexOf('smlib')).toBe(ids.indexOf('picovoxel') + 1);
    expect(smlibKernel.extensions).toEqual(['ts', 'js']);
    expect(importMatcher.test("import { Box } from '@classcad/smlibwasm';")).toBe(true);
    expect(importMatcher.test("import { makeBox } from 'replicad';")).toBe(false);
  });

  it('should list Build123d and PicoGK after Assimp and before Replicad, each bounded by the desktop policy', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const ids = kernels.map((kernel) => kernel.id);

    expect(ids.slice(ids.indexOf('build123d'), ids.indexOf('picogk') + 1)).toEqual(['build123d', 'picogk']);
    expect(ids.indexOf('replicad')).toBeGreaterThan(ids.indexOf('picogk'));
    /* Unbounded defaults let one script hold all memory for as long as it runs. */
    for (const id of ['build123d', 'picogk']) {
      const { options } = kernels.find((kernel) => kernel.id === id)!;
      expect(options).toMatchObject({ requestTimeout: 10 * 60_000, maxArtifactBytes: 1024 * 1024 * 1024 });
      expect(options).not.toHaveProperty('closure');
    }
  });

  it('should mirror every native deployment it lists in the packaging list, in list order', async () => {
    const listed = nativeDeploymentsOf(await resolveDesktopRuntime());

    expect(listed.map(({ deployment }) => deployment.package)).toEqual(
      desktopNativeDeployments.map((deployment) => deployment.package),
    );
  });

  it('should run Build123d from the sealed closure main names in the store', async () => {
    const frame = nativeKernelsFixture({ picogk: false });
    const { root } = frame.kernels[0]!.closure!;
    const { kernels } = await resolveDesktopRuntime(frame);
    const build123dKernel = kernels.find((kernel) => kernel.id === 'build123d')!;

    const bound = await bindNativeKernel({
      deployment: nativeDeploymentOf(build123dKernel)!,
      kernel: 'build123d',
      options: build123dKernel.options as { readonly requestTimeout: number },
    });

    expect(build123dKernel.extensions).toEqual(['py']);
    expect(bound.options).toMatchObject({
      pythonExecutable: `${root}/python/bin/python3`,
      pythonSha256: '1'.repeat(64),
      workerPath: `${root}/tau-worker/worker.py`,
      runtimePath: root,
      requestTimeout: 10 * 60_000,
    });
  });

  it('should refuse a native kernel without a closure with the reason main gives', async () => {
    const refusal = 'The @taucad/build123d closure in this app differs from its receipt (python/bin/python3).';
    const { kernels } = await resolveDesktopRuntime({
      type: 'tau:native-kernels',
      store: fixturePayloadStore,
      kernels: [{ kernel: 'build123d', package: '@taucad/build123d', extensions: ['py'], refusal }],
    });
    const build123dKernel = kernels.find((kernel) => kernel.id === 'build123d')!;
    const binding = bindNativeKernel({
      deployment: nativeDeploymentOf(build123dKernel)!,
      kernel: 'build123d',
      options: {},
    });

    await expect(binding).rejects.toBeInstanceOf(UnpreparedKernelError);
    await expect(binding).rejects.toMatchObject({
      issues: [{ code: 'KERNEL_NOT_PREPARED', message: refusal, details: { extension: '.py' } }],
    });
  });

  it('should route KCL to Zoo through the configured Tau proxy with the sign-in copy', async () => {
    const { kernels } = await resolveDesktopRuntime();
    const zooKernel = kernels.find((kernel) => kernel.id === 'zoo');

    expect(zooKernel?.extensions).toEqual(['kcl']);
    expect(zooKernel?.options).toMatchObject({
      baseUrl: 'ws://localhost:4001/v1/kernels/zoo',
      closeErrors: { 4401: 'Sign in to Tau to use the Zoo kernel.' },
    });
    // The credential rides the WebSocket upgrade, never kernel options (they feed cache keys and middleware).
    expect(zooKernel?.options).not.toHaveProperty('token');
  });

  it('should compose the bundler under the locked acquisition profile only when TAU_ACQUISITION says so', async () => {
    vi.stubEnv('TAU_ACQUISITION', '');
    const open = await resolveDesktopRuntime();
    vi.stubEnv('TAU_ACQUISITION', 'locked');
    const locked = await resolveDesktopRuntime();

    expect(open.bundlers.find(({ id }) => id === 'esbuild')).not.toHaveProperty('options.acquisition');
    expect(locked.bundlers.find(({ id }) => id === 'esbuild')?.options).toMatchObject({ acquisition: 'locked' });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  installNativeClosureResolver(undefined);
});
