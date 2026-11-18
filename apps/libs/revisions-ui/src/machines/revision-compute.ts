/**
 * The file-manager worker's one compute worker for its revision stores
 * (charter D7), shared by every project it opens.
 *
 * A browser that cannot start a worker from inside a worker runs the same
 * work inline, which is also where calls go once the supervisor stops
 * restarting a worker that keeps dying. A crash fails the calls in flight
 * with a typed error that the pack reader never takes for corrupt bytes.
 */

import { createInlineCompute, createSupervisedComputeWorker } from '@taucad/revisions';
import type { ComputeCrashReport, ComputeWorker } from '@taucad/revisions';

/**
 * Build the compute the revision ports share.
 *
 * @param onCrash - Told of each worker death, for telemetry.
 * @returns A supervised worker, or the inline compute where workers cannot start.
 */
export const createRevisionCompute = (onCrash?: (report: ComputeCrashReport) => void): ComputeWorker => {
  const inline = createInlineCompute();
  if (typeof Worker !== 'function') {
    return inline;
  }
  return createSupervisedComputeWorker({
    spawn: () =>
      new Worker(new URL('revision-compute.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tau-revision-compute',
      }),
    fallback: inline,
    onCrash,
  });
};
