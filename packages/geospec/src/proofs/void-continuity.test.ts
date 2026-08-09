import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeoSpecVoidContinuityExpectation } from '#runner/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import { proveVoidContinuity } from '#proofs/void-continuity.js';

const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);

// Fixture valve-stem-guide: a 20x20x45 box (guide) with a single r4.03
// through-bore along +Z over z in [0, 45]. The bore lumen is one connected open
// void with a mouth at each Z face; its exact cross-section is PI*4.03^2 ~= 51 mm2.
const guidePath = fixture('containment/valve-stem-guide-positive/model.step');

// Fixture filter-inside-housing: an open cup (housing) — outer r30 z in [0, 60],
// with a blind r27 cavity z in [3, 60] cut from the top (3 mm floor, walls). Bounding
// the analysis to the block footprint (r < 15, corners stay inside the solid)
// isolates the cavity void from the below-block exterior across the floor.
const housingPath = fixture('containment/filter-inside-housing-positive/model.step');
const housingBlockBounds = { min: [-15, -15, -6] as const, max: [15, 15, 62] as const };

describe('void-continuity proof (native fixtures)', () => {
  let guide: GeometrySubject;
  let guideContext: RelationshipProofContext;
  let housing: GeometrySubject;
  let housingContext: RelationshipProofContext;

  beforeAll(async () => {
    guide = await loadStep({ source: guidePath, name: 'valve-stem-guide' });
    housing = await loadStep({ source: housingPath, name: 'filter-inside-housing' });
    const guideBuilt = getSubjectProofContext(guide);
    const housingBuilt = getSubjectProofContext(housing);
    if (!guideBuilt || !housingBuilt) {
      throw new Error('void-continuity fixtures must carry STEP-XDE and native BRep evidence.');
    }
    guideContext = guideBuilt;
    housingContext = housingBuilt;
  }, 120_000);

  afterAll(() => {
    guide.nativeXde?.delete?.();
    housing.nativeXde?.delete?.();
  });

  const prove = (expectation: GeoSpecVoidContinuityExpectation, context: RelationshipProofContext) =>
    proveVoidContinuity(expectation, context);

  it('should pass a connected through-void between both bore mouths', () => {
    const diagnostics = prove(
      {
        path: [
          [0, 0, 3],
          [0, 0, 42],
        ],
        material: ['guide'],
        resolution: 1,
      },
      guideContext,
    );
    expect(diagnostics).toEqual([]);
  }, 15_000);

  it('should fail connectivity when the waypoints sit in different void components', () => {
    // The cavity (z in [3, 60]) and the below-block exterior (z < 0) are sealed
    // from each other by the 3 mm floor when the region hugs the block footprint.
    const diagnostics = prove(
      {
        path: [
          [0, 0, 30],
          [0, 0, -3],
        ],
        material: ['housing'],
        resolution: 2,
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('GEOSPEC_VOID_CONTINUITY_MISMATCH');
    expect(diagnostics[0]?.message).toContain('path is broken');
    expect(diagnostics[0]?.spatial?.center).toBeDefined();
  });

  it('should fail connectivity when a waypoint is buried in material', () => {
    // Point z = 1.5 is inside the housing floor (z in [0, 3]) — not open void.
    const diagnostics = prove(
      {
        path: [
          [0, 0, 30],
          [0, 0, 1.5],
        ],
        material: ['housing'],
        resolution: 2,
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('inside material');
  });

  it('should pass isolation when the path void does not reach the isolatedFrom space', () => {
    const diagnostics = prove(
      {
        path: [
          [0, 0, 10],
          [0, 0, 55],
        ],
        material: ['housing'],
        resolution: 2,
        isolatedFrom: [[0, 0, -3]],
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(diagnostics).toEqual([]);
  });

  it('should fail isolation when the path void reaches an isolatedFrom space', () => {
    const diagnostics = prove(
      {
        path: [
          [0, 0, 10],
          [0, 0, 55],
        ],
        material: ['housing'],
        resolution: 2,
        isolatedFrom: [[0, 0, 35]], // Same cavity void as the path.
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('isolation breached');
    expect(diagnostics[0]?.spatial?.center).toEqual([0, 0, 35]);
  });

  it('should discriminate a wide void from a pinched threshold on min cross-section', () => {
    // The bore lumen samples to ~51 mm2; a low threshold passes within the band.
    const wide = prove(
      {
        path: [
          [0, 0, 5],
          [0, 0, 40],
        ],
        material: ['guide'],
        resolution: 1,
        minCrossSection: 40,
      },
      guideContext,
    );
    expect(wide).toEqual([]);

    // A threshold far above the sampled lumen (and its quantization band) fails.
    const pinched = prove(
      {
        path: [
          [0, 0, 5],
          [0, 0, 40],
        ],
        material: ['guide'],
        resolution: 1,
        minCrossSection: 900,
      },
      guideContext,
    );
    expect(pinched).toHaveLength(1);
    expect(pinched[0]?.code).toBe('GEOSPEC_VOID_CONTINUITY_MISMATCH');
    expect(pinched[0]?.message).toContain('cross-section');
    const measured = (pinched[0]?.details as { measuredCrossSection?: number } | undefined)?.measuredCrossSection ?? 0;
    expect(measured).toBeGreaterThan(40);
    expect(measured).toBeLessThan(70);
  }, 15_000);

  it('should keep the verdict identical across tessellation settings (exact classification)', async () => {
    const coarse = await loadStep({
      source: guidePath,
      name: 'guide-coarse',
      meshLinearTolerance: 1,
      meshAngularToleranceDegrees: 40,
    });
    const fine = await loadStep({
      source: guidePath,
      name: 'guide-fine',
      meshLinearTolerance: 0.01,
      meshAngularToleranceDegrees: 5,
    });
    try {
      const measure = (loaded: GeometrySubject) => {
        const context = getSubjectProofContext(loaded);
        if (!context) {
          throw new Error('fixture must carry BRep evidence at every tessellation setting.');
        }
        return proveVoidContinuity(
          {
            path: [
              [0, 0, 3],
              [0, 0, 42],
            ],
            material: ['guide'],
            resolution: 1,
          },
          context,
        );
      };
      expect(measure(coarse)).toEqual([]);
      expect(measure(fine)).toEqual([]);
    } finally {
      coarse.nativeXde?.delete?.();
      fine.nativeXde?.delete?.();
    }
  }, 120_000);

  describe('WS-A/WS-B remediation (bounded material, honest cross-section, isolation)', () => {
    it('should refuse a claim with neither material nor bounds instead of classifying every occurrence', () => {
      // A3 (Finding 2): the old default classified all occurrences over an
      // unbounded region — O(all x V). Refuse it honestly.
      const diagnostics = prove(
        {
          path: [
            [0, 0, 10],
            [0, 0, 55],
          ],
        },
        housingContext,
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain('material set or explicit bounds');
    });

    it('should derive the full material neighbourhood (all region solids) from declared bounds when material is omitted', () => {
      // A3: deriving material from bounds includes every occurrence in the region
      // (conservative — all solids bound the void), not a refusal and not "all
      // occurrences". The housing region also holds the filter occurrence, so a
      // point that is open when only 'housing' is material becomes inside-material
      // once the filter is derived too.
      const explicitHousingOnly = prove(
        {
          path: [
            [0, 0, 10],
            [0, 0, 55],
          ],
          material: ['housing'],
          resolution: 2,
          bounds: housingBlockBounds,
        },
        housingContext,
      );
      const derived = prove(
        {
          path: [
            [0, 0, 10],
            [0, 0, 55],
          ],
          resolution: 2,
          bounds: housingBlockBounds,
        },
        housingContext,
      );
      expect(explicitHousingOnly).toEqual([]);
      expect(derived).toHaveLength(1);
      expect(derived[0]?.message).not.toContain('material set or explicit bounds');
    });

    it('should report unsupported when the declared section is finer than the grid can resolve', () => {
      // B3: a section below ~2x2 cells cannot be sampled honestly (Nyquist).
      const diagnostics = prove(
        {
          path: [
            [0, 0, 5],
            [0, 0, 40],
          ],
          material: ['guide'],
          resolution: 1,
          minCrossSection: 2,
        },
        guideContext,
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain('cannot bound');
    });

    it('should report unsupported (not a vacuous pass) when the band swamps a tight section', () => {
      // B2: the r4 bore at 2 mm samples to ~13 cells, where the quantization
      // band >= the measured area — the old code let this pass unfalsifiably.
      const diagnostics = prove(
        {
          path: [
            [0, 0, 5],
            [0, 0, 40],
          ],
          material: ['guide'],
          resolution: 2,
          minCrossSection: 40,
        },
        guideContext,
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain('too coarse to bound honestly');
    }, 15_000);

    it('should report unsupported (not a vacuous pass) when an isolatedFrom probe lands in material', () => {
      // B4: z = 1.5 is inside the housing floor — the old single-point check
      // passed vacuously because a buried probe never shares the path component.
      const diagnostics = prove(
        {
          path: [
            [0, 0, 10],
            [0, 0, 55],
          ],
          material: ['housing'],
          resolution: 2,
          isolatedFrom: [[0, 0, 1.5]],
          bounds: housingBlockBounds,
        },
        housingContext,
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain('inside material');
    });

    it('should reuse per-occurrence occupancy across identical claims in one run (A4)', () => {
      // A4: two identical claims on the same subject + grid classify once. Count
      // native classifyPoints via a proxy; the memo is keyed by the native handle
      // identity, so the second proof adds zero native calls and matches verdicts.
      // Pinned to the exact engine: this test verifies the classification memo,
      // and classifyPoints IS that memoized work — the hybrid engine's tiny/empty
      // band on this small bore would make the count vacuous. The occupancyCache
      // wraps both engines identically, so exact-path reuse proves the memo.
      const previousEngine = process.env['GEOSPEC_VOID_ENGINE'];
      process.env['GEOSPEC_VOID_ENGINE'] = 'exact';
      let classifyCalls = 0;
      const source = guideContext.native;
      const countingContext: RelationshipProofContext = {
        ...guideContext,
        native: new Proxy(source, {
          get(target, property, receiver) {
            if (property === 'classifyPoints') {
              return (occurrence: number, json: string) => {
                classifyCalls += 1;
                return target.classifyPoints(occurrence, json);
              };
            }
            return Reflect.get(target, property, receiver) as unknown;
          },
        }),
      };
      const claim: GeoSpecVoidContinuityExpectation = {
        path: [
          [0, 0, 3],
          [0, 0, 42],
        ],
        material: ['guide'],
        resolution: 1,
        bounds: { min: [-13, -13, -3], max: [13, 13, 48] },
      };
      try {
        const first = prove(claim, countingContext);
        const afterFirst = classifyCalls;
        const second = prove(claim, countingContext);
        expect(afterFirst).toBeGreaterThan(0);
        expect(classifyCalls).toBe(afterFirst);
        expect(second).toEqual(first);
      } finally {
        if (previousEngine === undefined) {
          delete process.env['GEOSPEC_VOID_ENGINE'];
        } else {
          process.env['GEOSPEC_VOID_ENGINE'] = previousEngine;
        }
      }
    }, 15_000);
  });

  describe('toHaveVoidContinuity matcher wiring', () => {
    const runOneAssertion = async (callback: (collector: ReturnType<typeof createCollector>) => void) => {
      const collector = createCollector();
      installCollector(collector);
      try {
        collector.it('should evaluate void-continuity matcher', () => {
          callback(collector);
        });
        await collector.waitForCompletion(60_000);
        return collector.tests[0];
      } finally {
        clearCollectorGlobals();
      }
    };

    it('should pass a connected, isolated, wide void end to end through the matcher', async () => {
      const passing = await runOneAssertion((collector) => {
        collector.expectGeo(housing).toHaveVoidContinuity({
          path: [
            [0, 0, 10],
            [0, 0, 55],
          ],
          material: ['housing'],
          resolution: 2,
          isolatedFrom: [[0, 0, -3]],
          minCrossSection: 100,
          bounds: housingBlockBounds,
        });
      });
      expect(passing?.status).toBe('passed');
    });

    it('should emit the void-continuity diagnostic contract on failure', async () => {
      const failing = await runOneAssertion((collector) => {
        collector.expectGeo(housing).toHaveVoidContinuity({
          path: [
            [0, 0, 30],
            [0, 0, -3],
          ],
          material: ['housing'],
          resolution: 2,
          bounds: housingBlockBounds,
        });
      });
      expect(failing?.status).toBe('failed');
      const diagnostic = failing?.assertions[0]?.diagnostics?.[0];
      expect(diagnostic?.code).toBe('GEOSPEC_VOID_CONTINUITY_MISMATCH');
      expect(diagnostic?.suggestion).toBeTruthy();
      expect(diagnostic?.spatial?.center).toBeDefined();
    });

    it('should reject an invalid expectation before proof', async () => {
      const invalid = await runOneAssertion((collector) => {
        collector.expectGeo(housing).toHaveVoidContinuity({ path: [] } as unknown as GeoSpecVoidContinuityExpectation);
      });
      expect(invalid?.status).toBe('failed');
      expect(invalid?.assertions[0]?.diagnostics?.[0]?.code).toBe('GEOSPEC_INVALID_EXPECTATION');
    });

    it('should fail the whole matcher on a mesh-only (no BRep) subject', async () => {
      const meshOnly: GeometrySubject = { ...housing, step: undefined, nativeXde: undefined };
      const rejected = await runOneAssertion((collector) => {
        collector.expectGeo(meshOnly).toHaveVoidContinuity({ path: [[0, 0, 10]], material: ['housing'] });
      });
      expect(rejected?.status).toBe('failed');
      expect(rejected?.assertions[0]?.diagnostics?.[0]?.message).toContain('BRep-kernel subject');
    });

    it('should fail a heavy matcher as a bounded MATCHER_TIMEOUT through the collector (R13)', async () => {
      // R13 end to end: a tiny work-unit budget + a large grid (multi-chunk
      // classification, fresh bounds so the A4 memo misses) makes the
      // void-continuity matcher exhaust its deterministic unit budget at a
      // chunk boundary and fail as a bounded timeout, not a stall — the same
      // outcome at any machine load or pool size.
      process.env['GEOSPEC_MATCHER_UNIT_BUDGET'] = '1';
      try {
        const timedOut = await runOneAssertion((collector) => {
          collector.expectGeo(housing).toHaveVoidContinuity({
            path: [
              [0, 0, 10],
              [0, 0, 55],
            ],
            material: ['housing'],
            resolution: 1,
            bounds: { min: [-14, -14, -5], max: [14, 14, 61] },
          });
        });
        expect(timedOut?.status).toBe('failed');
        expect(timedOut?.assertions[0]?.diagnostics?.[0]?.code).toBe('MATCHER_TIMEOUT');
      } finally {
        delete process.env['GEOSPEC_MATCHER_UNIT_BUDGET'];
      }
    }, 30_000);
  });
});
