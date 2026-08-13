/**
 * Engine-side mesh types: the substrate vocabulary re-exported verbatim plus
 * the engine's augmentation of {@link GeometrySubject} with the native handle
 * the substrate deliberately does not declare (split-doc D-S5).
 *
 * @module
 */

import type {
  GeometrySubject as SubstrateGeometrySubject,
  AabbMeters as SubstrateAabbMeters,
  BoundingBoxStats as SubstrateBoundingBoxStats,
  BrepEvidence as SubstrateBrepEvidence,
  ClusterGap as SubstrateClusterGap,
  ClusterReport as SubstrateClusterReport,
  ConnectedComponentsResult as SubstrateConnectedComponentsResult,
  GeometryCapability as SubstrateGeometryCapability,
  GeometryDiagnostic as SubstrateGeometryDiagnostic,
  GeometryFileFormat as SubstrateGeometryFileFormat,
  GeometryProvenance as SubstrateGeometryProvenance,
  GeometrySource as SubstrateGeometrySource,
  GeometryStats as SubstrateGeometryStats,
  GeoSpecUnit as SubstrateGeoSpecUnit,
  MeshEvidence as SubstrateMeshEvidence,
  MeshFileFormat as SubstrateMeshFileFormat,
  MeshQualityStats as SubstrateMeshQualityStats,
  MeshTriangle as SubstrateMeshTriangle,
  PrimitiveRecord as SubstratePrimitiveRecord,
  StepEvidence as SubstrateStepEvidence,
  Vec3 as SubstrateVec3,
  WatertightIrregularEdgeCluster as SubstrateWatertightIrregularEdgeCluster,
  WatertightIrregularEdgeKind as SubstrateWatertightIrregularEdgeKind,
  WatertightIrregularEdgeSample as SubstrateWatertightIrregularEdgeSample,
  WatertightPrimitiveBreakdown as SubstrateWatertightPrimitiveBreakdown,
  WatertightResult as SubstrateWatertightResult,
} from 'geospec/mesh';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';

/** An occurrence (or occurrence-face) tessellation. @public */
export type OccurrenceMesh = {
  positions: Float32Array<ArrayBuffer>;
  triangleCount: number;
};

/** Per-fetch tessellation overrides. @public */
export type OccurrenceMeshOptions = {
  /** Linear deflection (mm) overriding the subject's load-time tolerance. */
  deflection?: number;
};

/** Re-published substrate vocabulary: {@link SubstrateAabbMeters}. @public */
export type AabbMeters = SubstrateAabbMeters;
/** Re-published substrate vocabulary: {@link SubstrateBoundingBoxStats}. @public */
export type BoundingBoxStats = SubstrateBoundingBoxStats;
/** Re-published substrate vocabulary: {@link SubstrateBrepEvidence}. @public */
export type BrepEvidence = SubstrateBrepEvidence;
/** Re-published substrate vocabulary: {@link SubstrateClusterGap}. @public */
export type ClusterGap = SubstrateClusterGap;
/** Re-published substrate vocabulary: {@link SubstrateClusterReport}. @public */
export type ClusterReport = SubstrateClusterReport;
/** Re-published substrate vocabulary: {@link SubstrateConnectedComponentsResult}. @public */
export type ConnectedComponentsResult = SubstrateConnectedComponentsResult;
/** Re-published substrate vocabulary: {@link SubstrateGeometryCapability}. @public */
export type GeometryCapability = SubstrateGeometryCapability;
/** Re-published substrate vocabulary: {@link SubstrateGeometryDiagnostic}. @public */
export type GeometryDiagnostic = SubstrateGeometryDiagnostic;
/** Re-published substrate vocabulary: {@link SubstrateGeometryFileFormat}. @public */
export type GeometryFileFormat = SubstrateGeometryFileFormat;
/** Engine provenance before it is projected to Contract-B JSON. @public */
export type GeometryProvenance = Omit<SubstrateGeometryProvenance, 'parameters'> & {
  parameters?: Record<string, unknown>;
};
/** Re-published substrate vocabulary: {@link SubstrateGeometrySource}. @public */
export type GeometrySource = SubstrateGeometrySource;
/** Engine-only callable analysis surface; never crosses Contract B. @public */
export type GeometryStats = SubstrateGeometryStats & {
  connectedComponents(toleranceMm: number): number;
  analyseConnectedComponents(toleranceMm: number): ConnectedComponentsResult;
  analyseWatertight(): WatertightResult;
};
/** Re-published substrate vocabulary: {@link SubstrateGeoSpecUnit}. @public */
export type GeoSpecUnit = SubstrateGeoSpecUnit;
/** Re-published substrate vocabulary: {@link SubstrateMeshEvidence}. @public */
export type MeshEvidence = Omit<SubstrateMeshEvidence, 'stats'> & { stats: GeometryStats };
/** Re-published substrate vocabulary: {@link SubstrateMeshFileFormat}. @public */
export type MeshFileFormat = SubstrateMeshFileFormat;
/** Re-published substrate vocabulary: {@link SubstrateMeshQualityStats}. @public */
export type MeshQualityStats = SubstrateMeshQualityStats;
/** Re-published substrate vocabulary: {@link SubstrateMeshTriangle}. @public */
export type MeshTriangle = SubstrateMeshTriangle;
/** Re-published substrate vocabulary: {@link SubstratePrimitiveRecord}. @public */
export type PrimitiveRecord = SubstratePrimitiveRecord;
/** Re-published substrate vocabulary: {@link SubstrateStepEvidence}. @public */
export type StepEvidence = SubstrateStepEvidence;
/** Re-published substrate vocabulary: {@link SubstrateVec3}. @public */
export type Vec3 = SubstrateVec3;
/** Re-published substrate vocabulary: {@link SubstrateWatertightIrregularEdgeCluster}. @public */
export type WatertightIrregularEdgeCluster = SubstrateWatertightIrregularEdgeCluster;
/** Re-published substrate vocabulary: {@link SubstrateWatertightIrregularEdgeKind}. @public */
export type WatertightIrregularEdgeKind = SubstrateWatertightIrregularEdgeKind;
/** Re-published substrate vocabulary: {@link SubstrateWatertightIrregularEdgeSample}. @public */
export type WatertightIrregularEdgeSample = SubstrateWatertightIrregularEdgeSample;
/** Re-published substrate vocabulary: {@link SubstrateWatertightPrimitiveBreakdown}. @public */
export type WatertightPrimitiveBreakdown = SubstrateWatertightPrimitiveBreakdown;
/** Re-published substrate vocabulary: {@link SubstrateWatertightResult}. @public */
export type WatertightResult = SubstrateWatertightResult;
/**
 * A GeoSpec subject as the engine produces it: the substrate contract plus the
 * retained AP242 read that every exact proof runs through. The handle is
 * engine-owned and never crosses the seam.
 *
 * @public
 */
export type GeometrySubject = Omit<SubstrateGeometrySubject, 'subjectId' | 'mesh' | 'provenance' | 'diagnostics'> & {
  subjectId?: string;
  mesh: MeshEvidence;
  provenance: GeometryProvenance;
  diagnostics: GeometryDiagnostic[];
  nativeXde?: GeoSpecNativeXdeReadResult;
  /** Tessellation of one occurrence, cached in the `occurrence-mesh` family. */
  occurrenceMesh?: (occurrence: number, options?: OccurrenceMeshOptions) => OccurrenceMesh | undefined;
};
