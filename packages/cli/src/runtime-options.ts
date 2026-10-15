import { createCliRuntime } from '#cli-runtime.js';
import { loadTauPlugin, loadTauPluginConfig } from '#plugin-loader.js';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type { Build123dClosureOptions } from '@taucad/build123d';
import type { PicogkKernelOptions } from '@taucad/picogk';
import type { UnavailableNativeKernel } from '#unprepared-kernels.js';

export const loadCliRuntime = async (options: {
  readonly projectRoot: string;
  readonly plugin: unknown;
  readonly config?: string;
  readonly picogk?: PicogkKernelOptions;
  readonly build123d?: Build123dClosureOptions;
  readonly unavailableKernels?: readonly UnavailableNativeKernel[];
  readonly zooProxyUrl?: string;
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
    ...(options.picogk ? { picogk: options.picogk } : {}),
    ...(options.build123d ? { build123d: options.build123d } : {}),
    ...(options.unavailableKernels ? { unavailableKernels: options.unavailableKernels } : {}),
    ...(options.zooProxyUrl ? { zooProxyUrl: options.zooProxyUrl } : {}),
  });
};
