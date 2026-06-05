/**
 * Mesh loading and analysis utilities.
 *
 * @module
 */

export { analyzeGlb, analyzeGltfDocument } from '#mesh/analyze-glb.js';
export {
  analyseConnectedComponents,
  buildMeshNodeNameMap,
  collectPrimitiveRecords,
  countConnectedComponents,
} from '#mesh/connected-components.js';
export { analyzeMeshQuality } from '#mesh/mesh-quality.js';
export { analyzeChamferDistance } from '#mesh/distance.js';
export type { AnalyzeChamferDistanceOptions, AnalyzeChamferDistanceResult, MeshDistanceStats } from '#mesh/distance.js';
export { analyzeMeshOverlap } from '#mesh/overlap.js';
export type {
  AnalyzeMeshOverlapOptions,
  AnalyzeMeshOverlapResult,
  MeshComponentOverlap,
  MeshOverlapEvidence,
} from '#mesh/overlap.js';
export { analyzeMesh, loadMesh } from '#mesh/load-mesh.js';
export { createOpenCascadeMeshAnalyzer } from '#mesh/native.js';
export type {
  GeoSpecNativeChamferDistanceOptions,
  GeoSpecNativeMeshComponent,
  GeoSpecNativeMeshAnalyzer,
  GeoSpecNativeMeshOverlap,
  GeoSpecNativeMeshOverlapOptions,
  GeoSpecNativeMeshOverlapResult,
  GeoSpecNativeTriangleSoup,
  GeoSpecOpenCascadeMeshModule,
} from '#mesh/native.js';
export type {
  AnalyzeMeshResult,
  LoadMeshFailure,
  LoadMeshOptions,
  LoadMeshResult,
  LoadMeshSuccess,
  MeshBufferSource,
  MeshSource,
} from '#mesh/load-mesh.js';
export { analyseWatertight, isWatertight } from '#mesh/watertight.js';
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
  GeoSpecUnit,
  GeometryCapability,
  GeometryFileFormat,
  GeometryDiagnostic,
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
  WatertightPrimitiveBreakdown,
  WatertightResult,
} from '#mesh/types.js';
