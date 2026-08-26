/**
 * Component-overlap contract (engine-backed).
 *
 * @module
 */

import {
  geoSpecClaimDiagnostics,
  geoSpecClaimJson,
  geoSpecProtocolViolation,
  geoSpecSubjectId,
  isGeoSpecJsonRecord,
  submitGeoSpecClaim,
} from '#engine/client.js';
import { geoSpecEngineUnavailableDiagnostic } from '#engine/registry.js';
import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';

/**
 * Options for component-overlap analysis.
 *
 * @public
 */
export type AnalyzeMeshOverlapOptions = {
  subject: GeometrySubject;
  tolerance?: number;
  pairs?: MeshOverlapPairSelector[];
};

/**
 * Component selector used to narrow overlap analysis to named component pairs.
 *
 * @public
 */
export type MeshOverlapComponentSelector = string | RegExp;

/**
 * Pair selector used to narrow overlap analysis to named component pairs.
 *
 * @public
 */
export type MeshOverlapPairSelector = {
  left: MeshOverlapComponentSelector;
  right: MeshOverlapComponentSelector;
};

/**
 * One overlapping component pair found by {@link analyzeMeshOverlap}.
 *
 * @public
 */
export type MeshComponentOverlap = {
  leftComponentId: number;
  rightComponentId: number;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
  intersectionVolume: number;
  witnessPoint?: Vec3;
  penetration: 'positive-volume';
};

/**
 * One selector-expanded component pair considered by overlap analysis before
 * AABB pruning.
 *
 * @public
 */
export type MeshOverlapSelectedPair = {
  leftLabel: string;
  rightLabel: string;
};

/**
 * Successful overlap analysis.
 *
 * @public
 */
export type MeshOverlapEvidence = {
  componentSource: 'named';
  componentCount: number;
  selectedPairs?: MeshOverlapSelectedPair[];
  checkedPairs: number;
  tolerance: number;
  overlaps: MeshComponentOverlap[];
};

/**
 * Typed result for component-overlap analysis.
 *
 * @public
 */
export type AnalyzeMeshOverlapResult =
  | { success: true; evidence: MeshOverlapEvidence; diagnostics: GeometryDiagnostic[] }
  | { success: false; diagnostics: GeometryDiagnostic[] };

/**
 * Find positive-volume intersections between a subject's components.
 *
 * @param options - Subject, tolerance, and optional pair selectors.
 * @returns Typed overlap evidence, or a structured failure.
 * @public
 */
export const analyzeMeshOverlap = async (options: AnalyzeMeshOverlapOptions): Promise<AnalyzeMeshOverlapResult> => {
  let submitted;
  try {
    submitted = submitGeoSpecClaim({
      capability: 'analyzeMeshOverlap',
      subjectIds: [geoSpecSubjectId(options.subject)],
      payload: geoSpecClaimJson({ tolerance: options.tolerance, pairs: options.pairs }),
    });
  } catch (error) {
    return {
      success: false,
      diagnostics: [geoSpecProtocolViolation(error instanceof Error ? error.message : String(error))],
    };
  }
  if (submitted === undefined) {
    return { success: false, diagnostics: [geoSpecEngineUnavailableDiagnostic('analyzeMeshOverlap')] };
  }
  const result = await submitted;
  const { evidence } = result;
  if (!isGeoSpecJsonRecord(evidence) || typeof evidence['success'] !== 'boolean') {
    return {
      success: false,
      diagnostics: [geoSpecProtocolViolation('The engine returned malformed overlap evidence.')],
    };
  }
  const diagnostics = geoSpecClaimDiagnostics(result);
  if (!evidence['success']) {
    return { success: false, diagnostics };
  }
  if (!isGeoSpecJsonRecord(evidence['evidence'])) {
    return {
      success: false,
      diagnostics: [geoSpecProtocolViolation('The engine omitted successful overlap evidence.')],
    };
  }
  return { success: true, evidence: evidence['evidence'] as unknown as MeshOverlapEvidence, diagnostics };
};
