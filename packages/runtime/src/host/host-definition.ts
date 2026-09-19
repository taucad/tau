import { defineRuntime as defineCadRuntime } from '#worker/runtime-definition.js';
import type { RuntimeDefinition } from '#worker/runtime-definition.js';
import {
  expandedPluginCapabilities,
  isPluginFactory,
  isPluginInstance,
  runtimePluginAbiVersionOf,
} from '#plugins/plugin.js';
import type {
  AnyPluginInstance,
  ExpandPluginBundlers,
  ExpandPluginJobs,
  ExpandPluginKernels,
  ExpandPluginMachines,
  ExpandPluginMiddleware,
  ExpandPluginTranscoders,
  PluginCapabilities,
} from '#plugins/plugin.js';
import { runtimePluginAbiVersion } from '#plugins/plugin-runtime-definition.js';

/** Invoked toolkits selected by the executable host, never by a remote client. @public */
export type RuntimeHostDefinitionInput<Plugins extends readonly AnyPluginInstance[] = readonly AnyPluginInstance[]> =
  Readonly<{ plugins: Plugins }>;

/** Independently executable service registrations and the four-role CAD subset. @public */
export type RuntimeHostDefinition<Plugins extends readonly AnyPluginInstance[] = readonly AnyPluginInstance[]> =
  Readonly<{
    cad: RuntimeDefinition<
      ExpandPluginKernels<Plugins>,
      ExpandPluginMiddleware<Plugins>,
      ExpandPluginBundlers<Plugins>,
      ExpandPluginTranscoders<Plugins>
    >;
    jobs: ExpandPluginJobs<Plugins>;
    machines: ExpandPluginMachines<Plugins>;
  }>;

/**
 * Compose toolkit capabilities without starting a host, job, or device connection.
 *
 * Boot configuration is resolved by the executable host before composition.
 * The CAD executor receives only its four role buckets; jobs and machines remain
 * owned by the serving host even when there are no CAD kernels.
 *
 * @param input - Invoked, configured toolkits selected by the host.
 * @returns Frozen registrations preserving each toolkit's exact selected types.
 * @public
 */
export function defineRuntime<const Plugins extends readonly AnyPluginInstance[]>(
  input: RuntimeHostDefinitionInput<Plugins>,
): RuntimeHostDefinition<Plugins>;
/**
 * Collect validated toolkits into their service-owned buckets.
 * @param input - Invoked host toolkits.
 * @returns Frozen host registrations.
 * @public
 */
export function defineRuntime(input: RuntimeHostDefinitionInput): RuntimeHostDefinition {
  const capabilities: { -readonly [Kind in keyof PluginCapabilities]: Array<PluginCapabilities[Kind][number]> } = {
    kernels: [],
    middleware: [],
    bundlers: [],
    transcoders: [],
    jobs: [],
    machines: [],
  };
  const origins = new Map<string, string>();
  for (const plugin of input.plugins) {
    if (isPluginFactory(plugin)) {
      throw new TypeError('Host defineRuntime requires invoked toolkits: call plugin() before composing it.');
    }
    if (!isPluginInstance(plugin)) {
      throw new TypeError(
        `Invalid host toolkit: expected ABI ${runtimePluginAbiVersion}, received ${runtimePluginAbiVersionOf(plugin) ?? 'unbranded'}.`,
      );
    }
    for (const entry of expandedPluginCapabilities(plugin)) {
      const key = `${entry.kind}:${entry.capability.id}`;
      const origin = `${entry.packageName} (path "${entry.path}")`;
      const previous = origins.get(key);
      if (previous !== undefined) {
        throw new TypeError(
          `Duplicate host capability ${key}: first supplied by ${previous}; second supplied by ${origin}.`,
        );
      }
      origins.set(key, origin);
      switch (entry.kind) {
        case 'kernels': {
          capabilities.kernels.push(entry.capability);
          break;
        }
        case 'middleware': {
          capabilities.middleware.push(entry.capability);
          break;
        }
        case 'bundlers': {
          capabilities.bundlers.push(entry.capability);
          break;
        }
        case 'transcoders': {
          capabilities.transcoders.push(entry.capability);
          break;
        }
        case 'jobs': {
          capabilities.jobs.push(entry.capability);
          break;
        }
        case 'machines': {
          capabilities.machines.push(entry.capability);
          break;
        }
      }
    }
  }
  const { jobs, machines, ...cad } = capabilities;
  const definition = defineCadRuntime(cad);
  for (const bucket of Object.values(definition)) {
    Object.freeze(bucket);
  }
  return Object.freeze({
    cad: Object.freeze(definition),
    jobs: Object.freeze(jobs),
    machines: Object.freeze(machines),
  });
}
