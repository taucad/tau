import { describe, expect, it } from 'vitest';
import { arrangementPairVolume } from '#mesh/overlap-arrangement.js';
import { buildComponentDisjointnessData } from '#mesh/overlap-prefilter.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import { boxSoup, invertSoup, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';
import type { AabbMeters } from '#mesh/types.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

/** Run with GEOSPEC_OVERLAP_ENGINE pinned, restoring the prior value. */
const withEngine = async <T>(engine: string | undefined, run: () => Promise<T>): Promise<T> => {
  const previous = process.env['GEOSPEC_OVERLAP_ENGINE'];
  if (engine === undefined) {
    delete process.env['GEOSPEC_OVERLAP_ENGINE'];
  } else {
    process.env['GEOSPEC_OVERLAP_ENGINE'] = engine;
  }
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env['GEOSPEC_OVERLAP_ENGINE'];
    } else {
      process.env['GEOSPEC_OVERLAP_ENGINE'] = previous;
    }
  }
};

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

const pairVolume = (left: number[], right: number[]): { volume: number; witnessPoint: unknown } | undefined =>
  arrangementPairVolume({
    leftAabb: soupAabb(left),
    rightAabb: soupAabb(right),
    left: buildComponentDisjointnessData(new Float32Array(left)),
    right: buildComponentDisjointnessData(new Float32Array(right)),
  });

describe('arrangement pair volume (CR2 rung B)', () => {
  const outer = boxSoup([0, 0, 0], [10, 10, 10]);
  const inner = boxSoup([2, 2, 2], [8, 8, 8]);

  it('should resolve a nested pair to the contained solid volume, either way round', () => {
    expect(pairVolume(outer, inner)).toEqual({ volume: 216, witnessPoint: [5, 5, 5] });
    expect(pairVolume(inner, outer)).toEqual({ volume: 216, witnessPoint: [5, 5, 5] });
  });

  it('should refuse a participant that is not consistently oriented', () => {
    const flipped = boxSoup([2, 2, 2], [8, 8, 8]);
    for (let axis = 0; axis < 3; axis += 1) {
      const second = flipped[3 + axis]!;
      flipped[3 + axis] = flipped[6 + axis]!;
      flipped[6 + axis] = second;
    }
    expect(pairVolume(outer, flipped)).toBeUndefined();
  });

  it('should refuse pairs whose surfaces come within the margin', () => {
    expect(pairVolume(boxSoup([0, 0, 0], [10, 10, 10]), boxSoup([10, 0, 0], [20, 10, 10]))).toBeUndefined();
  });

  it('should refuse mixed multi-island containment', () => {
    const bracket = [...boxSoup([0, 0, 0], [10, 10, 10]), ...boxSoup([32, 0, 0], [38, 6, 6])];
    const block = boxSoup([30, -2, -2], [40, 8, 8]);
    expect(pairVolume(bracket, block)).toBeUndefined();
  });

  it('should leave fully disjoint pairs to the zero proof', () => {
    expect(pairVolume(outer, boxSoup([20, 0, 0], [30, 10, 10]))).toBeUndefined();
  });

  it('should leave a part inside a hollow cavity to the zero proof', () => {
    const housing = [...boxSoup([0, 0, 0], [20, 20, 20]), ...invertSoup(boxSoup([5, 5, 5], [15, 15, 15]))];
    expect(pairVolume(housing, boxSoup([8, 8, 8], [12, 12, 12]))).toBeUndefined();
  });

  it('should refuse a globally inverted contained component', () => {
    expect(pairVolume(outer, invertSoup(inner))).toBeUndefined();
  });
});

describe('arrangement engine wiring (GEOSPEC_OVERLAP_ENGINE)', () => {
  it('should resolve the nested sweep without a boolean and report the exact volume', async () => {
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    const subject = scope.trackSubject(
      subjectFromNamedSoups([
        { name: 'outer', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'inner', soup: boxSoup([2, 2, 2], [8, 8, 8]) },
      ]),
    );
    try {
      const result = await withEngine('arrangement', async () => analyzeMeshOverlap({ subject, tolerance: 0.5 }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.evidence.overlaps[0]?.intersectionVolume).toBeCloseTo(216, 9);
        expect(result.evidence.overlaps[0]?.witnessPoint).toEqual([5, 5, 5]);
      }
      expect(profile.overlap).toMatchObject({
        arrangementResolved: 1,
        arrangementFallback: 0,
        // The whole point: no Manifold was built for a resolved pair.
        preparedComponentMisses: 0,
        pairVolumeMisses: 0,
      });
    } finally {
      await scope.dispose();
    }
  });

  it('should fall back to the boolean for transversal pairs under the flag', async () => {
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    const subject = scope.trackSubject(
      subjectFromNamedSoups([
        { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
      ]),
    );
    try {
      const result = await withEngine('arrangement', async () => analyzeMeshOverlap({ subject, tolerance: 0.5 }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.evidence.overlaps[0]?.intersectionVolume).toBeCloseTo(500, 9);
      }
      expect(profile.overlap).toMatchObject({ arrangementResolved: 0, arrangementFallback: 1, pairVolumeMisses: 1 });
    } finally {
      await scope.dispose();
    }
  });
});
