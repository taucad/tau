// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClipper2TsBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.js';
import { createClipper2WasmBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-wasm.js';
import { createSectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import { measureCapMultiPolygonArea } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import type { CapPolygonBooleanBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const square = (
  bounds: Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>,
): CapMultiPolygon => [
  [
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY],
    ],
  ],
];

const donut = (): CapMultiPolygon => [
  [
    [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ],
    [
      [1, 1],
      [1, 4],
      [4, 4],
      [4, 1],
    ],
  ],
];

const islands = (): CapMultiPolygon => [
  square({ minX: -2, minY: -2, maxX: -1, maxY: -1 })[0]!,
  square({ minX: 1, minY: 1, maxX: 2, maxY: 2 })[0]!,
];

const operationAreas = (backend: CapPolygonBooleanBackend): readonly [number, number, number, number] => {
  const operations = createSectionCapBooleanOperations(backend);
  return [
    measureCapMultiPolygonArea(
      operations.intersectCapPolygons(
        square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        square({ minX: 0.25, minY: 0.25, maxX: 1.25, maxY: 1.25 }),
      ).multiPolygon,
    ),
    measureCapMultiPolygonArea(
      operations.unionCapPolygons([
        square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
        square({ minX: 0.5, minY: 0, maxX: 1.5, maxY: 1 }),
        square({ minX: 1, minY: 0, maxX: 2, maxY: 1 }),
      ]).multiPolygon,
    ),
    measureCapMultiPolygonArea(
      operations.differenceCapPolygon(donut(), [square({ minX: 0.5, minY: 0.5, maxX: 2, maxY: 2 })]).multiPolygon,
    ),
    measureCapMultiPolygonArea(
      operations.unionCapPolygons([
        islands(),
        square({ minX: 10_000.125_000_01, minY: -10_000.5, maxX: 10_001.125_000_01, maxY: -9_999.5 }),
      ]).multiPolygon,
    ),
  ];
};

describe('section cap polygon boolean backends', () => {
  it('should expose a Tau-owned clipper2-ts backend with finite exact outputs', () => {
    const backend = createClipper2TsBackend();
    const [intersectionArea, unionArea, differenceArea, farCoordinateArea] = operationAreas(backend);

    expect(backend.info).toMatchObject({
      name: 'clipper2-ts',
      target: 'js',
      version: '2.0.1-17',
    });
    expect(intersectionArea).toBeCloseTo(0.5625, 6);
    expect(unionArea).toBeCloseTo(2, 6);
    expect(differenceArea).toBeGreaterThan(0);
    expect(farCoordinateArea).toBeCloseTo(3, 6);
  });

  it('should initialize clipper2-wasm and match clipper2-ts fixture areas', async () => {
    const tsBackend = createClipper2TsBackend();
    const wasmBackend = await createClipper2WasmBackend();

    try {
      expect(wasmBackend.info).toMatchObject({
        name: 'clipper2-wasm',
        target: 'wasm',
        version: '0.4.0',
      });
      expect(wasmBackend.info.initializationTime).toEqual(expect.any(Number));
      expect(operationAreas(wasmBackend)).toEqual(operationAreas(tsBackend).map((area) => expect.closeTo(area, 6)));
    } finally {
      wasmBackend.dispose();
      tsBackend.dispose();
    }
  });
});
