import type { SectionCapDiagnostic } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

export const sectionCapOverlapDebugUserDataKey = 'sectionCapOverlapDiagnostics';

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
