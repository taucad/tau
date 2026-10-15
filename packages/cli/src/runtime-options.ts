import { createCliRuntime } from '#cli-runtime.js';
import { preparedBuild123d } from '#native-kernels.js';
import { loadTauPlugin, loadTauPluginConfig } from '#plugin-loader.js';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type { PicogkKernelOptions } from '@taucad/picogk';

export const loadCliRuntime = async (options: {
  readonly projectRoot: string;
  readonly plugin: unknown;
  readonly config?: string;
  readonly picogk?: PicogkKernelOptions;
  readonly zooProxyUrl?: string;
}): Promise<AnyRuntimeDefinition> => {
  const pluginSpecifiers = Array.isArray(options.plugin)
    ? options.plugin.filter((value): value is string => typeof value === 'string')
    : typeof options.plugin === 'string'
      ? [options.plugin]
      : [];
  const [explicitFactories, configuredPlugins, build123d] = await Promise.all([
    Promise.all(pluginSpecifiers.map(async (specifier) => loadTauPlugin(specifier, options.projectRoot))),
    options.config ? loadTauPluginConfig(options.config, options.projectRoot) : Promise.resolve([]),
    // A prepared closure in the payload store composes the Build123d kernel; only receipts are read.
    preparedBuild123d(),
  ]);
  return createCliRuntime({
    explicitFactories,
    configuredPlugins,
    ...(options.picogk ? { picogk: options.picogk } : {}),
    ...(build123d ? { build123d } : {}),
    ...(options.zooProxyUrl ? { zooProxyUrl: options.zooProxyUrl } : {}),
  });
};
