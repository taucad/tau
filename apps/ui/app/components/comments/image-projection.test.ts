import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { AnnotationCamera, AnnotationVec3 } from '@taucad/chat/annotations';
import { angleBetweenViews, isSameCamera, projectToImage } from '#components/comments/image-projection.js';

const position: AnnotationVec3 = [0.3, -0.4, 0.25];
const target: AnnotationVec3 = [0.02, 0.01, 0.03];
const up: AnnotationVec3 = [0, 0, 1];
const aspect = 1.6;

const perspective: AnnotationCamera = {
  frameId: 'tau:root',
  position,
  target,
  up,
  projection: { kind: 'perspective', verticalFieldOfView: 45, zoom: 1.5 },
  clipping: { near: 0.01, far: 10 },
  aspect,
};
const orthographic: AnnotationCamera = {
  ...perspective,
  projection: { kind: 'orthographic', verticalSpan: 0.4, zoom: 2 },
};

/** What three.js draws for the same camera: the reference the picture renderer agrees with. */
const threeFraction = (camera: PerspectiveCamera | OrthographicCamera, point: AnnotationVec3): [number, number] => {
  camera.position.set(...position);
  camera.up.set(...up);
  camera.lookAt(new Vector3(...target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const ndc = new Vector3(...point).project(camera);
  return [(ndc.x + 1) / 2, (1 - ndc.y) / 2];
};

const points: AnnotationVec3[] = [
  [0.02, 0.01, 0.03],
  [0.1, 0.05, -0.02],
  [-0.08, 0.12, 0.09],
];

describe('projectToImage', () => {
  it('should place a point where a perspective camera with zoom draws it', () => {
    const camera = new PerspectiveCamera(45, aspect, 0.01, 10);
    camera.zoom = 1.5;
    for (const point of points) {
      const [x, y] = threeFraction(camera, point);
      const projected = projectToImage(perspective, point);
      expect(projected?.at[0]).toBeCloseTo(x, 9);
      expect(projected?.at[1]).toBeCloseTo(y, 9);
    }
  });

  it('should place a point where an orthographic camera with zoom draws it', () => {
    const half = 0.4 / 2;
    const camera = new OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.01, 10);
    camera.zoom = 2;
    for (const point of points) {
      const [x, y] = threeFraction(camera, point);
      const projected = projectToImage(orthographic, point);
      expect(projected?.at[0]).toBeCloseTo(x, 9);
      expect(projected?.at[1]).toBeCloseTo(y, 9);
    }
  });

  it('should put the camera target at the centre and refuse a point behind a perspective camera', () => {
    const centre = projectToImage(perspective, target);
    expect(centre?.at[0]).toBeCloseTo(0.5, 9);
    expect(centre?.at[1]).toBeCloseTo(0.5, 9);
    expect(projectToImage(perspective, [0.6, -0.8, 0.5])).toBeUndefined();
  });
});

describe('camera comparison', () => {
  it('should treat a camera that survived a JSON round trip as the same, and a moved one as another', () => {
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- the stored record is JSON, which is what must compare equal.
    const stored = JSON.parse(JSON.stringify(perspective)) as AnnotationCamera;
    expect(isSameCamera(perspective, stored)).toBe(true);
    expect(isSameCamera(perspective, { ...perspective, position: [0.3, -0.4, 0.26] })).toBe(false);
    expect(isSameCamera(perspective, orthographic)).toBe(false);
  });

  it('should measure the angle between view directions', () => {
    expect(angleBetweenViews(perspective, perspective)).toBeCloseTo(0, 6);
    const side: AnnotationCamera = { ...perspective, position: [1, 0, 0], target: [0, 0, 0] };
    const top: AnnotationCamera = { ...perspective, position: [0, 0, 1], target: [0, 0, 0], up: [0, 1, 0] };
    expect(angleBetweenViews(side, top)).toBeCloseTo(90, 6);
  });
});
