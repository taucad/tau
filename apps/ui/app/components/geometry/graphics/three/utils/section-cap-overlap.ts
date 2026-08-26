import {
  defaultSectionCapBooleanOperations,
  measureCapMultiPolygonArea,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import type { SectionCapPolygon } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type {
  CapMultiPolygon,
  SectionCapBbox,
  SectionCapDiagnostic,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import type { SectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type { SectionCapBooleanDebugSink } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';

export type SectionCapOverlapResult = Readonly<{
  sourcePairCount: number;
  classifiableSourceCount: number;
  trueCutPrunedRegionCount: number;
  xPrunedPairCount: number;
  ownerPrunedPairCount: number;
  yPrunedPairCount: number;
  candidatePointCount: number;
  broadphaseCandidatePairCount: number;
  exactIntersectionPairCount: number;
  positiveAreaPairCount: number;
  /** Per-source regions to subtract from normal cap colors. */
  overlapBySourceKey: Map<string, CapMultiPolygon>;
  /** Deterministic single-owner overlap regions to render red without cross-source z-fighting. */
  visibleOverlapBySourceKey: Map<string, CapMultiPolygon>;
  diagnostics: SectionCapDiagnostic[];
}>;

export const sectionCapMinimumOverlapArea = 1e-7;

const boxesOverlap = (first: SectionCapBbox, second: SectionCapBbox): boolean =>
  first.minX <= second.maxX && first.maxX >= second.minX && first.minY <= second.maxY && first.maxY >= second.minY;

const isClassifiableRegion = (region: SectionCapPolygon, minArea: number): boolean =>
  region.trueCut &&
  region.area > minArea &&
  region.multiPolygon.length > 0 &&
  Number.isFinite(region.bbox.minX) &&
  Number.isFinite(region.bbox.maxX);

const countRegionPoints = (region: SectionCapPolygon): number =>
  region.multiPolygon.reduce(
    (sum, polygon) => sum + polygon.reduce((polygonSum, ring) => polygonSum + ring.length, 0),
    0,
  );

const appendPendingOverlap = (
  overlapBySourceKey: Map<string, CapMultiPolygon[]>,
  sourceKey: string,
  overlap: CapMultiPolygon,
): void => {
  const current = overlapBySourceKey.get(sourceKey) ?? [];
  current.push(overlap);
  overlapBySourceKey.set(sourceKey, current);
};

type UnionPendingOverlapsOptions = Readonly<{
  pendingOverlapBySourceKey: Map<string, CapMultiPolygon[]>;
  diagnostics: SectionCapDiagnostic[];
  booleanOperations: SectionCapBooleanOperations;
  debugSink?: SectionCapBooleanDebugSink;
}>;

const unionPendingOverlaps = (options: UnionPendingOverlapsOptions): Map<string, CapMultiPolygon> => {
  const result = new Map<string, CapMultiPolygon>();

  for (const [sourceKey, pendingOverlaps] of options.pendingOverlapBySourceKey) {
    const nonEmptyOverlaps = pendingOverlaps.filter((multiPolygon) => multiPolygon.length > 0);
    if (nonEmptyOverlaps.length === 0) {
      continue;
    }

    if (nonEmptyOverlaps.length === 1) {
      result.set(sourceKey, nonEmptyOverlaps[0]!);
      continue;
    }

    const union = options.booleanOperations.unionCapPolygons(nonEmptyOverlaps, options.debugSink);
    options.diagnostics.push(...union.diagnostics.map((diagnostic) => ({ ...diagnostic, sourceKey })));
    if (union.diagnostics.length > 0 || union.multiPolygon.length === 0) {
      continue;
    }

    result.set(sourceKey, union.multiPolygon);
  }

  return result;
};

export const classifySectionCapOverlaps = (
  regions: readonly SectionCapPolygon[],
  options: Readonly<{
    booleanOperations?: SectionCapBooleanOperations;
    debugSink?: SectionCapBooleanDebugSink;
  }> = {},
): SectionCapOverlapResult => {
  const booleanOperations = options.booleanOperations ?? defaultSectionCapBooleanOperations;
  const diagnostics: SectionCapDiagnostic[] = [];
  const pendingOverlapBySourceKey = new Map<string, CapMultiPolygon[]>();
  const pendingVisibleOverlapBySourceKey = new Map<string, CapMultiPolygon[]>();
  let xPrunedPairCount = 0;
  let ownerPrunedPairCount = 0;
  let yPrunedPairCount = 0;
  let broadphaseCandidatePairCount = 0;
  let exactIntersectionPairCount = 0;
  let positiveAreaPairCount = 0;
  let trueCutPrunedRegionCount = 0;

  const candidates = regions
    .filter((region) => {
      const isClassifiable = isClassifiableRegion(region, sectionCapMinimumOverlapArea);
      if (!isClassifiable && !region.trueCut) {
        trueCutPrunedRegionCount++;
      }

      return isClassifiable;
    })
    .sort((first, second) => first.bbox.minX - second.bbox.minX);
  const sourcePairCount = (candidates.length * (candidates.length - 1)) / 2;
  const candidatePointCount = candidates.reduce((sum, region) => sum + countRegionPoints(region), 0);
  for (let firstIndex = 0; firstIndex < candidates.length; firstIndex++) {
    const first = candidates[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex++) {
      const second = candidates[secondIndex]!;
      if (second.bbox.minX > first.bbox.maxX) {
        xPrunedPairCount += candidates.length - secondIndex;
        break;
      }

      if (first.ownerKey === second.ownerKey) {
        ownerPrunedPairCount++;
        continue;
      }

      if (!boxesOverlap(first.bbox, second.bbox)) {
        yPrunedPairCount++;
        continue;
      }

      broadphaseCandidatePairCount++;
      exactIntersectionPairCount++;
      const overlap = booleanOperations.intersectCapPolygons(
        first.multiPolygon,
        second.multiPolygon,
        options.debugSink,
      );
      diagnostics.push(...overlap.diagnostics);
      if (
        overlap.diagnostics.length > 0 ||
        measureCapMultiPolygonArea(overlap.multiPolygon) <= sectionCapMinimumOverlapArea
      ) {
        continue;
      }

      positiveAreaPairCount++;
      appendPendingOverlap(pendingOverlapBySourceKey, first.sourceKey, overlap.multiPolygon);
      appendPendingOverlap(pendingOverlapBySourceKey, second.sourceKey, overlap.multiPolygon);
      appendPendingOverlap(
        pendingVisibleOverlapBySourceKey,
        first.sourceKey < second.sourceKey ? first.sourceKey : second.sourceKey,
        overlap.multiPolygon,
      );
    }
  }

  return {
    sourcePairCount,
    classifiableSourceCount: candidates.length,
    trueCutPrunedRegionCount,
    xPrunedPairCount,
    ownerPrunedPairCount,
    yPrunedPairCount,
    candidatePointCount,
    broadphaseCandidatePairCount,
    exactIntersectionPairCount,
    positiveAreaPairCount,
    overlapBySourceKey: unionPendingOverlaps({
      pendingOverlapBySourceKey,
      diagnostics,
      booleanOperations,
      debugSink: options.debugSink,
    }),
    visibleOverlapBySourceKey: unionPendingOverlaps({
      pendingOverlapBySourceKey: pendingVisibleOverlapBySourceKey,
      diagnostics,
      booleanOperations,
      debugSink: options.debugSink,
    }),
    diagnostics,
  };
};
