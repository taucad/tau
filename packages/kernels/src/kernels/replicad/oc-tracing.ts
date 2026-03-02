/**
 * OpenCASCADE API Call Tracing & Exception Capture
 *
 * Instruments OC instance method/constructor calls via a recursive JavaScript Proxy.
 * Two modes:
 * - summary: accumulates per-class call counts and durations, emits a single
 *   `oc.summary` span at flush time. Low overhead (~2-5%).
 * - per-call: creates individual `oc.{ClassName}` spans for every call via
 *   the tracer. Higher overhead (~10-20%), used for deep profiling.
 *
 * Also catches WebAssembly.Exception at the proxy boundary, converting it to a
 * standard Error with the decoded OC message and the JS stack trace from the
 * call site (which includes user code frames).
 */

import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { KernelSpanTracer } from '#types/kernel-tracer.types.js';
import { formatOcExceptionMessage } from '#kernels/replicad/oc-exceptions.js';

/**
 * Error subclass thrown when a WebAssembly.Exception from OC is caught at the
 * tracing proxy boundary. Preserves the decoded OC message and the JS call
 * stack from the user code call site.
 */
export class OcKernelError extends Error {
  public override readonly name = 'OcKernelError';
  public readonly typeName: string;
  public readonly rawMessage: string;

  public constructor(typeName: string, rawMessage: string) {
    const formatted = formatOcExceptionMessage(typeName, rawMessage);
    super(formatted);
    this.typeName = typeName;
    this.rawMessage = rawMessage;
  }
}

/**
 * Configuration for OC API call tracing.
 */
export type OcTracingConfig = {
  mode: 'summary' | 'per-call';
};

/**
 * Accumulated statistics for a single OC class in summary mode.
 */
type ClassStats = {
  calls: number;
  totalMs: number;
};

/**
 * Handle for flushing accumulated summary data as a span.
 */
export type OcTracingSummary = {
  /** Emit a single `oc.summary` span with aggregated per-class statistics. */
  flush(): void;
};

/**
 * Result of wrapping an OC instance with tracing.
 */
export type OcTracingResult = {
  tracedInstance: OpenCascadeInstance;
  summary: OcTracingSummary;
};

// =============================================================================
// Shared type guards
// =============================================================================

type GenericFunction = (...args: unknown[]) => unknown;
type ExceptionDecoder = (ex: WebAssembly.Exception) => [string, string];

function isCallable(value: unknown): value is GenericFunction {
  return typeof value === 'function';
}

/** V8-only `Error.captureStackTrace` — not present in all runtimes. */
type V8ErrorConstructor = {
  captureStackTrace?(target: Error, constructorOpt: GenericFunction): void;
};

// =============================================================================
// Shared exception interception helpers
// =============================================================================

/** Runtime-only Emscripten export — not in the generated .d.ts. */
type OcWithExceptionHelpers = OpenCascadeInstance & {
  getExceptionMessage?: ExceptionDecoder;
};

function getExceptionDecoder(oc: OpenCascadeInstance): ExceptionDecoder | undefined {
  const candidate = (oc as OcWithExceptionHelpers).getExceptionMessage;
  return typeof candidate === 'function' ? candidate : undefined;
}

/**
 * Create a `rethrowIfWasmException` function bound to the given OC instance.
 * Converts `WebAssembly.Exception` to `OcKernelError` at the call site so the
 * JS stack trace includes user code frames.
 */
function createRethrowFn(decoder: ExceptionDecoder | undefined): (error: unknown) => never {
  return function rethrowIfWasmException(error: unknown): never {
    if (
      typeof decoder === 'function' &&
      typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.Exception === 'function' &&
      error instanceof WebAssembly.Exception
    ) {
      try {
        const [typeName, rawMessage] = decoder(error);
        const kernelError = new OcKernelError(typeName, rawMessage);
        (Error as V8ErrorConstructor).captureStackTrace?.(kernelError, rethrowIfWasmException);
        throw kernelError;
      } catch (decodeError: unknown) {
        if (decodeError instanceof OcKernelError) {
          throw decodeError;
        }
      }
    }

    throw error;
  };
}

