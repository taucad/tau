import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { load } from '#lib/code-loading.js';

/**
 * Lazy-resolve default editor kernel options after the file manager is ready.
 * Keeps `kernel-worker.constants` (heavy runtime graph) out of the SSR eager set.
 */
export const defaultKernelOptions: LazyKernelOptionsFactory = async () => {
  const { createDefaultKernelOptions } = await load(async () =>
    import('#constants/kernel-worker.constants.js').then((loaded) => ({
      createDefaultKernelOptions: loaded.createDefaultKernelOptions,
    })),
  );
  const runtimeConfig = createUiRuntimeConfig(ENV);
  return (deps) => createDefaultKernelOptions({ ...deps, runtimeConfig });
};

/**
 * Lazy-resolve debug kernel options (enriched replicad stack traces).
 */
export const debugKernelOptions: LazyKernelOptionsFactory = async () => {
  const { createDebugKernelOptions } = await load(async () =>
    import('#constants/kernel-worker.constants.js').then((loaded) => ({
      createDebugKernelOptions: loaded.createDebugKernelOptions,
    })),
  );
  const runtimeConfig = createUiRuntimeConfig(ENV);
  return (deps) => createDebugKernelOptions({ ...deps, runtimeConfig });
};
