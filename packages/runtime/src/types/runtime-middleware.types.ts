/**
 * Kernel Middleware Types
 *
 * Types for the middleware subsystem: wrap-style hooks, middleware state,
 * middleware runtime context, and handler types for the onion-model pipeline.
 */

import type { PartialDeep } from 'type-fest';
import type { CreateGeometryResult, ExportGeometryResult, GetParametersResult } from '#types/runtime.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type {
  RuntimeLogger,
  KernelFileSystem,
  CreateGeometryInput,
  ExportGeometryRequest,
  GetDependenciesInput,
  GetParametersInput,
} from '#types/runtime-kernel.types.js';

// =============================================================================
// Middleware State & Runtime
// =============================================================================

/**
 * Type-safe state for middleware to persist data during an operation.
 *
 * The state is scoped to a single middleware and persists for the duration of
 * one operation (e.g., one createGeometry call). In wrap-style hooks, state
 * can be updated before calling handler() and read after it returns.
 *
 * @template T - The state schema type inferred from Zod. Must be an object type.
 * @public
 */
export type MiddlewareState<T extends Record<string, unknown>> = {
  /**
   * Current state value.
   * Type is PartialDeep<T> since update() may be called with partial data
   * or not called at all.
   */
  readonly value: PartialDeep<T>;

  /**
   * Update the state with partial data.
   * Values are validated against the Zod schema before being merged.
   *
   * @param partial - Partial data to merge into the state
   */
  update: (partial: Partial<T>) => void;
};

/**
 * Runtime context provided to middleware wrap hooks.
 * Contains services and utilities available during hook execution.
 *
 * @template State - The state type inferred from the middleware's stateSchema. Must be an object type.
 * @template Options - The options type inferred from the middleware's optionsSchema. Must be an object type.
 * @public
 */
export type KernelMiddlewareRuntime<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  State extends Record<string, unknown> = {},
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
> = {
  /** Logger with middleware name pre-configured as the component */
  logger: RuntimeLogger;
  /** Filesystem for all file operations (uses absolute path methods for middleware) */
  filesystem: KernelFileSystem;
  /** Absolute project root path for cache and middleware-owned files */
  projectRootPath: string;
  /** Absolute base path for middleware-owned files. Alias of projectRootPath for current runtime operations. */
  basePath: string;
  /** Type-safe state for persisting data during the wrap hook execution */
  state: MiddlewareState<State>;
  /** Resolved options (optionsSchema defaults merged with caller overrides) */
  options: Options;
  /**
   * Dependencies for cache key computation.
   * Includes file dependencies (source files, fonts), middleware signatures,
   * framework version, and kernel options.
   */
  dependencies: readonly Dependency[];
  /**
   * Pre-computed SHA-256 hash of all dependencies.
   * Can be used as a cache key or unique geometry identifier.
   * This is a 64-character hex string.
   */
  dependencyHash: string;
  /**
   * Register a file path for the kernel's watch set with an optional debounce tier.
   * Paths registered here are included in the kernel's filesystem watcher.
   * The debounce tier controls how quickly changes to this path trigger a re-render
   * (e.g., 50ms for parameter files vs 500ms default for source code).
   *
   * Idempotent — re-registering the same path updates the debounce value.
   *
   * @param absolutePath - Absolute filesystem path to watch
   * @param options - Optional configuration with `watchDebounce` (milliseconds) override
   */
  registerWatchPath(
    absolutePath: string,
    options?: {
      /** Milliseconds. */
      watchDebounce?: number;
    },
  ): void;
};

// =============================================================================
// Middleware Handler Types (Wrap-Style Hooks)
// =============================================================================

/**
 * Handler function for createGeometry.
 * Called by wrap hooks to continue the middleware chain or execute the main operation.
 * Runtime is captured in the handler's closure, so middleware only passes input.
 * Uses internal geometry types (without hash) - hash is added by kernel-worker.ts.
 * @public
 */
export type CreateGeometryHandler = (input: CreateGeometryInput) => Promise<CreateGeometryResult>;

