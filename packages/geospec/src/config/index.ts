/* oxlint-disable no-barrel-files/no-barrel-files -- Public portable configuration entry point. */
/** Portable configuration: types, `defineConfig` and the spec-VM reader; the native loader is in config/node. @module */

export { defineConfig } from '#config/define-config.js';
export { readGeoSpecConfig } from '#config/read-geospec-config.js';
export type { ReadGeoSpecConfigOptions, ReadGeoSpecConfigResult } from '#config/read-geospec-config.js';
export type { GeoSpecConfig, GeoSpecConfigData, LoadedGeoSpecConfig, LoadGeoSpecConfigOptions } from '#config/types.js';
