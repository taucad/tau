// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  mergeTriangulatedContours,
  triangulateContour,
} from '#components/geometry/graphics/three/utils/earcut-contour.js';

const planeNormal = new THREE.Vector3(0, 0, 1);

describe('triangulateContour', () => {
  it('triangulates a unit square in z=0 to two triangles', () => {
    const contour: readonly THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(0, 1, 0),
    ];

    const { indices } = triangulateContour(contour, planeNormal);
    expect(indices.length).toBe(6);
  });

  it('triangulates an L-shaped contour to four triangles', () => {
    const contour: readonly THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1, 2, 0),
      new THREE.Vector3(0, 2, 0),
    ];

    const { indices } = triangulateContour(contour, planeNormal);
    expect(indices.length).toBe(12);
  });

  it('triangulates a non-convex pentagon', () => {
    const contour: readonly THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 2, 0),
      new THREE.Vector3(1, 0.5, 0),
      new THREE.Vector3(0, 2, 0),
    ];

    const { indices } = triangulateContour(contour, planeNormal);
    expect(indices.length).toBe(9);
  });
});

describe('mergeTriangulatedContours', () => {
  it('merges independent loops with remapped indices', () => {
    const a: readonly THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0.5, 1, 0),
    ];
    const b: readonly THREE.Vector3[] = [
      new THREE.Vector3(3, 0, 0),
      new THREE.Vector3(4, 0, 0),
      new THREE.Vector3(3.5, 1, 0),
    ];

    const merged = mergeTriangulatedContours([a, b], planeNormal);
    expect(merged.indices.length).toBe(6);
    expect(merged.positions.length / 3).toBe(6);
    expect(merged.planeUv.length / 2).toBe(6);
    const maxIndex = Math.max(...merged.indices);
    expect(maxIndex).toBe(5);
  });

  it('emits a plane-aligned planeUv entry per vertex', () => {
    const contour: readonly THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(0, 1, 0),
    ];

    const { positions, planeUv } = triangulateContour(contour, planeNormal);
    expect(planeUv.length).toBe((positions.length / 3) * 2);
    expect(Number.isFinite(planeUv[0]!) && Number.isFinite(planeUv[1]!)).toBe(true);
  });
});
