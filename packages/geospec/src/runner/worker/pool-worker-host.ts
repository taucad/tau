/**
 * Pool-worker host contract (R3): the code that runs INSIDE each pool worker.
 * The host owns a worker-lifetime resource scope and cached loader, so the
 * engine provides it (D-S3); the substrate declares its options.
 *
 * @module
 */

import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from '#runner/pool/pool-messages.js';
import type { RunGeoSpecModuleOptions } from '#runner/types.js';

/**
 * Options accepted by {@link startGeoSpecPoolWorkerHost}.
 *
 * @public
 */
export type GeoSpecPoolWorkerHostOptions = {
  /** Filesystem containing the project and test modules. */
  filesystem: RunGeoSpecModuleOptions['filesystem'];
  /** Model loader exposed to authored tests through `geospec/model`. */
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  /** STEP loader exposed to authored tests through `geospec/step`. */
  stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
  /** Post a message to the pool host. */
  postMessage: (message: GeoSpecPoolWorkerMessage) => void;
  /** Subscribe to pool-host messages. */
  onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void;
  /** Sample this worker's resident memory in bytes (R15 telemetry); optional. */
  measureMemoryBytes?: () => number | undefined;
  /** Release platform resources on shutdown (after the shared scope disposes). */
  onShutdown?: () => Promise<void> | void;
};

/**
 * Start serving shards. Resolves when the host sends `shutdown`.
 *
 * @param options - Worker filesystem, loaders, and message plumbing.
 * @public
 */
export const startGeoSpecPoolWorkerHost = (options: GeoSpecPoolWorkerHostOptions): void => {
  requireRegisteredGeoSpecHostBinding<(options: GeoSpecPoolWorkerHostOptions) => void>('startGeoSpecPoolWorkerHost')(
    options,
  );
};
