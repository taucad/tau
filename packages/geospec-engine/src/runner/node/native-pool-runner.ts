/** Distinct opt-in protocol-3 native Node pool. @module */

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { allocateNativePoolGrants } from 'geospec/runner/native';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import { createNodeWorkerHandle } from '#runner/node/node-runner.js';
import type { NodeWorkerLike } from '#runner/node/node-runner.js';
import { createGeoSpecPoolRunner } from '#runner/pool/pool.js';

/** Options for the opt-in native Node pool. @public */
export type GeoSpecNativeNodePoolOptions = {
  /** Absolute project root. */
  projectPath: string;
  /** Number of outer worker isolates; defaults to one. */
  workers?: number;
  /**
   * Caller-inclusive total CPU budget; defaults to one per worker. Above one
   * permit per worker only with a single worker: every worker shares this
   * process's OCCT library, whose admission refuses any second engine beside
   * one holding two or more permits.
   */
  budget?: number;
  /** Non-verdict shard watchdog in milliseconds. */
  shardTimeout?: number;
};

/**
 * Create an opt-in native pool with one engine constructed inside each worker.
 *
 * Workers are threads of this process and share one OCCT library instance and
 * pool width, so inner parallelism is all-or-nothing: either several workers
 * with one permit each, or one worker holding the whole budget. A budget above
 * the worker count with more than one worker is refused before any worker
 * starts rather than silently run serial.
 *
 * @param options - Project, outer workers, and caller-inclusive CPU budget.
 * @returns A pooled GeoSpec runner.
 * @throws RangeError When the budget is invalid, exceeds the host cap, or
 *   gives any of several in-process workers more than one permit.
 * @public
 */
export const createGeoSpecNativeNodePoolRunner = (options: GeoSpecNativeNodePoolOptions): GeoSpecRunner => {
  const workers = options.workers ?? 1;
  if (workers > 1 && options.budget !== undefined && options.budget > workers) {
    throw new RangeError(
      'Native pool workers share one process OCCT library: a budget above one permit per worker requires workers: 1.',
    );
  }
  const grants = allocateNativePoolGrants({
    workers,
    hostCap: availableParallelism(),
    ...(options.budget === undefined ? {} : { budget: options.budget }),
  });
  let index = 0;
  return createGeoSpecPoolRunner({
    workers,
    gracefulShutdown: true,
    createWorker: () =>
      createNodeWorkerHandle(
        new Worker(
          new URL(
            import.meta.url.endsWith('.ts') ? './native-pool-worker-entry.ts' : './native-pool-worker-entry.mjs',
            import.meta.url,
          ),
          { workerData: { projectPath: options.projectPath, grant: grants[index++] } },
        ) as NodeWorkerLike,
      ),
    initializeWorker: (worker) => {
      worker.postMessage({ type: 'initialize' });
    },
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
};
