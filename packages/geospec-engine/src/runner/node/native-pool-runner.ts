/* oxlint-disable no-barrel-files/no-barrel-files -- Compatibility re-export until this package is removed. */
/**
 * Compatibility entry until this package is removed: the `geospec` Node pool with Tau's default exporter in every
 * worker.
 *
 * @module
 */

import { createGeoSpecNodePoolRunner } from 'geospec/runner/node';
import type { GeoSpecNodePoolOptions } from 'geospec/runner/node';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import { defaultExporterModule } from '#model/default-exporter.js';

export { createNodeWorkerHandle } from 'geospec/runner/node';
export type { NodeWorkerLike } from 'geospec/runner/node';

/** Options for the compiled Node pool. @public */
export type GeoSpecNativeNodePoolOptions = Omit<GeoSpecNodePoolOptions, 'exporterModules'>;

/**
 * Create the `geospec` Node pool with Tau's default exporter ahead of the project config's exporters.
 *
 * @param options - Project, config, outer workers, and caller-inclusive CPU budget.
 * @returns A pooled GeoSpec runner.
 * @throws RangeError When the budget is invalid, exceeds the host cap, or
 *   gives any of several in-process workers more than one permit.
 * @public
 */
export const createGeoSpecNativeNodePoolRunner = (options: GeoSpecNativeNodePoolOptions): GeoSpecRunner =>
  createGeoSpecNodePoolRunner({ ...options, exporterModules: [defaultExporterModule] });
