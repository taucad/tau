import { describe, expect, it } from 'vitest';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';

import { nativeKernelsFixture } from '#tau/native-kernels.fixture.js';
import { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';
import type { NativeKernelsFrame } from '#tau/native-kernels-frame.js';

// Main composes PicoGK where its manifest declares a closure: Apple Silicon only.
const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';

const resolveDesktopRuntime = async (frame: NativeKernelsFrame = nativeKernelsFixture({ picogk: isAppleSilicon })) =>
  resolveRuntimeDefinition(createDesktopRuntime({ nativeKernels: async () => frame }), {
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  });

describe('desktop runtime kernels', () => {
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
    // Native PicoGK is composed where main found its closure (Apple Silicon only) and claims C# alone.
    const picogkKernel = kernels.find((kernel) => kernel.id === 'picogk');
    if (isAppleSilicon) {
      expect(picogkKernel?.extensions).toEqual(['cs']);
    } else {
      expect(picogkKernel).toBeUndefined();
    }
  });

  it('should run Build123d from the sealed closure main names in the store', async () => {
    const frame = nativeKernelsFixture({ picogk: false });
    const { root } = frame.kernels[0]!.closure!;
    const { kernels } = await resolveDesktopRuntime(frame);
    const build123dKernel = kernels.find((kernel) => kernel.id === 'build123d');

    expect(build123dKernel?.extensions).toEqual(['py']);
    expect(build123dKernel?.options).toMatchObject({
      pythonExecutable: `${root}/python/bin/python3`,
      pythonSha256: '1'.repeat(64),
      workerPath: `${root}/tau-worker/worker.py`,
      runtimePath: root,
    });
  });

  it('should answer a native kernel without a closure with the refusal main gives', async () => {
    const refusal = 'The @taucad/build123d closure in this app differs from its receipt (python/bin/python3).';
    const { kernels } = await resolveDesktopRuntime({
      type: 'tau:native-kernels',
      kernels: [{ kernel: 'build123d', package: '@taucad/build123d', extensions: ['py'], refusal }],
    });
    const standIn = kernels.find((kernel) => kernel.id === 'build123d');

    expect(standIn?.extensions).toEqual(['py']);
    expect(standIn).not.toHaveProperty('options.pythonExecutable');
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
});
