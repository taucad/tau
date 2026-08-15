/**
 * Node runner contract (engine-backed host).
 *
 * @module
 */

import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/runner-types.js';

/**
 * Options accepted by {@link createGeoSpecNodeRunner}.
 *
 * @public
 */
export type GeoSpecNodeRunnerOptions = GeoSpecRunnerOptions & {
  /** Absolute project root path. */
  projectPath: string;
  /** Enable the authenticated persistent evidence cache. Defaults to true. */
  cache?: boolean;
  /** Absolute out-of-tree evidence-cache directory. */
  cacheDirectory?: string;
};

/**
 * Create a GeoSpec runner for Node.js and CLI environments.
 *
 * @param options - Filesystem, project root, loaders, and cache controls.
 * @returns A runner with `run`, `abort`, and `close` lifecycle methods.
 * @public
 */
export const createGeoSpecNodeRunner = (options: GeoSpecNodeRunnerOptions): GeoSpecRunner =>
  requireRegisteredGeoSpecHostBinding<(options: GeoSpecNodeRunnerOptions) => GeoSpecRunner>('createGeoSpecNodeRunner')(
    options,
  );
