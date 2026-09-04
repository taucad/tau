import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import * as spatialModule from '#spatial.js';
import { createThreeRenderMatrix, fromThreeRenderPoint, toThreeRenderPoint } from '#spatial.js';

const renderFrame: RenderFrame = {
  anchorFrameId: 'test-root',
  originMeters: [1, -2, 3],
  metersPerRenderUnit: 1e-6,
};

describe('Three spatial adapter', () => {
  it('publishes only consumed adapter functions', () => {
    expect(Object.keys(spatialModule).sort()).toEqual([
      'createThreeRenderMatrix',
      'fromThreeRenderBounds',
      'fromThreeRenderPoint',
      'toThreeRenderBounds',
      'toThreeRenderPlane',
      'toThreeRenderPoint',
    ]);
  });

  it('maps points through the same outer scene matrix and inverse', () => {
    const physicalPoint = [1.002, -1.997, 2.996] as const;
    const direct = toThreeRenderPoint({ renderFrame, pointMeters: physicalPoint });
    const matrixPoint = new Vector3(...physicalPoint).applyMatrix4(createThreeRenderMatrix(renderFrame));
    expect(matrixPoint.distanceTo(direct)).toBeLessThan(1e-6);
    const restored = fromThreeRenderPoint({ renderFrame, point: direct });
    expect(restored[0]).toBe(physicalPoint[0]);
    expect(restored[1]).toBe(physicalPoint[1]);
    expect(restored[2]).toBe(physicalPoint[2]);
    const identity = createThreeRenderMatrix(renderFrame)
      .clone()
      .multiply(new Matrix4().copy(createThreeRenderMatrix(renderFrame)).invert());
    expect(identity.elements).toEqual(new Matrix4().elements.map((value): unknown => expect.closeTo(value, 12)));
  });
});
