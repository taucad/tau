// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeTriangulatedContours } from '#components/geometry/graphics/three/utils/earcut-contour.js';

const planeNormal = new THREE.Vector3(0, 0, 1);

function regularPolygon(radius: number, segments: number, z = 0): readonly THREE.Vector3[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
  });
}

function square(min: number, max: number): readonly THREE.Vector3[] {
  return [
    new THREE.Vector3(min, min, 0),
    new THREE.Vector3(max, min, 0),
    new THREE.Vector3(max, max, 0),
    new THREE.Vector3(min, max, 0),
  ];
}

function polygonArea(contour: readonly THREE.Vector3[]): number {
  let twiceArea = 0;
  for (let index = 0; index < contour.length; index++) {
    const current = contour[index]!;
    const next = contour[(index + 1) % contour.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea / 2);
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

describe('mergeTriangulatedContours single-loop behavior', () => {
  it('triangulates a unit square in z=0 to two triangles', () => {
    const contour: readonly THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(0, 1, 0),
    ];

    const { indices } = mergeTriangulatedContours([contour], planeNormal);
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

    const { indices } = mergeTriangulatedContours([contour], planeNormal);
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

    const { indices } = mergeTriangulatedContours([contour], planeNormal);
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

    const { positions, planeUv } = mergeTriangulatedContours([contour], planeNormal);
    expect(planeUv.length).toBe((positions.length / 3) * 2);
    expect(Number.isFinite(planeUv[0]!) && Number.isFinite(planeUv[1]!)).toBe(true);
  });

  it('treats contained loops as holes instead of filled islands', () => {
    const outer = regularPolygon(2, 96);
    const inner = regularPolygon(1, 96);

    const merged = mergeTriangulatedContours([outer, inner], planeNormal);

    expect(triangulatedArea(merged)).toBeCloseTo(polygonArea(outer) - polygonArea(inner), 4);
  });

  it('fills nested islands inside holes', () => {
    const outer = square(-2, 2);
    const hole = square(-1, 1);
    const island = square(-0.25, 0.25);

    const merged = mergeTriangulatedContours([outer, hole, island], planeNormal);

    expect(triangulatedArea(merged)).toBeCloseTo(polygonArea(outer) - polygonArea(hole) + polygonArea(island), 5);
  });

  it('keeps independent loops filled independently', () => {
    const left = square(-3, -2);
    const right = square(2, 3);

    const merged = mergeTriangulatedContours([left, right], planeNormal);

    expect(triangulatedArea(merged)).toBeCloseTo(polygonArea(left) + polygonArea(right), 5);
  });

  it('is stable when hole winding is reversed', () => {
    const outer = square(-2, 2);
    const hole = [...square(-1, 1)].reverse();

    const merged = mergeTriangulatedContours([outer, hole], planeNormal);

    expect(triangulatedArea(merged)).toBeCloseTo(polygonArea(outer) - polygonArea(hole), 5);
  });
});
