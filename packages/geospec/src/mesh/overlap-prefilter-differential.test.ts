import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import type { AnalyzeMeshOverlapResult } from '#mesh/overlap.js';
import { boxSoup, invertSoup, rotateSoupZ, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
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

type Fixture = {
  name: string;
  components: Array<{ name: string; soup: number[] }>;
  tolerance: number;
};

// Every adversarial shape the pre-filter could get wrong: proofs must match
// the boolean byte-for-byte, and near-misses must fall through to it.
const fixtures: Fixture[] = [
  {
    // Surfaces coincide on the shared face plane: within the margin, so the
    // pre-filter must abort and let the boolean report the exact 0.
    name: 'face-coincident touching cubes',
    components: [
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([10, 0, 0], [20, 10, 10]) },
    ],
    tolerance: 0.5,
  },
  {
    // A genuine gap far below the separation margin (~1.2e-5 at this scale):
    // the margin must never decide a near-touching pair.
    name: 'gap below the separation margin',
    components: [
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([10.000_001, 0, 0], [20, 10, 10]) },
    ],
    tolerance: 0.5,
  },
  {
    // Overlap volume exactly at the volume-epsilon boundary (tolerance³ = 1):
    // the boolean decides the verdict on both paths.
    name: 'overlap at the volume-epsilon boundary',
    components: [
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([9.99, 0, 0], [19.99, 10, 10]) },
    ],
    tolerance: 1,
  },
  {
    // Solid fully nested inside a solid: surfaces are far apart but the
    // containment probe must force the boolean (volume = the inner box).
    name: 'solid nested inside a solid',
    components: [
      { name: 'outer', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'inner', soup: boxSoup([2, 2, 2], [8, 8, 8]) },
    ],
    tolerance: 0.5,
  },
  {
    // A part inside a hollow component's CAVITY: winding additivity over the
    // outer + inverted inner shells reads exactly 0 — provably disjoint.
    name: 'part inside a hollow component cavity',
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
    // The naive single-probe false positive: one named component with two
    // islands, the far island clear of the neighbour and the near island
    // fully inside it. Per-island probing must fall through to the boolean.
    name: 'two-island component with one island penetrating',
    components: [
      { name: 'bracket', soup: [...boxSoup([0, 0, 0], [10, 10, 10]), ...boxSoup([32, 0, 0], [38, 6, 6])] },
      { name: 'block', soup: boxSoup([30, -2, -2], [40, 8, 8]) },
    ],
    tolerance: 0.5,
  },
  {
    // CR2 rung A: parallel rotated diagonal faces whose fat leaf AABBs
    // overlap while the planes clear by ~0.99 — the certificate proves it
    // where the AABB leaf always fell through; the stored 0 must stay
    // byte-identical to the boolean's.
    name: 'rotated parallel-face near-miss with fat leaf boxes',
    components: [
      { name: 'left', soup: rotateSoupZ(boxSoup([0, 0, 1], [10, 10, 9]), 45, [5, 5, 5]) },
      { name: 'right', soup: rotateSoupZ(boxSoup([10.7, 10.7, 2], [20.7, 20.7, 8]), 45, [15.7, 15.7, 5]) },
    ],
    tolerance: 0.5,
  },
  {
    // Skew disjoint pair (axis box vs rotated box, gap ~0.66): the plane
    // certificate cannot separate crossing planes by design — must fall
    // through and match the boolean's exact 0.
    name: 'skew rotated near-miss falling through to the boolean',
    components: [
      { name: 'axis', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'rotated', soup: rotateSoupZ(boxSoup([9, 9, 1], [19, 19, 9]), 45, [14, 14, 5]) },
    ],
    tolerance: 0.5,
  },
];

type DifferentialRun = {
  result: AnalyzeMeshOverlapResult;
  entries: Map<string, Uint8Array<ArrayBuffer>>;
};

const runOnce = async (fixture: Fixture, prefilter: boolean): Promise<DifferentialRun> => {
  const store = createMemoryEvidenceStore();
  setGeoSpecEvidenceStore(store);
  try {
    const subject = subjectFromNamedSoups(fixture.components, {
      contentHash: `sha256:prefilter-differential:${fixture.name}`,
    });
    const result = await withPrefilter(prefilter, async () =>
      analyzeMeshOverlap({ subject, tolerance: fixture.tolerance }),
    );
    return { result, entries: store.entries };
  } finally {
    setGeoSpecEvidenceStore(undefined);
  }
};

describe('interference disjointness pre-filter differential (R14-lite)', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  for (const fixture of fixtures) {
    it(`should reach byte-identical evidence and stored payloads for ${fixture.name}`, async () => {
      const withProof = await runOnce(fixture, true);
      const withoutProof = await runOnce(fixture, false);

      expect(withProof.result).toEqual(withoutProof.result);

      // Byte-identical store contents: same keys, same payload bytes — a
      // proven 0 must be indistinguishable from the boolean's stored 0.
      expect([...withProof.entries.keys()].sort()).toEqual([...withoutProof.entries.keys()].sort());
      for (const [key, bytes] of withProof.entries) {
        expect(Buffer.compare(bytes, withoutProof.entries.get(key)!), `payload for ${key}`).toBe(0);
      }
    });
  }

  it('should prove the cavity pair without building a single Manifold', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    const subject = scope.trackSubject(
      subjectFromNamedSoups(fixtures[4]!.components, { contentHash: 'sha256:prefilter-proof-count' }),
    );
    try {
      const result = await withPrefilter(true, async () => analyzeMeshOverlap({ subject, tolerance: 0.5 }));
      expect(result.success).toBe(true);
      expect(profile.overlap).toMatchObject({
        prefilterProven: 1,
        prefilterFallthrough: 0,
        // The whole point: the pair was decided with zero Manifold builds.
        preparedComponentMisses: 0,
        pairVolumeMisses: 0,
      });
    } finally {
      await scope.dispose();
      setGeoSpecEvidenceStore(undefined);
    }
  });

  it('should fall through to the boolean on the nested pair', async () => {
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    const subject = scope.trackSubject(
      subjectFromNamedSoups(fixtures[3]!.components, { contentHash: 'sha256:prefilter-fallthrough-count' }),
    );
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    try {
      const result = await withPrefilter(true, async () => analyzeMeshOverlap({ subject, tolerance: 0.5 }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.evidence.overlaps[0]?.intersectionVolume).toBeCloseTo(216, 6);
      }
      expect(profile.overlap).toMatchObject({ prefilterProven: 0, prefilterFallthrough: 1 });
    } finally {
      await scope.dispose();
      setGeoSpecEvidenceStore(undefined);
    }
  });
});
