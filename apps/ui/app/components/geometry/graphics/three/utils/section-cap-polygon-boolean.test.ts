// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  differenceCapPolygon,
  intersectCapPolygons,
  measureCapMultiPolygonArea,
  unionCapPolygons,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

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

const donut = (): CapMultiPolygon => [
  [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    [
      [1, 1],
      [1, 3],
      [3, 3],
      [3, 1],
    ],
  ],
];

describe('section cap polygon boolean wrapper', () => {
  it('should intersect overlapping cap polygons with finite positive area', () => {
    const result = intersectCapPolygons(
      square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(result.multiPolygon)).toBeCloseTo(0.25, 6);
  });

  it('should union cap polygons and preserve normalized area semantics', () => {
    const result = unionCapPolygons([
      square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(result.multiPolygon)).toBeCloseTo(1.75, 6);
  });

  it('should subtract overlap regions from the source polygon', () => {
    const result = differenceCapPolygon(square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }), [
      square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(result.multiPolygon)).toBeCloseTo(0.75, 6);
  });

  it('should use the same exact path for higher-complexity inputs without budget diagnostics', () => {
    const result = intersectCapPolygons(
      square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
    );

    expect(result.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(result.multiPolygon)).toBeCloseTo(0.25, 6);
  });

  it('should preserve hole semantics for nested cap regions', () => {
    const holeOnlyIntersection = intersectCapPolygons(
      donut(),
      square({ minX: 1.25, minY: 1.25, maxX: 2.75, maxY: 2.75 }),
    );
    const stripIntersection = intersectCapPolygons(donut(), square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 3.5 }));
    const sourceMinusHole = differenceCapPolygon(square({ minX: 0, minY: 0, maxX: 4, maxY: 4 }), [
      square({ minX: 1, minY: 1, maxX: 3, maxY: 3 }),
    ]);

    expect(holeOnlyIntersection.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(holeOnlyIntersection.multiPolygon)).toBeCloseTo(0, 6);
    expect(stripIntersection.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(stripIntersection.multiPolygon)).toBeCloseTo(2, 6);
    expect(sourceMinusHole.diagnostics).toEqual([]);
    expect(measureCapMultiPolygonArea(sourceMinusHole.multiPolygon)).toBeCloseTo(12, 6);
  });

  it('should report boolean debug sink operations without changing polygon output', () => {
    const calls: Array<{ operation: string; elapsed: number }> = [];
    const debugSink = {
      recordBooleanOperation(operation: 'intersection' | 'union' | 'difference', elapsed: number) {
        calls.push({ operation, elapsed });
      },
    };

    const intersection = intersectCapPolygons(
      square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 }),
      debugSink,
    );
    const union = unionCapPolygons(
      [square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }), square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 })],
      debugSink,
    );
    const difference = differenceCapPolygon(
      square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      [square({ minX: 0.5, minY: 0.5, maxX: 1.5, maxY: 1.5 })],
      debugSink,
    );

    expect(measureCapMultiPolygonArea(intersection.multiPolygon)).toBeCloseTo(0.25, 6);
    expect(measureCapMultiPolygonArea(union.multiPolygon)).toBeCloseTo(1.75, 6);
    expect(measureCapMultiPolygonArea(difference.multiPolygon)).toBeCloseTo(0.75, 6);
    expect(calls.map((call) => call.operation)).toEqual(['intersection', 'union', 'difference']);
    expect(calls.every((call) => Number.isFinite(call.elapsed) && call.elapsed >= 0)).toBe(true);
  });
});
