// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildSectionCapBoundaryPositions,
  countSectionCapBoundarySegments,
} from '#components/geometry/graphics/three/utils/section-cap-boundary.js';
import { createSectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const asNumbers = (array: Float32Array): number[] => [...array];

describe('section cap boundary positions', () => {
  it('should count all outer and hole ring segments from the sanitized cap multipolygon', () => {
    const multiPolygon: CapMultiPolygon = [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        [
          [0.5, 0.5],
          [1.5, 0.5],
          [1.5, 1.5],
          [0.5, 1.5],
        ],
      ],
    ];

    expect(countSectionCapBoundarySegments(multiPolygon)).toEqual({
      ringCount: 2,
      segmentCount: 8,
    });
  });

  it('should emit local-space endpoint pairs from the same plane basis used by cap triangulation', () => {
    const basis = createSectionCutPlaneBasis({ worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) });
    const multiPolygon: CapMultiPolygon = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    ];

    const result = buildSectionCapBoundaryPositions({
      multiPolygon,
      basis,
      meshWorldInverse: new THREE.Matrix4(),
    });

    expect(result.stats).toEqual({ ringCount: 1, segmentCount: 4 });
    expect(asNumbers(result.positions)).toEqual([
      0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it('should apply an explicit plane-normal bias when requested', () => {
    const basis = createSectionCutPlaneBasis({ worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) });
    const result = buildSectionCapBoundaryPositions({
      multiPolygon: [
        [
          [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        ],
      ],
      basis,
      meshWorldInverse: new THREE.Matrix4(),
      planeNormalBias: 0.01,
    });

    expect(
      [...result.positions].filter((value, index) => index % 3 === 2).map((value) => Number(value.toFixed(4))),
    ).toEqual([0.01, 0.01, 0.01, 0.01, 0.01, 0.01]);
  });
});
