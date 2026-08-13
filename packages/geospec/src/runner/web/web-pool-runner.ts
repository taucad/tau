/**
 * Browser pool-runner contract (engine-backed host).
 *
 * @module
 */

import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeoSpecPoolWorkerMessage } from '#runner/pool/pool-messages.js';
import type { GeoSpecRunner } from '#runner/worker/runner-types.js';

/**
 * The subset of the browser `Worker` API the pool runner drives.
 *
 * @public
 */
export type WebWorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: GeoSpecPoolWorkerMessage }) => void): void;
  terminate(): void;
};

/**
 * Options accepted by {@link createGeoSpecWebPoolRunner}.
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
  /** Per-shard non-verdict watchdog override, milliseconds (R11). */
  shardTimeout?: number;
};

/**
 * Create a worker-pool GeoSpec runner for browser environments.
 *
 * @param options - Worker factory, worker count, and lifecycle event hook.
 * @returns A runner with `run`, `abort`, and `close` lifecycle methods.
 * @public
 */
export const createGeoSpecWebPoolRunner = (options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner =>
  requireRegisteredGeoSpecHostBinding<(options: GeoSpecWebPoolRunnerOptions) => GeoSpecRunner>(
    'createGeoSpecWebPoolRunner',
  )(options);
