import { Matrix4, Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import {
  createThreeRenderMatrix,
  fromThreeRenderPoint,
  fromThreeRenderRay,
  toThreeRenderPoint,
  toThreeRenderRay,
} from '#spatial.js';

const renderFrame: RenderFrame = {
  anchorFrameId: 'test-root',
  originMeters: [1, -2, 3],
  metersPerRenderUnit: 1e-6,
};

describe('Three spatial adapter', () => {
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

  it('round-trips rays without scaling their normalized direction', () => {
    const physical = new Ray(new Vector3(1.002, -2, 3), new Vector3(1, 2, 3).normalize());
    const native = toThreeRenderRay({ renderFrame, ray: physical });
    const restored = fromThreeRenderRay({ renderFrame, ray: native });
    expect(restored.origin.distanceTo(physical.origin)).toBe(0);
    expect(restored.direction.distanceTo(physical.direction)).toBeLessThan(1e-15);
  });
});
