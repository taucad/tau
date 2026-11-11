import type { KernelId, KernelRoutingZoneId } from '@taucad/types/constants';
import { kernelRoutingFamilyShares, kernelRoutingRoutingCases } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase, KernelRoutingHeuristic } from '#testing/live/kernel-routing.cases.js';

/**
 * The grader of the automatic kernel selection eval (blueprint AKS-3a, D9, Appendix E). It scores what a run observed
 * against a case's labels and turns a run's grades into the D9 metrics, with the development thresholds of
 * Appendix E. It reads labels only; a runner never shows them to the model.
 */

/** What a runner observed for one case, up to the first written entry or the end of the turn. */
export type KernelRoutingObservation = {
  readonly caseId: string;
  /** The catalog kernel the first written entry bound, from the binding helper or the first `evaluate_model`. */
  readonly boundKernel?: KernelId;
  /** Whether the agent asked the person a question before writing an entry. */
  readonly asked: boolean;
  /** Whether it said the request is out of scope and offered the nearest thing Tau can build. */
  readonly declinedOutOfScope?: boolean;
  /** Whether the chosen kernel's `cad-` skill was activated before the first write; reported, never gated. */
  readonly skillBeforeWrite?: boolean;
  /** Whether it named the kernel and a reason before modelling; reported, never gated. */
  readonly announced?: boolean;
};

/** One graded case. */
export type KernelRoutingGrade = {
  readonly caseId: string;
  readonly pass: boolean;
  readonly reason: string;
  /** For a case with `preferred`, whether the bound kernel was one of them. */
  readonly preferredHit?: boolean;
};

const has = (kernels: readonly KernelId[] | undefined, kernel: KernelId | undefined): boolean =>
  kernel !== undefined && (kernels ?? []).includes(kernel);

/**
 * Grade one observation against its case.
 *
 * @param testCase - The labelled case.
 * @param observation - What the run observed.
 * @returns The grade with a one-line reason.
 */
// oxlint-disable-next-line complexity -- one branch per case kind, as Appendix E lists them
export const gradeKernelRoutingCase = (
  testCase: KernelRoutingCase,
  observation: KernelRoutingObservation,
): KernelRoutingGrade => {
  if (observation.caseId !== testCase.id) {
    throw new Error(`Observation ${observation.caseId} graded against case ${testCase.id}.`);
  }
  const bound = observation.boundKernel;
  const preferredHit = testCase.preferred && bound ? has(testCase.preferred, bound) : undefined;
  const result = (pass: boolean, reason: string): KernelRoutingGrade => ({
    caseId: testCase.id,
    pass,
    reason,
    ...(preferredHit === undefined ? {} : { preferredHit }),
  });

  if (has(testCase.forbidden, bound)) {
    return result(false, `wrote ${bound}, which is not available on the ${testCase.host} host`);
  }
  switch (testCase.kind) {
    case 'routing':
    case 'ambiguous-safe': {
      if (testCase.kind === 'ambiguous-safe' && observation.asked) {
        return result(false, 'asked on a request where any acceptable kernel serves');
      }
      if (bound === undefined) {
        return result(false, observation.asked ? 'asked instead of choosing' : 'wrote no entry');
      }
      return has(testCase.acceptable, bound)
        ? result(true, `${bound} is acceptable`)
        : result(false, `${bound} is not in ${testCase.acceptable.join(', ')}`);
    }
    case 'must-ask': {
      if (bound !== undefined && !observation.asked) {
        return result(false, `wrote ${bound} without asking`);
      }
      return observation.asked || observation.declinedOutOfScope === true
        ? result(true, observation.asked ? 'asked' : 'said it is out of scope and offered the nearest')
        : result(false, 'neither asked nor declined');
    }
    case 'entitlement': {
      return result(true, bound === undefined ? 'wrote no entry' : `wrote ${bound}, which is available`);
    }
    case 'existing': {
      if (testCase.fixture.kind !== 'existing') {
        throw new Error(`Existing-project case ${testCase.id} has no existing fixture.`);
      }
      return bound === undefined || bound === testCase.fixture.owner
        ? result(true, 'kept the project kernel')
        : result(false, `changed ${testCase.fixture.owner} to ${bound} unasked`);
    }
    case 'obedience': {
      return bound === testCase.preference
        ? result(true, 'followed the manual pick')
        : result(false, `picked ${testCase.preference} but wrote ${bound ?? 'nothing'}`);
    }
  }
};

