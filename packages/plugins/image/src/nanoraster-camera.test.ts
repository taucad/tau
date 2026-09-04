import { describe, expect, it } from 'vitest';
import type { CameraState } from '@taucad/camera';
import { toNanorasterCamera } from '#nanoraster-camera.js';

describe('toNanorasterCamera', () => {
  const projections: ReadonlyArray<CameraState['projection']> = [
    {
      kind: 'perspective',
      verticalFieldOfView: 52,
      zoom: 1.4,
    },
    {
      kind: 'orthographic',
      verticalSpan: 12,
      zoom: 2,
    },
  ];

  it.each(projections)('preserves fixed camera state for $kind capture', (projection) => {
    expect(
      toNanorasterCamera({
        cameraState: {
          frameId: 'tau:root',
          position: [8, -6, 4],
          target: [1, 2, 3],
          up: [0.1, 0.2, 0.97],
          projection,
          clipping: { near: 0.2, far: 900 },
          aspect: 16 / 9,
        },
      }),
    ).toEqual({
      framing: 'fixed',
      position: [8, -6, 4],
      target: [1, 2, 3],
      up: [0.1, 0.2, 0.97],
      projection,
      clipping: { near: 0.2, far: 900 },
    });
  });

  it('preserves a near-orthographic Three perspective matrix within nanoraster ranges', () => {
    const camera = toNanorasterCamera({
      cameraState: {
        frameId: 'tau:root',
        position: [0, -10, 5],
        target: [0, 0, 0],
        up: [0, 0, 1],
        projection: { kind: 'perspective', verticalFieldOfView: 0.1, zoom: 2 },
        clipping: { near: 0.1, far: 1000 },
        aspect: 1,
      },
    });
    const { projection } = camera;
    if (
      camera.framing !== 'fixed' ||
      projection?.kind !== 'perspective' ||
      projection.verticalFieldOfView === undefined ||
      !('zoom' in projection) ||
      projection.zoom === undefined
    ) {
      throw new Error('Expected explicit perspective camera');
    }
    expect(projection.verticalFieldOfView).toBe(1);
    expect(Math.tan((projection.verticalFieldOfView * Math.PI) / 360) / projection.zoom).toBeCloseTo(
      Math.tan((0.1 * Math.PI) / 360) / 2,
      15,
    );
  });

  it('normalizes out-of-range zoom while preserving the effective projection', () => {
    const perspective = toNanorasterCamera({
      cameraState: {
        frameId: 'tau:root',
        position: [0, -10, 5],
        target: [0, 0, 0],
        up: [0, 0, 1],
        projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1000 },
        clipping: { near: 0.1, far: 1000 },
        aspect: 1,
      },
    });
    const orthographic = toNanorasterCamera({
      cameraState: {
        frameId: 'tau:root',
        position: [0, -10, 5],
        target: [0, 0, 0],
        up: [0, 0, 1],
        projection: { kind: 'orthographic', verticalSpan: 12, zoom: 200 },
        clipping: { near: 0.1, far: 1000 },
        aspect: 1,
      },
    });
    if (
      perspective.framing !== 'fixed' ||
      perspective.projection?.kind !== 'perspective' ||
      orthographic.framing !== 'fixed' ||
      orthographic.projection?.kind !== 'orthographic'
    ) {
      throw new Error('Expected fixed camera projections');
    }
    expect(perspective.projection.zoom).toBe(100);
    expect(
      Math.tan((perspective.projection.verticalFieldOfView! * Math.PI) / 360) / perspective.projection.zoom!,
    ).toBeCloseTo(Math.tan((52 * Math.PI) / 360) / 1000, 15);
    expect(orthographic.projection).toEqual({ kind: 'orthographic', verticalSpan: 6, zoom: 100 });
  });

  it('rejects camera states that are not expressed in the Tau root frame', () => {
    expect(() =>
      toNanorasterCamera({
        cameraState: {
          frameId: 'assembly:part',
          position: [0, -10, 5],
          target: [0, 0, 0],
          up: [0, 0, 1],
          projection: { kind: 'orthographic', verticalSpan: 12, zoom: 1 },
          clipping: { near: 0.1, far: 1000 },
          aspect: 1,
        },
      }),
    ).toThrow(RangeError);
    expect(() =>
      toNanorasterCamera({
        cameraState: {
          frameId: 'assembly:part',
          position: [0, -10, 5],
          target: [0, 0, 0],
          up: [0, 0, 1],
          projection: { kind: 'orthographic', verticalSpan: 12, zoom: 1 },
          clipping: { near: 0.1, far: 1000 },
          aspect: 1,
        },
      }),
    ).toThrow('must use frame "tau:root"');
  });
});
