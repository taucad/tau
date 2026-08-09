/**
 * Node worker-pool GeoSpec runner (R3): `worker_threads` host behind the
 * public `GeoSpecRunner` contract. Sizing is container-correct (R15):
 * cgroup-aware CPU via `availableParallelism()`, memory via
 * `constrainedMemory()` (total RAM when unconstrained), per-worker
 * `resourceLimits` so a runaway shard dies as a contained, structured shard
 * failure instead of taking the host process with it.
 */

import { availableParallelism, totalmem } from 'node:os';
import { relative, isAbsolute } from 'node:path';
import { Worker } from 'node:worker_threads';
import { readGeoSpecTimings } from '#cache/timings.js';
import { createGeoSpecPoolRunner } from '#runner/pool/pool-runner.js';
import type { GeoSpecPoolWorkerHandle, GeoSpecPoolWorkerMessage } from '#runner/pool/pool-messages.js';
import type { GeoSpecRunner, GeoSpecRunnerEvent } from '#runner/worker/runner-types.js';

/**
 * Options for creating a Node pool runner. Unlike the serial runner, workers
 * self-provision filesystem and loaders from `projectPath` — the pool host
 * carries no capability objects across the wire.
 *
 * @public
 */
export type GeoSpecNodePoolRunnerOptions = {
  /** Absolute project root path. */
  projectPath: string;
  /** Worker count; omit for auto-sizing (`min(shards, cpus − 2, mem/3.5 GiB)`). */
  workers?: number;
  /** Observe lifecycle events (streamed as shards progress). */
  onEvent?: (event: GeoSpecRunnerEvent) => void;
  /** Per-shard non-verdict watchdog override, milliseconds (R11). */
  shardTimeout?: number;
};

/** JS old-generation ceiling per worker (MB); wasm/typed-array memory lives outside it. */
const defaultWorkerMaxOldGenerationSizeMb = 4096;

const resolveWorkerMaxOldGenerationSizeMb = (): number => {
  const raw = Number(process.env['GEOSPEC_WORKER_MAX_OLD_GEN_MB']);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultWorkerMaxOldGenerationSizeMb;
};

/** Memory budget: cgroup limit when constrained, machine RAM otherwise (R15). */
const resolveAvailableMemoryBytes = (): number => {
  const constrained = process.constrainedMemory();
  return constrained > 0 ? constrained : totalmem();
};

const workerEntryUrl = (): URL =>
  // Under tsx/vitest this module is source (.ts) and workers inherit the
  // loader through execArgv; under a compiled dist it resolves to .js.
  new URL(import.meta.url.endsWith('.ts') ? './pool-worker-entry.ts' : './pool-worker-entry.js', import.meta.url);

const spawnNodePoolWorker = (projectPath: string): GeoSpecPoolWorkerHandle => {
  const worker = new Worker(workerEntryUrl(), {
    workerData: { projectPath },
    execArgv: process.execArgv,
    resourceLimits: { maxOldGenerationSizeMb: resolveWorkerMaxOldGenerationSizeMb() },
  });
  let terminating = false;
  return {
    postMessage(message) {
      worker.postMessage(message);
    },
    onMessage(listener) {
      worker.on('message', (message: GeoSpecPoolWorkerMessage) => {
        listener(message);
      });
    },
    onExit(listener) {
      worker.on('exit', (code) => {
        listener({ unexpected: !terminating && code !== 0, message: `worker exited with code ${code}` });
      });
      worker.on('error', (error) => {
        listener({ unexpected: !terminating, message: error.message });
      });
    },
    async terminate() {
      terminating = true;
      await worker.terminate();
    },
  };
};

/**
 * Create a worker-pool GeoSpec runner for Node.js and CLI environments (R3).
 * Produces the same aggregate contract as the serial runner; verdicts are
 * identical at any worker count (R13), only durations differ.
 *
 * @public
 */
export const createGeoSpecNodePoolRunner = (options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner =>
  createGeoSpecPoolRunner({
    readTimings: async () => readGeoSpecTimings(options.projectPath),
    spawnWorker: () => spawnNodePoolWorker(options.projectPath),
    workers: options.workers,
    availableParallelism: availableParallelism(),
    availableMemoryBytes: resolveAvailableMemoryBytes(),
    fileLabel: (file) => (isAbsolute(file) ? relative(options.projectPath, file) : file),
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
