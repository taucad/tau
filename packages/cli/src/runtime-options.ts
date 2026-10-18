import { createCliPlugins, createCliRuntime } from '#cli-runtime.js';
import type { CliRuntimeOptions } from '#cli-runtime.js';
import { loadTauPlugin, loadTauPluginConfig } from '#plugin-loader.js';
import type { PluginInstance } from '@taucad/runtime/plugin';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { acquisitionOf } from '#acquisition.js';
import type { Acquisition } from '#acquisition.js';

/** What the CLI runtime is built from: the invoking project, `--plugin`, `--config` and the host's settings. */
export type CliRuntimeInput = {
  readonly projectRoot: string;
  readonly plugin: unknown;
  readonly config?: string;
  readonly zooProxyUrl?: string;
  /** Default `TAU_ACQUISITION` from this process's environment. */
  readonly acquisition?: Acquisition;
};

const cliRuntimeOptions = async (options: CliRuntimeInput): Promise<CliRuntimeOptions> => {
  const pluginSpecifiers = Array.isArray(options.plugin)
    ? options.plugin.filter((value): value is string => typeof value === 'string')
    : typeof options.plugin === 'string'
      ? [options.plugin]
      : [];
  const [explicitFactories, configuredPlugins] = await Promise.all([
    Promise.all(pluginSpecifiers.map(async (specifier) => loadTauPlugin(specifier, options.projectRoot))),
    options.config ? loadTauPluginConfig(options.config, options.projectRoot) : Promise.resolve([]),
  ]);
  return {
    explicitFactories,
    configuredPlugins,
    ...(options.zooProxyUrl ? { zooProxyUrl: options.zooProxyUrl } : {}),
    acquisition: options.acquisition ?? acquisitionOf(process.env['TAU_ACQUISITION']),
  };
};

/**
 * Load the CLI runtime's plugins from the invoking project.
 * @param options - The project, `--plugin`, `--config` and the host's settings.
 * @returns The invoked plugins, in kernel-selection precedence.
 */
export const loadCliPlugins = async (options: CliRuntimeInput): Promise<readonly PluginInstance[]> =>
  createCliPlugins(await cliRuntimeOptions(options));

/**
 * Load the CLI runtime from the invoking project.
 * @param options - The project, `--plugin`, `--config` and the host's settings.
 * @returns The runtime definition.
 */
export const loadCliRuntime = async (options: CliRuntimeInput): Promise<AnyRuntimeDefinition> =>
  createCliRuntime(await cliRuntimeOptions(options));
