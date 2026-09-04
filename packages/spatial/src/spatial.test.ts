import { describe, expect, it } from 'vitest';
import {
  fromRenderBounds,
  fromRenderPlane,
  fromRenderPoint,
  resolveCoordinateTransform,
  resolveMetersPerRenderUnit,
  shouldRebaseRenderFrame,
  shouldRescaleRenderFrame,
  toRenderBounds,
  toRenderPlane,
  toRenderPoint,
} from '#index.js';
import type { RenderFrame, SpatialMatrix, SpatialVector } from '#index.js';

const expectVectorClose = (actual: SpatialVector, expected: SpatialVector): void => {
  for (const index of [0, 1, 2] as const) {
    expect(actual[index]).toBeCloseTo(expected[index], 12);
  }
};

const transformByMatrix = (matrix: SpatialMatrix, point: SpatialVector): SpatialVector => [
  matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
  matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
  matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
];

describe('coordinate conventions', () => {
  const gltf = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
  const tau = { up: '+z', forward: '-y', metersPerUnit: 1 } as const;

  it('maps canonical glTF into Tau with an exact inverse', () => {
    const transform = resolveCoordinateTransform({ source: gltf, target: tau });
    expect(transform.matrix).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]);
    expect(transform.inverse).toEqual([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
    expect(transform.rotation).toEqual([expect.closeTo(Math.SQRT1_2, 15), 0, 0, expect.closeTo(Math.SQRT1_2, 15)]);
    expect(transform.inverseRotation).toEqual([
      expect.closeTo(-Math.SQRT1_2, 15),
      0,
      0,
      expect.closeTo(Math.SQRT1_2, 15),
    ]);
    expectVectorClose(
      transformByMatrix(transform.inverse, transformByMatrix(transform.matrix, [4, -2, 7])),
      [4, -2, 7],
    );
  });

  it('validates axes and scale', () => {
    expect(resolveCoordinateTransform({ source: { ...tau, metersPerUnit: 0.001 }, target: tau }).matrix[0]).toBe(0.001);
    expect(() => resolveCoordinateTransform({ source: { ...tau, forward: '+z' }, target: gltf })).toThrow(
      'distinct axes',
    );
    expect(() => resolveCoordinateTransform({ source: { ...tau, metersPerUnit: 0 }, target: gltf })).toThrow(
      'positive finite',
    );
  });

  it.each(['+q', 'x', '+xy', '', null, 42])('rejects a non-axis literal (%s)', (up) => {
    const source = { ...tau };
    Reflect.set(source, 'up', up);
    expect(() =>
      resolveCoordinateTransform({
        source,
        target: gltf,
      }),
    ).toThrow('Invalid signed world axis');
  });
});

describe('render frames', () => {
  const renderFrame: RenderFrame = {
    anchorFrameId: 'root',
    originMeters: [1_000_000, -2_000_000, 3_000_000],
    metersPerRenderUnit: 1e-9,
  };

  it('round-trips points, bounds, and planes', () => {
    const point = [1_000_000.000_000_02, -1_999_999.999_999_97, 3_000_000.000_000_04] as const;
    const bounds = { min: point, max: [point[0] + 8e-8, point[1] + 9e-8, point[2] + 1e-7] as const };
    const plane = { pointMeters: point, normal: [0, 0, 1] as const };
    expectVectorClose(fromRenderPoint({ renderFrame, point: toRenderPoint({ renderFrame, point }) }), point);
    const restoredBounds = fromRenderBounds({ renderFrame, bounds: toRenderBounds({ renderFrame, bounds }) });
    expectVectorClose(restoredBounds.min, bounds.min);
    expectVectorClose(restoredBounds.max, bounds.max);
    const restoredPlane = fromRenderPlane({ renderFrame, plane: toRenderPlane({ renderFrame, plane }) });
    expectVectorClose(restoredPlane.pointMeters, plane.pointMeters);
    expectVectorClose(restoredPlane.normal, plane.normal);
    expect(structuredClone(renderFrame)).toEqual(renderFrame);
  });

  it('selects SI-aligned scales without a human-scale floor', () => {
    const cases = [
      [20e-9, 1e-9],
      [0.1, 1e-3],
      [6.371e6, 1e6],
      [1e-30, 1e-30],
      [1e30, 1e30],
    ] as const;
    for (const [characteristicLengthMeters, expected] of cases) {
      expect(resolveMetersPerRenderUnit({ characteristicLengthMeters }) / expected).toBeCloseTo(1, 12);
    }
    expect(() => resolveMetersPerRenderUnit({ characteristicLengthMeters: 0 })).toThrow('greater than zero');
  });

  it('keeps scale inside the hysteresis band and rebases only beyond its threshold', () => {
    expect(
      shouldRescaleRenderFrame({ renderFrame: { ...renderFrame, metersPerRenderUnit: 1 }, visibleSpanMeters: 10 }),
    ).toBe(false);
    expect(
      shouldRescaleRenderFrame({ renderFrame: { ...renderFrame, metersPerRenderUnit: 1 }, visibleSpanMeters: 1e4 }),
    ).toBe(true);
    expect(shouldRebaseRenderFrame({ renderFrame, targetMeters: renderFrame.originMeters })).toBe(false);
    expect(shouldRebaseRenderFrame({ renderFrame, targetMeters: [1_000_000.000_02, -2_000_000, 3_000_000] })).toBe(
      true,
    );
  });
});
