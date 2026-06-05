import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/index.js';

/**
 * Options for creating a browser GeoSpec runner.
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
 *
 * @public
 */
export const createGeoSpecWebRunner = (options: GeoSpecWebRunnerOptions): GeoSpecRunner =>
  createSerialGeoSpecRunner(options);
