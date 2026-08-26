import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import { boxSoup, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';
import type { ForensicMeasurement } from '#runner/forensic.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import type { GeoSpecOverlapCacheProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

/** Sweep a synthetic subject and return its overlap profile counters. */
const sweepProfile = async (options: {
  components: Array<{ name: string; soup: number[] }>;
  tolerance: number;
}): Promise<GeoSpecOverlapCacheProfile> => {
  const profile = createGeoSpecResourceScopeProfile();
  const scope = createGeoSpecResourceScope({ profile });
  const subject = scope.trackSubject(subjectFromNamedSoups(options.components));
  try {
    const result = await analyzeMeshOverlap({ subject, tolerance: options.tolerance });
    expect(result.success).toBe(true);
    return profile.overlap;
  } finally {
    await scope.dispose();
  }
};

describe('CR1 pair-outcome census', () => {
  it('should classify a touching pair computed as zero volume as separated', async () => {
    const overlap = await sweepProfile({
      components: [
        { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'right', soup: boxSoup([10, 0, 0], [20, 10, 10]) },
      ],
      tolerance: 0.5,
    });
    expect(overlap).toMatchObject({
      outcomeSeparated: 1,
      outcomeTouching: 0,
      outcomeContainment: 0,
      outcomeTransversal: 0,
    });
  });

  it('should classify a sliver at tolerance scale as touching', async () => {
    const overlap = await sweepProfile({
      components: [
        { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'right', soup: boxSoup([9.999, 0, 0], [20, 10, 10]) },
      ],
      // The 0.1 sliver sits below volumeEpsilon = 1³ = 1.
      tolerance: 1,
    });
    expect(overlap).toMatchObject({
      outcomeSeparated: 0,
      outcomeTouching: 1,
      outcomeContainment: 0,
      outcomeTransversal: 0,
    });
  });

  it('should classify a nested pair as containment', async () => {
    const overlap = await sweepProfile({
      components: [
        { name: 'outer', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'inner', soup: boxSoup([2, 2, 2], [8, 8, 8]) },
      ],
      tolerance: 0.5,
    });
    expect(overlap).toMatchObject({
      outcomeSeparated: 0,
      outcomeTouching: 0,
      outcomeContainment: 1,
      outcomeTransversal: 0,
    });
  });

  it('should classify genuine crossings as transversal, memoizing participant volumes', async () => {
    // Three mutually crossing boxes: every component participates in two
    // computed pairs, so the second pair replays the memoized solid volume.
    const overlap = await sweepProfile({
      components: [
        { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
        { name: 'c', soup: boxSoup([0, 5, 0], [10, 15, 10]) },
      ],
      tolerance: 0.5,
    });
    expect(overlap).toMatchObject({
      outcomeSeparated: 0,
      outcomeTouching: 0,
      outcomeContainment: 0,
      outcomeTransversal: 3,
    });
  });
});

describe('CR1 forensic step buckets', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  it('should emit one aggregate measurement per step, never one per pair', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const measurements: ForensicMeasurement[] = [];
    // Three crossing pairs make aggregation observable. The pre-filter and
    // memory evidence store exercise every retained overlap phase.
    const subject = subjectFromNamedSoups([
      { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
      { name: 'c', soup: boxSoup([0, 5, 0], [10, 15, 10]) },
    ]);
    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 }, measurements.push.bind(measurements));
    expect(result.success).toBe(true);

    const labels = measurements.map(({ name }) => name);
    expect(new Set(labels)).toEqual(
      new Set([
        'overlap.step.peek',
        'overlap.step.prefilter.build',
        'overlap.step.prefilter.prove',
        'overlap.step.build',
        'overlap.step.intersection',
        'overlap.step.volume',
        'overlap.step.witness',
        'overlap.step.delete',
        'overlap.step.persist',
      ]),
    );
    expect(measurements.length).toBe(new Set(labels).size);
    for (const measurement of measurements) {
      expect(measurement.unit).toBe('milliseconds');
      expect(measurement.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should need no forensic sink to run', async () => {
    const subject = subjectFromNamedSoups([
      { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
    ]);
    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });
    expect(result.success).toBe(true);
  });
});
