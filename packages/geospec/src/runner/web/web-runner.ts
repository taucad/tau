/**
 * Browser runner contract (engine-backed host).
 *
 * @module
 */

import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/runner-types.js';

/**
 * Options accepted by {@link createGeoSpecWebRunner}.
 *
 * @public
 */
export type GeoSpecWebRunnerOptions = GeoSpecRunnerOptions;

/**
 * Create a GeoSpec runner for browser environments.
 *
 * The public surface intentionally hides worker and MessagePort primitives.
 * Applications provide filesystem and loader capabilities, and the runner
 * returns compact results suitable for UI and agent RPC consumption.
 *
 * @param options - Filesystem, project root, loaders, and lifecycle event hook.
 * @returns A runner with `run`, `abort`, and `close` lifecycle methods.
 * @public
 */
export const createGeoSpecWebRunner = (options: GeoSpecWebRunnerOptions): GeoSpecRunner =>
  requireRegisteredGeoSpecHostBinding<(options: GeoSpecWebRunnerOptions) => GeoSpecRunner>('createGeoSpecWebRunner')(
    options,
  );
