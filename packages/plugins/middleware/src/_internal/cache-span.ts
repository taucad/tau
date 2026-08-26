import type { RuntimeSpanTracer } from '@taucad/runtime/types';

/**
 * Trace one cache operation and close its span on success or failure.
 *
 * @param tracer - Runtime tracer that owns the cache span.
 * @param name - Stable telemetry span name.
 * @param operation - Cache operation to measure.
 * @returns The operation result.
 */
export const traceCacheOperation = async <T>(
  tracer: RuntimeSpanTracer,
  name: string,
  operation: () => T | Promise<T>,
): Promise<T> => {
  const span = tracer.startSpan(name);
  try {
    return await operation();
  } finally {
    span.end();
  }
};
