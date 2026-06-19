import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

type SpanAttributes = Record<string, string | number | boolean>;
type TraceableTarget = Record<PropertyKey, unknown> | ((...args: unknown[]) => unknown);

/** Runtime library tracing modes. */
export type KernelLibraryTraceMode = 'off' | 'summary' | 'per-call';

/** Semantic execution scope for a traced library call. */
export type KernelLibraryTraceScope = 'kernel-setup' | 'user-main' | 'render-output' | 'export';

/** Function call shape seen by a library trace policy. */
export type KernelLibraryTraceCallContext = {
  library: string;
  scope: KernelLibraryTraceScope;
  memberPath: string;
  operation: string;
  callType: 'apply' | 'construct';
};

/** Value wrapping decision shape seen by a library trace policy. */
export type KernelLibraryTraceValueContext = {
  library: string;
  scope: KernelLibraryTraceScope;
  memberPath: string;
  value: unknown;
};

/** Completed function result shape seen by a library trace policy. */
export type KernelLibraryTraceResultContext = KernelLibraryTraceCallContext & {
  result: unknown;
  elapsed: number;
};

/** Additional telemetry derived from a completed function result. */
export type KernelLibraryTraceResultTelemetry = {
  attributes?: SpanAttributes;
  summary?: Record<string, number>;
};

/** Policy decision for a library call. */
export type KernelLibraryTraceDecision =
  | {
      type: 'trace';
      operation?: string;
      attributes?: SpanAttributes;
    }
  | {
      type: 'ignore';
    };

/** Policy controlling which library calls are traced and which values stay proxied. */
export type KernelLibraryTracePolicy = {
  library: string;
  spanPrefix?: string;
  summarySpanName?: string;
  traceCall(context: KernelLibraryTraceCallContext): KernelLibraryTraceDecision;
  shouldWrapValue?(context: KernelLibraryTraceValueContext): boolean;
  extractResultTelemetry?(context: KernelLibraryTraceResultContext): KernelLibraryTraceResultTelemetry | undefined;
};

/** Active-scope operation for a traced library handle. */
export type KernelLibraryTraceScopeOperation<T> = {
  scope: KernelLibraryTraceScope;
  operation: () => T;
};

/** Opaque handle returned by {@link createKernelLibraryTracer}. */
export type KernelLibraryTraceHandle<Library> = {
  tracedLibrary: Library;
  runInScope<T>(input: KernelLibraryTraceScopeOperation<T>): T;
  unwrap<T>(value: T): T;
  emitSummary(): void;
};

/** Options for creating a kernel library tracer. */
export type CreateKernelLibraryTracerOptions<Library> = {
  library: Library;
  tracer: RuntimeSpanTracer;
  mode: KernelLibraryTraceMode;
  policy: KernelLibraryTracePolicy;
  defaultScope?: KernelLibraryTraceScope;
};

type CallStats = {
  calls: number;
  errors: number;
  totalDuration: number;
  metrics: Record<string, number>;
};

type SummaryRecordInput = {
  operation: string;
  elapsed: number;
  failed: boolean;
  metrics?: Record<string, number>;
};

type ExtractResultTelemetryInput = {
  policy: KernelLibraryTracePolicy;
  callContext: KernelLibraryTraceCallContext;
  result: unknown;
  elapsed: number;
};

/**
 * Defines a library trace policy with full type inference.
 *
 * Kept as a tiny identity helper so kernel integrations can author policies
 * declaratively without exporting policy internals as public runtime API.
 *
 * @param policy - Library trace policy to normalize.
 * @returns The policy with default span names filled in.
 */
export function defineLibraryTracePolicy(policy: KernelLibraryTracePolicy): KernelLibraryTracePolicy {
  return {
    spanPrefix: `${policy.library}.library`,
    summarySpanName: `${policy.library}.library.summary`,
    ...policy,
  };
}

/**
 * Creates a proxy tracer for a JavaScript library used by a kernel.
 *
 * @param options - Tracer configuration and library policy.
 * @returns A trace handle containing the proxied library and internal helpers.
 */
