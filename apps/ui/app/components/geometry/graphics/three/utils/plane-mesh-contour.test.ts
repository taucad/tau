// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  createSegmentScratch,
  extractSectionContours,
} from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import { mergeTriangulatedContours } from '#components/geometry/graphics/three/utils/earcut-contour.js';

function mergeNonIndexedGeometries(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let floatCount = 0;
  const positionArrays: Float32Array[] = [];

  for (const geometry of geometries) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const position = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    positionArrays.push(array);
    floatCount += array.length;
  }

  const positions = new Float32Array(floatCount);
  let offset = 0;
  for (const array of positionArrays) {
    positions.set(array, offset);
    offset += array.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return merged;
}

function triangulatedArea(result: ReturnType<typeof mergeTriangulatedContours>): number {
  let area = 0;
  for (let index = 0; index < result.indices.length; index += 3) {
    const aIndex = result.indices[index]! * 3;
    const bIndex = result.indices[index + 1]! * 3;
    const cIndex = result.indices[index + 2]! * 3;
    const a = new THREE.Vector3(result.positions[aIndex], result.positions[aIndex + 1], result.positions[aIndex + 2]);
    const b = new THREE.Vector3(result.positions[bIndex], result.positions[bIndex + 1], result.positions[bIndex + 2]);
    const c = new THREE.Vector3(result.positions[cIndex], result.positions[cIndex + 1], result.positions[cIndex + 2]);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }

  return area;
}

describe('extractSectionContours', () => {
  it('should return one rectangular loop for a centered box cut by an axis plane', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(256);

    const result = extractSectionContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(scratch.count).toBeGreaterThan(0);
    expect(result.closedContours.length).toBe(1);
    expect(result.closedContours[0]!.length).toBeGreaterThanOrEqual(4);
    expect(result.openPolylines).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('should return two loops for a torus cut by a plane through the hole axis', () => {
    const geometry = new THREE.TorusGeometry(1.4, 0.45, 24, 64);
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(4096);

    const result = extractSectionContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(result.closedContours.length).toBe(2);
  });

  it('should return an open polyline for a single open triangle cut to one segment', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -1, 1, 0, 1, 0, 1, 1]), 3));
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(64);

    const result = extractSectionContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(result.closedContours.length).toBe(0);
    expect(result.openPolylines.length).toBe(1);
    expect(result.openPolylines[0]!.length).toBe(2);
  });

  it('should recover fillable cap cycles from a branched non-manifold section graph', () => {
    const leftBox = new THREE.BoxGeometry(2, 2, 2).translate(-1, 0, 0);
    const rightBox = new THREE.BoxGeometry(2, 2, 2).translate(1, 0, 0);
    const geometry = mergeNonIndexedGeometries([leftBox, rightBox]);
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(512);

    const result = extractSectionContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ kind: 'branched-component' }));
    expect(result.closedContours.length).toBeGreaterThan(0);

    const cap = mergeTriangulatedContours(result.closedContours, worldPlane.normal);
    expect(triangulatedArea(cap)).toBeCloseTo(8, 5);
  });

  it('should reuse segment scratch slots across extraction runs', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const bvh = new MeshBVH(geometry);
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const meshWorld = new THREE.Matrix4();
    const scratch = createSegmentScratch(16);
    const firstSlot = scratch.slots[0];

    extractSectionContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });
    extractSectionContours({
      geometry,
      bvh,
      worldPlane,
      meshWorldMatrix: meshWorld,
      segmentScratch: scratch,
    });

    expect(scratch.slots[0]).toBe(firstSlot);
  });
});
