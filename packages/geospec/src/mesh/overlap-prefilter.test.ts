import { describe, expect, it } from 'vitest';
import {
  buildComponentDisjointnessData,
  disjointnessMargin,
  provePairDisjoint,
  trianglePairSeparated,
} from '#mesh/overlap-prefilter.js';
import { boxSoup, rotateSoupZ } from '#mesh/testing/overlap-subjects.js';
import type { AabbMeters } from '#mesh/types.js';

const aabb = (min: [number, number, number], max: [number, number, number]): AabbMeters => ({ min, max });

const soupOf = (values: number[]): Float32Array<ArrayBuffer> => new Float32Array(values);

/** Wrap one 9-float triangle as pre-filter data for the pair certificate. */
const triangleData = (values: number[]): ReturnType<typeof buildComponentDisjointnessData> =>
  buildComponentDisjointnessData(soupOf(values));

const pairSeparated = (left: number[], right: number[], margin = 1e-6): boolean =>
  trianglePairSeparated({
    left: triangleData(left),
    leftTriangle: 0,
    right: triangleData(right),
    rightTriangle: 0,
    margin,
  });

describe('component disjointness data', () => {
  it('should detect a closed box and split disconnected geometry into islands', () => {
    const data = buildComponentDisjointnessData(
      soupOf([...boxSoup([0, 0, 0], [1, 1, 1]), ...boxSoup([5, 0, 0], [6, 1, 1])]),
    );

    expect(data.closed).toBe(true);
    expect(data.orientedClosed).toBe(true);
    expect(data.islands).toHaveLength(2);
    expect(data.triangleCount).toBe(24);
  });

  it('should mark a soup with a missing triangle as open', () => {
    const open = boxSoup([0, 0, 0], [1, 1, 1]).slice(0, 11 * 9);

    const data = buildComponentDisjointnessData(soupOf(open));

    expect(data.closed).toBe(false);
    expect(data.orientedClosed).toBe(false);
  });

  it('should mark an empty soup as open', () => {
    const data = buildComponentDisjointnessData(soupOf([]));

    expect(data.closed).toBe(false);
    expect(data.orientedClosed).toBe(false);
    expect(data.islands).toEqual([]);
  });

  it('should mark a soup with a zero-length welded edge as open', () => {
    // Two corners of one triangle weld to the same vertex — the degenerate
    // edge can never satisfy the two-triangles-per-edge closure.
    const data = buildComponentDisjointnessData(soupOf([0, 0, 0, 0, 0, 0, 1, 1, 1]));

    expect(data.closed).toBe(false);
    expect(data.orientedClosed).toBe(false);
  });

  it('should keep a flipped-triangle box closed but not oriented (F-c)', () => {
    // Undirected edge counting cannot see one reversed triangle — the soup
    // still reads closed — but the directed-edge pass must reject it, because
    // a divergence-theorem volume over it would be garbage.
    const flipped = boxSoup([0, 0, 0], [1, 1, 1]);
    for (let axis = 0; axis < 3; axis += 1) {
      const second = flipped[3 + axis]!;
      flipped[3 + axis] = flipped[6 + axis]!;
      flipped[6 + axis] = second;
    }

    const data = buildComponentDisjointnessData(soupOf(flipped));

    expect(data.closed).toBe(true);
    expect(data.orientedClosed).toBe(false);
  });
});

describe('triangle-pair separation certificate (CR2 rung A)', () => {
  const flat = [0, 0, 0, 1, 0, 0, 0, 1, 0];

  it('should certify parallel triangles cleared beyond the margin', () => {
    expect(pairSeparated(flat, [0, 0, 0.5, 1, 0, 0.5, 0, 1, 0.5])).toBe(true);
  });

  it('should refuse coplanar triangles (shared plane, zero clearance)', () => {
    expect(pairSeparated(flat, [2, 0, 0, 3, 0, 0, 2, 1, 0])).toBe(false);
  });

  it('should refuse mutually plane-crossing triangles', () => {
    // The X configuration: each triangle's vertices straddle the other's plane.
    expect(pairSeparated(flat, [0.5, -0.5, -1, 0.5, 1.5, -1, 0.5, 0.5, 2])).toBe(false);
  });

  it('should fall back to the other direction when one normal is degenerate', () => {
    const colinear = [0, 0, 0, 1, 0, 0, 2, 0, 0];
    // The colinear triangle certifies nothing, but the plane of the real
    // triangle separates it — the certificate holds via the second direction.
    expect(pairSeparated(colinear, [0, 0, 1, 1, 0, 1, 0, 1, 1])).toBe(true);
    // Two degenerate triangles certify nothing at all.
    expect(pairSeparated(colinear, [0, 2, 0, 1, 2, 0, 2, 2, 0])).toBe(false);
  });
});

