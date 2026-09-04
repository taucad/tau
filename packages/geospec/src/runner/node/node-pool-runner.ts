/**
 * Node pool-runner contract (engine-backed host).
 *
 * @module
 */

import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeoSpecRunner } from '#runner/worker/runner-types.js';

/**
 * Options accepted by {@link createGeoSpecNodePoolRunner}.
 *
 * @public
 */
export type GeoSpecNodePoolRunnerOptions = {
  /** Absolute project root path. */
  projectPath: string;
  /** Worker count; omit for auto-sizing (`min(shards, cpus − 2, mem/3.5 GiB)`). */
  workers?: number;
  /** Per-shard non-verdict watchdog override, milliseconds (R11). */
  shardTimeout?: number;
  /** Enable the authenticated persistent evidence cache. Defaults to true. */
  cache?: boolean;
  /** Absolute out-of-tree evidence-cache directory used by every worker. */
  cacheDirectory?: string;
  /** Node module exporting the runtime factory every worker should use. */
  runtimeFactoryModule?: {
    /** Absolute URL or resolvable Node module specifier. */
    specifier: string;
    /** Named export with signature `(projectPath: string) => Promise<GeoSpecRuntimeClient>`. */
    exportName: string;
  };
};

/**
 * Create a worker-pool GeoSpec runner for Node.js.
 *
 * @param options - Project root, worker count, watchdog, and cache controls.
 * @returns A runner with `run`, `abort`, and `close` lifecycle methods.
 * @public
 */
export const createGeoSpecNodePoolRunner = (options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner =>
  requireRegisteredGeoSpecHostBinding<(options: GeoSpecNodePoolRunnerOptions) => GeoSpecRunner>(
    'createGeoSpecNodePoolRunner',
  )(options);
