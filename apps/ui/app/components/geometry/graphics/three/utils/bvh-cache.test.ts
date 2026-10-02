import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';

describe('getOrBuildBvh', () => {
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
});
