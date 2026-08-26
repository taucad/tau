import { describe, expect, it } from 'vitest';
import { boxSoup, invertSoup } from '#mesh/testing/overlap-subjects.js';
import {
  certifyTrianglesApart,
  disjointBeyondMargin,
  disjointVisitBudget,
  disjointnessMargin,
  preparePrefilterComponent,
  provePairDisjoint,
  signedSoupVolume,
} from '#mesh/overlap-prefilter.js';
import type { Vec3 } from '#mesh/types.js';

const component = (soup: readonly number[]) =>
  preparePrefilterComponent(Float64Array.from(soup), Math.floor(soup.length / 9));

describe('disjointnessMargin', () => {
  it('should floor at 1e-6 and scale with the coordinate magnitude', () => {
    expect(disjointnessMargin(0)).toBe(1e-6);
    expect(disjointnessMargin(1)).toBe(1e-6);
    // 6e-7 · 1000 = 6e-4 dominates the floor.
    expect(disjointnessMargin(1000)).toBeCloseTo(6e-4, 12);
  });
});

describe('certifyTrianglesApart', () => {
  const left: [Vec3, Vec3, Vec3] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];

  it("should certify with either triangle's plane", () => {
    const above: [Vec3, Vec3, Vec3] = [
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
    ];
    expect(certifyTrianglesApart(left, above, 0.5)).toBe(true);
    expect(certifyTrianglesApart(above, left, 0.5)).toBe(true);
  });

  it('should certify nothing for mutually crossing planes', () => {
    // A triangle straddling the z = 0 plane whose own plane the left triangle
    // also straddles: neither plane separates, so the pair falls through.
    const crossing: [Vec3, Vec3, Vec3] = [
      [0.25, 0.25, -1],
      [0.25, 0.25, 1],
      [2, 2, 0],
    ];
    expect(certifyTrianglesApart(left, crossing, 1e-6)).toBe(false);
  });

  it('should certify nothing from a degenerate triangle', () => {
    const degenerate: [Vec3, Vec3, Vec3] = [
      [5, 5, 5],
      [5, 5, 5],
      [5, 5, 5],
    ];
    // The degenerate side has no plane, but the other triangle's plane still
    // separates it — swapping proves the degenerate leg alone certifies nothing.
    expect(certifyTrianglesApart(degenerate, left, 0.5)).toBe(true);
    expect(
      certifyTrianglesApart(
        degenerate,
        [
          [5, 5, 5],
          [6, 5, 5],
          [5, 6, 5],
        ],
        0.5,
      ),
    ).toBe(false);
  });
});

describe('disjointVisitBudget', () => {
  it('should be a pure function of the two triangle counts', () => {
    expect(disjointVisitBudget(12, 12)).toBe(disjointVisitBudget(12, 12));
    expect(disjointVisitBudget(12, 24)).toBeGreaterThan(disjointVisitBudget(12, 12));
  });
});

