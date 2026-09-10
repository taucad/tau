import { debugKernelOptions } from '#constants/kernel-options.presets.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { ComputeReuseMode } from '#lib/compute-reuse-preference.js';

export const localKernelOptions =
  (_projectId: string, _nativeKernelId?: string, computeMode: ComputeReuseMode = 'durable'): LazyKernelOptionsFactory =>
  async () => {
    const factory = await debugKernelOptions();
    return (deps) => factory({ ...deps, compute: computeMode === 'durable' ? deps.compute : { mode: computeMode } });
  };
