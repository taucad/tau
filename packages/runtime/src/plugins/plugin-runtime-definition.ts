import type { BundlerDefinition } from '#types/runtime-bundler.types.js';
import type { AnyKernelDefinition } from '#types/runtime-kernel.types.js';
import type { TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import type { z } from 'zod';
import type { KernelMiddleware } from '#middleware/runtime-middleware.js';

/**
 * Internal implementation slot carried by worker-owned plugin registrations.
 *
 * The slot is deliberately non-enumerable when attached by the factory helpers,
 * so public plugin objects remain plain metadata and do not expose executable
 * module-loading details.
 *
 * @internal
 */
export const runtimePluginDefinitionSymbol: unique symbol = Symbol.for('@taucad/runtime/plugin-definition');

export type RuntimePluginKind = 'kernel' | 'middleware' | 'bundler' | 'transcoder';

export type RuntimePluginDefinitionFor<Kind extends RuntimePluginKind> = Kind extends 'kernel'
  ? AnyKernelDefinition
  : Kind extends 'middleware'
    ? KernelMiddleware<z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>>
    : Kind extends 'bundler'
      ? BundlerDefinition
      : TranscoderDefinition;

export type RuntimePluginDefinitionLoader<Definition> = () => Definition | Promise<Definition>;

export type RuntimePluginDefinitionCarrier<Definition> = {
  readonly [runtimePluginDefinitionSymbol]?: RuntimePluginDefinitionLoader<Definition>;
};

export type RuntimePluginWithDefinition<
  Kind extends RuntimePluginKind,
  Definition extends RuntimePluginDefinitionFor<Kind> = RuntimePluginDefinitionFor<Kind>,
> = {
  readonly id: string;
} & RuntimePluginDefinitionCarrier<Definition>;

type PlainPluginObject = Partial<Record<PropertyKey, unknown>>;

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

export async function resolveRuntimePluginDefinition<
  Kind extends RuntimePluginKind,
  Definition extends RuntimePluginDefinitionFor<Kind>,
>(kind: Kind, plugin: RuntimePluginWithDefinition<Kind, Definition>): Promise<Definition> {
  const load = plugin[runtimePluginDefinitionSymbol];
  if (!load) {
    throw new Error(
      `Runtime plugin '${plugin.id}' cannot be used in defineRuntime(): missing worker-owned ${kind} implementation.`,
    );
  }
  return load();
}
