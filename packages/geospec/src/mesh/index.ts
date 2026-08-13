/**
 * Mesh loading and analysis utilities.
 *
 * @module
 */

export { analyzeMeshOverlap } from '#mesh/overlap.js';
export type { GeoSpecUnit } from '#geometry-unit.js';
export type {
  AnalyzeMeshOverlapOptions,
  AnalyzeMeshOverlapResult,
  MeshComponentOverlap,
  MeshOverlapEvidence,
} from '#mesh/overlap.js';
export { analyzeMesh, loadMesh } from '#mesh/load-mesh.js';
export type {
  AnalyzeMeshResult,
  LoadMeshFailure,
  LoadMeshOptions,
  LoadMeshResult,
  LoadMeshSuccess,
  MeshBufferSource,
  MeshSource,
} from '#mesh/load-mesh.js';
export type {
  AabbMeters,
  BoundingBoxAxisExtremum,
  BoundingBoxAxisFailure,
  BoundingBoxFailure,
  BoundingBoxStats,
  BrepEvidence,
  CheckResult,
  ClusterGap,
  ClusterReport,
  ConnectedComponentsFailure,
  ConnectedComponentsResult,
  GeometryCapability,
  GeometryFileFormat,
  GeometryDiagnostic,
  GeometryEvidenceDiagnostic,
  GeometryProvenance,
  GeometrySource,
  GeometryStats,
  GeometrySubject,
  MeshEvidence,
  MeshFileFormat,
  MeshQualityStats,
  MeshTriangle,
  PrimitiveRecord,
  StepEvidence,
  Vec3,
  WatertightFailure,
  WatertightIrregularEdgeCluster,
  WatertightIrregularEdgeKind,
  WatertightIrregularEdgeSample,
  WatertightPrimitiveBreakdown,
  WatertightResult,
} from '#mesh/types.js';
