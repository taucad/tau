/**
 * GeoSpec root authoring API.
 *
 * @module
 */

export { describe, expectGeo, geoSpecMatcherNames, it, test } from '#create-geospec.js';
export type { GeoSpecSubject } from '#model/subject.js';
export type { GeoSpecUnit } from '#geometry-unit.js';

export type {
  GeoSpecAssertion,
  GeoSpecAssemblyOccurrenceExpectation,
  GeoSpecAssemblyOccurrencesExpectation,
  GeoSpecAxisExpectation,
  GeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecComponentInterferenceAllowance,
  GeoSpecComponentInterferenceExpectation,
  GeoSpecComponentInterferencePairExpectation,
  GeoSpecConnectedComponentsExpectation,
  GeoSpecGeometrySelector,
  GeoSpecMatcher,
  GeoSpecMassExpectation,
  GeoSpecMeshIntegrityExpectation,
  GeoSpecNoDiagnosticsExpectation,
  GeoSpecMinimumWallThicknessExpectation,
  GeoSpecCircularHolePatternExpectation,
  GeoSpecFilletFeatureExpectation,
  GeoSpecNumericExpectation,
  GeoSpecPlanarFaceExpectation,
  GeoSpecPointExpectation,
  GeoSpecProductStructureExpectation,
  GeoSpecSpatialRelationshipExpectation,
  GeoSpecSpatialRelationshipsExpectation,
  GeoSpecStepUnitsExpectation,
  GeoSpecSurfaceAreaExpectation,
  GeoSpecTopologyCountsExpectation,
  GeoSpecValidBrepExpectation,
  GeoSpecVoidContinuityExpectation,
  GeoSpecVoidWaypoint,
  GeoSpecVolumeExpectation,
} from '#runner/types.js';
export type {
  BrepEvidence,
  GeometryFileFormat,
  GeometryCapability,
  GeometryDiagnostic,
  GeometryProvenance,
  GeometrySource,
  GeometrySubject,
  GeometrySubjectMeshEvidence,
  MeshEvidence,
  MeshFileFormat,
  MeshQualityStats,
  MeshTriangle,
  StepEvidence,
  Vec3,
} from '#mesh/types.js';

export type { Vec3 as GeoSpecVec3 } from '#mesh/types.js';
