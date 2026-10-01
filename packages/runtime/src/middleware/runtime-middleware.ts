import type { z } from 'zod';
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { LogLevel, OnWorkerLog } from '@taucad/types';
import type { KernelMiddlewareRuntime, MiddlewareState } from '#types/runtime-middleware.types.js';
import type { RuntimeLogger, KernelFileSystem } from '#types/runtime-kernel.types.js';
import type { KernelComputeCapability } from '#types/runtime-compute.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

/** Empty state when no schema is supplied. */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Middleware state starts with no declared keys.
type EmptyState = {};

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
  /** Operation-scoped cancellation signal. */
  signal: AbortSignal;
  /** Span tracer shared with the active runtime operation. */
  tracer: RuntimeSpanTracer;
  /** The log callback from KernelWorker */
  onLog: OnWorkerLog;
  /** Name of the middleware */
  middlewareName: string;
  /** Filesystem for all file operations */
  filesystem: KernelFileSystem;
  /** Shared deterministic compute reuse service. */
  compute: KernelComputeCapability;
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
    signal,
    tracer,
    onLog,
    middlewareName,
    filesystem,
    compute,
    dependencies,
    dependencyHash,
    stateSchema,
    options,
    logger,
  } = runtimeOptions;

  return {
    signal,
    tracer,
    logger: logger ?? createMiddlewareLogger(onLog, middlewareName),
    filesystem,
    compute,
    state: createMiddlewareState<State>(stateSchema),
    options: (options ?? {}) as Options,
    dependencies,
    dependencyHash,
  };
}
