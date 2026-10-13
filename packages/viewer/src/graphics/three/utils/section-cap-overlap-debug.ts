import type { SectionCapDiagnostic } from '#graphics/three/utils/section-cap-polygon-types.js';

/**
 * The `userData` key under which a section fill root stores its latest cap overlap summary.
 *
 * @public
 */
export const sectionCapOverlapDebugUserDataKey = 'sectionCapOverlapDiagnostics';

/**
 * Counts and diagnostics from detecting overlap between section cap sources, kept for debugging.
 *
 * @public
 */
export type SectionCapOverlapDebugSummary = Readonly<{
  sourceCount: number;
  sourcePairCount: number;
  broadphaseCandidatePairCount: number;
  exactIntersectionPairCount: number;
  positiveAreaPairCount: number;
  renderedOverlapArea: number;
  splitFailed: boolean;
  diagnostics: readonly SectionCapDiagnostic[];
}>;
