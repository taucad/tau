// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildSectionCapPolygon,
  collectSectionCapWorldPoints,
  computeSectionTrueCut,
  createSectionCutPlaneBasis,
  deriveSectionTrueCut,
  sanitizeCapRing,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';

const squareContour = (min: number, max: number, z = 0): THREE.Vector3[] => [
  new THREE.Vector3(min, min, z),
  new THREE.Vector3(max, min, z),
  new THREE.Vector3(max, max, z),
  new THREE.Vector3(min, max, z),
];

describe('section cap region projection', () => {
  it('should normalize far-from-origin cap polygons onto a shared stable plane basis', () => {
    const contour = squareContour(1_000_000_000, 1_000_000_004);
    const meshWorldMatrix = new THREE.Matrix4();
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const worldPoints = collectSectionCapWorldPoints({ contours: [contour], meshWorldMatrix });
    const basis = createSectionCutPlaneBasis({ worldPlane, worldPoints });

    const result = buildSectionCapPolygon({
      sourceKey: 'source-a',
      ownerKey: 'owner-a',
      geometryKey: 'geometry-a',
      contours: [contour],
      meshWorldMatrix,
      planeBasis: basis,
      trueCut: true,
    });

    expect(basis.normalizationScale).toBeCloseTo(0.25, 6);
    expect(result.polygon.area).toBeCloseTo(1, 6);
    expect(result.polygon.trueCut).toBe(true);
    expect(result.polygon.bbox).toEqual({
      minX: -0.5,
      minY: -0.5,
      maxX: 0.5,
      maxY: 0.5,
    });
  });

  it('should sanitize duplicate and collinear contour points before boolean input', () => {
    const ring = sanitizeCapRing([
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);

    expect(ring).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });
});

describe('computeSectionTrueCut', () => {
  it('should classify crossing cuts as true cuts and tangent cuts as non-overlap diagnostics', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const meshWorldMatrix = new THREE.Matrix4();

    expect(
      computeSectionTrueCut({
        geometry,
        meshWorldMatrix,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      }),
    ).toBe(true);

    expect(
      computeSectionTrueCut({
        geometry,
        meshWorldMatrix,
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -1),
      }),
    ).toBe(false);

    expect(
      computeSectionTrueCut({
        geometry,
        meshWorldMatrix: new THREE.Matrix4().makeTranslation(0, 0, 3),
        worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      }),
    ).toBe(false);
  });

  it('should derive common true-cut evidence from bounds and contours before triangle fallback', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const meshWorldMatrix = new THREE.Matrix4();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    expect(
      deriveSectionTrueCut({
        geometry,
        meshWorldMatrix,
        worldPlane: plane,
        closedContourCount: 1,
        closedContourArea: 1,
      }),
    ).toEqual({
      trueCut: true,
      method: 'contour-evidence',
    });

    expect(
      deriveSectionTrueCut({
        geometry,
        meshWorldMatrix: new THREE.Matrix4().makeTranslation(0, 0, 3),
        worldPlane: plane,
        closedContourCount: 0,
      }),
    ).toEqual({
      trueCut: false,
      method: 'bounds-reject',
    });

    expect(
      deriveSectionTrueCut({
        geometry,
        meshWorldMatrix,
        worldPlane: plane,
        closedContourCount: 0,
      }),
    ).toEqual({
      trueCut: true,
      method: 'triangle-fallback',
    });
  });
});