/**
 * Create a wrapper that recursively proxies Emscripten objects so their method
 * calls are intercepted for exception conversion.
 */
function isEmscriptenRecord(value: unknown): value is Record<string, unknown> & { delete(): void } {
  // eslint-disable-next-line @typescript-eslint/dot-notation -- 'delete' is a reserved keyword, dot notation fails
  return typeof value === 'object' && value !== null && 'delete' in value && typeof value['delete'] === 'function';
}

function createEmscriptenWrapper(rethrowIfWasmException: (error: unknown) => never): (value: unknown) => unknown {
  const wrappedObjects = new WeakSet<Record<string, unknown>>();

  function wrapEmscriptenResult(value: unknown): unknown {
    if (!isEmscriptenRecord(value) || wrappedObjects.has(value)) {
      return value;
    }

    wrappedObjects.add(value);
    return new Proxy(value, {
      get(target, property, receiver): unknown {
        const member: unknown = Reflect.get(target, property, receiver);
        if (typeof member !== 'function') {
          return member;
        }

        const wrapper = function (this: unknown, ...methodArgs: unknown[]): unknown {
          try {
            return wrapEmscriptenResult(Reflect.apply(member, target, methodArgs));
          } catch (error: unknown) {
            return rethrowIfWasmException(error);
          }
        };

        const className = (target as { constructor?: { name?: string } }).constructor?.name ?? 'OC';
        Object.defineProperty(wrapper, 'name', { value: `${className}.${String(property)}` });
        return wrapper;
      },
    });
  }

  return wrapEmscriptenResult;
}

// =============================================================================
// Exception-only proxy (no tracing overhead)
// =============================================================================

/**
 * Wrap an OpenCASCADE instance with exception handling only.
 *
 * Intercepts `WebAssembly.Exception` from both top-level OC function calls and
 * methods on returned Emscripten objects, converting them to `OcKernelError`
 * with a JS stack trace that includes user code frames.
 *
 * Use when OC tracing is disabled but the WASM build has exceptions enabled.
 * Negligible runtime overhead — only adds Proxy get-traps and a WeakSet lookup.
 */
export function wrapOcForExceptions(oc: OpenCascadeInstance): OpenCascadeInstance {
  const decoder = getExceptionDecoder(oc);
  if (!decoder) {
    return oc;
  }

  const rethrowIfWasmException = createRethrowFn(decoder);
  const wrapEmscriptenResult = createEmscriptenWrapper(rethrowIfWasmException);

  const cache = new Map<string, unknown>();
  return new Proxy(oc, {
    get(target, property, receiver): unknown {
      if (typeof property === 'symbol') {
        return Reflect.get(target, property, receiver);
      }

      const cached = cache.get(property);
      if (cached !== undefined) {
        return cached;
      }

      const value: unknown = Reflect.get(target, property, receiver);

      if (isCallable(value)) {
        const wrapped = new Proxy(value, {
          construct(constructTarget, args, newTarget) {
            try {
              return wrapEmscriptenResult(Reflect.construct(constructTarget, args, newTarget)) as Record<
                string,
                unknown
              >;
            } catch (error: unknown) {
              return rethrowIfWasmException(error);
            }
          },
          apply(applyTarget, thisArg, args) {
            try {
              return wrapEmscriptenResult(Reflect.apply(applyTarget, thisArg, args));
            } catch (error: unknown) {
              return rethrowIfWasmException(error);
            }
          },
        });
        cache.set(property, wrapped);
        return wrapped;
      }

      return value;
    },
  });
}

// =============================================================================
// Tracing proxy (full instrumentation + exception handling)
// =============================================================================

/**
 * Wrap an OpenCASCADE instance with tracing instrumentation.
 *
 * The proxy intercepts property access to resolve class names, then wraps
 * function calls (constructors and methods) with timing instrumentation.
 * Also handles exception conversion via the shared helpers.
 *
 * @param oc - The OC instance (raw or already exception-wrapped)
 * @param tracer - KernelSpanTracer for creating spans
 * @param config - Tracing configuration (mode selection)
 * @returns The traced instance and a summary handle for flushing
 */
