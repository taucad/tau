import type { z } from 'zod';
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { LogLevel, OnWorkerLog } from '@taucad/types';
import type {
  WrapCreateGeometryHook,
  WrapExportGeometryHook,
  WrapGetParametersHook,
  GetMiddlewareDependenciesHook,
  KernelMiddlewareRuntime,
  MiddlewareState,
} from '#types/runtime-middleware.types.js';
import type { RuntimeLogger, KernelFileSystem } from '#types/runtime-kernel.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { MiddlewarePlugin } from '#plugins/plugin-types.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

/**
 * Type alias for an empty Zod object schema.
 * Used as the default when no state schema is provided.
 * z.infer of this type yields `{}`.
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Represents z.object({}) schema type
type EmptyZodObject = z.ZodObject<{}>;

/**
 * Type alias for an empty state object.
 * Used as the default inferred state type when no state schema is provided.
 * Equivalent to z.infer<EmptyZodObject>.
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Represents an empty state object
type EmptyState = {};

/**
 * Configuration for creating a kernel middleware.
 *
 * @template StateSchema - Optional Zod object schema for the middleware state.
 *   Defaults to an empty object schema when no state is needed.
 * @template OptionsSchema - Optional Zod object schema for the middleware options.
 *   Defaults to an empty object schema when no options are needed.
 * @public
 */
export type KernelMiddlewareOptions<
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
> = {
  /** Name of the middleware for debugging and logging */
  name: string;
  /** Version of the middleware for cache key computation. Defaults to '1' if not provided. */
  version?: string;
  /** Whether the middleware is enabled by default. Defaults to `true`; plugin options can still tune middleware behavior. */
  enabled?: boolean;
  /** Optional Zod schema for type-safe state. Must be a z.object() schema. */
  stateSchema?: StateSchema;
  /** Optional Zod schema for middleware options with .default() values for each field. */
  optionsSchema?: OptionsSchema;
  /** Hook to declare additional file dependencies for cache key computation */
  getDependencies?: GetMiddlewareDependenciesHook<z.infer<OptionsSchema>>;
  /** Wrap-style hook for createGeometry with onion model execution */
  wrapCreateGeometry?: WrapCreateGeometryHook<z.infer<StateSchema>, z.infer<OptionsSchema>>;
  /** Wrap-style hook for exportGeometry with onion model execution */
  wrapExportGeometry?: WrapExportGeometryHook<z.infer<StateSchema>, z.infer<OptionsSchema>>;
  /** Wrap-style hook for getParameters with onion model execution */
  wrapGetParameters?: WrapGetParametersHook<z.infer<StateSchema>, z.infer<OptionsSchema>>;
};

/**
 * A kernel middleware instance with typed wrap-style hooks.
 *
 * @template StateSchema - The Zod schema type for the state.
 *   Keeping the schema type (not inferred type) allows proper type flow from config to middleware.
 *   Defaults to an empty object schema when no state is needed.
 * @template OptionsSchema - The Zod schema type for the options.
 *   Defaults to an empty object schema when no options are needed.
 * @public
 */
export type KernelMiddleware<
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
> = {
  /** Name of the middleware */
  name: string;
  /** Version of the middleware for cache key computation. Defaults to '1' if not provided. */
  version?: string;
  /** Whether the middleware is enabled by default. Defaults to `true`. */
  enabled?: boolean;
  /** Zod schema for validating state updates (if provided) */
  stateSchema?: StateSchema;
  /** Zod schema for validating and defaulting options (if provided) */
  optionsSchema?: OptionsSchema;
  /** Hook to declare additional file dependencies for cache key computation */
  getDependencies?: GetMiddlewareDependenciesHook<z.infer<OptionsSchema>>;
  /** Wrap-style hook for createGeometry with onion model execution */
  wrapCreateGeometry?: WrapCreateGeometryHook<z.infer<StateSchema>, z.infer<OptionsSchema>>;
  /** Wrap-style hook for exportGeometry with onion model execution */
  wrapExportGeometry?: WrapExportGeometryHook<z.infer<StateSchema>, z.infer<OptionsSchema>>;
  /** Wrap-style hook for getParameters with onion model execution */
  wrapGetParameters?: WrapGetParametersHook<z.infer<StateSchema>, z.infer<OptionsSchema>>;
};

type MiddlewareDefinitionConfig<
  Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape>,
  OptionsSchema extends z.ZodObject<z.ZodRawShape>,
