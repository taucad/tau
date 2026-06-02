import type {
  AabbMeters as GeoSpecAabbMeters,
  BoundingBoxAxisExtremum as GeoSpecBoundingBoxAxisExtremum,
  BoundingBoxAxisFailure as GeoSpecBoundingBoxAxisFailure,
  BoundingBoxFailure as GeoSpecBoundingBoxFailure,
  BoundingBoxStats as GeoSpecBoundingBoxStats,
  CheckResult as GeoSpecCheckResult,
  ClusterGap as GeoSpecClusterGap,
  ClusterReport as GeoSpecClusterReport,
  ConnectedComponentsFailure as GeoSpecConnectedComponentsFailure,
  ConnectedComponentsResult as GeoSpecConnectedComponentsResult,
  GeometryStats as GeoSpecGeometryStats,
  MeshQualityStats as GeoSpecMeshQualityStats,
  PrimitiveRecord as GeoSpecPrimitiveRecord,
  WatertightFailure as GeoSpecWatertightFailure,
  WatertightPrimitiveBreakdown as GeoSpecWatertightPrimitiveBreakdown,
  WatertightResult as GeoSpecWatertightResult,
} from 'geospec/mesh';

/**
 * Axis-aligned bounding box in meters.
 *
 * @public
 */
export type AabbMeters = GeoSpecAabbMeters;
/**
 * Expected or actual extrema for one bounding-box axis.
 *
 * @public
 */
export type BoundingBoxAxisExtremum = GeoSpecBoundingBoxAxisExtremum;
/**
 * Failure details for one bounding-box axis.
 *
 * @public
 */
export type BoundingBoxAxisFailure = GeoSpecBoundingBoxAxisFailure;
/**
 * Failure details for a bounding-box requirement.
 *
 * @public
 */
export type BoundingBoxFailure = GeoSpecBoundingBoxFailure;
/**
 * Bounding-box statistics for a mesh.
 *
 * @public
 */
export type BoundingBoxStats = GeoSpecBoundingBoxStats;
/**
 * Result of evaluating one legacy geometry requirement.
 *
 * @public
 */
export type CheckResult = GeoSpecCheckResult;
/**
 * Spatial gap between connected-component clusters.
 *
 * @public
 */
export type ClusterGap = GeoSpecClusterGap;
/**
 * Spatial report for one connected-component cluster.
 *
 * @public
 */
export type ClusterReport = GeoSpecClusterReport;
/**
 * Failure details for a connected-components requirement.
 *
 * @public
 */
export type ConnectedComponentsFailure = GeoSpecConnectedComponentsFailure;
/**
 * Connected-components analysis result.
 *
 * @public
 */
export type ConnectedComponentsResult = GeoSpecConnectedComponentsResult;
/**
 * Full mesh statistics used by legacy Tau geometry tests.
 *
 * @public
 */
export type GeometryStats = GeoSpecGeometryStats;
/**
 * Mesh quality metrics for triangle-level checks.
 *
 * @public
 */
export type MeshQualityStats = GeoSpecMeshQualityStats;
/**
 * Spatial record for one glTF primitive or sub-primitive.
 *
 * @public
 */
export type PrimitiveRecord = GeoSpecPrimitiveRecord;
/**
 * Failure details for a watertightness requirement.
 *
 * @public
 */
export type WatertightFailure = GeoSpecWatertightFailure;
/**
 * Per-primitive watertightness evidence.
 *
 * @public
 */
export type WatertightPrimitiveBreakdown = GeoSpecWatertightPrimitiveBreakdown;
/**
 * Watertightness analysis result.
 *
 * @public
 */
export type WatertightResult = GeoSpecWatertightResult;
