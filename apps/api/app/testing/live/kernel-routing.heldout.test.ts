import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kernelRoutingZones } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { kernelRoutingDevelopmentCases, kernelRoutingHosts } from '#testing/live/kernel-routing.cases.js';
import { staticDefaultBaseline, stratumOf } from '#testing/live/kernel-routing.grader.js';
import {
  kernelRoutingHeldOutBehaviourCases,
  kernelRoutingHeldOutCases,
  kernelRoutingHeldOutRoutingCases,
  kernelRoutingHeldOutStratumN,
  kernelRoutingHeldOutStratumR,
  selectKernelRoutingCases,
} from '#testing/live/kernel-routing.heldout.js';
import type { KernelRoutingHeldOutCase } from '#testing/live/kernel-routing.heldout.js';

/** Each value with its count, in order of first appearance. */
const tally = <T extends string>(values: readonly T[]): Array<[T, number]> => {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts];
};

const buckets = (cases: readonly KernelRoutingHeldOutCase[]) => tally(cases.map(({ bucket }) => bucket));

describe('kernel routing held-out set (AKS-3d, Appendix E)', () => {
  it('should hold 80 cases: 40 routing and 40 behaviour', () => {
    expect(kernelRoutingHeldOutCases).toHaveLength(80);
    expect(kernelRoutingHeldOutRoutingCases).toHaveLength(40);
    expect(kernelRoutingHeldOutRoutingCases.every(({ kind }) => kind === 'routing')).toBe(true);
    expect(tally(kernelRoutingHeldOutBehaviourCases.map(({ kind }) => kind))).toEqual([
      ['must-ask', 10],
      ['entitlement', 10],
      ['existing', 10],
      ['obedience', 10],
    ]);
  });

  it('should hold stratum R in the family counts of Appendix E, every case scoring replicad', () => {
    expect(kernelRoutingHeldOutStratumR.map((testCase) => stratumOf(testCase))).toEqual(
      Array.from({ length: 20 }, () => 'R'),
    );
    expect(buckets(kernelRoutingHeldOutStratumR)).toEqual([
      ['everyday-prints', 6],
      ['enclosures', 3],
      ['standard-components', 3],
      ['process-parts', 2],
      ['assemblies', 2],
      ['product-form', 1],
      ['organic', 1],
      ['architecture', 1],
      ['teaching', 1],
    ]);
    expect(tally(kernelRoutingHeldOutStratumR.map(({ family }) => family))).toEqual([
      ['U1', 6],
      ['U2', 3],
      ['U3', 3],
      ['U4', 2],
      ['U5', 2],
      ['U6', 1],
      ['U7', 1],
      ['U10', 1],
      ['U11', 1],
    ]);
  });

  it('should hold stratum N in the counts of Appendix E, no case scoring replicad', () => {
    expect(kernelRoutingHeldOutStratumN.map((testCase) => stratumOf(testCase))).toEqual(
      Array.from({ length: 20 }, () => 'N'),
    );
    expect(buckets(kernelRoutingHeldOutStratumN)).toEqual([
      ['computational-engineering', 7],
      ['electronics', 4],
      ['existing-mesh', 2],
      ['voxel-only-organic', 2],
      ['customiser-or-scad', 2],
      ['named-language', 3],
    ]);
  });

  it('should make the 7 computational-engineering cases the only U8 routing cases, each voxel-only', () => {
    const ce = kernelRoutingHeldOutRoutingCases.filter(({ family }) => family === 'U8');
    expect(ce).toHaveLength(7);
    expect(ce.every(({ bucket }) => bucket === 'computational-engineering')).toBe(true);
    for (const testCase of ce) {
      expect(
        testCase.acceptable.every((id) => id === 'picovoxel' || id === 'picogk'),
        testCase.id,
      ).toBe(true);
    }
  });

  it('should hold the must-ask cases in the counts of Appendix E', () => {
    const mustAsk = kernelRoutingHeldOutBehaviourCases.filter(({ kind }) => kind === 'must-ask');
    expect(buckets(mustAsk)).toEqual([
      ['conflicting-rules', 4],
      ['best-fit-unavailable', 3],
      ['out-of-scope', 3],
    ]);
    expect(mustAsk.filter(({ tier }) => tier === 'none').map(({ bucket }) => bucket)).toEqual(
      Array.from({ length: 3 }, () => 'out-of-scope'),
    );
  });

  it('should write exactly three cases in languages other than English', () => {
    const foreign = kernelRoutingHeldOutCases.filter(({ language }) => language !== undefined && language !== 'en');
    expect(foreign).toHaveLength(3);
  });

  it('should keep ids unique, and distinct from the development set in id and prompt', () => {
    const ids = kernelRoutingHeldOutCases.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const developmentIds = new Set(kernelRoutingDevelopmentCases.map(({ id }) => id));
    const developmentPrompts = new Set(kernelRoutingDevelopmentCases.map(({ prompt }) => prompt.trim().toLowerCase()));
    for (const testCase of kernelRoutingHeldOutCases) {
      expect(developmentIds.has(testCase.id), testCase.id).toBe(false);
      expect(developmentPrompts.has(testCase.prompt.trim().toLowerCase()), testCase.id).toBe(false);
    }
  });

  it('should label only kernels the case host can run, and forbid only kernels it cannot', () => {
    for (const testCase of kernelRoutingHeldOutCases) {
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
      expect([...testCase.acceptable, ...(testCase.preferred ?? [])], testCase.id).not.toContain('zoo');
    }
  });

  it('should give every entitlement trap a forbidden set that includes Zoo, and no other case one', () => {
    for (const testCase of kernelRoutingHeldOutCases) {
      if (testCase.kind === 'entitlement') {
        expect(testCase.forbidden, testCase.id).toContain('zoo');
        if (testCase.host === 'web') {
          expect([...(testCase.forbidden ?? [])].sort(), testCase.id).toEqual([
            'build123d',
            'picogk',
            'smlibpy',
            'zoo',
          ]);
        }
      } else {
        expect(testCase.forbidden, testCase.id).toBeUndefined();
      }
    }
  });

  it('should start every migration trap from an existing model and accept only its owner', () => {
    for (const testCase of kernelRoutingHeldOutCases.filter(({ kind }) => kind === 'existing')) {
      expect(testCase.fixture.kind, testCase.id).toBe('existing');
      if (testCase.fixture.kind === 'existing') {
        expect(testCase.acceptable, testCase.id).toEqual([testCase.fixture.owner]);
        expect(kernelRoutingHosts[testCase.host].available, testCase.id).toContain(testCase.fixture.owner);
      }
      expect(testCase.preference, testCase.id).toBe('auto');
    }
  });

  it('should give every obedience case a concrete, available pick and accept only it', () => {
    const obedience = kernelRoutingHeldOutCases.filter(({ kind }) => kind === 'obedience');
    for (const testCase of obedience) {
      expect(testCase.preference, testCase.id).not.toBe('auto');
      expect(testCase.acceptable, testCase.id).toEqual([testCase.preference]);
    }
    expect(new Set(obedience.map(({ preference }) => preference)).size).toBeGreaterThanOrEqual(8);
  });

  it('should agree with the D5 table: a broad case scores its zone, a narrow case a subset of it', () => {
    for (const testCase of kernelRoutingHeldOutRoutingCases.filter(({ named }) => !named)) {
      const zoneSet: readonly KernelId[] = (
        kernelRoutingZones.find(({ id }) => id === testCase.family)?.acceptable ?? []
      ).filter((id: KernelId) => kernelRoutingHosts[testCase.host].available.includes(id));
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

  it('should score always-replicad at all of stratum R and none of stratum N', () => {
    const replicad = staticDefaultBaseline('replicad', kernelRoutingHeldOutRoutingCases);
    expect(replicad.stratumR).toMatchObject({ passed: 20, total: 20 });
    expect(replicad.stratumN).toMatchObject({ passed: 0, total: 20 });
    expect(replicad.computationalEngineering).toMatchObject({ passed: 0, total: 7 });
  });
});

describe('held-out selection', () => {
  it('should select the development set by default and the held-out set only by name', () => {
    expect(selectKernelRoutingCases('')).toBe(kernelRoutingDevelopmentCases);
    expect(selectKernelRoutingCases('development')).toBe(kernelRoutingDevelopmentCases);
    expect(selectKernelRoutingCases('heldout')).toBe(kernelRoutingHeldOutCases);
    expect(() => selectKernelRoutingCases('gate')).toThrow(/KERNEL_ROUTING_SET/u);
  });

  it('should never be imported outside the live eval', () => {
    const root = resolve(import.meta.dirname, '../../../../..');
    const walk = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        if (name === 'node_modules' || name === 'dist') {
          return [];
        }
        return statSync(path).isDirectory() ? walk(path) : /\.(?:ts|tsx)$/u.test(name) ? [path] : [];
      });
    const sources = [...walk(join(root, 'libs/chat/src')), ...walk(join(root, 'apps/api/app'))].filter(
      (path) => !path.includes(join('testing', 'live', 'kernel-routing.heldout')),
    );
    const importers = sources.filter((path) => readFileSync(path, 'utf8').includes('kernel-routing.heldout'));
    expect(importers).toEqual([]);
  });
});
