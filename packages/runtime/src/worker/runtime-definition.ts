import { ZodError } from 'zod';
import type { z } from 'zod';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import {
  expandedPluginCapabilities,
  isPluginFactory,
  isPluginInstance,
  runtimePluginAbiVersionOf,
} from '#plugins/plugin.js';
import { runtimePluginAbiVersion } from '#plugins/plugin-runtime-definition.js';
import type {
  AnyPluginInstance,
  ExpandPluginBundlers,
  ExpandPluginKernels,
  ExpandPluginMiddleware,
  ExpandPluginTranscoders,
  ExpandedPluginCapability,
} from '#plugins/plugin.js';

type MaybePromise<T> = T | Promise<T>;
type AnyKernelPlugin = KernelPlugin<Record<string, unknown>, unknown>;
type AnyTranscoderPlugin = TranscoderPlugin<Record<string, unknown>>;

type RuntimePluginOptions<
  Kernels extends readonly AnyKernelPlugin[] = readonly AnyKernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[] = readonly MiddlewarePlugin[],
  Bundlers extends readonly BundlerPlugin[] = readonly BundlerPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly AnyTranscoderPlugin[],
> = {
  readonly kernels: Kernels;
  readonly middleware: Middleware;
  readonly bundlers: Bundlers;
  readonly transcoders: Transcoders;
};

type AwaitedRuntimeOptions<Runtime> = Awaited<Runtime>;

type PublicKernelPlugin<Plugin> =
  Plugin extends KernelPlugin<
    infer FormatMap,
    infer RenderOptions,
    infer Id,
    infer RenderContent,
    infer ExportContent,
    infer Extensions
  >
    ? KernelPlugin<FormatMap, RenderOptions, Id, RenderContent, ExportContent, Extensions>
    : never;

type PublicMiddlewarePlugin<Plugin> =
  Plugin extends MiddlewarePlugin<infer Id, infer RenderContent, infer ExportContent>
    ? MiddlewarePlugin<Id, RenderContent, ExportContent>
    : never;

type PublicBundlerPlugin<Plugin> = Plugin extends BundlerPlugin<infer Id> ? BundlerPlugin<Id> : never;

type PublicTranscoderPlugin<Plugin> =
  Plugin extends TranscoderPlugin<infer EdgeMap, infer From, infer Id, infer Content, infer PinnedSourceOptions>
    ? TranscoderPlugin<EdgeMap, From, Id, Content, PinnedSourceOptions>
    : never;

type PublicKernelTuple<Plugins extends readonly AnyKernelPlugin[]> = {
  readonly [Index in keyof Plugins]: PublicKernelPlugin<Plugins[Index]>;
};

type PublicMiddlewareTuple<Plugins extends readonly MiddlewarePlugin[]> = {
  readonly [Index in keyof Plugins]: PublicMiddlewarePlugin<Plugins[Index]>;
};

type PublicBundlerTuple<Plugins extends readonly BundlerPlugin[]> = {
  readonly [Index in keyof Plugins]: PublicBundlerPlugin<Plugins[Index]>;
};

type PublicTranscoderTuple<Plugins extends readonly AnyTranscoderPlugin[]> = {
  readonly [Index in keyof Plugins]: PublicTranscoderPlugin<Plugins[Index]>;
};

type Concat<Left extends readonly unknown[], Right extends readonly unknown[]> = readonly [...Left, ...Right];

type RuntimeOptionsKernels<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<
    infer Kernels,
    readonly MiddlewarePlugin[],
    readonly BundlerPlugin[],
    readonly AnyTranscoderPlugin[],
    infer Plugins
  >
    ? PublicKernelTuple<Concat<ExpandPluginKernels<Plugins>, Kernels>>
    : readonly never[];

type RuntimeOptionsMiddleware<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<
    readonly AnyKernelPlugin[],
    infer Middleware,
    readonly BundlerPlugin[],
    readonly AnyTranscoderPlugin[],
    infer Plugins
  >
    ? PublicMiddlewareTuple<Concat<ExpandPluginMiddleware<Plugins>, Middleware>>
    : readonly never[];

type RuntimeOptionsBundlers<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<
    readonly AnyKernelPlugin[],
    readonly MiddlewarePlugin[],
    infer Bundlers,
    readonly AnyTranscoderPlugin[],
    infer Plugins
  >
    ? PublicBundlerTuple<Concat<ExpandPluginBundlers<Plugins>, Bundlers>>
    : readonly never[];

type RuntimeOptionsTranscoders<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<
    readonly AnyKernelPlugin[],
    readonly MiddlewarePlugin[],
    readonly BundlerPlugin[],
    infer Transcoders,
    infer Plugins
  >
    ? PublicTranscoderTuple<Concat<ExpandPluginTranscoders<Plugins>, Transcoders>>
    : readonly never[];

