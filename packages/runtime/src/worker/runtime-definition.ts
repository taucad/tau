import { ZodError } from 'zod';
import type { z } from 'zod';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';

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
  readonly renderTimeout?: number;
};

type AwaitedRuntimeOptions<Runtime> = Awaited<Runtime>;

type PublicKernelPlugin<Plugin> =
  Plugin extends KernelPlugin<infer FormatMap, infer RenderOptions, infer Id>
    ? KernelPlugin<FormatMap, RenderOptions, Id>
    : never;

type PublicMiddlewarePlugin<Plugin> = Plugin extends MiddlewarePlugin<infer Id> ? MiddlewarePlugin<Id> : never;

type PublicBundlerPlugin<Plugin> = Plugin extends BundlerPlugin<infer Id> ? BundlerPlugin<Id> : never;

type PublicTranscoderPlugin<Plugin> =
  Plugin extends TranscoderPlugin<infer EdgeMap, infer From, infer Id> ? TranscoderPlugin<EdgeMap, From, Id> : never;

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

type RuntimeOptionsKernels<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<infer Kernels> ? Kernels : readonly never[];

type RuntimeOptionsMiddleware<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<readonly AnyKernelPlugin[], infer Middleware>
    ? Middleware
    : readonly never[];

type RuntimeOptionsBundlers<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<
    readonly AnyKernelPlugin[],
    readonly MiddlewarePlugin[],
    infer Bundlers
  >
    ? Bundlers
    : readonly never[];

type RuntimeOptionsTranscoders<Options> =
  AwaitedRuntimeOptions<Options> extends RuntimeDefinitionOptions<
    readonly AnyKernelPlugin[],
    readonly MiddlewarePlugin[],
    readonly BundlerPlugin[],
    infer Transcoders
  >
    ? Transcoders
    : readonly never[];

type ConfiguredRuntimeCreateResult<
  Kernels extends readonly AnyKernelPlugin[] = readonly AnyKernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[] = readonly MiddlewarePlugin[],
  Bundlers extends readonly BundlerPlugin[] = readonly BundlerPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly AnyTranscoderPlugin[],
> = MaybePromise<RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders>>;

export type RuntimeDefinition<
  Kernels extends readonly AnyKernelPlugin[] = readonly AnyKernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[] = readonly MiddlewarePlugin[],
  Bundlers extends readonly BundlerPlugin[] = readonly BundlerPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly AnyTranscoderPlugin[],
  ConfigSchema extends z.ZodType | undefined = undefined,
> = ConfigSchema extends z.ZodType
  ? ConfiguredRuntimeDefinition<RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders>, ConfigSchema>
  : RuntimePluginOptions<Kernels, Middleware, Bundlers, Transcoders>;

export type ConfiguredRuntimeDefinition<
  Options extends ConfiguredRuntimeCreateResult,
  ConfigSchema extends z.ZodType,
> = {
  readonly configSchema: ConfigSchema;
  readonly createRuntime: (config: z.output<ConfigSchema>) => Options;
};

export type AnyRuntimeDefinition =
  | RuntimePluginOptions
  | ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, z.ZodType>;

export type RuntimeDefinitionOptions<
  Kernels extends readonly AnyKernelPlugin[] = readonly never[],
  Middleware extends readonly MiddlewarePlugin[] = readonly never[],
  Bundlers extends readonly BundlerPlugin[] = readonly never[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly never[],
> = {
  readonly kernels?: Kernels;
  readonly middleware?: Middleware;
  readonly bundlers?: Bundlers;
  readonly transcoders?: Transcoders;
  readonly renderTimeout?: number;
};

export type RuntimeKernels<Runtime> =
  Runtime extends RuntimePluginOptions<infer Kernels>
    ? Kernels
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsKernels<Options>
      : readonly KernelPlugin[];

export type RuntimeMiddleware<Runtime> =
  Runtime extends RuntimePluginOptions<readonly AnyKernelPlugin[], infer Middleware>
    ? Middleware
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsMiddleware<Options>
      : readonly MiddlewarePlugin[];

export type RuntimeBundlers<Runtime> =
  Runtime extends RuntimePluginOptions<readonly AnyKernelPlugin[], readonly MiddlewarePlugin[], infer Bundlers>
    ? Bundlers
    : Runtime extends ConfiguredRuntimeDefinition<infer Options, z.ZodType>
      ? RuntimeOptionsBundlers<Options>
      : readonly BundlerPlugin[];

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

export type RuntimeConfigInput<Runtime> =
  Runtime extends ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, infer ConfigSchema>
    ? z.input<ConfigSchema>
    : never;

export type RuntimeConfigOutput<Runtime> =
  Runtime extends ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, infer ConfigSchema>
    ? z.output<ConfigSchema>
    : never;

export type RuntimeConfigProvider<Runtime> =
  | RuntimeConfigInput<Runtime>
  | (() => RuntimeConfigInput<Runtime> | Promise<RuntimeConfigInput<Runtime>>);

export class RuntimeConfigError extends Error {
  public override readonly cause: unknown;

  public constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.cause = cause;
  }

  public get code(): 'RUNTIME_CONFIG_INVALID' {
    return 'RUNTIME_CONFIG_INVALID';
  }
}

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

function normalizeRuntimeDefinition<
  const Kernels extends readonly AnyKernelPlugin[] = readonly never[],
  const Middleware extends readonly MiddlewarePlugin[] = readonly never[],
  const Bundlers extends readonly BundlerPlugin[] = readonly never[],
  const Transcoders extends readonly AnyTranscoderPlugin[] = readonly never[],
>(
  options: RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders>,
): RuntimePluginOptions<Kernels, Middleware, Bundlers, Transcoders> {
  return {
    kernels: (options.kernels ?? []) as unknown as Kernels,
    middleware: (options.middleware ?? []) as unknown as Middleware,
    bundlers: (options.bundlers ?? []) as unknown as Bundlers,
    transcoders: (options.transcoders ?? []) as unknown as Transcoders,
    ...(options.renderTimeout === undefined ? {} : { renderTimeout: options.renderTimeout }),
  };
}

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
>(
  options: RuntimeDefinitionOptions<Kernels, Middleware, Bundlers, Transcoders>,
): RuntimeDefinition<
  PublicKernelTuple<Kernels>,
  PublicMiddlewareTuple<Middleware>,
  PublicBundlerTuple<Bundlers>,
  PublicTranscoderTuple<Transcoders>
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

export function defineRuntime(
  options: RuntimeDefinitionOptions | ConfiguredRuntimeDefinition<ConfiguredRuntimeCreateResult, z.ZodType>,
): AnyRuntimeDefinition {
  if (isConfiguredRuntimeDefinition(options)) {
    return options;
  }

  return normalizeRuntimeDefinition(options);
}
