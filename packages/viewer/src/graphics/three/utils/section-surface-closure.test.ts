import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { censusSectionSurfaceClosure } from '#graphics/three/utils/section-surface-closure.js';

const inputOf = (geometry: THREE.BufferGeometry) => ({
  positions: Float64Array.from(geometry.getAttribute('position').array),
  triangleVertices: Uint32Array.from(
    geometry.index
      ? geometry.index.array
      : Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i),
  ),
});

describe('censusSectionSurfaceClosure', () => {
  it('should weld only the seams an indexed census leaves unbalanced', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    geometry.deleteAttribute('normal').deleteAttribute('uv');
    const census = censusSectionSurfaceClosure(inputOf(geometry));

    // BoxGeometry splits its faces at the box edges: those edges are unbalanced by index, balanced once welded.
    expect(census).toMatchObject({ isClosed: true, unbalancedEdgeCount: 0 });
    expect(census.indexUnbalancedEdgeCount).toBeGreaterThan(0);
  });

  it('should leave a gap wider than the weld open, and close one narrower', () => {
    const near = new THREE.BoxGeometry(1, 1, 1);
    const position = near.getAttribute('position');
    // Nudge one corner of the +x face: by a billionth of the diagonal it still welds; by a thousandth it opens.
    const nudged = (offset: number) => {
      const geometry = near.clone();
      const attribute = geometry.getAttribute('position');
      attribute.setX(0, position.getX(0) + offset);
      return censusSectionSurfaceClosure(inputOf(geometry));
    };

    expect(nudged(1e-9).isClosed).toBe(true);
    expect(nudged(1e-3)).toMatchObject({ isClosed: false });
  });

  it('should close an edge shared by four faces of two consistently oriented solids', () => {
    const shared = mergeGeometries([
      new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0),
      new THREE.BoxGeometry(1, 1, 1).translate(-0.5, -0.5, 0),
    ]);

    expect(censusSectionSurfaceClosure(inputOf(shared)).isClosed).toBe(true);
  });

  it('should open a surface with no triangles', () => {
    expect(
      censusSectionSurfaceClosure({ positions: new Float64Array(0), triangleVertices: new Uint32Array(0) }).isClosed,
    ).toBe(false);
  });
});