describe('disjointBeyondMargin', () => {
  it('should prove clearly separated boxes apart', () => {
    const left = component(boxSoup([0, 0, 0], [10, 10, 10]));
    const right = component(boxSoup([20, 0, 0], [30, 10, 10]));
    expect(disjointBeyondMargin(left, right, { margin: 1e-5 })).toBe(true);
  });

  it('should refuse face-coincident boxes', () => {
    const left = component(boxSoup([0, 0, 0], [10, 10, 10]));
    const right = component(boxSoup([10, 0, 0], [20, 10, 10]));
    expect(disjointBeyondMargin(left, right, { margin: 1e-5 })).toBe(false);
  });

  it('should prove a nested pair apart — separated surfaces are not disjoint bodies', () => {
    const outer = component(boxSoup([0, 0, 0], [10, 10, 10]));
    const inner = component(boxSoup([2, 2, 2], [8, 8, 8]));
    expect(disjointBeyondMargin(outer, inner, { margin: 1e-5 })).toBe(true);
  });

  it('should answer "cannot certify" rather than a verdict when the budget runs out', () => {
    const left = component(boxSoup([0, 0, 0], [10, 10, 10]));
    const right = component(boxSoup([20, 0, 0], [30, 10, 10]));

    // A margin larger than the gap forces a full descent; a budget of one visit
    // cannot finish it, and exhaustion is never a verdict.
    expect(disjointBeyondMargin(left, right, { margin: 1e6, budget: 1 })).toBeUndefined();
    // The same pair with the real budget still refuses — the boxes are inside
    // the (absurd) margin — but it refuses with an answer, not an exhaustion.
    expect(disjointBeyondMargin(left, right, { margin: 1e6 })).toBe(false);
  });

  it('should certify a leaf pair whose fat boxes overlap but whose planes clear', () => {
    // Two slanted triangles: their axis-aligned boxes interpenetrate, while the
    // supporting planes stay 2/√2 apart — exactly the CR2-A case an AABB leaf
    // test always fell through on.
    const slanted = [0, 0, 0, 2, 2, 0, 0, 0, 2];
    const shifted = slanted.map((value, index) => (index % 3 === 0 ? value + 1 : index % 3 === 1 ? value - 1 : value));
    const left = component(slanted);
    const right = component(shifted);

    expect(disjointBeyondMargin(left, right, { margin: 1 })).toBe(true);
    // Above the true plane clearance the certificate correctly refuses.
    expect(disjointBeyondMargin(left, right, { margin: 2 })).toBe(false);
  });

  it('should handle an empty component', () => {
    const empty = component([]);
    const box = component(boxSoup([0, 0, 0], [10, 10, 10]));
    expect(disjointBeyondMargin(empty, box, { margin: 1e-5 })).toBe(true);
  });
});

describe('provePairDisjoint', () => {
  it('should prove two clear boxes disjoint', () => {
    const result = provePairDisjoint(
      component(boxSoup([0, 0, 0], [10, 10, 10])),
      component(boxSoup([20, 0, 0], [30, 10, 10])),
    );
    expect(result).toMatchObject({ proven: true, surfacesApart: true, trustworthy: true });
  });

  it('should refuse a nested pair even though its surfaces are apart', () => {
    const result = provePairDisjoint(
      component(boxSoup([0, 0, 0], [10, 10, 10])),
      component(boxSoup([2, 2, 2], [8, 8, 8])),
    );
    expect(result.proven).toBe(false);
    expect(result.rightInsideLeft).toEqual([true]);
    expect(result.leftInsideRight).toEqual([false]);
  });

  it('should prove a part inside a cavity disjoint by winding additivity', () => {
    const housing = component([...boxSoup([0, 0, 0], [20, 20, 20]), ...invertSoup(boxSoup([5, 5, 5], [15, 15, 15]))]);
    const insert = component(boxSoup([8, 8, 8], [12, 12, 12]));
    expect(provePairDisjoint(housing, insert).proven).toBe(true);
  });

  it('should refuse an untrustworthy soup instead of probing it', () => {
    // An open shell: the winding number over it is not a membership oracle.
    const open = component(boxSoup([0, 0, 0], [10, 10, 10]).slice(0, 9 * 10));
    const far = component(boxSoup([40, 40, 40], [50, 50, 50]));
    const result = provePairDisjoint(open, far);
    expect(result).toMatchObject({ proven: false, surfacesApart: true, trustworthy: false });
  });

  it('should refuse a soup with a duplicated directed edge', () => {
    // The same triangle twice: every directed edge repeats, so orientation is
    // not consistent and the shell cannot answer a containment probe.
    const box = boxSoup([0, 0, 0], [10, 10, 10]);
    const duplicated = component([...box, ...box.slice(0, 9)]);
    expect(duplicated.trustworthy).toBe(false);
  });
});

describe('signedSoupVolume', () => {
  it('should measure an outward box positively and an inverted one negatively', () => {
    expect(signedSoupVolume(component(boxSoup([0, 0, 0], [10, 10, 10])))).toBeCloseTo(1000, 9);
    expect(signedSoupVolume(component(invertSoup(boxSoup([0, 0, 0], [10, 10, 10]))))).toBeCloseTo(-1000, 9);
  });
});
