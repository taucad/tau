import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AnnotationView } from '@taucad/chat/annotations';
import type { CommentPinSurface, CommentSurfacePick } from '@taucad/viewer/cad/comment-pins';
import { useImageLift } from '#components/comments/image-lift.js';
import { useRegisterViewerSurface, ViewerSurfacesProvider } from '#components/comments/viewer-surfaces.js';
import type { ViewerSurfaceEntry } from '#components/comments/viewer-surfaces.js';

const view: AnnotationView = {
  path: 'main.ts',
  revision: 'r1',
  scene: 's1',
  camera: {
    frameId: 'tau:root',
    position: [0, 0, 1],
    target: [0, 0, 0],
    up: [0, 1, 0],
    projection: { kind: 'perspective', verticalFieldOfView: 45, zoom: 1 },
    clipping: { near: 0.01, far: 10 },
    aspect: 1,
  },
};

const pick: CommentSurfacePick = {
  point: [0, 0, 0],
  normal: [0, 0, 1],
  geometryKey: 'r1',
  camera: view.camera as unknown as CommentSurfacePick['camera'],
};

const liftWith = (presented: { revision: string; scene: string }) => {
  const pickRay = vi.fn<CommentPinSurface['pickRay']>(() => pick);
  const entry: ViewerSurfaceEntry = {
    path: 'main.ts',
    kernelView: undefined,
    instance: undefined,
    presented: () => presented,
    surface: { current: { pick: vi.fn(), hover: vi.fn(), pickRay } },
  };
  const { result } = renderHook(
    () => {
      useRegisterViewerSurface(entry);
      return useImageLift(view);
    },
    { wrapper: ViewerSurfacesProvider },
  );
  return { lift: result.current!, pickRay };
};

describe('useImageLift', () => {
  it("should lift a picture point through a pane that shows the picture's scene at its revision", () => {
    const { lift, pickRay } = liftWith({ revision: 'r1', scene: 's1' });
    expect(lift([0.5, 0.5])).toBe(pick);
    const [ray] = pickRay.mock.calls[0]!;
    expect(ray.origin).toEqual([0, 0, 1]);
    expect(ray.direction[2]).toBeCloseTo(-1);
  });

  it('should not lift while the pane shows other geometry', () => {
    const { lift, pickRay } = liftWith({ revision: 'r2', scene: 's1' });
    expect(lift([0.5, 0.5])).toBeUndefined();
    expect(pickRay).not.toHaveBeenCalled();
  });
});
