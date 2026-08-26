/**
 * Engine-side runner vocabulary: the substrate's expectation shapes
 * re-published under the engine's own `#runner/*` paths.
 *
 * Matcher expectations are DSL surface (substrate); the engine only consumes
 * them. These aliases keep engine modules and the migrated oracle suites on a
 * single specifier.
 *
 * @module
 */

import type {
  GeoSpecAssertion as SubstrateGeoSpecAssertion,
  GeoSpecAssemblyOccurrenceExpectation as SubstrateGeoSpecAssemblyOccurrenceExpectation,
  GeoSpecAssemblyOccurrencesExpectation as SubstrateGeoSpecAssemblyOccurrencesExpectation,
  GeoSpecAxisExpectation as SubstrateGeoSpecAxisExpectation,
  GeoSpecBoundingBoxExpectation as SubstrateGeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation as SubstrateGeoSpecCenterOfMassExpectation,
  GeoSpecChamferFeatureExpectation as SubstrateGeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation as SubstrateGeoSpecCircularHoleExpectation,
  GeoSpecCircularHolePatternExpectation as SubstrateGeoSpecCircularHolePatternExpectation,
  GeoSpecComponentInterferenceAllowance as SubstrateGeoSpecComponentInterferenceAllowance,
  GeoSpecComponentInterferenceExpectation as SubstrateGeoSpecComponentInterferenceExpectation,
  GeoSpecConnectedComponentsExpectation as SubstrateGeoSpecConnectedComponentsExpectation,
  GeoSpecCylindricalFaceExpectation as SubstrateGeoSpecCylindricalFaceExpectation,
  GeoSpecFilletFeatureExpectation as SubstrateGeoSpecFilletFeatureExpectation,
  GeoSpecMassExpectation as SubstrateGeoSpecMassExpectation,
  GeoSpecMeshIntegrityExpectation as SubstrateGeoSpecMeshIntegrityExpectation,
  GeoSpecMinimumWallThicknessExpectation as SubstrateGeoSpecMinimumWallThicknessExpectation,
  GeoSpecNumericExpectation as SubstrateGeoSpecNumericExpectation,
  GeoSpecPlanarFaceExpectation as SubstrateGeoSpecPlanarFaceExpectation,
  GeoSpecPointExpectation as SubstrateGeoSpecPointExpectation,
  GeoSpecProductStructureExpectation as SubstrateGeoSpecProductStructureExpectation,
  GeoSpecStepUnitsExpectation as SubstrateGeoSpecStepUnitsExpectation,
  GeoSpecSurfaceAreaExpectation as SubstrateGeoSpecSurfaceAreaExpectation,
  GeoSpecTopologyCountsExpectation as SubstrateGeoSpecTopologyCountsExpectation,
  GeoSpecValidBrepExpectation as SubstrateGeoSpecValidBrepExpectation,
  GeoSpecVolumeExpectation as SubstrateGeoSpecVolumeExpectation,
  GeoSpecGeometrySelector as SubstrateGeoSpecGeometrySelector,
  GeoSpecMatcher as SubstrateGeoSpecMatcher,
  GeoSpecSpatialRelationshipExpectation as SubstrateGeoSpecSpatialRelationshipExpectation,
  GeoSpecSpatialRelationshipsExpectation as SubstrateGeoSpecSpatialRelationshipsExpectation,
  GeoSpecRunFailure as SubstrateGeoSpecRunFailure,
  GeoSpecRunResult as SubstrateGeoSpecRunResult,
  GeoSpecRunSuccess as SubstrateGeoSpecRunSuccess,
  GeoSpecTestCase as SubstrateGeoSpecTestCase,
  GeoSpecTestStatus as SubstrateGeoSpecTestStatus,
} from 'geospec/runner';
// The void-continuity expectation is published on the root subpath only.
import type {
  GeoSpecVoidContinuityExpectation as SubstrateGeoSpecVoidContinuityExpectation,
  GeoSpecVoidWaypoint as SubstrateGeoSpecVoidWaypoint,
} from 'geospec';

