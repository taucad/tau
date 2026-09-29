/* oxlint-disable no-barrel-files/no-barrel-files -- public Vitest integration subpath */
/** Vitest adapter for runner-independent GeoSpec assertions. @module */

export {
  createGeoSpecVitestAdapter,
  installGeoSpecVitest,
  setupGeoSpecVitest,
  type GeoSpecVitestAdapter,
} from '#vitest/adapter.js';
export type { GeoSpecAssertionClient, GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
