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
          frameId: 'image:test',
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
        frameId: 'image:test',
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
});
