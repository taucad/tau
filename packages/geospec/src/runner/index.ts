/**
 * Embedded GeoSpec runner APIs.
 *
 * @module
 */

export { runGeoSpecModule } from '#runner/run-geospec-module.js';
export type {
  GeoSpecAssertion,
  GeoSpecAxisExpectation,
  GeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation,
  GeoSpecChamferDistanceExpectation,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecConnectedComponentsExpectation,
  GeoSpecMassExpectation,
  GeoSpecMatcher,
  GeoSpecMinimumWallThicknessExpectation,
  GeoSpecNumericExpectation,
  GeoSpecPlanarFaceExpectation,
  GeoSpecPointExpectation,
  GeoSpecRunFailure,
  GeoSpecRunResult,
  GeoSpecRunSuccess,
  GeoSpecSurfaceAreaExpectation,
  GeoSpecTestCase,
  GeoSpecTestStatus,
  GeoSpecVolumeExpectation,
  RunGeoSpecModuleOptions,
} from '#runner/types.js';
