// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCurrentSectionBaseCapGeometry } from '#components/geometry/graphics/three/utils/section-cap-current-base.js';
import { createSectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import { sectionCapNormalRegionKind } from '#components/geometry/graphics/three/utils/section-cap-style.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

describe('buildCurrentSectionBaseCapGeometry', () => {
  it('should pack a current base cap as normal-region geometry without overlap ownership', () => {
    const multiPolygon: CapMultiPolygon = [
      [
        [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ],
      ],
    ];
    const buffers = buildCurrentSectionBaseCapGeometry({
      multiPolygon,
      basis: createSectionCutPlaneBasis({ worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) }),
      meshWorldInverse: new THREE.Matrix4(),
    });

    expect(buffers.positions.length).toBeGreaterThan(0);
    expect(buffers.indices.length).toBeGreaterThan(0);
    expect(buffers.regionKinds.length).toBe(buffers.positions.length / 3);
    expect(new Set(buffers.regionKinds)).toEqual(new Set([sectionCapNormalRegionKind]));
  });

  it('should return an empty packed cap when the sanitized base polygon is empty', () => {
    const buffers = buildCurrentSectionBaseCapGeometry({
      multiPolygon: [],
      basis: createSectionCutPlaneBasis({ worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) }),
      meshWorldInverse: new THREE.Matrix4(),
    });

    expect(buffers.positions).toHaveLength(0);
    expect(buffers.indices).toHaveLength(0);
    expect(buffers.regionKinds).toHaveLength(0);
  });
});
