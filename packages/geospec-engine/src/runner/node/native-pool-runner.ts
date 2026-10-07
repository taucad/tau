/** Compiled GeoSpec Node pool and caller-inclusive CPU admission. @module */

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { allocateNativePoolGrants } from 'geospec/runner/native';
import { createGeoSpecPoolRunner } from '#runner/pool/pool.js';
import type {
  GeoSpecPoolHostMessage,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
  GeoSpecRunner,
} from 'geospec/runner/worker';

/**
 * The slice of `node:worker_threads`' `Worker` the pool drives.
 *
 * Declared structurally so the adapter can be exercised against a stub as well
 * as against a real thread (D-8: vitest cannot host a TypeScript worker).
 *
 * @public
 */
export type NodeWorkerLike = {
  postMessage(value: unknown): void;
  on(event: 'message', listener: (value: GeoSpecPoolWorkerMessage) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  terminate(): Promise<number> | number;
};

/**
 * Adapt a Node worker thread to the pool's host-agnostic handle.
 *
 * @param worker - The spawned worker.
 * @returns The pool handle.
 * @public
 */
export const createNodeWorkerHandle = (worker: NodeWorkerLike): GeoSpecPoolWorkerHandle => {
  let shuttingDown = false;
  let lastError: string | undefined;
  return {
    postMessage(message: GeoSpecPoolHostMessage) {
      if (message.type === 'shutdown') {
        shuttingDown = true;
      }
      worker.postMessage(message);
    },
    onMessage(listener) {
      worker.on('message', listener);
    },
    onExit(listener) {
      worker.on('error', (error: Error) => {
        lastError = error.message;
      });
      worker.on('exit', (code: number) => {
        // An exit during shutdown is the expected end of a worker's life; an
        // exit at any other time killed a shard, and the pool must hear about
        // it rather than wait forever for a reply that will not come.
        listener({
          unexpected: !shuttingDown && code !== 0,
          ...(lastError === undefined ? {} : { message: lastError }),
        });
      });
    },
    async terminate() {
      shuttingDown = true;
      await worker.terminate();
    },
  };
};

/** Options for the compiled Node pool. @public */
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
 * Create a compiled pool with one engine constructed inside each worker.
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
          {
            workerData: { projectPath: options.projectPath, grant: grants[index++] },
          },
        ) as NodeWorkerLike,
      ),
    initializeWorker: (worker) => {
      worker.postMessage({ type: 'initialize' });
    },
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
};
