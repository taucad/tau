// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifySectionCapOverlaps } from '#components/geometry/graphics/three/utils/section-cap-overlap.js';
import type { SectionCapPolygon } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type {
  CapMultiPolygon,
  CapPoint2,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

type RectangleBounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

const square = ({ minX, minY, maxX, maxY }: RectangleBounds): CapMultiPolygon => [
  [
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ],
  ],
];

const flattenCapPoints = (multiPolygon: CapMultiPolygon): readonly CapPoint2[] => {
  const points: CapPoint2[] = [];
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      points.push(...ring);
    }
  }

  return points;
};

const region = (options: {
  sourceKey: string;
  ownerKey: string;
  polygon: CapMultiPolygon;
  trueCut?: boolean;
}): SectionCapPolygon => ({
  sourceKey: options.sourceKey,
  ownerKey: options.ownerKey,
  geometryKey: `${options.sourceKey}:geometry`,
  multiPolygon: options.polygon,
  bbox: {
    minX: Math.min(...flattenCapPoints(options.polygon).map((point) => point[0])),
    minY: Math.min(...flattenCapPoints(options.polygon).map((point) => point[1])),
    maxX: Math.max(...flattenCapPoints(options.polygon).map((point) => point[0])),
    maxY: Math.max(...flattenCapPoints(options.polygon).map((point) => point[1])),
  },
  area: 1,
  trueCut: options.trueCut ?? true,
  diagnostics: [],
});

describe('classifySectionCapOverlaps', () => {
  it('should return exact overlap polygons for true-cut regions from different owners', () => {
    const result = classifySectionCapOverlaps([
      region({ sourceKey: 'a', ownerKey: 'owner-a', polygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }) }),
      region({ sourceKey: 'b', ownerKey: 'owner-b', polygon: square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }) }),
    ]);

    expect(result.sourcePairCount).toBe(1);
    expect(result.broadphaseCandidatePairCount).toBe(1);
    expect(result.exactIntersectionPairCount).toBe(1);
    expect(result.positiveAreaPairCount).toBe(1);
    expect(result.overlapBySourceKey.get('a')).toBeDefined();
    expect(result.overlapBySourceKey.get('b')).toBeDefined();
    expect([...result.visibleOverlapBySourceKey.keys()]).toEqual(['a']);
    expect(Object.keys(result).sort()).toEqual([
      'broadphaseCandidatePairCount',
      'candidatePointCount',
      'classifiableSourceCount',
      'diagnostics',
      'exactIntersectionPairCount',
      'overlapBySourceKey',
      'ownerPrunedPairCount',
      'positiveAreaPairCount',
      'sourcePairCount',
      'trueCutPrunedRegionCount',
      'visibleOverlapBySourceKey',
      'xPrunedPairCount',
      'yPrunedPairCount',
    ]);
  });

  it('should reject same-owner, tangent, and non-true-cut candidates', () => {
    const result = classifySectionCapOverlaps([
      region({ sourceKey: 'same-a', ownerKey: 'owner-a', polygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }) }),
      region({
        sourceKey: 'same-b',
        ownerKey: 'owner-a',
        polygon: square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
      }),
      region({
        sourceKey: 'tangent',
        ownerKey: 'owner-b',
        polygon: square({ minX: 1.5, minY: 0, maxX: 2.5, maxY: 1 }),
      }),
      region({
        sourceKey: 'not-cut',
        ownerKey: 'owner-c',
        polygon: square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
        trueCut: false,
      }),
    ]);

    expect(result.broadphaseCandidatePairCount).toBe(1);
    expect(result.exactIntersectionPairCount).toBe(1);
    expect(result.positiveAreaPairCount).toBe(0);
    expect(result.ownerPrunedPairCount).toBe(1);
    expect(result.trueCutPrunedRegionCount).toBe(1);
    expect(result.overlapBySourceKey.size).toBe(0);
  });

  it('should prune by sorted X and Y bounds before exact boolean work', () => {
    const result = classifySectionCapOverlaps([
      region({ sourceKey: 'a', ownerKey: 'owner-a', polygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }) }),
      region({ sourceKey: 'b', ownerKey: 'owner-b', polygon: square({ minX: 0.25, minY: 3, maxX: 0.75, maxY: 4 }) }),
      region({ sourceKey: 'c', ownerKey: 'owner-c', polygon: square({ minX: 4, minY: 0, maxX: 5, maxY: 1 }) }),
    ]);

    expect(result.sourcePairCount).toBe(3);
    expect(result.classifiableSourceCount).toBe(3);
    expect(result.yPrunedPairCount).toBe(1);
    expect(result.xPrunedPairCount).toBe(2);
    expect(result.broadphaseCandidatePairCount).toBe(0);
    expect(result.exactIntersectionPairCount).toBe(0);
    expect(result.candidatePointCount).toBe(12);
  });

  it('should run exact intersection for every broadphase candidate without simplified fallback state', () => {
    const result = classifySectionCapOverlaps([
      region({ sourceKey: 'a', ownerKey: 'owner-a', polygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }) }),
      region({ sourceKey: 'b', ownerKey: 'owner-b', polygon: square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }) }),
      region({
        sourceKey: 'c',
        ownerKey: 'owner-c',
        polygon: square({ minX: 0.75, minY: 0.75, maxX: 1.75, maxY: 1.75 }),
      }),
    ]);

    expect(result.sourcePairCount).toBe(3);
    expect(result.broadphaseCandidatePairCount).toBe(3);
    expect(result.exactIntersectionPairCount).toBe(3);
    expect(result.positiveAreaPairCount).toBe(3);
    expect(result.overlapBySourceKey.size).toBe(3);
    expect(result.visibleOverlapBySourceKey.size).toBe(2);
    expect(result.diagnostics).toEqual([]);
  });
});