export function wrapOcWithTracing(
  oc: OpenCascadeInstance,
  tracer: KernelSpanTracer,
  config: OcTracingConfig,
): OcTracingResult {
  const stats = new Map<string, ClassStats>();

  const decoder = getExceptionDecoder(oc);
  const rethrowIfWasmException = createRethrowFn(decoder);
  const wrapEmscriptenResult = createEmscriptenWrapper(rethrowIfWasmException);

  function recordSummaryCall(className: string, durationMs: number): void {
    const existing = stats.get(className);
    if (existing) {
      existing.calls++;
      existing.totalMs += durationMs;
    } else {
      stats.set(className, { calls: 1, totalMs: durationMs });
    }
  }

  function wrapFunctionForSummary(fn: GenericFunction, className: string): GenericFunction {
    return new Proxy(fn, {
      construct(target, args, newTarget) {
        const start = performance.now();
        try {
          const result: unknown = Reflect.construct(target, args, newTarget);
          recordSummaryCall(className, performance.now() - start);
          return wrapEmscriptenResult(result) as Record<string, unknown>;
        } catch (error: unknown) {
          recordSummaryCall(className, performance.now() - start);
          return rethrowIfWasmException(error);
        }
      },
      apply(target, thisArg, args) {
        const start = performance.now();
        try {
          const result: unknown = Reflect.apply(target, thisArg, args);
          recordSummaryCall(className, performance.now() - start);
          return wrapEmscriptenResult(result);
        } catch (error: unknown) {
          recordSummaryCall(className, performance.now() - start);
          return rethrowIfWasmException(error);
        }
      },
    });
  }

  function wrapFunctionForPerCall(fn: GenericFunction, className: string): GenericFunction {
    return new Proxy(fn, {
      construct(target, args, newTarget) {
        const span = tracer.startSpan(`oc.${className}`, { method: 'constructor' });
        try {
          return wrapEmscriptenResult(Reflect.construct(target, args, newTarget)) as Record<string, unknown>;
        } catch (error: unknown) {
          return rethrowIfWasmException(error);
        } finally {
          span.end();
        }
      },
      apply(target, thisArg, args) {
        const span = tracer.startSpan(`oc.${className}`, { method: 'apply' });
        try {
          return wrapEmscriptenResult(Reflect.apply(target, thisArg, args));
        } catch (error: unknown) {
          return rethrowIfWasmException(error);
        } finally {
          span.end();
        }
      },
    });
  }

  const wrapFunction = config.mode === 'summary' ? wrapFunctionForSummary : wrapFunctionForPerCall;

  const classProxyCache = new Map<string, unknown>();

  const tracedInstance: OpenCascadeInstance = new Proxy(oc, {
    get(target, property, receiver): unknown {
      if (typeof property === 'symbol') {
        return Reflect.get(target, property, receiver);
      }

      const cached = classProxyCache.get(property);
      if (cached !== undefined) {
        return cached;
      }

      const value: unknown = Reflect.get(target, property, receiver);

      if (isCallable(value)) {
        const wrapped = wrapFunction(value, property);
        classProxyCache.set(property, wrapped);
        return wrapped;
      }

      return value;
    },
  });

  const summary: OcTracingSummary = {
    flush() {
      if (stats.size === 0) {
        return;
      }

      const attributes: Record<string, string | number | boolean> = {};
      let totalCalls = 0;
      let totalMs = 0;

      for (const [className, classStats] of stats) {
        attributes[`${className}.calls`] = classStats.calls;
        attributes[`${className}.ms`] = Math.round(classStats.totalMs * 100) / 100;
        totalCalls += classStats.calls;
        totalMs += classStats.totalMs;
      }

      attributes['total.calls'] = totalCalls;
      attributes['total.ms'] = Math.round(totalMs * 100) / 100;
      attributes['classes'] = stats.size;

      const span = tracer.startSpan('oc.summary', attributes);
      span.end();

      stats.clear();
    },
  };

  return { tracedInstance, summary };
}
