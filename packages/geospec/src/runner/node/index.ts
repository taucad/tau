import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/index.js';

/**
 * Options for creating a Node GeoSpec runner.
 *
 * @public
 */
export type GeoSpecNodeRunnerOptions = GeoSpecRunnerOptions;

/**
 * Create a GeoSpec runner for Node.js and CLI environments.
 *
 * The returned runner uses the same compact result contract as the browser
 * runner and executes CAD tests serially for deterministic geometry evidence.
 *
 * @param options - Filesystem, project root, loaders, and lifecycle event hook.
 * @returns A runner with `run`, `abort`, and `close` lifecycle methods.
 *
 * @public
 */
export const createGeoSpecNodeRunner = (options: GeoSpecNodeRunnerOptions): GeoSpecRunner =>
  createSerialGeoSpecRunner(options);