export function createKernelLibraryTracer<Library extends Record<PropertyKey, unknown>>(
  options: CreateKernelLibraryTracerOptions<Library>,
): KernelLibraryTraceHandle<Library> {
  if (options.mode === 'off') {
    return createOffTraceHandle(options.library);
  }

  const policy = defineLibraryTracePolicy(options.policy);
  const proxyToRaw = new WeakMap<TraceableTarget, TraceableTarget>();
  const rawToProxy = new WeakMap<TraceableTarget, TraceableTarget>();
  const summary = new Map<string, CallStats>();
  let activeScope = options.defaultScope ?? 'kernel-setup';

  const unwrap = <T>(value: T): T => unwrapValue(value, proxyToRaw);

  const shouldWrap = (value: unknown, memberPath: string): boolean => {
    if (!isWrappableValue(value)) {
      return false;
    }

    if (memberPath === policy.library) {
      return true;
    }

    return policy.shouldWrapValue?.({ library: policy.library, scope: activeScope, memberPath, value }) ?? true;
  };

  const wrapValue = <T>(value: T, memberPath: string): T => {
    if (!shouldWrap(value, memberPath)) {
      return value;
    }

    const rawTarget = value as TraceableTarget;
    const cached = rawToProxy.get(rawTarget);
    if (cached) {
      return cached as T;
    }

    const proxy = new Proxy(rawTarget, {
      get(target, property) {
        if (typeof property === 'symbol') {
          return Reflect.get(target, property, target) as unknown;
        }

        if (property === 'then') {
          return Reflect.get(target, property, target) as unknown;
        }

        const propertyValue: unknown = Reflect.get(target, property, target);
        return wrapValue(propertyValue, appendMemberPath(memberPath, property));
      },
      apply(target, thisArgument, args) {
        return traceCall({
          callType: 'apply',
          memberPath,
          invoke: () => Reflect.apply(target as (...args: unknown[]) => unknown, unwrap(thisArgument), unwrap(args)),
        });
      },
      construct(target, args) {
        return traceCall({
          callType: 'construct',
          memberPath,
          invoke: () => Reflect.construct(target as unknown as new (...args: unknown[]) => unknown, unwrap(args)),
        }) as Record<PropertyKey, unknown>;
      },
    });

    rawToProxy.set(rawTarget, proxy);
    proxyToRaw.set(proxy, rawTarget);
    return proxy as T;
  };

  const recordSummary = ({ operation, elapsed, failed, metrics }: SummaryRecordInput): void => {
    if (options.mode !== 'summary') {
      return;
    }

    const current = summary.get(operation) ?? { calls: 0, errors: 0, totalDuration: 0, metrics: {} };
    current.calls++;
    current.totalDuration += elapsed;
    if (failed) {
      current.errors++;
    }
    for (const [key, value] of Object.entries(metrics ?? {})) {
      current.metrics[key] = (current.metrics[key] ?? 0) + value;
    }

    summary.set(operation, current);
  };

  const traceCall = (input: {
    callType: 'apply' | 'construct';
    memberPath: string;
    invoke: () => unknown;
  }): unknown => {
    const operation = operationFromPath(input.memberPath);
    const decision = policy.traceCall({
      library: policy.library,
      scope: activeScope,
      memberPath: input.memberPath,
      operation,
      callType: input.callType,
    });

    if (decision.type === 'ignore') {
      return wrapValue(input.invoke(), input.memberPath);
    }

    const tracedOperation = decision.operation ?? operation;
    const callContext: KernelLibraryTraceCallContext = {
      library: policy.library,
      scope: activeScope,
      memberPath: input.memberPath,
      operation: tracedOperation,
      callType: input.callType,
    };
    const attributes = {
      library: callContext.library,
      scope: callContext.scope,
      memberPath: callContext.memberPath,
      operation: callContext.operation,
      callType: callContext.callType,
      ...decision.attributes,
    };
    const span =
      options.mode === 'per-call'
        ? options.tracer.startSpan(`${policy.spanPrefix}.${tracedOperation}`, attributes)
        : undefined;
    const startedAt = performance.now();

    try {
      const result = input.invoke();
      if (isPromiseLike(result)) {
        return result.then(
          (value) => {
            const elapsed = performance.now() - startedAt;
            const telemetry = extractResultTelemetry({ policy, callContext, result: value, elapsed });
            recordSummary({ operation: tracedOperation, elapsed, failed: false, metrics: telemetry?.summary });
            span?.end(telemetry?.attributes);
            return wrapValue(value, input.memberPath);
          },
          (error: unknown) => {
            recordSummary({ operation: tracedOperation, elapsed: performance.now() - startedAt, failed: true });
            span?.end();
            throw error;
          },
        );
      }

      const elapsed = performance.now() - startedAt;
      const telemetry = extractResultTelemetry({ policy, callContext, result, elapsed });
      recordSummary({ operation: tracedOperation, elapsed, failed: false, metrics: telemetry?.summary });
      span?.end(telemetry?.attributes);
      return wrapValue(result, input.memberPath);
    } catch (error) {
      recordSummary({ operation: tracedOperation, elapsed: performance.now() - startedAt, failed: true });
      span?.end();
      throw error;
    }
  };

  return {
    tracedLibrary: wrapValue(options.library, policy.library),
    runInScope<T>({ scope, operation }: KernelLibraryTraceScopeOperation<T>): T {
      const previousScope = activeScope;
      activeScope = scope;

      try {
        const result = operation();
        if (isPromiseLike(result)) {
          // oxlint-disable-next-line promise/prefer-await-to-then -- this preserves the sync return path for non-promises.
          return Promise.resolve(result).finally(() => {
            activeScope = previousScope;
          }) as T;
        }

        activeScope = previousScope;
        return result;
      } catch (error) {
        activeScope = previousScope;
        throw error;
      }
    },
    unwrap,
    emitSummary() {
      if (summary.size === 0) {
        return;
      }

      const attributes: SpanAttributes = {
        library: policy.library,
        operations: summary.size,
      };
      attributes['total.calls'] = 0;
      attributes['total.ms'] = 0;
      attributes['total.errors'] = 0;

      for (const [operation, stats] of summary) {
        attributes[`${operation}.calls`] = stats.calls;
        attributes[`${operation}.ms`] = stats.totalDuration;
        attributes[`${operation}.errors`] = stats.errors;
        for (const [key, value] of Object.entries(stats.metrics)) {
          attributes[`${operation}.${key}`] = value;
        }
        attributes['total.calls'] = Number(attributes['total.calls']) + stats.calls;
        attributes['total.ms'] = Number(attributes['total.ms']) + stats.totalDuration;
        attributes['total.errors'] = Number(attributes['total.errors']) + stats.errors;
      }

      const span = options.tracer.startSpan(policy.summarySpanName ?? `${policy.library}.library.summary`, attributes);
      span.end();
      summary.clear();
    },
  };
}

