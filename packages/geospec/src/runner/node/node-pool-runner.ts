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
  /** Compiled worker count; defaults to one, within the caller-inclusive host cap. */
  workers?: number;
  /** Per-shard non-verdict watchdog override, milliseconds (R11). */
  shardTimeout?: number;
  /** Persistent reference-engine evidence caching is unsupported; omit or use false. True is refused. */
  cache?: boolean;
  /** Reference-engine cache directories are unsupported and refused when supplied. */
  cacheDirectory?: string;
  /** Reference-engine runtime factories are unsupported and refused when supplied. */
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
