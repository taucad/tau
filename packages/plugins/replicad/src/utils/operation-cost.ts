/**
 * Replicad operation cost (audit R18, F43): the time each kind of library operation took in one build, measured
 * where the live tier computes it, so an agent can see which upstream code is expensive.
 *
 * The meter wraps the operation cache the live tier installs and times only `compute`, which the tier calls for an
 * operation it cannot reuse; a reused operation costs nothing and is not counted. Times are inclusive: a user
 * callback that a library operation runs (a sweep factory) counts in that operation and in its own operations. With
 * the live tier off nothing is installed, so nothing is measured (I2).
 *
 * @internal
 */
import type { OperationCache } from 'replicad';
import type { KernelBuildReport, OperationCost } from '@taucad/runtime/kernel';

/** One build's operation meter. @internal */
export type OperationMeter = {
  /** The cache to install in place of the one it wraps. */
  readonly cache: OperationCache;
  /**
   * The costliest kinds of operation so far, costliest first.
   * @param limit - Kinds reported at most.
   */
  costliest(limit: number): OperationCost[];
};

/**
 * Wrap an operation cache with a meter.
 * @param inner - The cache the live tier would install.
 * @returns The meter.
 * @internal
 */
export const meterOperations = (inner: OperationCache): OperationMeter => {
  const totals = new Map<string, { elapsed: number; calls: number }>();
  const record = (operation: string, elapsed: number): void => {
    const total = totals.get(operation);
    if (total) {
      total.elapsed += elapsed;
      total.calls += 1;
    } else {
      totals.set(operation, { elapsed, calls: 1 });
    }
  };
  return {
    cache: {
      operation(request) {
        // The library hands every call a request of its own, so its `compute` is replaced in place: copying the
        // request on every call, reused ones included, costs an edit tens of milliseconds (I7).
        const { op, compute } = request;
        request.compute = () => {
          const started = performance.now();
          try {
            return compute();
          } finally {
            record(op, performance.now() - started);
          }
        };
        return inner.operation(request);
      },
      step: (request) => inner.step(request),
      elements: (...input) => {
        inner.elements(...input);
      },
    },
    costliest(limit) {
      return [...totals]
        .map(([operation, { elapsed, calls }]) => ({ operation, elapsed: Math.round(elapsed * 10) / 10, calls }))
        .sort((left, right) => right.elapsed - left.elapsed)
        .slice(0, limit);
    },
  };
};

/** What a build's report reads from the live tier: its counters after the build ended. @internal */
type TierCounters = { stats(): { calls: number; hits: number } };

/**
 * The kernel's build report for a build that ran with the live tier: the operations the tier reused and computed,
 * read once the build ended, and the costliest computed ones.
 * @param tier - The document's operation tier.
 * @param meter - The build's meter.
 * @returns The report.
 * @internal
 */
export const tierBuildReport = (tier: TierCounters, meter: OperationMeter | undefined): KernelBuildReport => {
  const { calls, hits } = tier.stats();
  return {
    operations: { reused: hits, computed: Math.max(0, calls - hits) },
    ...(meter === undefined ? {} : { costliest: meter.costliest(3) }),
  };
};
