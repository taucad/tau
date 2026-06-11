import type { Document } from '@gltf-transform/core';
import { buildMeshAnalysisRecord, collectConnectedPiecePrimitiveRecordsFromRecord } from '#mesh/analysis-record.js';
import type { ConnectedComponentsResult, PrimitiveRecord } from '#mesh/types.js';

/**
 * Lists every geometry-derived primitive/sub-piece with AABB and display
 * metadata. The records are derived from the canonical mesh analysis record so
 * document callers do not maintain a parallel traversal path.
 *
 * @param document - Parsed glTF document whose meshes should be enumerated.
 * @returns Primitive catalogue entries suitable for clustering overlays.
 * @public
 */
export const collectPrimitiveRecords = (document: Document): PrimitiveRecord[] =>
  collectConnectedPiecePrimitiveRecordsFromRecord(buildMeshAnalysisRecord(document));

/**
 * Full cluster decomposition at `toleranceMm`.
 *
 * @param document - Parsed glTF document.
 * @param toleranceMm - Maximum separation (mm) that still merges adjacent clusters.
 * @returns Disjoint spatial clusters, labels, per-cluster primitives, and sorted pairwise gaps.
 * @public
 */
export const analyseConnectedComponents = (document: Document, toleranceMm: number): ConnectedComponentsResult =>
  buildMeshAnalysisRecord(document).getConnectedComponents(toleranceMm);

/**
 * Counts spatially-disjoint chunks by deriving connected sub-pieces from the
 * canonical typed mesh record.
 *
 * @param document - A glTF-Transform Document.
 * @param toleranceMm - Maximum gap (mm) between two primitive AABBs that still counts as connected.
 * @returns The number of distinct spatial clusters.
 * @public
 */
export const countConnectedComponents = (document: Document, toleranceMm: number): number =>
  analyseConnectedComponents(document, toleranceMm).count;
