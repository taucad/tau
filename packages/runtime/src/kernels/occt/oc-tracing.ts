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
 *
 * Shared between the replicad and opencascade kernels via the structural
 * {@link OcExceptionInstance} type — neither kernel imports the other's WASM
 * bindings, and each kernel keeps its own concrete `oc` type at the call site
 * via the generic parameter.
 */

import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { OcExceptionInstance } from '#kernels/occt/oc-exceptions.js';
import { OcKernelError } from '#kernels/occt/oc-kernel-error.js';
import type { WebAssemblyException } from '#kernels/occt/wasm-exception.js';
import { isWebAssemblyException } from '#kernels/occt/wasm-exception.js';
import { checkAbort } from '#framework/cooperative-abort.js';
import { named } from '#framework/named.js';

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
 *
 * @template T - The concrete OC instance type from the calling kernel
 */
export type OcTracingResult<T extends OcExceptionInstance> = {
  tracedInstance: T;
  summary: OcTracingSummary;
};

// =============================================================================
// Shared type guards
// =============================================================================

type GenericFunction = (...args: unknown[]) => unknown;
type ExceptionDecoder = (ex: WebAssemblyException) => [string, string];

function isCallable(value: unknown): value is GenericFunction {
  return typeof value === 'function';
}

/**
 * Checks whether a value is an OC namespace object — a plain (non-null) object
 * that is NOT callable and NOT an Emscripten record (no `delete()` method).
 * Namespace objects like `BRepLib` contain static methods that need exception
 * interception but are not themselves WASM-allocated objects.
 *
 * Host-platform objects with non-plain prototypes (e.g. `WebAssembly.Memory`,
 * typed array `HEAP*` views) are excluded — proxying them breaks accessors
 * like `WebAssembly.Memory.prototype.buffer`, which require the real receiver.
 *
 * @param value - Value to classify as an OC namespace or not
 * @returns Whether `value` is a non-callable namespace object without `delete`
 */
function isOcNamespace(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || isCallable(value)) {
    return false;
  }
  if (typeof (value as Record<string, unknown>)['delete'] === 'function') {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Wraps an OC namespace object so that its callable properties are intercepted
 * for exception conversion. Handles nested namespaces recursively.
 *
 * @param rethrowIfWasmException - Converts or rethrows errors from WASM calls
 * @returns Function that wraps namespace values with exception interception
 */
function createNamespaceWrapper(rethrowIfWasmException: (error: unknown) => never): (value: unknown) => unknown {
  const wrappedNamespaces = new WeakSet<Record<string, unknown>>();

  /**
   * Recursively proxies a namespace object's members for exception handling.
   *
   * @param ns - OC namespace object to wrap
   * @returns Proxied namespace with intercepted callables
   */
  function wrapNamespace(ns: Record<string, unknown>): Record<string, unknown> {
    if (wrappedNamespaces.has(ns)) {
      return ns;
    }
    wrappedNamespaces.add(ns);

    return new Proxy(ns, {
      get(target, property, receiver): unknown {
        const member: unknown = Reflect.get(target, property, receiver);
        if (isCallable(member)) {
          return function (this: unknown, ...args: unknown[]): unknown {
            checkAbort();
            try {
              return Reflect.apply(member, target, args);
            } catch (error) {
              return rethrowIfWasmException(error);
            }
          };
        }
        if (isOcNamespace(member)) {
          return wrapNamespace(member);
        }
        return member;
      },
    });
  }

  return (value: unknown): unknown => {
    if (isOcNamespace(value)) {
      return wrapNamespace(value);
    }
    return value;
  };
}

/** V8-only `Error.captureStackTrace` — not present in all runtimes. */
type V8ErrorConstructor = {
  captureStackTrace?(target: Error, constructorOpt: GenericFunction): void;
};

// =============================================================================
// Shared exception interception helpers
// =============================================================================

function getExceptionDecoder(oc: OcExceptionInstance): ExceptionDecoder | undefined {
  const candidate = oc.getExceptionMessage;
  if (typeof candidate !== 'function') {
    return undefined;
  }

  const decoder = candidate as ExceptionDecoder;
  return (error) => decoder(error);
}

/**
 * Create a `rethrowIfWasmException` function bound to the given OC instance.
 * Converts `WebAssembly.Exception` to `OcKernelError` at the call site so the
 * JS stack trace includes user code frames.
 *
 * @param decoder - optional Emscripten exception decoder function
 * @returns a function that rethrows WASM exceptions as OcKernelError
 */
function createRethrowFunction(decoder: ExceptionDecoder | undefined): (error: unknown) => never {
  return function rethrowIfWasmException(error: unknown): never {
    if (typeof decoder === 'function' && isWebAssemblyException(error)) {
      try {
        const [typeName, rawMessage] = decoder(error);
        const kernelError = new OcKernelError(typeName, rawMessage);
        (Error as V8ErrorConstructor).captureStackTrace?.(kernelError, rethrowIfWasmException);
        throw kernelError;
      } catch (decodeError) {
        if (decodeError instanceof OcKernelError) {
          throw decodeError;
        }

        // Decoding failed — still wrap as OcKernelError to preserve the
        // JS call stack from the proxy call site (which includes user code).
        const fallback = new OcKernelError('', 'Unknown C++ exception');
        (Error as V8ErrorConstructor).captureStackTrace?.(fallback, rethrowIfWasmException);
        throw fallback;
      }
    }

    throw error;
  };
}

/**
 * Create a wrapper that recursively proxies Emscripten objects so their method
 * calls are intercepted for exception conversion.
 *
 * @param value - the value to check
 * @returns whether the value is an Emscripten-managed WASM object with a delete method
 */
function isEmscriptenRecord(value: unknown): value is Record<string, unknown> & { delete(): void } {
  return typeof value === 'object' && value !== null && 'delete' in value && typeof value.delete === 'function';
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

        const wrapper = function (this: unknown, ...methodArguments: unknown[]): unknown {
          checkAbort();
          try {
            return wrapEmscriptenResult(Reflect.apply(member, target, methodArguments));
          } catch (error) {
            return rethrowIfWasmException(error);
          }
        };

        return named(
          `${(target as { constructor?: { name?: string } }).constructor?.name ?? 'OC'}.${String(property)}`,
          wrapper,
        );
      },
    });
  }

  return wrapEmscriptenResult;
}