function extractResultTelemetry({
  policy,
  callContext,
  result,
  elapsed,
}: ExtractResultTelemetryInput): KernelLibraryTraceResultTelemetry | undefined {
  try {
    return policy.extractResultTelemetry?.({
      ...callContext,
      result,
      elapsed,
    });
  } catch {
    return undefined;
  }
}

function createOffTraceHandle<Library>(library: Library): KernelLibraryTraceHandle<Library> {
  return {
    tracedLibrary: library,
    runInScope<T>({ operation }: KernelLibraryTraceScopeOperation<T>): T {
      return operation();
    },
    unwrap<T>(value: T): T {
      return value;
    },
    emitSummary() {
      return undefined;
    },
  };
}

function appendMemberPath(path: string, property: string): string {
  return `${path}.${property}`;
}

function operationFromPath(path: string): string {
  const parts = path.split('.');
  return sanitizeOperation(parts.at(-1) ?? path);
}

function sanitizeOperation(operation: string): string {
  const sanitized = operation.replaceAll(/[^\w$-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'call';
}

function isPromiseLike(
  value: unknown,
): value is PromiseLike<unknown> & { finally?: (callback: () => void) => unknown } {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function isWrappableValue(value: unknown): value is TraceableTarget {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false;
  }

  if (isPromiseLike(value)) {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date || value instanceof RegExp) {
    return false;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return false;
  }

  return true;
}

function unwrapValue<T>(value: T, proxyToRaw: WeakMap<TraceableTarget, TraceableTarget>): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return value;
  }

  const raw = proxyToRaw.get(value as TraceableTarget);
  if (raw) {
    return raw as T;
  }

  if (Array.isArray(value)) {
    const arrayValue = value as unknown[];
    let changed = false;
    const next: unknown[] = [];
    for (const entry of arrayValue) {
      const unwrapped = unwrapValue(entry, proxyToRaw);
      if (unwrapped !== entry) {
        changed = true;
      }
      next.push(unwrapped);
    }
    return (changed ? next : value) as T;
  }

  if (isPlainObject(value)) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const unwrapped = unwrapValue(entry, proxyToRaw);
      changed ||= unwrapped !== entry;
      next[key] = unwrapped;
    }

    return (changed ? next : value) as T;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
