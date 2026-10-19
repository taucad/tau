import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sliceSectionLoops } from '#graphics/three/utils/section-loop-slice.js';

/** Nine coordinates per triangle of `geometry`, after `matrix`. */
const soupOf = (geometry: THREE.BufferGeometry, matrix = new THREE.Matrix4()): Float64Array => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  flat.applyMatrix4(matrix);
  return Float64Array.from(flat.getAttribute('position').array);
};

const box = (size: number, at: readonly [number, number, number] = [0, 0, 0]): THREE.BufferGeometry =>
  new THREE.BoxGeometry(size, size, size).translate(...at);

/** A box with its +x face removed. */
const openBox = (size: number): THREE.BufferGeometry => {
  const geometry = box(size);
  geometry.setIndex([...geometry.getIndex()!.array].slice(6));
  return geometry;
};

/** The area the fill covers, counted even-odd at the centres of a 0.02 grid that the fixtures' edges fall between. */
const evenOddArea = (fill: Float32Array, half: number): number => {
  const steps = Math.round(half * 100);
  const cell = (2 * half) / steps;
  let covered = 0;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = -half + (i + 0.5) * cell;
      const y = -half + (j + 0.5) * cell;
      let isInside = false;
      for (let t = 0; t < fill.length; t += 9) {
        const [ax, ay, bx, by, cx, cy] = [
          fill[t]!,
          fill[t + 1]!,
          fill[t + 3]!,
          fill[t + 4]!,
          fill[t + 6]!,
          fill[t + 7]!,
        ];
        // A fan over collinear loop points has no area, and a rasterizer draws none of it.
        if ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay) === 0) {
          continue;
        }
        const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
        const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
        const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
        const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNegative && hasPositive)) {
          isInside = !isInside;
        }
      }
      covered += isInside ? 1 : 0;
    }
  }
  return covered * cell * cell;
};

const horizontal = [0, 0, 1, 0.1] as const;

describe('sliceSectionLoops', () => {
  it('should close a box cut into one loop whose fill covers its section', () => {
    const slice = sliceSectionLoops({ triangles: soupOf(box(2)), plane: horizontal, weldTolerance: 1e-9 });

    expect(slice.closedLoops).toHaveLength(1);
    expect(slice.openChains).toHaveLength(0);
    expect(slice.openTriangles).toHaveLength(0);
    expect(evenOddArea(slice.fill, 1.5)).toBeCloseTo(4, 1);
  });

  it('should leave an open box cut as one open chain over the triangles it crosses, with no fill', () => {
    const slice = sliceSectionLoops({ triangles: soupOf(openBox(2)), plane: horizontal, weldTolerance: 1e-9 });

    expect(slice.closedLoops).toHaveLength(0);
    expect(slice.openChains).toHaveLength(1);
    // Three walls of two triangles each cross the plane; the chain runs from one open edge to the other.
    expect(slice.openTriangles).toHaveLength(6 * 9);
    const chain = slice.openChains[0]!;
    expect([chain[0], chain.at(-3)]).toEqual([1, 1]);
    expect(slice.fill).toHaveLength(0);
  });

  it('should fill a hollow section even-odd: the wall between two nested loops, not the hole', () => {
    const outer = box(2);
    // Inward-facing inner box: a closed solid with a cavity.
    const inner = box(1).scale(-1, 1, 1);
    const slice = sliceSectionLoops({
      triangles: soupOf(mergeGeometries([outer, inner])),
      plane: horizontal,
      weldTolerance: 1e-9,
    });

    expect(slice.closedLoops).toHaveLength(2);
    expect(slice.openChains).toHaveLength(0);
    expect(evenOddArea(slice.fill, 1.5)).toBeCloseTo(4 - 1, 1);
  });

  it('should cap every loop of a cracked part and leave only the crack open', () => {
    const intact = box(2, [-3, 0, 0]);
    const cracked = openBox(2);
    const slice = sliceSectionLoops({
      triangles: soupOf(mergeGeometries([intact, cracked])),
      plane: horizontal,
      weldTolerance: 1e-9,
    });

    expect(slice.closedLoops).toHaveLength(1);
    expect(slice.openChains).toHaveLength(1);
    expect(evenOddArea(slice.fill, 4.5)).toBeCloseTo(4, 1);
  });

  it('should keep two solids that share a face closed and fill both', () => {
    const left = box(2, [-1, 0, 0]);
    const right = box(2, [1, 0, 0]);
    const slice = sliceSectionLoops({
      triangles: soupOf(mergeGeometries([left, right])),
      plane: horizontal,
      weldTolerance: 1e-9,
    });

    // The shared face's two triangulations cut it at different points, so the loops need not merge; neither opens.
    expect(slice.openChains).toHaveLength(0);
    expect(slice.closedLoops.length).toBeGreaterThan(0);
    expect(evenOddArea(slice.fill, 2.5)).toBeCloseTo(8, 1);
  });

  it('should keep a sliver triangle without opening the loop it lies on', () => {
    const triangles = soupOf(box(2));
    // A zero-area sliver across the plane on the -y wall, with three distinct corners: its cut is a single point.
    const sliver = Float64Array.from([-1, -1, -0.5, 0, -1, 0, 1, -1, 0.5]);
    const slice = sliceSectionLoops({
      triangles: Float64Array.from([...triangles, ...sliver]),
      plane: horizontal,
      weldTolerance: 1e-9,
    });

    expect(slice.closedLoops).toHaveLength(1);
    expect(slice.openChains).toHaveLength(0);
  });

  it('should weld cut points across a seam of duplicated vertices', () => {
    // Every face of a non-indexed box has its own vertices; the cut points still meet.
    const slice = sliceSectionLoops({
      triangles: soupOf(box(2).toNonIndexed()),
      plane: horizontal,
      weldTolerance: 1e-9,
    });

    expect(slice.closedLoops).toHaveLength(1);
    expect(slice.openChains).toHaveLength(0);
  });
});
