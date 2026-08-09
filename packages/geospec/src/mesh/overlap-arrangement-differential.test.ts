import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import type { AnalyzeMeshOverlapResult } from '#mesh/overlap.js';
import { boxSoup, invertSoup, rotateSoupZ, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';

/**
 * CR2 arrangement-engine differential: every fixture must reach the same
 * verdict structure under `GEOSPEC_OVERLAP_ENGINE=arrangement` as under the
 * Manifold default — identical overlap SETS with volumes agreeing within FP
 * tolerance (arrangement payloads are v2 by design, never byte-compared to
 * v1) — and the two engines' store entries must never collide (F-g: a flag
 * flip may never replay the other engine's bytes).
 */
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

type Fixture = {
  name: string;
  components: Array<{ name: string; soup: number[] }>;
  tolerance: number;
};

// The adversarial set: containment both ways, touching, transversal,
// mixed-island, cavity, inverted orientation, and the rotated fat-AABB pair.
const fixtures: Fixture[] = [
  {
    name: 'solid nested inside a solid (rung B resolves)',
    components: [
      { name: 'outer', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'inner', soup: boxSoup([2, 2, 2], [8, 8, 8]) },
    ],
    tolerance: 0.5,
  },
  {
    name: 'face-coincident touching cubes (falls back)',
    components: [
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([10, 0, 0], [20, 10, 10]) },
    ],
    tolerance: 0.5,
  },
  {
    name: 'transversal crossing (falls back)',
    components: [
      { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
    ],
    tolerance: 0.5,
  },
  {
    name: 'two-island component with one island penetrating (mixed, falls back)',
    components: [
      { name: 'bracket', soup: [...boxSoup([0, 0, 0], [10, 10, 10]), ...boxSoup([32, 0, 0], [38, 6, 6])] },
      { name: 'block', soup: boxSoup([30, -2, -2], [40, 8, 8]) },
    ],
    tolerance: 0.5,
  },
  {
    name: 'part inside a hollow component cavity (zero proof)',
    components: [
      {
        name: 'housing',
        soup: [...boxSoup([0, 0, 0], [20, 20, 20]), ...invertSoup(boxSoup([5, 5, 5], [15, 15, 15]))],
      },
      { name: 'insert', soup: boxSoup([8, 8, 8], [12, 12, 12]) },
    ],
    tolerance: 0.5,
  },
  {
    name: 'inverted contained component (falls back)',
    components: [
      { name: 'outer', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'insideOut', soup: invertSoup(boxSoup([2, 2, 2], [8, 8, 8])) },
    ],
    tolerance: 0.5,
  },
  {
    name: 'rotated parallel-face near-miss (zero proof)',
    components: [
      { name: 'left', soup: rotateSoupZ(boxSoup([0, 0, 1], [10, 10, 9]), 45, [5, 5, 5]) },
      { name: 'right', soup: rotateSoupZ(boxSoup([10.7, 10.7, 2], [20.7, 20.7, 8]), 45, [15.7, 15.7, 5]) },
    ],
    tolerance: 0.5,
  },
];

const runOnce = async (
  fixture: Fixture,
  engine: 'manifold' | 'arrangement',
  store?: ReturnType<typeof createMemoryEvidenceStore>,
): Promise<AnalyzeMeshOverlapResult> => {
  if (store) {
    setGeoSpecEvidenceStore(store);
  }
  try {
    const subject = subjectFromNamedSoups(fixture.components, {
      contentHash: `sha256:arrangement-differential:${fixture.name}`,
    });
    return await withEngine(engine === 'manifold' ? undefined : engine, async () =>
      analyzeMeshOverlap({ subject, tolerance: fixture.tolerance }),
    );
  } finally {
    if (store) {
      setGeoSpecEvidenceStore(undefined);
    }
  }
};

describe('CR2 arrangement-engine differential — manifold vs arrangement', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  for (const fixture of fixtures) {
    it(`should agree with the Manifold engine on ${fixture.name}`, async () => {
      const manifold = await runOnce(fixture, 'manifold');
      const arrangement = await runOnce(fixture, 'arrangement');

      expect(arrangement.success).toBe(manifold.success);
      if (!manifold.success || !arrangement.success) {
        return;
      }
      const manifoldOverlaps = manifold.evidence.overlaps;
      const arrangementOverlaps = arrangement.evidence.overlaps;
      expect(arrangementOverlaps.map((overlap) => [overlap.leftLabel, overlap.rightLabel])).toEqual(
        manifoldOverlaps.map((overlap) => [overlap.leftLabel, overlap.rightLabel]),
      );
      for (const [index, overlap] of arrangementOverlaps.entries()) {
        // Volume agreement within documented FP tolerance: the divergence sum
        // and Manifold's kernel differ only in accumulation order.
        expect(overlap.intersectionVolume).toBeCloseTo(manifoldOverlaps[index]!.intersectionVolume, 6);
      }
    });
  }

  it('should keep the two engines in disjoint store versions (F-g)', async () => {
    const store = createMemoryEvidenceStore();
    const fixture = fixtures[0]!;
    await runOnce(fixture, 'manifold', store);
    const afterManifold = new Set(store.entries.keys());
    expect(afterManifold.size).toBeGreaterThan(0);

    setGeoSpecEvidenceStore(store);
    const arrangement = await withEngine('arrangement', async () =>
      analyzeMeshOverlap({
        subject: subjectFromNamedSoups(fixture.components, {
          contentHash: `sha256:arrangement-differential:${fixture.name}`,
        }),
        tolerance: fixture.tolerance,
      }),
    );
    setGeoSpecEvidenceStore(undefined);

    expect(arrangement.success).toBe(true);
    // The arrangement run must have written NEW entries (v2), never replayed
    // or overwritten the Manifold engine's v1 bytes.
    const afterBoth = new Set(store.entries.keys());
    expect(afterBoth.size).toBeGreaterThan(afterManifold.size);
    for (const key of afterManifold) {
      expect(afterBoth.has(key)).toBe(true);
    }
  });
});
