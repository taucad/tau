/**
 * Browser worker-pool GeoSpec runner (R3, cross-platform matrix): the same
 * host-agnostic pool over Web Workers. The application supplies the worker
 * factory — its worker script builds its own filesystem/loaders and calls
 * `startGeoSpecPoolWorkerHost` (the seam the worker-runner blueprint left
 * open). Sizing uses `navigator.hardwareConcurrency` capped at 4 with a
 * device-memory guard; heavyweight GLB-class shards are throttled by the
 * same memory-class cap (Node/CI remains their primary home).
 */

import { createGeoSpecPoolRunner } from '#runner/pool/pool-runner.js';
import type { GeoSpecPoolWorkerHandle, GeoSpecPoolWorkerMessage } from '#runner/pool/pool-messages.js';
import type { GeoSpecRunner, GeoSpecRunnerEvent } from '#runner/worker/runner-types.js';

/** Minimal structural Worker view (avoids requiring DOM lib types). */
type WebWorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void;
  terminate(): void;
};

/**
 * Options for creating a browser pool runner.
 *
 * @public
 */
export type GeoSpecWebPoolRunnerOptions = {
  /**
   * Spawn one pool worker whose script calls `startGeoSpecPoolWorkerHost`
   * with the application's filesystem and loaders.
   */
  createWorker: () => WebWorkerLike | Promise<WebWorkerLike>;
  /** Worker count; omit for `min(shards, hardwareConcurrency − 2, 4)`. */
  workers?: number;
  /** Observe lifecycle events. */
  onEvent?: (event: GeoSpecRunnerEvent) => void;
  /** Per-shard non-verdict watchdog override, milliseconds (R11). */
  shardTimeout?: number;
};

/** Hard ceiling for browser pools (matrix: `min(hc − 2, 4)`). */
const webPoolCeiling = 4;

const wrapWebWorker = (worker: WebWorkerLike): GeoSpecPoolWorkerHandle => ({
  postMessage(message) {
    worker.postMessage(message);
  },
  onMessage(listener) {
    worker.addEventListener('message', (event) => {
      listener(event.data as GeoSpecPoolWorkerMessage);
    });
  },
  onExit(listener) {
    // Browsers have no worker exit event; a script error is the crash signal.
    worker.addEventListener('error', (event) => {
      listener({ unexpected: true, message: event.message });
    });
  },
  terminate() {
    worker.terminate();
  },
});

const webAvailableParallelism = (): number => {
  const hardwareConcurrency =
    typeof navigator === 'undefined' ? undefined : (navigator as { hardwareConcurrency?: number }).hardwareConcurrency;
  return Math.min(Math.max(1, (hardwareConcurrency ?? 4) - 2) + 2, webPoolCeiling + 2);
};

const webAvailableMemoryBytes = (): number => {
  // `deviceMemory` is Chromium-only; assume a conservative 8 GB class otherwise.
  const deviceMemoryGb =
    typeof navigator === 'undefined' ? undefined : (navigator as { deviceMemory?: number }).deviceMemory;
  return (deviceMemoryGb ?? 8) * 1024 ** 3;
};

/**
 * Create a worker-pool GeoSpec runner for browser environments (R3).
 *
 * @public
 */
export const createGeoSpecWebPoolRunner = (options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner =>
  createGeoSpecPoolRunner({
    spawnWorker: async () => wrapWebWorker(await options.createWorker()),
    workers: options.workers,
    availableParallelism: webAvailableParallelism(),
    availableMemoryBytes: webAvailableMemoryBytes(),
    fileLabel: (file) => file,
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
