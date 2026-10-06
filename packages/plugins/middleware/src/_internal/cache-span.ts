import type { ComputeEvaluationResult } from '@taucad/cache-core';
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
  operation: () => ComputeEvaluationResult<T> | Promise<ComputeEvaluationResult<T>>,
): Promise<ComputeEvaluationResult<T>> => {
  const span = tracer.startSpan(name);
  let attributes: Record<string, string | number | boolean> | undefined;
  try {
    const result = await operation();
    attributes = {
      source: result.source,
      actionDigest: result.actionDigest,
      ...(result.source === 'cache'
        ? { contentDigest: result.contentDigest }
        : {
            publicationStatus: result.publication.status,
            ...(result.publication.status === 'stored'
              ? { contentDigest: result.publication.contentDigest }
              : { publicationReason: result.publication.reason }),
          }),
    };
    return result;
  } finally {
    span.end(attributes);
  }
};