// =============================================================================
// Exception-only proxy (no tracing overhead)
// =============================================================================

/**
 * Wraps an OpenCASCADE instance with exception-only interception (no tracing overhead).
 * Use when OC tracing is disabled but the WASM build has exceptions enabled.
 *
 * @template T - The concrete OC instance type from the calling kernel
 * @param oc - The raw OpenCascade instance to wrap
 * @returns A proxied instance that converts `WebAssembly.Exception` to `OcKernelError`
 */
export function wrapOcForExceptions<T extends OcExceptionInstance>(oc: T): T {
  const decoder = getExceptionDecoder(oc);
  if (!decoder) {
    return oc;
  }

  const rethrowIfWasmException = createRethrowFunction(decoder);
  const wrapEmscriptenResult = createEmscriptenWrapper(rethrowIfWasmException);
  const wrapIfNamespace = createNamespaceWrapper(rethrowIfWasmException);

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
            checkAbort();
            try {
              return wrapEmscriptenResult(Reflect.construct(constructTarget, args, newTarget)) as Record<
                string,
                unknown
              >;
            } catch (error) {
              return rethrowIfWasmException(error);
            }
          },
          // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- spec-mandated Proxy/Reflect parameter name
          apply(applyTarget, thisArg, args) {
            checkAbort();
            try {
              return wrapEmscriptenResult(Reflect.apply(applyTarget, thisArg, args));
            } catch (error) {
              return rethrowIfWasmException(error);
            }
          },
        });
        cache.set(property, wrapped);
        return wrapped;
      }

      const wrappedNs = wrapIfNamespace(value);
      if (wrappedNs !== value) {
        cache.set(property, wrappedNs);
        return wrappedNs;
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
 * @template T - The concrete OC instance type from the calling kernel
 * @param oc - The OC instance (raw or already exception-wrapped)
 * @param tracer - RuntimeSpanTracer for creating spans
 * @param config - Tracing configuration (mode selection)
 * @returns The traced instance and a summary handle for flushing
 */
export function wrapOcWithTracing<T extends OcExceptionInstance>(
  oc: T,
  tracer: RuntimeSpanTracer,
  config: OcTracingConfig,
): OcTracingResult<T> {
  const stats = new Map<string, ClassStats>();

  const decoder = getExceptionDecoder(oc);
  const rethrowIfWasmException = createRethrowFunction(decoder);
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

  function wrapFunctionForSummary(function_: GenericFunction, className: string): GenericFunction {
    return new Proxy(function_, {
      construct(target, args, newTarget) {
        checkAbort();
        const start = performance.now();
        try {
          const result: unknown = Reflect.construct(target, args, newTarget);
          recordSummaryCall(className, performance.now() - start);
          return wrapEmscriptenResult(result) as Record<string, unknown>;
        } catch (error) {
          recordSummaryCall(className, performance.now() - start);
          return rethrowIfWasmException(error);
        }
      },
      apply(target, thisArgument, args) {
        checkAbort();
        const start = performance.now();
        try {
          const result: unknown = Reflect.apply(target, thisArgument, args);
          recordSummaryCall(className, performance.now() - start);
          return wrapEmscriptenResult(result);
        } catch (error) {
          recordSummaryCall(className, performance.now() - start);
          return rethrowIfWasmException(error);
        }
      },
    });
  }

  function wrapFunctionForPerCall(function_: GenericFunction, className: string): GenericFunction {
    return new Proxy(function_, {
      construct(target, args, newTarget) {
        checkAbort();
        const span = tracer.startSpan(`oc.${className}`, {
          method: 'constructor',
        });
        try {
          return wrapEmscriptenResult(Reflect.construct(target, args, newTarget)) as Record<string, unknown>;
        } catch (error) {
          return rethrowIfWasmException(error);
        } finally {
          span.end();
        }
      },
      apply(target, thisArgument, args) {
        checkAbort();
        const span = tracer.startSpan(`oc.${className}`, { method: 'apply' });
        try {
          return wrapEmscriptenResult(Reflect.apply(target, thisArgument, args));
        } catch (error) {
          return rethrowIfWasmException(error);
        } finally {
          span.end();
        }
      },
    });
  }

  const wrapFunction = config.mode === 'summary' ? wrapFunctionForSummary : wrapFunctionForPerCall;
  const wrapIfNamespace = createNamespaceWrapper(rethrowIfWasmException);

  const classProxyCache = new Map<string, unknown>();

  const tracedInstance = new Proxy(oc, {
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

      const wrappedNs = wrapIfNamespace(value);
      if (wrappedNs !== value) {
        classProxyCache.set(property, wrappedNs);
        return wrappedNs;
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
