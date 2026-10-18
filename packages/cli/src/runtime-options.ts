import { createCliRuntime } from '#cli-runtime.js';
import { loadTauPlugin, loadTauPluginConfig } from '#plugin-loader.js';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type { NativeKernelComposition } from '@taucad/native-kernels';
import { acquisitionOf } from '#acquisition.js';
import type { Acquisition } from '#acquisition.js';

export const loadCliRuntime = async (options: {
  readonly projectRoot: string;
  readonly plugin: unknown;
  readonly config?: string;
  /** The native kernels the parent composed from the payload store. */
  readonly native?: NativeKernelComposition;
  readonly zooProxyUrl?: string;
  /** Default `TAU_ACQUISITION` from this process's environment. */
  readonly acquisition?: Acquisition;
}): Promise<AnyRuntimeDefinition> => {
  const pluginSpecifiers = Array.isArray(options.plugin)
    ? options.plugin.filter((value): value is string => typeof value === 'string')
    : typeof options.plugin === 'string'
      ? [options.plugin]
      : [];
  const [explicitFactories, configuredPlugins] = await Promise.all([
    Promise.all(pluginSpecifiers.map(async (specifier) => loadTauPlugin(specifier, options.projectRoot))),
    options.config ? loadTauPluginConfig(options.config, options.projectRoot) : Promise.resolve([]),
  ]);
  return createCliRuntime({
    explicitFactories,
    configuredPlugins,
    ...(options.native ? { native: options.native } : {}),
    ...(options.zooProxyUrl ? { zooProxyUrl: options.zooProxyUrl } : {}),
    acquisition: options.acquisition ?? acquisitionOf(process.env['TAU_ACQUISITION']),
  });
};
