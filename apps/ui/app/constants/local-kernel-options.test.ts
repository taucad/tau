import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import type { ComputeReuseMode } from '#lib/compute-reuse-preference.js';

const mocks = vi.hoisted(() => ({
  defaultBuild: vi.fn((_dependencies: unknown) => ({ preset: 'default' })),
  debugBuild: vi.fn((_dependencies: unknown) => ({ preset: 'debug' })),
}));

vi.mock('#constants/kernel-options.presets.js', () => ({
  defaultKernelOptions: async () => mocks.defaultBuild,
  debugKernelOptions: async () => mocks.debugBuild,
}));

/** The dependencies `connectKernelActor` hands the resolved factory. */
const dependencies = {
  fileSystem: fromMemoryFs(),
  // The binding the cad machine opened for this project, if any.
  compute: { mode: 'memory' },
} as const;

const resolveOptions = async (computeMode: ComputeReuseMode): Promise<unknown> => {
  const { localKernelOptions } = await import('#constants/local-kernel-options.js');
  const build = await localKernelOptions('project-1', undefined, computeMode)();
  return build(dependencies as unknown as Parameters<typeof build>[0]);
};

describe('localKernelOptions', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    mocks.defaultBuild.mockClear();
    mocks.debugBuild.mockClear();
    vi.resetModules();
  });

  // Charter D28 / W8.
  it('boots the production runtime by default', async () => {
    await expect(resolveOptions('off')).resolves.toEqual({ preset: 'default' });
    expect(mocks.debugBuild).not.toHaveBeenCalled();
  });

  it('boots the debug runtime only behind the developer flag', async () => {
    globalThis.localStorage.setItem('tau:flags', JSON.stringify({ tauDebug: true }));

    await expect(resolveOptions('off')).resolves.toEqual({ preset: 'debug' });
    expect(mocks.defaultBuild).not.toHaveBeenCalled();
  });

  // Charter D3 / W3: the preset carries no reuse default; a caller that asks
  // for bypass never reaches the compute binding the machine opened.
  it('bypasses the opened compute binding for a non-durable mode', async () => {
    await resolveOptions('off');

    expect(mocks.defaultBuild).toHaveBeenCalledWith({ ...dependencies, compute: { mode: 'off' } });
  });

  it('keeps the compute binding the caller opted into', async () => {
    await resolveOptions('durable');

    expect(mocks.defaultBuild).toHaveBeenCalledWith(dependencies);
  });
});
