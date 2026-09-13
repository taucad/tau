// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  createSegmentScratch,
  extractClosedContours,
} from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';

describe('extractClosedContours', () => {
  it('returns one rectangular loop for a centered box cut by an axis plane', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(256);

    const contours = extractClosedContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(scratch.count).toBeGreaterThan(0);
    expect(contours.length).toBe(1);
    expect(contours[0]!.length).toBeGreaterThanOrEqual(4);
  });

  it('returns two loops for a torus cut by a plane through the hole axis', () => {
    const geometry = new THREE.TorusGeometry(1.4, 0.45, 24, 64);
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(4096);

    const contours = extractClosedContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(contours.length).toBe(2);
  });

  it('returns no closed contours for a single open triangle cut to a single segment chain', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.25);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(64);

    const contours = extractClosedContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(contours.length).toBe(0);
  });
});
