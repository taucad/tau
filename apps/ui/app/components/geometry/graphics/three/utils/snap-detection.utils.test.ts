// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  detectSnapPoints,
  findClosestSnapPoint,
} from '#components/geometry/graphics/three/utils/snap-detection.utils.js';
import type { SnapPoint } from '#components/geometry/graphics/three/utils/snap-detection.utils.js';

const intersectionForFirstTriangle = (mesh: THREE.Mesh): THREE.Intersection<THREE.Mesh> => ({
  distance: 0,
  face: { a: 0, b: 1, c: 2, materialIndex: 0, normal: new THREE.Vector3(0, 0, 1) },
  faceIndex: 0,
  object: mesh,
  point: new THREE.Vector3(),
  uv: new THREE.Vector2(),
});

const localSnapSignature = (mesh: THREE.Mesh, snaps: ReturnType<typeof detectSnapPoints>): string[] => {
  const inverse = mesh.matrixWorld.clone().invert();
  return snaps
    .map(({ position, type }) => {
      const local = position.clone().applyMatrix4(inverse);
      return `${type}:${local.x.toPrecision(6)},${local.y.toPrecision(6)},${local.z.toPrecision(6)}`;
    })
    .sort();
};

describe('detectSnapPoints', () => {
  it('preserves planar feature identity through render-world matrix rescaling', () => {
    const signatures = [1e-9, 1, 1e9].map((scale) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      mesh.scale.setScalar(scale);
      mesh.updateMatrixWorld(true);
      return localSnapSignature(mesh, detectSnapPoints(mesh, intersectionForFirstTriangle(mesh)));
    });

    expect(signatures[0]).toEqual(signatures[1]);
    expect(signatures[2]).toEqual(signatures[1]);
    expect(signatures[1]).toHaveLength(9);
  });

  it('welds duplicated non-indexed vertices without merging distinct Float32-resolvable features', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [1.1e-6, -1e-3, 0, 1.4e-6, -1e-3, 0, 1.4e-6, 1e-3, 0, 1.1e-6, -1e-3, 0, 1.4e-6, 1e-3, 0, 1.1e-6, 1e-3, 0],
        3,
      ),
    );
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);

    expect(detectSnapPoints(mesh, intersectionForFirstTriangle(mesh))).toHaveLength(9);
  });

  it.each([1e-9, 1, 1e9])('detects circular snaps at local radius %s', (radius) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32));
    mesh.updateMatrixWorld(true);

    const snaps = detectSnapPoints(mesh, intersectionForFirstTriangle(mesh));
    expect(snaps).toHaveLength(5);
    expect(snaps.filter(({ type }) => type === 'edge-midpoint')).toHaveLength(4);
  });
});

describe('findClosestSnapPoint', () => {
  it('keeps final selection in screen pixels', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const near: SnapPoint = { position: new THREE.Vector3(0.02, 0, 0), type: 'vertex' };
    const far: SnapPoint = { position: new THREE.Vector3(0.5, 0, 0), type: 'vertex' };
    const canvas = { width: 1000, height: 1000 } satisfies Partial<HTMLCanvasElement>;

    expect(
      findClosestSnapPoint([far, near], {
        camera,
        canvas: canvas as HTMLCanvasElement,
        mousePos: new THREE.Vector2(0, 0),
        snapDistancePx: 12,
        snapPointBufferPx: 0,
      }),
    ).toBe(near);
  });
});
