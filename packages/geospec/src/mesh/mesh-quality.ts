import type { Document } from '@gltf-transform/core';
import { buildMeshAnalysisRecord, createGeometryStatsFromRecord } from '#mesh/analysis-record.js';
import type { MeshQualityStats } from '#mesh/types.js';

/**
 * Analyze scalar mesh quality metrics from a parsed glTF document.
 *
 * This compatibility helper now derives from the canonical
 * {@link MeshAnalysisRecord} path used by `analyzeGltfDocument`, so callers do
 * not get a second production traversal implementation.
 *
 * @param document - Parsed glTF document.
 * @returns Quality metrics used by GeoSpec mesh matchers.
 * @public
 */
export const analyzeMeshQuality = (document: Document): MeshQualityStats =>
  createGeometryStatsFromRecord(buildMeshAnalysisRecord(document)).meshQuality;