> = Omit<KernelMiddlewareOptions<StateSchema, OptionsSchema>, 'optionsSchema'> & {
  /** Unique identifier for this middleware plugin. */
  id: Id;
};

type MiddlewarePluginRegistration<
  Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape>,
  OptionsSchema extends z.ZodObject<z.ZodRawShape>,
> = MiddlewarePlugin<Id> & RuntimePluginDefinitionCarrier<KernelMiddleware<StateSchema, OptionsSchema>>;

export type MiddlewarePluginFactory<
  Id extends string,
  Options = undefined,
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
> = Options extends undefined
  ? () => MiddlewarePluginRegistration<Id, StateSchema, OptionsSchema>
  : Partial<Options> extends Options
    ? (options?: Options) => MiddlewarePluginRegistration<Id, StateSchema, OptionsSchema>
    : (options: Options) => MiddlewarePluginRegistration<Id, StateSchema, OptionsSchema>;

type MiddlewarePluginFactoryWithoutOptions<
  Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
> = () => MiddlewarePluginRegistration<Id, StateSchema, EmptyZodObject>;

/**
 * Creates a kernel middleware instance with wrap-style hooks.
 *
 * Middleware allows intercepting and transforming results from kernel operations
 * using an onion model where code after handler() runs on the "return journey".
 * This pattern is inspired by LangChain's wrap-style middleware hooks.
 *
 * @param options - Middleware configuration with wrap hooks and optional state schema
 * @returns A middleware instance that can be applied to kernel workers
 *
 * @public
 *
 * @example <caption>Wrapping geometry with logging</caption>
 * ```typescript
 * import { defineMiddleware } from '@taucad/runtime/middleware';
 *
 * const loggingMiddleware = defineMiddleware({
 *   id: 'logging',
 *   name: 'Logging',
 *   async wrapCreateGeometry(input, handler, { logger }) {
 *     logger.debug('Computing geometry...');
 *     const result = await handler(input);
 *     logger.debug('Geometry computed');
 *     return result;
 *   },
 * });
 * ```
 */
export function defineMiddleware<
  const Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
>(
  options: MiddlewareDefinitionConfig<Id, StateSchema, EmptyZodObject> & { optionsSchema?: undefined },
): MiddlewarePluginFactoryWithoutOptions<Id, StateSchema>;
export function defineMiddleware<
  const Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> = EmptyZodObject,
>(
  options: MiddlewareDefinitionConfig<Id, StateSchema, OptionsSchema> & { optionsSchema: OptionsSchema },
): MiddlewarePluginFactory<Id, z.input<OptionsSchema>, StateSchema, OptionsSchema>;
export function defineMiddleware(options: unknown): unknown {
  const { id, ...middlewareDefinition } = options as MiddlewareDefinitionConfig<
    string,
    z.ZodObject<z.ZodRawShape>,
    z.ZodObject<z.ZodRawShape>
  > & {
    optionsSchema?: z.ZodObject<z.ZodRawShape>;
  };
  const factory = ((pluginOptions?: Record<string, unknown>) =>
    attachRuntimePluginDefinition(
      {
        id,
        options: pluginOptions,
      },
      () => ({
        name: middlewareDefinition.name,
        version: middlewareDefinition.version ?? '1',
        enabled: middlewareDefinition.enabled,
        stateSchema: middlewareDefinition.stateSchema,
        optionsSchema: middlewareDefinition.optionsSchema,
        getDependencies: middlewareDefinition.getDependencies,
        wrapCreateGeometry: middlewareDefinition.wrapCreateGeometry,
        wrapExportGeometry: middlewareDefinition.wrapExportGeometry,
        wrapGetParameters: middlewareDefinition.wrapGetParameters,
      }),
    )) as MiddlewarePluginFactory<string, unknown>;
  return factory;
}

/**
 * Create a middleware logger from an OnWorkerLog callback.
 * The logger automatically injects the middleware name as the component.
 *
 * @param onLog - The log callback from KernelWorker
 * @param middlewareName - Name of the middleware for origin.component
 * @returns Logger instance with convenience methods
 * @public
 */
export function createMiddlewareLogger(onLog: OnWorkerLog, middlewareName: string): RuntimeLogger {
  const emit = (level: LogLevel, message: string, data?: unknown): void => {
    onLog({
      level,
      message,
      origin: { component: middlewareName },
      data,
    });
  };

  return {
    log(message, options) {
      emit('info', message, options?.data);
    },
    debug(message, options) {
      emit('debug', message, options?.data);
    },
    trace(message, options) {
      emit('trace', message, options?.data);
    },
    warn(message, options) {
      emit('warn', message, options?.data);
    },
    error(message, options) {
      emit('error', message, options?.data);
    },
    custom(level, message, options) {
      emit(level, message, options?.data);
    },
  };
}

