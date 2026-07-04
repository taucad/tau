/**
 * Embedded GeoSpec runner APIs.
 *
 * @module
 */

export { GeoSpecAssertionError } from '#runner/collector.js';
export {
  compileGeoSpecTestNamePattern,
  filterGeoSpecTests,
  matchesGeoSpecTestName,
  type GeoSpecTestNamePattern,
} from '#runner/filter.js';
export {
  defaultGeoSpecIgnoredDirectories,
  defaultGeoSpecInclude,
  discoverGeoSpecFiles,
  isGeoSpecTestFile,
} from '#runner/discovery.js';
export { runGeoSpecModule } from '#runner/run-geospec-module.js';
export type {
  DiscoverGeoSpecFilesOptions,
  GeoSpecDiscoveryFileKind,
  GeoSpecDiscoveryFileStat,
  GeoSpecDiscoveryFileSystem,
  GeoSpecDiscoveryResult,
} from '#runner/discovery.js';
export type {
  GeoSpecAssertion,
  GeoSpecAssemblyOccurrenceExpectation,
  GeoSpecAssemblyOccurrencesExpectation,
  GeoSpecAxisExpectation,
  GeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation,
  GeoSpecChamferDistanceExpectation,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation,
  GeoSpecCircularHolePatternExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecComponentInterferenceAllowance,
  GeoSpecComponentInterferenceExpectation,
  GeoSpecComponentInterferencePairExpectation,
  GeoSpecConnectedComponentsExpectation,
  GeoSpecGeometrySelector,
  GeoSpecFilletFeatureExpectation,
  GeoSpecMassExpectation,
  GeoSpecMatcher,
  GeoSpecMeshIntegrityExpectation,
  GeoSpecMinimumDistanceExpectation,
  GeoSpecMinimumWallThicknessExpectation,
  GeoSpecNumericExpectation,
  GeoSpecPlanarFaceExpectation,
  GeoSpecPointExpectation,
  GeoSpecProductStructureExpectation,
  GeoSpecRunFailure,
  GeoSpecRunResult,
  GeoSpecRunSuccess,
  GeoSpecSpatialRelationshipExpectation,
  GeoSpecSpatialRelationshipsExpectation,
  GeoSpecStepUnitsExpectation,
  GeoSpecSurfaceAreaExpectation,
  GeoSpecTestCase,
  GeoSpecTestStatus,
  GeoSpecTopologyCountsExpectation,
  GeoSpecValidBrepExpectation,
  GeoSpecVolumeExpectation,
  RunGeoSpecModuleOptions,
} from '#runner/types.js';
