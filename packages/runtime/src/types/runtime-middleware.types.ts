/** Shared middleware operation state and runtime services. */

import type { PartialDeep } from 'type-fest';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { RuntimeLogger, KernelFileSystem } from '#types/runtime-kernel.types.js';
import type { KernelComputeCapability } from '#types/runtime-compute.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

/**
 * Type-safe state for middleware to persist data during an operation.
 *
 * The state is scoped to a single middleware and persists for the duration of
 * one document operation. In wrap-style hooks, state
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
  /**
   * Operation-scoped cancellation signal shared with the active kernel call.
   * Fresh for each operation; pass it to cancellable APIs and do not retain it.
   */
  readonly signal: AbortSignal;
  /** Span tracer for middleware-authored performance instrumentation. */
  readonly tracer: RuntimeSpanTracer;
  /** Logger with middleware name pre-configured as the component */
  logger: RuntimeLogger;
  /** Filesystem capability for runtime-path operations. `/` is the supplied filesystem root. */
  filesystem: KernelFileSystem;
  /** Shared compute reuse facet for middleware-owned work. `off` carries no operations. */
  readonly compute: KernelComputeCapability;
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
   * Can be used as a cache key for the operation.
   * This is a 64-character hex string.
   */
  dependencyHash: string;
};
