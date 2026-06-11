import type { Document } from '@gltf-transform/core';
import { buildMeshAnalysisRecord } from '#mesh/analysis-record.js';
import type { WatertightResult } from '#mesh/types.js';

/**
 * Global watertight analysis plus per-primitive local boundary breakdown.
 *
 * This helper is a compatibility facade over the canonical mesh analysis
 * record. Normal `analyzeGltfDocument` callers reuse a cached topology summary
 * and expand per-primitive diagnostics lazily only when requested.
 *
 * @param document - A glTF-Transform document to analyse.
 * @returns Watertight verdict, global edge counts, and per-primitive boundary diagnostics.
 * @public
 */
export const analyseWatertight = (document: Document): WatertightResult =>
  buildMeshAnalysisRecord(document).getWatertightResult();

/**
 * Determines whether a mesh is watertight (closed/manifold-like).
 *
 * @param document - A glTF-Transform Document.
 * @returns `true` if the mesh is watertight, `false` otherwise.
 * @public
 */
export const isWatertight = (document: Document): boolean =>
  buildMeshAnalysisRecord(document).topologySummary.watertight;