/** A count against an Appendix E threshold. */
export type KernelRoutingMetric = {
  readonly passed: number;
  readonly total: number;
  /** The least `passed` that meets the threshold, or undefined for a reported metric. */
  readonly required?: number;
  /** For a tripwire, the most failures allowed. */
  readonly maxFailures?: number;
  readonly met?: boolean;
};

/** The D9 figures of one run. */
export type KernelRoutingSummary = {
  /** Stratum R: routing cases where replicad is acceptable (always-replicad scores every one). */
  readonly stratumR: KernelRoutingMetric;
  /** Stratum N: routing cases where it is not (always-replicad scores none). */
  readonly stratumN: KernelRoutingMetric;
  readonly computationalEngineering: KernelRoutingMetric;
  readonly entitlement: KernelRoutingMetric;
  readonly migration: KernelRoutingMetric;
  readonly mustAsk: KernelRoutingMetric;
  readonly obedience: KernelRoutingMetric;
  /** Questions asked on routing cases (reported in development; at most 4 of 40 at the gate). */
  readonly clearCaseAsks: KernelRoutingMetric;
  readonly families: Readonly<Partial<Record<KernelRoutingZoneId, KernelRoutingMetric>>>;
  /** Per-family pass rates weighted by the estimated shares (indicative only). */
  readonly expectedMixRate: number;
  readonly heuristics: Readonly<Partial<Record<KernelRoutingHeuristic, KernelRoutingMetric>>>;
  /** Kernels chosen in each broad zone, so a rubric that never leaves one kernel is seen. */
  readonly broadZoneSpread: Readonly<Partial<Record<KernelRoutingZoneId, Readonly<Partial<Record<KernelId, number>>>>>>;
  readonly allThresholdsMet: boolean;
};

/** A routing case's gate stratum: R when replicad is acceptable (always-replicad scores it), else N. */
export const stratumOf = (testCase: KernelRoutingCase): 'R' | 'N' =>
  testCase.acceptable.includes('replicad') ? 'R' : 'N';

const count = (
  grades: readonly KernelRoutingGrade[],
  threshold?: { readonly rate?: number; readonly atLeast?: number; readonly maxFailures?: number },
): KernelRoutingMetric => {
  const passed = grades.filter(({ pass }) => pass).length;
  const total = grades.length;
  if (threshold?.maxFailures !== undefined) {
    return { passed, total, maxFailures: threshold.maxFailures, met: total - passed <= threshold.maxFailures };
  }
  const required =
    threshold?.atLeast ?? (threshold?.rate === undefined ? undefined : Math.ceil(threshold.rate * total - 1e-9));
  return required === undefined ? { passed, total } : { passed, total, required, met: passed >= required };
};

/**
 * Summarize a development run against the Appendix E thresholds (one run per case).
 *
 * @param cases - The cases the run covered.
 * @param observations - One observation per case.
 * @returns The D9 figures and whether every threshold the run covered is met.
 */
