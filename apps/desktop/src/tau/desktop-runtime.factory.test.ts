import { describe, expect, it, vi } from 'vitest';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';

import { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';

// The prepared Python and .NET payloads are build outputs; kernel composition does not read them.
vi.mock('#tau/build123d-resources.js', () => ({ build123dKernelOptions: () => ({}) }));
vi.mock('#tau/picogk-resources.js', () => ({ picogkKernelOptions: () => ({}) }));

const resolveDesktopRuntime = async () =>
  resolveRuntimeDefinition(createDesktopRuntime(), {
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

    expect(picovoxelKernel.extensions).toEqual(['ts', 'js']);
    expect(detectImport?.test("import type { Pico } from 'picovoxel';")).toBe(true);
    expect(detectImport?.test("import { makeBox } from 'replicad';")).toBe(false);
    // Native PicoGK is composed on Apple Silicon only and claims C# alone.
    const picogkKernel = kernels.find((kernel) => kernel.id === 'picogk');
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(picogkKernel?.extensions).toEqual(['cs']);
    } else {
      expect(picogkKernel).toBeUndefined();
    }
  });
});
