import { describe, expect, it } from 'vitest';
import { boxSoup } from '#mesh/testing/overlap-subjects.js';
import { preparePrefilterComponent } from '#mesh/overlap-prefilter.js';
import type { PrefilterComponent } from '#mesh/overlap-prefilter.js';
import { fartherThan, withinDistance } from '#proofs/mesh-distance.js';
import type { Vec3 } from '#mesh/types.js';

const component = (min: Vec3, max: Vec3): PrefilterComponent => {
  const soup = boxSoup(min, max);
  return preparePrefilterComponent(Float64Array.from(soup), soup.length / 9);
};

const empty = preparePrefilterComponent(new Float64Array(0), 0);

const left = component([0, 0, 0], [10, 10, 10]);
const right = component([13, 0, 0], [23, 10, 10]);

describe('fartherThan — proof, never a verdict', () => {
  it('should prove a separation the soups really have', () => {
    expect(fartherThan(left, right, 2)).toBe(true);
  });

  it('should refuse to certify a separation the soups do not have', () => {
    expect(fartherThan(left, right, 5)).toBe(false);
  });

  it('should never certify a non-positive separation', () => {
    expect(fartherThan(left, right, 0)).toBe(false);
    expect(fartherThan(left, right, -1)).toBe(false);
  });
});

describe('withinDistance — a realizable witness or nothing', () => {
  it('should attain the true gap with points on both soups', () => {
    const witness = withinDistance(left, right, { limit: 5 });
    expect(witness?.distance).toBeCloseTo(3, 9);
    expect(witness?.left[0]).toBeCloseTo(10, 9);
    expect(witness?.right[0]).toBeCloseTo(13, 9);
  });

  it('should answer nothing when no pair attains the limit', () => {
    expect(withinDistance(left, right, { limit: 1 })).toBeUndefined();
  });

  it('should answer nothing for an empty soup or a negative limit', () => {
    expect(withinDistance(empty, right, { limit: 5 })).toBeUndefined();
    expect(withinDistance(left, empty, { limit: 5 })).toBeUndefined();
    expect(withinDistance(left, right, { limit: -1 })).toBeUndefined();
  });

  it('should answer nothing when the visit budget runs out — cannot certify', () => {
    expect(withinDistance(left, right, { limit: 5, budget: 1 })).toBeUndefined();
  });

  it('should be a pure function of the two soups', () => {
    expect(withinDistance(left, right, { limit: 5 })).toEqual(withinDistance(left, right, { limit: 5 }));
  });

  it('should realize the witness on whichever soup carries the closest vertex', () => {
    // A tall slab facing a wide one: the closest pair is a vertex of the RIGHT
    // soup against a face of the left, the second half of the vertex sweep.
    const wide = component([0, 0, 0], [10, 10, 10]);
    const spike = component([12, 4, 4], [14, 6, 6]);
    const witness = withinDistance(wide, spike, { limit: 5 });
    expect(witness?.distance).toBeCloseTo(2, 9);
    expect(witness?.right[0]).toBeCloseTo(12, 9);
  });
});
