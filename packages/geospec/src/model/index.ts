/**
 * CAD model loading helpers.
 *
 * @module
 */

export { GeoSpecModelLoadError } from '#model/errors.js';
export { createModelLoader, loadModel } from '#model/load-model.js';
export type { GeoSpecSubject } from '#model/subject.js';
export { geoSpecMeshEvidenceMatchers } from '#model/mesh-evidence-matchers.js';
export { geoSpecRegionScopedKinds, geoSpecRegionWholeModelClaimCode } from '#model/region-scope.js';
export type {
  CreateModelLoaderOptions,
  GeoSpecExporterCapabilities,
  GeoSpecExportFormat,
  GeoSpecLoadRegion,
  GeoSpecModelArtifact,
  GeoSpecModelExporter,
  GeoSpecModelExportRequest,
  GeoSpecModelFormat,
  GeoSpecModelLoader,
  ManagedGeoSpecModelLoader,
  GeoSpecConsumedSources,
  LoadModelCodeOptions,
  LoadModelFileOptions,
  LoadModelOptions,
  LoadModelSourceOptions,
} from '#model/types.js';