type ConfiguredRuntimeCreateResult<
  Kernels extends readonly AnyKernelPlugin[] = readonly AnyKernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[] = readonly MiddlewarePlugin[],
  Bundlers extends readonly BundlerPlugin[] = readonly BundlerPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly AnyTranscoderPlugin[],
  Plugins extends readonly AnyPluginInstance[] = readonly AnyPluginInstance[],
> = MaybePromise<RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders, Plugins>>;

/** @public */
export type RuntimeDefinition<
  Kernels extends readonly AnyKernelPlugin[] = readonly AnyKernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[] = readonly MiddlewarePlugin[],
  Bundlers extends readonly BundlerPlugin[] = readonly BundlerPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly AnyTranscoderPlugin[],
  ConfigSchema extends z.ZodType | undefined = undefined,
> = ConfigSchema extends z.ZodType
  ? ConfiguredRuntimeDefinition<RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders>, ConfigSchema>
  : RuntimePluginOptions<Kernels, Middleware, Bundlers, Transcoders>;

/** Runtime definition whose capabilities are derived from validated host configuration. @public */
export type ConfiguredRuntimeDefinition<
  Options extends ConfiguredRuntimeCreateResult,
  ConfigSchema extends z.ZodType,
> = {
  readonly configSchema: ConfigSchema;
  readonly createRuntime: (config: z.output<ConfigSchema>) => Options;
};

/** @public */
export type AnyRuntimeDefinition =
  | RuntimePluginOptions
  | ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, z.ZodType>;

/** @public */
export type RuntimeDefinitionOptions<
  Kernels extends readonly AnyKernelPlugin[] = readonly never[],
  Middleware extends readonly MiddlewarePlugin[] = readonly never[],
  Bundlers extends readonly BundlerPlugin[] = readonly never[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly never[],
  Plugins extends readonly AnyPluginInstance[] = readonly never[],
> = {
  readonly plugins?: Plugins;
  readonly kernels?: Kernels;
  readonly middleware?: Middleware;
  readonly bundlers?: Bundlers;
  readonly transcoders?: Transcoders;
};

type AnyRuntimeDefinitionOptions = RuntimeDefinitionOptions<
  readonly AnyKernelPlugin[],
  readonly MiddlewarePlugin[],
  readonly BundlerPlugin[],
  readonly AnyTranscoderPlugin[],
  readonly AnyPluginInstance[]
>;

/** @public */
export type RuntimeKernels<Runtime> =
  Runtime extends RuntimePluginOptions<infer Kernels>
    ? Kernels
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsKernels<Options>
      : readonly KernelPlugin[];

/** @public */
export type RuntimeMiddleware<Runtime> =
  Runtime extends RuntimePluginOptions<readonly AnyKernelPlugin[], infer Middleware>
    ? Middleware
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsMiddleware<Options>
      : readonly MiddlewarePlugin[];

/** @public */
export type RuntimeBundlers<Runtime> =
  Runtime extends RuntimePluginOptions<readonly AnyKernelPlugin[], readonly MiddlewarePlugin[], infer Bundlers>
    ? Bundlers
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsBundlers<Options>
      : readonly BundlerPlugin[];

/** @public */
export type RuntimeTranscoders<Runtime> =
  Runtime extends RuntimePluginOptions<
    readonly AnyKernelPlugin[],
    readonly MiddlewarePlugin[],
    readonly BundlerPlugin[],
    infer Transcoders
  >
    ? Transcoders
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsTranscoders<Options>
      : readonly TranscoderPlugin[];

/** @public */
export type RuntimeConfigInput<Runtime> =
  Runtime extends ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, infer ConfigSchema>
    ? z.input<ConfigSchema>
    : never;

/** @public */
export type RuntimeConfigOutput<Runtime> =
  Runtime extends ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, infer ConfigSchema>
    ? z.output<ConfigSchema>
    : never;

/** @public */
export type RuntimeConfigProvider<Runtime> =
  | RuntimeConfigInput<Runtime>
  | (() => RuntimeConfigInput<Runtime> | Promise<RuntimeConfigInput<Runtime>>);

/** @public */
export class RuntimeConfigError extends Error {
  public override readonly cause: unknown;

  public constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.cause = cause;
  }

  /** Stable machine-readable diagnostic code for invalid runtime configuration. */
  public get code(): 'RUNTIME_CONFIG_INVALID' {
    return 'RUNTIME_CONFIG_INVALID';
  }
}

/** @public */
export function isRuntimeConfigError(error: unknown): error is RuntimeConfigError {
  return error instanceof Error && error.name === 'RuntimeConfigError';
}