/**
 * Create a type-safe state for a middleware.
 * The state validates updates against the Zod schema if provided.
 *
 * Note: Array updates replace the entire array rather than concatenating.
 * For example: state.update({ items: [1, 2] }) then state.update({ items: [3] })
 * results in { items: [3] }, not { items: [1, 2, 3] }.
 *
 * @param schema - Optional Zod object schema for validation
 * @returns State instance with value and update method
 * @public
 */
export function createMiddlewareState<State extends Record<string, unknown> = EmptyState>(
  schema?: z.ZodObject<z.ZodRawShape>,
): MiddlewareState<State> {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- initial value is empty object
  let stateValue: PartialDeep<State> = {} as PartialDeep<State>;

  return {
    /**
     * Get the current state value.
     * @returns The current state value.
     */
    get value() {
      return stateValue;
    },
    /**
     * Update the state with partial data.
     * Values are validated against the Zod schema before being merged.
     *
     * Note: Array updates replace the entire array rather than concatenating.
     * For example: state.update({ items: [1, 2] }) then state.update({ items: [3] })
     * results in { items: [3] }, not { items: [1, 2, 3] }.
     *
     * @param partial - Partial data to merge into the state
     */
    update(partial: Partial<State>) {
      // First, construct the merged object using deepmerge for proper nested object handling
      // Use arrayMerge to replace arrays instead of concatenating (default deepmerge behavior)
      const merged = deepmerge(stateValue, partial, {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      }) as PartialDeep<State>;

      // Then validate against schema if provided
      if (schema) {
        // Use partial schema for validation - allows partial updates
        const partialSchema = schema.partial();
        partialSchema.parse(merged);
      }

      stateValue = merged;
    },
  };
}

/**
 * Options for creating a middleware runtime.
 * @public
 */
export type CreateMiddlewareRuntimeOptions = {
  /** The log callback from KernelWorker */
  onLog: OnWorkerLog;
  /** Name of the middleware */
  middlewareName: string;
  /** Filesystem for all file operations */
  filesystem: KernelFileSystem;
  /** Absolute project root path for cache and middleware-owned files */
  projectRootPath?: string;
  /** Absolute base path for middleware-owned files. Defaults to projectRootPath. */
  basePath?: string;
  /** Array of dependencies for cache key computation */
  dependencies: readonly Dependency[];
  /** Pre-computed SHA-256 hash of all dependencies */
  dependencyHash: string;
  /** Optional Zod object schema for the state */
  stateSchema?: z.ZodObject<z.ZodRawShape>;
  /** Resolved options values (schema defaults merged with caller overrides) */
  options?: Record<string, unknown>;
  /** Pre-created logger to avoid closure allocation per operation */
  logger?: RuntimeLogger;
  /** Callback for middleware to register additional watch paths with optional debounce tiers */
  registerWatchPath?: (
    absolutePath: string,
    options?: {
      /** Milliseconds. */
      watchDebounce?: number;
    },
  ) => void;
};

/**
 * Create a middleware runtime with logger, filesystem, state, options, and dependencies.
 *
 * @param runtimeOptions - Runtime configuration options
 * @returns Runtime instance for middleware wrap hooks
 * @public
 */
export function createMiddlewareRuntime<
  State extends Record<string, unknown> = EmptyState,
  Options extends Record<string, unknown> = EmptyState,
>(runtimeOptions: CreateMiddlewareRuntimeOptions): KernelMiddlewareRuntime<State, Options> {
  const {
    onLog,
    middlewareName,
    filesystem,
    projectRootPath,
    basePath,
    dependencies,
    dependencyHash,
    stateSchema,
    options,
    logger,
    registerWatchPath,
  } = runtimeOptions;

  return {
    logger: logger ?? createMiddlewareLogger(onLog, middlewareName),
    filesystem,
    projectRootPath: projectRootPath ?? basePath ?? '',
    basePath: basePath ?? projectRootPath ?? '',
    state: createMiddlewareState<State>(stateSchema),
    options: (options ?? {}) as Options,
    dependencies,
    dependencyHash,
    registerWatchPath: registerWatchPath ?? (() => undefined),
  };
}
