import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  getCachedBvh,
  getOrBuildBvh,
  intersectsBvhGeometryBounds,
} from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { estimateMemoryInBytes } from 'three-mesh-bvh';

describe('getOrBuildBvh', () => {
  it('should read only the actual retained tree without implicitly constructing bounds or another tree', () => {
    const geometry = new THREE.BoxGeometry();
    const computeBounds = vi.spyOn(geometry, 'computeBoundingBox');
    try {
      expect(getCachedBvh(geometry)).toBeUndefined();
      expect(geometry.boundingBox).toBeNull();
      expect(computeBounds).not.toHaveBeenCalled();
      const tree = getOrBuildBvh(geometry);
      expect(getCachedBvh(geometry)).toBe(tree);
      expect(estimateMemoryInBytes(tree)).toBeGreaterThan(0);
      expect(getCachedBvh(geometry)).toBe(tree);
      expect(computeBounds).toHaveBeenCalledOnce();
    } finally {
      geometry.dispose();
      computeBounds.mockRestore();
    }
  });

  it('should retire only the disposed geometry cache and rebuild only on a later explicit query', () => {
    const geometry = new THREE.BoxGeometry();
    const unrelated = new THREE.BoxGeometry();
    try {
      const first = getOrBuildBvh(geometry);
      const other = getOrBuildBvh(unrelated);
      geometry.getAttribute('position').needsUpdate = true;
      const updated = getOrBuildBvh(geometry);
      expect(updated).not.toBe(first);
      geometry.dispose();
      expect(getCachedBvh(geometry)).toBeUndefined();
      expect(getCachedBvh(unrelated)).toBe(other);
      const restored = getOrBuildBvh(geometry);
      expect(restored).not.toBe(updated);
      expect(getCachedBvh(geometry)).toBe(restored);
      geometry.dispose();
      expect(getCachedBvh(geometry)).toBeUndefined();
      expect(getCachedBvh(unrelated)).toBe(other);
    } finally {
      geometry.dispose();
      unrelated.dispose();
    }
  });

  it('returns the same MeshBVH instance when position version is unchanged', () => {
    const geometry = new THREE.BoxGeometry();
    const first = getOrBuildBvh(geometry);
    const second = getOrBuildBvh(geometry);
    expect(second).toBe(first);
  });

  it('rebuilds when position attribute is updated (version bump)', () => {
    const geometry = new THREE.BoxGeometry();
    const first = getOrBuildBvh(geometry);

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, 999, 0, 0);
    position.needsUpdate = true;

    const second = getOrBuildBvh(geometry);
    expect(second).not.toBe(first);
  });

  it('preserves source triangle indices used by topology mappings', () => {
    const geometry = new THREE.SphereGeometry(1, 16, 8);
    const before = [...(geometry.index!.array as Uint16Array)];

    getOrBuildBvh(geometry);

    expect([...(geometry.index!.array as Uint16Array)]).toEqual(before);
  });

  it('computes bounds once per position revision across bounds checks and BVH construction', () => {
    const geometry = new THREE.BoxGeometry();
    const computeBounds = vi.spyOn(geometry, 'computeBoundingBox');
    const ray = new THREE.Ray(new THREE.Vector3(10, 0, 2), new THREE.Vector3(0, 0, -1));
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    const bvh = getOrBuildBvh(geometry);
    expect(getOrBuildBvh(geometry)).toBe(bvh);
    expect(computeBounds).toHaveBeenCalledTimes(1);

    geometry.getAttribute('position').needsUpdate = true;
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    expect(computeBounds).toHaveBeenCalledTimes(2);
  });

  it('refreshes bounds when an interleaved position buffer changes', () => {
    const geometry = new THREE.BufferGeometry();
    const data = new THREE.InterleavedBuffer(new Float32Array([9, -1, 0, 1, 11, -1, 0, 1, 10, 1, 0, 1]), 4);
    const position = new THREE.InterleavedBufferAttribute(data, 3, 0);
    geometry.setAttribute('position', position);
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(false);
    for (let index = 0; index < position.count; index++) {
      position.setX(index, position.getX(index) - 10);
    }
    data.needsUpdate = true;
    expect(intersectsBvhGeometryBounds(geometry, ray)).toBe(true);
  });
});