function formatZodPath(path: ReadonlyArray<string | number | symbol>): string {
  if (path.length === 0) {
    return '<root>';
  }

  return path.map(String).join('.');
}

function formatConfigError(error: unknown): string {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => `${formatZodPath(issue.path)}: ${issue.message}`).join('; ');
    return details ? `Invalid runtime config: ${details}` : 'Invalid runtime config';
  }

  if (error instanceof Error) {
    return `Invalid runtime config: ${error.message}`;
  }

  return 'Invalid runtime config';
}

function isConfiguredRuntimeDefinition(
  runtime: unknown,
): runtime is ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, z.ZodType> {
  return typeof runtime === 'object' && runtime !== null && 'configSchema' in runtime && 'createRuntime' in runtime;
}

/**
 * Runtime-definition shape guard shared by transports that accept a
 * worker-owned runtime value. Accepts both static and config-backed
 * definitions produced by {@link defineRuntime}.
 *
 * @param runtime - Candidate runtime definition.
 * @returns `true` when the value is a runtime definition.
 * @internal
 */
export function isRuntimeDefinition(runtime: unknown): runtime is AnyRuntimeDefinition {
  if (isConfiguredRuntimeDefinition(runtime)) {
    return true;
  }

  return (
    typeof runtime === 'object' &&
    runtime !== null &&
    'kernels' in runtime &&
    'middleware' in runtime &&
    'bundlers' in runtime &&
    'transcoders' in runtime
  );
}

type CapabilityWithId = { readonly id: string };

type CapabilityOrigin = {
  readonly packageName: string;
  readonly path: string;
};

type NormalizeCapabilityBucketOptions<Capability extends CapabilityWithId> = {
  readonly kind: ExpandedPluginCapability['kind'];
  readonly expanded: readonly ExpandedPluginCapability[];
  readonly direct: readonly Capability[];
};

const describeCapabilityOrigin = (origin: CapabilityOrigin): string => `${origin.packageName} (path "${origin.path}")`;

const normalizeCapabilityBucket = <Capability extends CapabilityWithId>(
  options: NormalizeCapabilityBucketOptions<Capability>,
): readonly Capability[] => {
  const capabilities: Capability[] = [];
  const origins = new Map<string, CapabilityOrigin>();
  const append = (capability: Capability, origin: CapabilityOrigin): void => {
    const firstOrigin = origins.get(capability.id);
    if (firstOrigin) {
      throw new Error(
        `Duplicate runtime ${options.kind} id "${capability.id}": first supplied by ${describeCapabilityOrigin(firstOrigin)}; second supplied by ${describeCapabilityOrigin(origin)}.`,
      );
    }
    origins.set(capability.id, origin);
    capabilities.push(capability);
  };

  for (const entry of options.expanded) {
    if (entry.kind === options.kind) {
      append(entry.capability as Capability, entry);
    }
  }
  for (const capability of options.direct) {
    append(capability, {
      packageName: '<host>',
      path: `direct.${options.kind}`,
    });
  }

  return capabilities;
};

function normalizeRuntimeDefinition(options: AnyRuntimeDefinitionOptions): RuntimePluginOptions {
  const expanded: ExpandedPluginCapability[] = [];
  for (const plugin of options.plugins ?? []) {
    if (isPluginFactory(plugin)) {
      throw new TypeError(
        `Tau plugin factory "${plugin.meta.name}" was passed to defineRuntime({ plugins }); invoke it as plugin().`,
      );
    }
    const abiVersion = runtimePluginAbiVersionOf(plugin);
    if (abiVersion !== undefined && abiVersion !== runtimePluginAbiVersion) {
      throw new TypeError(
        `Tau plugin ABI mismatch: received ${abiVersion}, but this runtime requires ${runtimePluginAbiVersion}. Align @taucad/runtime versions.`,
      );
    }
    if (!isPluginInstance(plugin)) {
      throw new TypeError(
        'defineRuntime({ plugins }) accepts invoked Tau plugin factories such as plugin(), not individual capabilities; put invoked capability factories in kernels, middleware, bundlers, or transcoders.',
      );
    }
    expanded.push(...expandedPluginCapabilities(plugin));
  }

  return {
    kernels: normalizeCapabilityBucket({ kind: 'kernels', expanded, direct: options.kernels ?? [] }),
    middleware: normalizeCapabilityBucket({ kind: 'middleware', expanded, direct: options.middleware ?? [] }),
    bundlers: normalizeCapabilityBucket({ kind: 'bundlers', expanded, direct: options.bundlers ?? [] }),
    transcoders: normalizeCapabilityBucket({ kind: 'transcoders', expanded, direct: options.transcoders ?? [] }),
  };
}

