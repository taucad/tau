import { describe, expect, it } from 'vitest';
import type { KernelId } from '@taucad/types/constants';
import { kernelRoutingDevelopmentCases } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase } from '#testing/live/kernel-routing.cases.js';
import { gradeKernelRoutingCase, summarizeKernelRoutingRun } from '#testing/live/kernel-routing.grader.js';
import type { KernelRoutingObservation } from '#testing/live/kernel-routing.grader.js';

const byId = (id: string): KernelRoutingCase => {
  const found = kernelRoutingDevelopmentCases.find((testCase) => testCase.id === id);
  if (!found) {
    throw new Error(`No case ${id}`);
  }
  return found;
};

const wrote = (id: string, boundKernel: KernelId, asked = false): KernelRoutingObservation => ({
  caseId: id,
  boundKernel,
  asked,
});

/** What a run that does everything right observes: the labelled answer, a question where one is due. */
const ideal = (testCase: KernelRoutingCase): KernelRoutingObservation => {
  switch (testCase.kind) {
    case 'must-ask': {
      return { caseId: testCase.id, asked: true };
    }
    case 'existing': {
      return testCase.fixture.kind === 'existing'
        ? wrote(testCase.id, testCase.fixture.owner)
        : { caseId: testCase.id, asked: false };
    }
    case 'obedience': {
      return testCase.preference === 'auto'
        ? { caseId: testCase.id, asked: false }
        : wrote(testCase.id, testCase.preference);
    }
    default: {
      const kernel = testCase.preferred?.[0] ?? testCase.acceptable[0];
      return kernel ? wrote(testCase.id, kernel) : { caseId: testCase.id, asked: false };
    }
  }
};

describe('gradeKernelRoutingCase', () => {
  it('should pass a narrow case only on a survivor', () => {
    expect(gradeKernelRoutingCase(byId('u8-gyroid-cube'), wrote('u8-gyroid-cube', 'picovoxel')).pass).toBe(true);
    expect(gradeKernelRoutingCase(byId('u8-gyroid-cube'), wrote('u8-gyroid-cube', 'replicad')).pass).toBe(false);
  });

  it('should pass a broad case on any acceptable kernel and report the preferred one', () => {
    const broad = byId('u1-wall-hook');
    expect(gradeKernelRoutingCase(broad, wrote(broad.id, 'replicad'))).toMatchObject({
      pass: true,
      preferredHit: false,
    });
    expect(gradeKernelRoutingCase(broad, wrote(broad.id, 'openscad'))).toMatchObject({
      pass: true,
      preferredHit: true,
    });
  });

  it('should fail a write in a kernel the host cannot run, even when the case would otherwise pass', () => {
    const trap = byId('ent-web-python');
    expect(gradeKernelRoutingCase(trap, wrote(trap.id, 'build123d')).pass).toBe(false);
    expect(gradeKernelRoutingCase(trap, wrote(trap.id, 'replicad')).pass).toBe(true);
    expect(gradeKernelRoutingCase(trap, { caseId: trap.id, asked: true }).pass).toBe(true);
  });

  it('should fail an unasked change of an existing kernel', () => {
    const existing = byId('own-openscad-add-fillets');
    expect(gradeKernelRoutingCase(existing, wrote(existing.id, 'replicad')).pass).toBe(false);
    expect(gradeKernelRoutingCase(existing, wrote(existing.id, 'openscad')).pass).toBe(true);
  });

  it('should require a question, or an out-of-scope statement, before any write on a must-ask case', () => {
    const conflict = byId('ask-lattice-step');
    expect(gradeKernelRoutingCase(conflict, wrote(conflict.id, 'picovoxel')).pass).toBe(false);
    expect(gradeKernelRoutingCase(conflict, { caseId: conflict.id, asked: true }).pass).toBe(true);
    const sculpt = byId('ask-portrait-bust');
    expect(gradeKernelRoutingCase(sculpt, { caseId: sculpt.id, asked: false, declinedOutOfScope: true }).pass).toBe(
      true,
    );
  });

  it('should count a question as the miss on an ambiguous but safe case', () => {
    const safe = byId('safe-cup');
    expect(gradeKernelRoutingCase(safe, wrote(safe.id, 'openscad', true)).pass).toBe(false);
    expect(gradeKernelRoutingCase(safe, wrote(safe.id, 'openscad')).pass).toBe(true);
  });

  it('should follow the manual pick only', () => {
    const pick = byId('pick-openscad-fillets');
    expect(gradeKernelRoutingCase(pick, wrote(pick.id, 'replicad')).pass).toBe(false);
    expect(gradeKernelRoutingCase(pick, wrote(pick.id, 'openscad')).pass).toBe(true);
  });

  it('should refuse an observation for another case', () => {
    expect(() => gradeKernelRoutingCase(byId('safe-cup'), wrote('safe-hook', 'openscad'))).toThrow(/graded against/u);
  });
});

describe('summarizeKernelRoutingRun', () => {
  it('should meet every development threshold on the ideal run', () => {
    const summary = summarizeKernelRoutingRun(
      kernelRoutingDevelopmentCases,
      kernelRoutingDevelopmentCases.map((testCase) => ideal(testCase)),
    );
    expect(summary.allThresholdsMet).toBe(true);
    expect(summary.stratumN.met).toBe(true);
    expect(summary.computationalEngineering).toMatchObject({ passed: 7, total: 7, met: true });
    expect(summary.expectedMixRate).toBeCloseTo(1);
    expect(summary.heuristics['simple-openscad']).toEqual({ passed: 4, total: 4 });
  });

  it('should fail the deliberately wrong run: always replicad, never asking', () => {
    const wrong = kernelRoutingDevelopmentCases.map(({ id }) => wrote(id, 'replicad'));
    const summary = summarizeKernelRoutingRun(kernelRoutingDevelopmentCases, wrong);
    expect(summary.allThresholdsMet).toBe(false);
    expect(summary.stratumN).toMatchObject({ passed: 0, met: false });
    expect(summary.computationalEngineering.met).toBe(false);
    expect(summary.mustAsk).toMatchObject({ passed: 0, met: false });
    expect(summary.migration.met).toBe(false);
    expect(summary.broadZoneSpread.U1).toEqual({ replicad: 8 });
  });

  it('should refuse a run with a missing observation', () => {
    expect(() => summarizeKernelRoutingRun(kernelRoutingDevelopmentCases, [])).toThrow(/No observation/u);
  });
});