describe('rotated fat-AABB pairs (CR2 rung A integration)', () => {
  const soupAabb = (soup: readonly number[]): AabbMeters => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let base = 0; base < soup.length; base += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, soup[base + axis]!);
        max[axis] = Math.max(max[axis]!, soup[base + axis]!);
      }
    }
    return { min, max };
  };

  const prove = (leftSoup: number[], rightSoup: number[]): 'disjoint' | 'unknown' =>
    provePairDisjoint({
      leftAabb: soupAabb(leftSoup),
      rightAabb: soupAabb(rightSoup),
      left: buildComponentDisjointnessData(soupOf(leftSoup)),
      right: buildComponentDisjointnessData(soupOf(rightSoup)),
    });

  it('should prove a rotated near-miss between parallel diagonal faces', () => {
    // Two boxes rotated by the same 45°: the facing diagonal faces have FAT
    // triangle AABBs that overlap (box distance 0 — the old AABB leaf always
    // fell through here) while the parallel planes clear by ~0.99. Staggered
    // z keeps the coplanar top/bottom faces beyond the box margin.
    const left = rotateSoupZ(boxSoup([0, 0, 1], [10, 10, 9]), 45, [5, 5, 5]);
    const right = rotateSoupZ(boxSoup([10.7, 10.7, 2], [20.7, 20.7, 8]), 45, [15.7, 15.7, 5]);
    expect(prove(left, right)).toBe('disjoint');
  });

  it('should fall through on skew pairs the plane certificate cannot separate', () => {
    // An axis box beside a rotated box is disjoint (~0.66 gap) but its side
    // plane crosses the rotated top face and vice versa — no certificate by
    // design; skew pairs go to the boolean.
    const left = boxSoup([0, 0, 0], [10, 10, 10]);
    const right = rotateSoupZ(boxSoup([9, 9, 1], [19, 19, 9]), 45, [14, 14, 5]);
    expect(prove(left, right)).toBe('unknown');
  });

  it('should fall through on a rotated box that actually penetrates', () => {
    const left = boxSoup([0, 0, 0], [10, 10, 10]);
    const right = rotateSoupZ(boxSoup([7, 7, 1], [17, 17, 9]), 45, [12, 12, 5]);
    expect(prove(left, right)).toBe('unknown');
  });
});

describe('disjointness margin', () => {
  it('should floor the margin for small geometry and scale it with coordinate magnitude', () => {
    const small = disjointnessMargin(aabb([0, 0, 0], [0.01, 0.01, 0.01]), aabb([0.02, 0, 0], [0.03, 0.01, 0.01]));
    const large = disjointnessMargin(aabb([0, 0, 0], [1000, 10, 10]), aabb([1500, 0, 0], [2000, 10, 10]));

    expect(small).toBe(1e-6);
    expect(large).toBeCloseTo(6e-7 * 2000, 12);
  });
});

describe('provePairDisjoint', () => {
  it('should prove clearly separated closed boxes disjoint', () => {
    const left = buildComponentDisjointnessData(soupOf(boxSoup([0, 0, 0], [10, 10, 10])));
    const right = buildComponentDisjointnessData(soupOf(boxSoup([20, 0, 0], [30, 10, 10])));

    const verdict = provePairDisjoint({
      leftAabb: aabb([0, 0, 0], [10, 10, 10]),
      rightAabb: aabb([20, 0, 0], [30, 10, 10]),
      left,
      right,
    });

    expect(verdict).toBe('disjoint');
  });

  it('should refuse to reason about an open participant', () => {
    const left = buildComponentDisjointnessData(soupOf(boxSoup([0, 0, 0], [10, 10, 10]).slice(0, 11 * 9)));
    const right = buildComponentDisjointnessData(soupOf(boxSoup([20, 0, 0], [30, 10, 10])));

    const verdict = provePairDisjoint({
      leftAabb: aabb([0, 0, 0], [10, 10, 10]),
      rightAabb: aabb([20, 0, 0], [30, 10, 10]),
      left,
      right,
    });

    // The boolean path fail-closes on invalid components; the pre-filter must
    // never skip it for them.
    expect(verdict).toBe('unknown');
  });

  it('should fall through when surfaces come within the margin', () => {
    const left = buildComponentDisjointnessData(soupOf(boxSoup([0, 0, 0], [10, 10, 10])));
    const right = buildComponentDisjointnessData(soupOf(boxSoup([10, 0, 0], [20, 10, 10])));

    const verdict = provePairDisjoint({
      leftAabb: aabb([0, 0, 0], [10, 10, 10]),
      rightAabb: aabb([10, 0, 0], [20, 10, 10]),
      left,
      right,
    });

    expect(verdict).toBe('unknown');
  });
});