/** @public */
export async function resolveRuntimeDefinition(
  runtime: AnyRuntimeDefinition,
  rawConfig: unknown,
): Promise<RuntimePluginOptions> {
  if (!isConfiguredRuntimeDefinition(runtime)) {
    if (rawConfig !== undefined) {
      throw new RuntimeConfigError(
        'Runtime config was supplied, but this runtime does not define configSchema.',
        undefined,
      );
    }

    return normalizeRuntimeDefinition(runtime);
  }

  let parsedConfig: unknown;
  try {
    parsedConfig = await runtime.configSchema.parseAsync(rawConfig);
  } catch (error) {
    throw new RuntimeConfigError(formatConfigError(error), error);
  }

  const options = await runtime.createRuntime(parsedConfig);
  return normalizeRuntimeDefinition(options);
}

/**
 * Define the executable runtime owned by a worker or host process.
 *
 * Clients may import only `typeof runtime` for compile-time narrowing, but the
 * runtime value itself belongs in the worker/host entry that loads executable
 * kernels, middleware, bundlers, and transcoders.
 *
 * @param options - Worker-owned runtime composition.
 * @returns A typed runtime definition.
 * @public
 */
export function defineRuntime<
  const Kernels extends readonly AnyKernelPlugin[] = readonly never[],
  const Middleware extends readonly MiddlewarePlugin[] = readonly never[],
  const Bundlers extends readonly BundlerPlugin[] = readonly never[],
  const Transcoders extends readonly AnyTranscoderPlugin[] = readonly never[],
  const Plugins extends readonly AnyPluginInstance[] = readonly never[],
>(
  options: RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders, Plugins>,
): RuntimeDefinition<
  PublicKernelTuple<Concat<ExpandPluginKernels<Plugins>, Kernels>>,
  PublicMiddlewareTuple<Concat<ExpandPluginMiddleware<Plugins>, Middleware>>,
  PublicBundlerTuple<Concat<ExpandPluginBundlers<Plugins>, Bundlers>>,
  PublicTranscoderTuple<Concat<ExpandPluginTranscoders<Plugins>, Transcoders>>
>;

export function defineRuntime<
  const ConfigSchema extends z.ZodType,
  const Plugins extends readonly AnyPluginInstance[],
  const Kernels extends readonly AnyKernelPlugin[] = readonly never[],
  const Middleware extends readonly MiddlewarePlugin[] = readonly never[],
  const Bundlers extends readonly BundlerPlugin[] = readonly never[],
  const Transcoders extends readonly AnyTranscoderPlugin[] = readonly never[],
>(options: {
  readonly configSchema: ConfigSchema;
  readonly createRuntime: (config: z.output<ConfigSchema>) => MaybePromise<{
    readonly plugins: readonly [...Plugins];
    readonly kernels?: Kernels;
    readonly middleware?: Middleware;
    readonly bundlers?: Bundlers;
    readonly transcoders?: Transcoders;
  }>;
}): RuntimeDefinition<
  PublicKernelTuple<Concat<ExpandPluginKernels<Plugins>, Kernels>>,
  PublicMiddlewareTuple<Concat<ExpandPluginMiddleware<Plugins>, Middleware>>,
  PublicBundlerTuple<Concat<ExpandPluginBundlers<Plugins>, Bundlers>>,
  PublicTranscoderTuple<Concat<ExpandPluginTranscoders<Plugins>, Transcoders>>,
  ConfigSchema
>;

export function defineRuntime<
  const ConfigSchema extends z.ZodType,
  const Kernels extends readonly AnyKernelPlugin[] = readonly never[],
  const Middleware extends readonly MiddlewarePlugin[] = readonly never[],
  const Bundlers extends readonly BundlerPlugin[] = readonly never[],
  const Transcoders extends readonly AnyTranscoderPlugin[] = readonly never[],
>(options: {
  readonly configSchema: ConfigSchema;
  readonly createRuntime: (
    config: z.output<ConfigSchema>,
  ) => ConfiguredRuntimeCreateResult<Kernels, Middleware, Bundlers, Transcoders>;
}): RuntimeDefinition<
  PublicKernelTuple<Kernels>,
  PublicMiddlewareTuple<Middleware>,
  PublicBundlerTuple<Bundlers>,
  PublicTranscoderTuple<Transcoders>,
  ConfigSchema
>;

/** @public */
export function defineRuntime(
  options: AnyRuntimeDefinitionOptions | ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, z.ZodType>,
): AnyRuntimeDefinition {
  if (isConfiguredRuntimeDefinition(options)) {
    return options;
  }

  return normalizeRuntimeDefinition(options);
}
