import { describe, expect, it } from 'vitest';
import { kernelRoutingZones } from '@taucad/types/constants';
import type { KernelId, KernelRoutingZoneId } from '@taucad/types/constants';
import {
  kernelRoutingBehaviourCases,
  kernelRoutingDevelopmentCases,
  kernelRoutingFamilyShares,
  kernelRoutingHosts,
  kernelRoutingRoutingCases,
} from '#testing/live/kernel-routing.cases.js';
import { staticDefaultBaseline, stratumOf } from '#testing/live/kernel-routing.grader.js';

/** Each value with its count, in order of first appearance. */
const tally = <T extends string>(values: readonly T[]): Array<[T, number]> => {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts];
};

const zone = (id: KernelRoutingZoneId) => kernelRoutingZones.find((row) => row.id === id);

describe('kernel routing development corpus (Appendix E)', () => {
  it('should hold 50 routing cases in the family counts of Appendix E', () => {
    expect(kernelRoutingRoutingCases).toHaveLength(50);
    expect(tally(kernelRoutingRoutingCases.map(({ family }) => family))).toEqual([
      ['U1', 10],
      ['U2', 5],
      ['U3', 5],
      ['U4', 4],
      ['U5', 3],
      ['U6', 3],
      ['U7', 3],
      ['U8', 7],
      ['U9', 4],
      ['U10', 1],
      ['U11', 2],
      ['U12', 3],
    ]);
  });

  it('should hold at least 20 cases in each gate stratum', () => {
    const strata = kernelRoutingRoutingCases.map((testCase) => stratumOf(testCase));
    expect(strata.filter((stratum) => stratum === 'R').length).toBeGreaterThanOrEqual(20);
    expect(strata.filter((stratum) => stratum === 'N').length).toBeGreaterThanOrEqual(20);
  });

  it('should name a kernel, language, file type or customiser in six routing cases and write five in other languages', () => {
    expect(kernelRoutingRoutingCases.filter(({ named }) => named)).toHaveLength(6);
    expect(
      kernelRoutingRoutingCases.filter(({ language }) => language !== undefined && language !== 'en'),
    ).toHaveLength(5);
  });

  it('should hold 30 behaviour cases in the counts of Appendix E', () => {
    expect(kernelRoutingBehaviourCases).toHaveLength(30);
    expect(tally(kernelRoutingBehaviourCases.map(({ kind }) => kind))).toEqual([
      ['entitlement', 10],
      ['existing', 6],
      ['must-ask', 6],
      ['obedience', 5],
      ['ambiguous-safe', 3],
    ]);
    const existing = kernelRoutingBehaviourCases.filter(({ kind }) => kind === 'existing');
    expect(existing.filter(({ fixture }) => fixture.kind === 'existing' && fixture.noEntryText)).toHaveLength(2);
  });

  it('should keep ids unique', () => {
    const ids = kernelRoutingDevelopmentCases.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should label only kernels the case host can run, and forbid only kernels it cannot', () => {
    for (const testCase of kernelRoutingDevelopmentCases) {
      const available = new Set<KernelId>(kernelRoutingHosts[testCase.host].available);
      expect(
        testCase.acceptable.filter((id) => !available.has(id)),
        testCase.id,
      ).toEqual([]);
      expect(
        (testCase.forbidden ?? []).filter((id) => available.has(id)),
        testCase.id,
      ).toEqual([]);
      expect(
        (testCase.preferred ?? []).filter((id) => !testCase.acceptable.includes(id)),
        testCase.id,
      ).toEqual([]);
    }
  });

  it('should agree with the D5 table: a broad case scores its zone, a narrow case a subset of it', () => {
    for (const testCase of kernelRoutingRoutingCases.filter(({ named }) => !named)) {
      const zoneSet: readonly KernelId[] = (zone(testCase.family)?.acceptable ?? []).filter((id: KernelId) =>
        kernelRoutingHosts[testCase.host].available.includes(id),
      );
      if (testCase.tier === 'broad') {
        expect([...testCase.acceptable].sort(), testCase.id).toEqual([...zoneSet].sort());
      } else {
        expect(
          testCase.acceptable.filter((id) => !zoneSet.includes(id)),
          testCase.id,
        ).toEqual([]);
      }
    }
  });

  it('should weight every routing family', () => {
    for (const { family } of kernelRoutingRoutingCases) {
      expect(kernelRoutingFamilyShares.get(family), family).toBeGreaterThan(0);
    }
  });
});

describe('analytic baselines', () => {
  it('should score the static defaults from the labels alone', () => {
    const replicad = staticDefaultBaseline('replicad');
    const openscad = staticDefaultBaseline('openscad');
    const row = (name: string, summary: typeof replicad) => ({
      arm: name,
      stratumR: `${summary.stratumR.passed}/${summary.stratumR.total}`,
      stratumN: `${summary.stratumN.passed}/${summary.stratumN.total}`,
      computationalEngineering: `${summary.computationalEngineering.passed}/${summary.computationalEngineering.total}`,
      expectedMix: summary.expectedMixRate.toFixed(3),
      families: Object.fromEntries(
        Object.entries(summary.families).map(([family, metric]) => [family, `${metric.passed}/${metric.total}`]),
      ),
    });
    console.info(
      'kernel routing analytic baselines',
      JSON.stringify([row('always-replicad', replicad), row('always-openscad', openscad)]),
    );

    // By construction (D9): always-replicad passes all of stratum R and none of N.
    expect(replicad.stratumR.passed).toBe(replicad.stratumR.total);
    expect(replicad.stratumN.passed).toBe(0);
    expect(replicad.allThresholdsMet).toBe(false);
    expect(openscad.computationalEngineering.passed).toBe(0);
  });
});
