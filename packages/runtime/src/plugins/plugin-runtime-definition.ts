import type { RuntimePluginKind } from '#plugins/plugin-types.js';

/**
 * Same-realm plugin ABI shared by duplicate copies of `@taucad/runtime`.
 *
 * These registry keys and every shape reachable through them are frozen public
 * contracts. Bump this integer whenever any attached shape changes.
 *
 * @public
 */
export const runtimePluginAbiVersion = 1;
export const runtimePluginDefinitionSymbol: unique symbol = Symbol.for('@taucad/runtime/plugin-definition');
export const runtimePluginFactoryAcceptsOptionsSymbol: unique symbol = Symbol.for(
  '@taucad/runtime/plugin-factory-accepts-options',
);
export const pluginInstanceSymbol: unique symbol = Symbol.for('@taucad/runtime/plugin-instance');
export const expandedPluginCapabilitiesSymbol: unique symbol = Symbol.for('@taucad/runtime/plugin-capabilities');
export const pluginFactorySymbol: unique symbol = Symbol.for('@taucad/runtime/plugin-factory');

/** Deferred loader that produces a plugin's worker-owned implementation on first use. */
export type RuntimePluginDefinitionLoader<Definition> = () => Definition | Promise<Definition>;

/**
 * Shape of a plugin object that may carry a worker-owned implementation behind the internal symbol slot.
 *
 * @public
 */
export type RuntimePluginDefinitionCarrier<Definition> = {
  readonly [runtimePluginDefinitionSymbol]?: RuntimePluginDefinitionLoader<Definition>;
};

/** Mark whether a first-party capability factory accepts an options object. @internal */
export const attachRuntimePluginFactoryOptions = <Factory extends (...args: never[]) => unknown>(
  factory: Factory,
  acceptsOptions: boolean,
): Factory => {
  Object.defineProperty(factory, runtimePluginFactoryAcceptsOptionsSymbol, {
    value: acceptsOptions,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return factory;
};

/** Read the first-party factory option marker; custom factories return `undefined`. @internal */
export const runtimePluginFactoryAcceptsOptions = (factory: (...args: never[]) => unknown): boolean | undefined => {
  if (!(runtimePluginFactoryAcceptsOptionsSymbol in factory)) {
    return undefined;
  }
  const value = factory[runtimePluginFactoryAcceptsOptionsSymbol];
  return typeof value === 'boolean' ? value : undefined;
};

/** Identified plugin object that may carry a worker-owned implementation. */
export type RuntimePluginWithDefinition<Definition> = {
  readonly id: string;
} & RuntimePluginDefinitionCarrier<Definition>;

type PlainPluginObject = Partial<Record<PropertyKey, unknown>>;

/**
 * Attach a worker-owned implementation loader to a plugin object as a non-enumerable slot.
 *
 * @param plugin - Plain plugin metadata object to annotate.
 * @param load - Loader that resolves the worker-owned implementation.
 * @returns The same object, typed as carrying the definition slot.
 */
export function attachRuntimePluginDefinition<Plugin extends PlainPluginObject, Definition>(
  plugin: Plugin,
  load: RuntimePluginDefinitionLoader<Definition>,
): Plugin & RuntimePluginDefinitionCarrier<Definition> {
  Object.defineProperty(plugin, runtimePluginDefinitionSymbol, {
    value: load,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return plugin as Plugin & RuntimePluginDefinitionCarrier<Definition>;
}

/** @public */
export async function resolveRuntimePluginDefinition<Definition>(
  kind: RuntimePluginKind,
  plugin: RuntimePluginWithDefinition<Definition>,
): Promise<Definition> {
  const load = plugin[runtimePluginDefinitionSymbol];
  if (!load) {
    throw new Error(
      `Runtime plugin '${plugin.id}' cannot be used in defineRuntime(): missing worker-owned ${kind} implementation.`,
    );
  }
  return load();
}