/** Re-published substrate vocabulary: {@link SubstrateGeoSpecAssertion}. @public */
export type GeoSpecAssertion = SubstrateGeoSpecAssertion;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecGeometrySelector}. @public */
export type GeoSpecGeometrySelector = SubstrateGeoSpecGeometrySelector;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecMatcher}. @public */
export type GeoSpecMatcher = SubstrateGeoSpecMatcher;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecSpatialRelationshipExpectation}. @public */
export type GeoSpecSpatialRelationshipExpectation = SubstrateGeoSpecSpatialRelationshipExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecSpatialRelationshipsExpectation}. @public */
export type GeoSpecSpatialRelationshipsExpectation = SubstrateGeoSpecSpatialRelationshipsExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecAssemblyOccurrenceExpectation}. @public */
export type GeoSpecAssemblyOccurrenceExpectation = SubstrateGeoSpecAssemblyOccurrenceExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecAssemblyOccurrencesExpectation}. @public */
export type GeoSpecAssemblyOccurrencesExpectation = SubstrateGeoSpecAssemblyOccurrencesExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecAxisExpectation}. @public */
export type GeoSpecAxisExpectation = SubstrateGeoSpecAxisExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecBoundingBoxExpectation}. @public */
export type GeoSpecBoundingBoxExpectation = SubstrateGeoSpecBoundingBoxExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecCenterOfMassExpectation}. @public */
export type GeoSpecCenterOfMassExpectation = SubstrateGeoSpecCenterOfMassExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecChamferFeatureExpectation}. @public */
export type GeoSpecChamferFeatureExpectation = SubstrateGeoSpecChamferFeatureExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecCircularHoleExpectation}. @public */
export type GeoSpecCircularHoleExpectation = SubstrateGeoSpecCircularHoleExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecCircularHolePatternExpectation}. @public */
export type GeoSpecCircularHolePatternExpectation = SubstrateGeoSpecCircularHolePatternExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecComponentInterferenceAllowance}. @public */
export type GeoSpecComponentInterferenceAllowance = SubstrateGeoSpecComponentInterferenceAllowance;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecComponentInterferenceExpectation}. @public */
export type GeoSpecComponentInterferenceExpectation = SubstrateGeoSpecComponentInterferenceExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecConnectedComponentsExpectation}. @public */
export type GeoSpecConnectedComponentsExpectation = SubstrateGeoSpecConnectedComponentsExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecCylindricalFaceExpectation}. @public */
export type GeoSpecCylindricalFaceExpectation = SubstrateGeoSpecCylindricalFaceExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecFilletFeatureExpectation}. @public */
export type GeoSpecFilletFeatureExpectation = SubstrateGeoSpecFilletFeatureExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecMassExpectation}. @public */
export type GeoSpecMassExpectation = SubstrateGeoSpecMassExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecMeshIntegrityExpectation}. @public */
export type GeoSpecMeshIntegrityExpectation = SubstrateGeoSpecMeshIntegrityExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecMinimumWallThicknessExpectation}. @public */
export type GeoSpecMinimumWallThicknessExpectation = SubstrateGeoSpecMinimumWallThicknessExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecNumericExpectation}. @public */
export type GeoSpecNumericExpectation = SubstrateGeoSpecNumericExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecPlanarFaceExpectation}. @public */
export type GeoSpecPlanarFaceExpectation = SubstrateGeoSpecPlanarFaceExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecPointExpectation}. @public */
export type GeoSpecPointExpectation = SubstrateGeoSpecPointExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecProductStructureExpectation}. @public */
export type GeoSpecProductStructureExpectation = SubstrateGeoSpecProductStructureExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecStepUnitsExpectation}. @public */
export type GeoSpecStepUnitsExpectation = SubstrateGeoSpecStepUnitsExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecSurfaceAreaExpectation}. @public */
export type GeoSpecSurfaceAreaExpectation = SubstrateGeoSpecSurfaceAreaExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecTopologyCountsExpectation}. @public */
export type GeoSpecTopologyCountsExpectation = SubstrateGeoSpecTopologyCountsExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecValidBrepExpectation}. @public */
export type GeoSpecValidBrepExpectation = SubstrateGeoSpecValidBrepExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecVolumeExpectation}. @public */
export type GeoSpecVolumeExpectation = SubstrateGeoSpecVolumeExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecVoidContinuityExpectation}. @public */
export type GeoSpecVoidContinuityExpectation = SubstrateGeoSpecVoidContinuityExpectation;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecVoidWaypoint}. @public */
export type GeoSpecVoidWaypoint = SubstrateGeoSpecVoidWaypoint;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecRunFailure}. @public */
export type GeoSpecRunFailure = SubstrateGeoSpecRunFailure;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecRunResult}. @public */
export type GeoSpecRunResult = SubstrateGeoSpecRunResult;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecRunSuccess}. @public */
export type GeoSpecRunSuccess = SubstrateGeoSpecRunSuccess;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecTestCase}. @public */
export type GeoSpecTestCase = SubstrateGeoSpecTestCase;
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecTestStatus}. @public */
export type GeoSpecTestStatus = SubstrateGeoSpecTestStatus;
