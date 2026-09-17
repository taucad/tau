import { debugKernelOptions, defaultKernelOptions } from '#constants/kernel-options.presets.js';
import { isFeatureEnabled } from '#flags/feature-flags.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { ComputeReuseMode } from '#lib/compute-reuse-preference.js';

export const localKernelOptions =
  (_projectId: string, _nativeKernelId: string | undefined, computeMode: ComputeReuseMode): LazyKernelOptionsFactory =>
  async () => {
    // Shipped builds boot the production runtime (charter D28); the debug
    // runtime — replicad `withSourceMapping` plus `devtoolsTelemetry` — is a
    // developer surface like every other one behind `tauDebug`.
    const factory = await (isFeatureEnabled('tauDebug') ? debugKernelOptions : defaultKernelOptions)();
    return (deps) => factory({ ...deps, compute: computeMode === 'durable' ? deps.compute : { mode: computeMode } });
  };
