import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import { boxSoup, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';
import { setForensicEnabled } from '#runner/forensic.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import type { GeoSpecOverlapCacheProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

/** Run with GEOSPEC_INTERFERENCE_PREFILTER pinned, restoring the prior value. */
const withPrefilter = async <T>(enabled: boolean, run: () => Promise<T>): Promise<T> => {
  const previous = process.env['GEOSPEC_INTERFERENCE_PREFILTER'];
  if (enabled) {
    delete process.env['GEOSPEC_INTERFERENCE_PREFILTER'];
  } else {
    process.env['GEOSPEC_INTERFERENCE_PREFILTER'] = '0';
  }
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env['GEOSPEC_INTERFERENCE_PREFILTER'];
    } else {
      process.env['GEOSPEC_INTERFERENCE_PREFILTER'] = previous;
    }
  }
};

/** Sweep a synthetic subject and return its overlap profile counters. */
const sweepProfile = async (options: {
  components: Array<{ name: string; soup: number[] }>;
  tolerance: number;
  prefilter?: boolean;
}): Promise<GeoSpecOverlapCacheProfile> => {
  const profile = createGeoSpecResourceScopeProfile();
  const scope = createGeoSpecResourceScope({ profile });
  const subject = scope.trackSubject(subjectFromNamedSoups(options.components));
  try {
    const result = await withPrefilter(options.prefilter ?? true, async () =>
      analyzeMeshOverlap({ subject, tolerance: options.tolerance }),
    );
    expect(result.success).toBe(true);
    return profile.overlap;
  } finally {
    await scope.dispose();
  }
};

describe('CR1 pair-outcome census', () => {
  it('should classify a computed zero-volume pair as separated', async () => {
    const overlap = await sweepProfile({
      components: [
        { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'right', soup: boxSoup([10.05, 0, 0], [20, 10, 10]) },
      ],
      tolerance: 0.5,
      // The pre-filter would prove this pair without a boolean; pin it off so
      // the census sees a genuinely computed empty intersection.
      prefilter: false,
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
    setForensicEnabled(false);
    setGeoSpecEvidenceStore(undefined);
  });

  it('should emit one aggregate line per step, never one per pair', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
    ): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write);
    setForensicEnabled(true);
    try {
      // Three crossing pairs so aggregation is observable: 3 booleans, 1 line
      // per step. Pre-filter stays on to exercise its build/prove buckets; the
      // memory store brings the peek/persist round-trips into the sweep.
      const subject = subjectFromNamedSoups([
        { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
        { name: 'c', soup: boxSoup([0, 5, 0], [10, 15, 10]) },
      ]);
      const result = await withPrefilter(true, async () => analyzeMeshOverlap({ subject, tolerance: 0.5 }));
      expect(result.success).toBe(true);
    } finally {
      setForensicEnabled(false);
      spy.mockRestore();
    }

    const stepLines = lines.filter((line) => line.includes('overlap.step.'));
    const labels = stepLines.map((line) => /overlap\.step\.[.a-z]+/.exec(line)![0]);
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
    // Aggregate emission: exactly one line per bucket despite three computed
    // pairs, each carrying a parseable millisecond total.
    expect(stepLines.length).toBe(new Set(labels).size);
    for (const line of stepLines) {
      expect(line).toMatch(/\t\d+(\.\d+)?\n$/);
    }
  });

  it('should emit no step lines when forensic timing is disabled', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
    ): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write);
    try {
      const subject = subjectFromNamedSoups([
        { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
      ]);
      const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });
      expect(result.success).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(lines.filter((line) => line.includes('overlap.step.'))).toEqual([]);
  });
});
