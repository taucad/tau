/**
 * GeoSpec root authoring API.
 *
 * @module
 */

export { createGeoSpec, describe, expectGeo, geoSpecMatcherNames, it, test } from '#create-geospec.js';
export type { GeoSpec } from '#create-geospec.js';
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
  MeshEvidence,
  MeshFileFormat,
  MeshQualityStats,
  MeshTriangle,
  StepEvidence,
  Vec3,
} from '#mesh/types.js';

export type { AnalyzeMeshResult, LoadMeshOptions, LoadMeshResult } from '#mesh/load-mesh.js';
export type { Vec3 as GeoSpecVec3 } from '#mesh/types.js';
