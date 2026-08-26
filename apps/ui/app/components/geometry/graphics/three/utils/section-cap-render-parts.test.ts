// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildSectionCapRenderParts,
  sectionCapOverlapBaseHex,
  sectionCapOverlapStripeHex,
} from '#components/geometry/graphics/three/utils/section-cap-render-parts.js';
import { classifySectionCapOverlaps } from '#components/geometry/graphics/three/utils/section-cap-overlap.js';
import { measureCapMultiPolygonArea } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
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

const flattenPoints = (multiPolygon: CapMultiPolygon): CapPoint2[] => {
  const points: CapPoint2[] = [];
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      points.push(...ring);
    }
  }

  return points;
};

const region = (options: { sourceKey: string; ownerKey: string; polygon: CapMultiPolygon }): SectionCapPolygon => {
  const points = flattenPoints(options.polygon);
  return {
    sourceKey: options.sourceKey,
    ownerKey: options.ownerKey,
    geometryKey: `${options.sourceKey}:geometry`,
    multiPolygon: options.polygon,
    bbox: {
      minX: Math.min(...points.map((point) => point[0])),
      minY: Math.min(...points.map((point) => point[1])),
      maxX: Math.max(...points.map((point) => point[0])),
      maxY: Math.max(...points.map((point) => point[1])),
    },
    area: measureCapMultiPolygonArea(options.polygon),
    trueCut: true,
    diagnostics: [],
  };
};

const expectAxisClose = (actual: readonly [number, number], expected: readonly [number, number]): void => {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
};

describe('buildSectionCapRenderParts', () => {
  it('should render exact overlap parts as dark red diagnostics with 90-degree yellow stripes', () => {
    const result = buildSectionCapRenderParts({
      stripeFrequency: 2,
      stripeWidth: 0.2,
      sources: [
        {
          sourceKey: 'source-a',
          sourcePolygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
          overlapPolygon: square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
          visibleOverlapPolygon: square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
          tintHex: 0x44_88_cc,
        },
      ],
    });

    const parts = result.partsBySourceKey.get('source-a') ?? [];

    expect(result.diagnostics).toEqual([]);
    expect(result.splitFailed).toBe(false);
    expect(result.renderedOverlapArea).toBeCloseTo(0.25, 6);
    expect(parts.map((part) => part.regionKind)).toEqual(['normal', 'overlap']);
    expect(parts.map((part) => part.patternStrength)).toEqual([1, 1]);
    expect(parts.at(1)).toEqual(
      expect.objectContaining({
        baseColor: sectionCapOverlapBaseHex,
        stripeColor: sectionCapOverlapStripeHex,
      }),
    );
    expectAxisClose(parts[0]!.stripeAxis, [Math.SQRT1_2, Math.SQRT1_2]);
    expectAxisClose(parts[1]!.stripeAxis, [Math.SQRT1_2, -Math.SQRT1_2]);
  });

  it('should render normal-only caps when exact source splitting fails', () => {
    const result = buildSectionCapRenderParts({
      stripeFrequency: 2,
      stripeWidth: 0.2,
      differenceCapPolygon: () => ({
        multiPolygon: [],
        diagnostics: [
          {
            code: 'polygon-boolean-error',
            message: 'forced difference failure',
          },
        ],
      }),
      sources: [
        {
          sourceKey: 'source-a',
          sourcePolygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
          overlapPolygon: square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
          visibleOverlapPolygon: square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
          tintHex: 0x44_88_cc,
        },
      ],
    });

    const parts = result.partsBySourceKey.get('source-a') ?? [];

    expect(result.splitFailed).toBe(true);
    expect(result.renderedOverlapArea).toBe(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'section-cap-overlap-split-failed',
      }),
    );
    expect(parts.map((part) => part.regionKind)).toEqual(['normal']);
    expect(parts.map((part) => part.patternStrength)).toEqual([1]);
    expectAxisClose(parts[0]!.stripeAxis, [Math.SQRT1_2, Math.SQRT1_2]);
  });

  it('should keep complex assembly overlap diagnostics bounded to exact positive-area regions', () => {
    const blockPolygon = square({ minX: 0, minY: 0, maxX: 10, maxY: 2 });
    const rodPolygons = [1, 3, 5, 7].map((centerX) =>
      square({
        minX: centerX - 0.25,
        minY: -0.5,
        maxX: centerX + 0.25,
        maxY: 2.5,
      }),
    );
    const overlapResult = classifySectionCapOverlaps([
      region({ sourceKey: 'block', ownerKey: 'owner:block', polygon: blockPolygon }),
      ...rodPolygons.map((polygon, index) =>
        region({
          sourceKey: `rod-${index}`,
          ownerKey: `owner:rod-${index}`,
          polygon,
        }),
      ),
    ]);

    const renderResult = buildSectionCapRenderParts({
      stripeFrequency: 2,
      stripeWidth: 0.2,
      sources: [
        {
          sourceKey: 'block',
          sourcePolygon: blockPolygon,
          overlapPolygon: overlapResult.overlapBySourceKey.get('block'),
          visibleOverlapPolygon: overlapResult.visibleOverlapBySourceKey.get('block'),
          tintHex: 0x99_99_99,
        },
        ...rodPolygons.map((polygon, index) => ({
          sourceKey: `rod-${index}`,
          sourcePolygon: polygon,
          overlapPolygon: overlapResult.overlapBySourceKey.get(`rod-${index}`),
          visibleOverlapPolygon: overlapResult.visibleOverlapBySourceKey.get(`rod-${index}`),
          tintHex: 0x44_88_cc,
        })),
      ],
    });
    const blockParts = renderResult.partsBySourceKey.get('block') ?? [];
    const blockOverlapArea = blockParts
      .filter((part) => part.regionKind === 'overlap')
      .reduce((area, part) => area + measureCapMultiPolygonArea(part.multiPolygon), 0);

    expect(overlapResult.exactIntersectionPairCount).toBe(overlapResult.broadphaseCandidatePairCount);
    expect(overlapResult.positiveAreaPairCount).toBe(4);
    expect(blockParts.map((part) => part.regionKind)).toEqual(['normal', 'overlap']);
    expect(blockOverlapArea).toBeGreaterThan(0);
    expect(blockOverlapArea).toBeLessThan(measureCapMultiPolygonArea(blockPolygon));
  });
});
