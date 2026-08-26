/**
 * Side-effect entry point for Node hosts: installs everything
 * `@taucad/geospec-engine/register` installs, plus the capabilities that need a
 * Node runtime.
 *
 * ```typescript
 * import '@taucad/geospec-engine/register/node';
 * ```
 *
 * The split is a bundling contract, not a feature flag. A browser bundler
 * resolves the whole graph it can reach, so the filesystem evidence store, the
 * `worker_threads` pool runner, and the Node VM filesystem must not be
 * reachable from the neutral entry — they live here, where only a Node host
 * ever imports them. A browser build reports their absence honestly through
 * capability discovery (D-S0).
 *
 * @module
 */

import { registerGeoSpecEngine } from 'geospec/engine';
import type { GeoSpecEngineImplementation } from 'geospec/engine';
import { ensureNodeEvidenceStoreInstalled } from '#cache/node-evidence-store.js';
import { createGeoSpecNodePoolRunner, createGeoSpecNodeRunner } from '#runner/node/node-runner.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { geoSpecEngineImplementation } from '#register.js';

/**
 * The neutral build plus the Node hosts.
 *
 * @public
 */
export const geoSpecNodeEngineImplementation: GeoSpecEngineImplementation = {
  ...geoSpecEngineImplementation,
  host: {
    ...geoSpecEngineImplementation.host,
    createNodeVmFileSystem,
    createGeoSpecNodeRunner,
    createGeoSpecNodePoolRunner,
  },
};

// A node host persists evidence by default; the cache root never sits inside
// the project tree. Node runner factories may disable it explicitly.
ensureNodeEvidenceStoreInstalled();
registerGeoSpecEngine(geoSpecNodeEngineImplementation);