export const summarizeKernelRoutingRun = (
  cases: readonly KernelRoutingCase[],
  observations: readonly KernelRoutingObservation[],
): KernelRoutingSummary => {
  const byId = new Map(observations.map((observation) => [observation.caseId, observation]));
  const graded = cases.map((testCase) => {
    const observation = byId.get(testCase.id);
    if (!observation) {
      throw new Error(`No observation for case ${testCase.id}.`);
    }
    return { testCase, observation, grade: gradeKernelRoutingCase(testCase, observation) };
  });
  const where = (predicate: (row: (typeof graded)[number]) => boolean): KernelRoutingGrade[] =>
    graded.filter((row) => predicate(row)).map(({ grade }) => grade);
  const routing = graded.filter(({ testCase }) => testCase.kind === 'routing');

  const families: Partial<Record<KernelRoutingZoneId, KernelRoutingMetric>> = {};
  for (const family of new Set(routing.map(({ testCase }) => testCase.family))) {
    families[family] = count(where(({ testCase }) => testCase.kind === 'routing' && testCase.family === family));
  }
  let weighted = 0;
  let weight = 0;
  for (const [family, share] of kernelRoutingFamilyShares) {
    const metric = families[family];
    if (metric === undefined) {
      continue;
    }
    weighted += share * (metric.passed / metric.total);
    weight += share;
  }

  const heuristics: Partial<Record<KernelRoutingHeuristic, KernelRoutingMetric>> = {};
  for (const { testCase, observation } of graded) {
    if (testCase.heuristic && testCase.preferred) {
      const current = heuristics[testCase.heuristic] ?? { passed: 0, total: 0 };
      heuristics[testCase.heuristic] = {
        passed: current.passed + (has(testCase.preferred, observation.boundKernel) ? 1 : 0),
        total: current.total + 1,
      };
    }
  }

  const broadZoneSpread: Partial<Record<KernelRoutingZoneId, Partial<Record<KernelId, number>>>> = {};
  for (const { testCase, observation } of routing) {
    if (testCase.tier === 'broad' && observation.boundKernel) {
      const zone = broadZoneSpread[testCase.family] ?? {};
      broadZoneSpread[testCase.family] = zone;
      zone[observation.boundKernel] = (zone[observation.boundKernel] ?? 0) + 1;
    }
  }

  const metrics = {
    stratumR: count(
      where(({ testCase }) => testCase.kind === 'routing' && stratumOf(testCase) === 'R'),
      { rate: 0.95 },
    ),
    stratumN: count(
      where(({ testCase }) => testCase.kind === 'routing' && stratumOf(testCase) === 'N'),
      { rate: 0.85 },
    ),
    computationalEngineering: count(
      where(({ testCase }) => testCase.kind === 'routing' && testCase.family === 'U8'),
      { atLeast: 6 },
    ),
    entitlement: count(
      where(({ testCase }) => testCase.forbidden !== undefined),
      { maxFailures: 0 },
    ),
    migration: count(
      where(({ testCase }) => testCase.kind === 'existing'),
      { maxFailures: 0 },
    ),
    mustAsk: count(
      where(({ testCase }) => testCase.kind === 'must-ask'),
      { atLeast: 5 },
    ),
    obedience: count(
      where(({ testCase }) => testCase.kind === 'obedience'),
      { atLeast: 4 },
    ),
  };
  const covered = [
    metrics.stratumR,
    metrics.stratumN,
    metrics.computationalEngineering,
    metrics.entitlement,
    metrics.migration,
    metrics.mustAsk,
    metrics.obedience,
  ].filter(({ total }) => total > 0);
  const clearCaseAsks = {
    passed: routing.filter(({ observation }) => observation.asked).length,
    total: routing.length,
  };

  return {
    ...metrics,
    clearCaseAsks,
    families,
    expectedMixRate: weight === 0 ? 0 : weighted / weight,
    heuristics,
    broadZoneSpread,
    allThresholdsMet: covered.every(({ met }) => met !== false),
  };
};

/**
 * The analytic baseline of a static default ("always replicad", "always OpenSCAD"): its observation on every routing
 * case is a silent write in that kernel. D9 does not run these arms; their figures follow from the labels.
 *
 * @param kernel - The static default.
 * @param cases - The routing cases; the development set's by default.
 * @returns The run summary for that arm.
 */
export const staticDefaultBaseline = (
  kernel: KernelId,
  cases: readonly KernelRoutingCase[] = kernelRoutingRoutingCases,
): KernelRoutingSummary =>
  summarizeKernelRoutingRun(
    cases,
    cases.map(({ id }) => ({ caseId: id, boundKernel: kernel, asked: false })),
  );
