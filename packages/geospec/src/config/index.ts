/* oxlint-disable no-barrel-files/no-barrel-files -- Public portable configuration and Tau artifact adapter. */
/** Portable configuration and Tau artifact helpers; the native loader is in config/node. @module */

export { exportTauProjectArtifact } from '#config/tau-project-artifact.js';

export type {
  ExportTauProjectArtifactOptions,
  GeoSpecTauProjectArtifact,
  GeoSpecTauProjectRuntime,
} from '#config/tau-project-artifact.js';
export type {
  GeoSpecConfig,
  GeoSpecTauProjectDescriptor,
  LoadedGeoSpecConfig,
  LoadGeoSpecConfigOptions,
} from '#config/types.js';
