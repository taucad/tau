/** Deterministic caller-inclusive permits for an opt-in native worker pool. @module */

/**
 * Assign a bounded CPU budget across already-selected worker isolates.
 * The omitted budget is one permit per worker. A native pool must pass each
 * returned grant to the engine it constructs inside the corresponding worker.
 * A grant above one is admissible only for an engine with its own OCCT
 * library instance: native workers that are threads of one process share one,
 * so such a pool must use one worker or one permit per worker.
 *
 * @param options - Worker count, optional total budget, and host CPU cap.
 * @returns Grants in worker creation order.
 * @public
 */
export const allocateNativePoolGrants = (options: {
  workers: number;
  budget?: number;
  hostCap: number;
}): readonly number[] => {
  const { workers, hostCap } = options;
  const budget = options.budget ?? workers;
  if (
    !Number.isSafeInteger(workers) ||
    !Number.isSafeInteger(budget) ||
    !Number.isSafeInteger(hostCap) ||
    workers < 1 ||
    budget < workers ||
    budget > hostCap
  ) {
    throw new RangeError(
      'Native pool requires positive workers and a caller-inclusive budget between workers and the host cap.',
    );
  }
  const perWorker = Math.floor(budget / workers);
  const remainder = budget % workers;
  return Array.from({ length: workers }, (_, index) => perWorker + (index < remainder ? 1 : 0));
};
