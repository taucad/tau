/**
 * Embedded GeoSpec runner APIs.
 *
 * @module
 */

export { GeoSpecAssertionError, clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
export { chargeBudget, checkBudget } from '#runner/matcher-budget.js';
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