/**
 * Handler function for exportGeometry.
 * Called by wrap hooks to continue the middleware chain or execute the main operation.
 * Runtime is captured in the handler's closure, so middleware only passes input.
 * @public
 */
export type ExportGeometryHandler = (input: ExportGeometryRequest) => Promise<ExportGeometryResult>;

/**
 * Handler function for getParameters.
 * Called by wrap hooks to continue the middleware chain or execute the main operation.
 * Runtime is captured in the handler's closure, so middleware only passes input.
 * @public
 */
export type GetParametersHandler = (input: GetParametersInput) => Promise<GetParametersResult>;

// =============================================================================
// Middleware Wrap Hook Types
// =============================================================================

/**
 * Wrap-style hook for createGeometry.
 * Provides full control over execution: can short-circuit, transform input/output,
 * or add pre/post processing. Code after handler() runs on the "return journey"
 * (onion model), so short-circuited results still flow through upstream middleware.
 *
 * Arguments: (input, handler, runtime)
 * - input: what to process (destructure what you need)
 * - handler: call to continue the chain (always used)
 * - runtime: services like logger/filesystem (only destructure if needed)
 *
 * @template State - The state type from the middleware's stateSchema. Must be an object type.
 * @template Options - The options type from the middleware's optionsSchema. Must be an object type.
 *
 * @public
 *
 * @example <caption>Logging middleware for geometry pipeline</caption>
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
export type WrapCreateGeometryHook<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  State extends Record<string, unknown> = {},
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
> = (
  input: CreateGeometryInput,
  handler: CreateGeometryHandler,
  runtime: KernelMiddlewareRuntime<State, Options>,
) => Promise<CreateGeometryResult>;

/**
 * Wrap-style hook for exportGeometry.
 * Provides full control over execution with onion model semantics.
 *
 * @template State - The state type from the middleware's stateSchema. Must be an object type.
 * @template Options - The options type from the middleware's optionsSchema. Must be an object type.
 * @public
 */
export type WrapExportGeometryHook<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  State extends Record<string, unknown> = {},
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
> = (
  input: ExportGeometryRequest,
  handler: ExportGeometryHandler,
  runtime: KernelMiddlewareRuntime<State, Options>,
) => Promise<ExportGeometryResult>;

/**
 * Wrap-style hook for getParameters.
 * Provides full control over execution with onion model semantics.
 *
 * @template State - The state type from the middleware's stateSchema. Must be an object type.
 * @template Options - The options type from the middleware's optionsSchema. Must be an object type.
 * @public
 */
export type WrapGetParametersHook<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  State extends Record<string, unknown> = {},
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
> = (
  input: GetParametersInput,
  handler: GetParametersHandler,
  runtime: KernelMiddlewareRuntime<State, Options>,
) => Promise<GetParametersResult>;

// =============================================================================
// Middleware Dependency Hook
// =============================================================================

/**
 * Hook for middleware to declare additional file dependencies.
 *
 * Called during dependency resolution (before the wrap chain executes) so that
 * middleware-owned files contribute to the dependency hash used by cache middleware.
 * Returns absolute file paths; the kernel worker handles reading, hashing, and
 * including them in the dependency set.
 *
 * @template Options - The options type from the middleware's optionsSchema. Must be an object type.
 * @public
 *
 * @example <caption>Parameter file resolver declaring a dependency</caption>
 * ```typescript
 * import { defineMiddleware } from '@taucad/runtime/middleware';
 *
 * const parameterResolver = defineMiddleware({
 *   id: 'parameter-resolver',
 *   name: 'ParameterResolver',
 *   getDependencies({ filePath, basePath }, options) {
 *     const relativePath = filePath.replace(`${basePath}/`, '');
 *     return [`${basePath}/${options.parametersDir}/${relativePath}.json`];
 *   },
 * });
 * ```
 */
export type GetMiddlewareDependenciesHook<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
> = (input: GetDependenciesInput, options: Options) => string[] | Promise<string[]>;
