import type { Evidence } from '#contract.js';

/*
 * Evaluation corpus selection and judge calibration (blueprint T16).
 *
 * A reusable evaluation case is selected only from synthetic, operator-owned
 * or verified eligible Free material, and selection is decided again each
 * time a case is read for a corpus: a source that has since expired, lost its
 * rights or withdrawn reuse is refused then, not only when it was first
 * chosen. Pro protection anywhere in a case's lineage refuses it for good,
 * whatever its origin or the account's current tier, and lineage that cannot
 * be established refuses it rather than defaulting to eligible.
 *
 * A judge is trusted only as far as it has been measured against a reference
 * that is not itself a judge: a deterministic check or an expert's
 * adjudication. Calibration is reported per evaluator version and cohort, an
 * abstention is counted as its own outcome rather than a pass or a fail, and
 * a rate with nothing to measure it against is left undefined, never zero.
 */

type Lineage = Evidence['lineage'][number];

/** Where an evaluation case came from. @public */
export type CorpusOrigin = 'synthetic' | 'operator' | 'customer';

/** One case offered to an evaluation corpus. @public */
export type CorpusCandidate = Readonly<{
  origin: CorpusOrigin;
  /** Every source the case was built from, with the protection and rights each carries. */
  lineage: readonly Lineage[];
  /**
   * The source account's `reuse` purpose, resolved now. Read only for a
   * customer case; synthetic and operator-owned cases have no account to ask.
   */
  reuse: 'allowed' | 'denied' | 'unknown';
}>;

/** Why a case cannot enter a reusable corpus. @public */
export type CorpusRefusal =
  | 'pro-protected'
  | 'protection-unknown'
  | 'rights-unverified'
  | 'lineage-missing'
  | 'expired'
  | 'reuse-not-allowed';

/** A selection decision. @public */
export type CorpusEligibility = Readonly<{ eligible: true }> | Readonly<{ eligible: false; refusal: CorpusRefusal }>;

/**
 * Decide whether a case may enter a reusable evaluation corpus now.
 *
 * @param candidate - The case, its lineage and its account's current reuse purpose.
 * @param at - The selection time, in milliseconds.
 * @returns Eligible, or the first refusal in order of severity.
 * @public
 */
export const corpusEligibility = (candidate: CorpusCandidate, at: number): CorpusEligibility => {
  const { lineage } = candidate;
  /* Most restrictive first: Pro is permanent, so it is reported even where another refusal also holds. */
  if (lineage.some(({ protection }) => protection === 'pro')) {
    return { eligible: false, refusal: 'pro-protected' };
  }
  if (lineage.length === 0) {
    return { eligible: false, refusal: 'lineage-missing' };
  }
  if (lineage.some(({ protection }) => protection !== 'free')) {
    return { eligible: false, refusal: 'protection-unknown' };
  }
  if (lineage.some(({ rights }) => rights !== 'verified')) {
    return { eligible: false, refusal: 'rights-unverified' };
  }
  if (lineage.some(({ expiresAt }) => expiresAt <= at)) {
    return { eligible: false, refusal: 'expired' };
  }
  if (candidate.origin === 'customer' && candidate.reuse !== 'allowed') {
    return { eligible: false, refusal: 'reuse-not-allowed' };
  }
  return { eligible: true };
};

/** The versions that make two judge scores comparable. @public */
export type EvaluatorVersion = Readonly<{ prompt: string; model: string; rubric: string; parser: string }>;

/** A judge's reading of one case. @public */
export type JudgeVerdict = 'pass' | 'fail' | 'abstain';

/** What a deterministic check or an expert established about the same case. @public */
export type ReferenceVerdict = 'pass' | 'fail' | 'unknown';

/** One judged case, with the reference it is measured against. @public */
export type Judgement = Readonly<{
  case: string;
  cohort: string;
  evaluator: EvaluatorVersion;
  verdict: JudgeVerdict;
  reference: ReferenceVerdict;
  /** Who established the reference; `none` with an `unknown` reference. */
  referenceSource: 'deterministic' | 'expert' | 'none';
}>;

/** How one evaluator version performs on one cohort. @public */
export type Calibration = Readonly<{
  evaluator: EvaluatorVersion;
  cohort: string;
  /** Distinct cases judged, conflicts excluded. */
  judged: number;
  abstained: number;
  /** Judged cases with a known reference and a decided verdict: the denominator of `agreement`. */
  measured: number;
  /** Judged cases with no known reference. They are counted, never scored. */
  unreferenced: number;
  /** Cases this evaluator version judged both ways; kept out of every rate. */
  conflicted: number;
  bySource: Readonly<{ deterministic: number; expert: number }>;
  /** Decided verdicts that match the reference. */
  agreement: number | undefined;
  /** Passes the reference failed, over the reference's failures the judge decided. */
  falseSuccess: number | undefined;
  /** Failures the reference passed, over the reference's passes the judge decided. */
  falseFailure: number | undefined;
  /** Abstentions over judged cases. */
  abstention: number | undefined;
}>;

/** One CAD check a run settled: which requirement, against which revision, with what result. @public */
export type CheckReading = Readonly<{
  /** When it settled, in milliseconds. */
  at: number;
  /** The digest of the source revision it checked. */
  revision: string;
  requirement: string;
  result: 'passed' | 'failed' | 'inconclusive' | 'unsupported' | 'not-run';
}>;

/**
 * The deterministic reference for a case, from its CAD checks alone. Only the
 * last revision checked counts, each requirement by its latest result there:
 * any failure fails it, and it passes only when every requirement passed. An
 * inconclusive, unsupported or unrun requirement is not a pass, so it leaves
 * the reference unknown rather than counting as either. Nothing the assistant
 * said about the run enters it: a claimed success cannot outvote a check.
 *
 * @param checks - The run's checks, in any order; ties keep the order given.
 * @returns The reference verdict, `unknown` when the run checked nothing.
 * @public
 */
export const checkReference = (checks: readonly CheckReading[]): ReferenceVerdict => {
  const ordered = [...checks].sort((a, b) => a.at - b.at);
  const final = ordered.at(-1)?.revision;
  const latest = new Map<string, CheckReading['result']>();
  for (const { revision, requirement, result } of ordered) {
    if (revision === final) {
      latest.set(requirement, result);
    }
  }
  const results = [...latest.values()];
  if (results.includes('failed')) {
    return 'fail';
  }
  return results.length > 0 && results.every((result) => result === 'passed') ? 'pass' : 'unknown';
};

const evaluatorKey = ({ prompt, model, rubric, parser }: EvaluatorVersion): string =>
  JSON.stringify([prompt, model, rubric, parser]);

const rate = (count: number, total: number): number | undefined => (total === 0 ? undefined : count / total);

/**
 * Measure each evaluator version against its references, per cohort.
 *
 * @param judgements - Judged cases, in any order; a repeat of the same judgement counts once.
 * @returns One calibration per evaluator version and cohort, in order of first appearance.
 * @public
 */
export const calibrate = (judgements: readonly Judgement[]): Calibration[] => {
  const groups = new Map<string, { evaluator: EvaluatorVersion; cohort: string; cases: Map<string, Judgement[]> }>();
  for (const judgement of judgements) {
    const key = JSON.stringify([evaluatorKey(judgement.evaluator), judgement.cohort]);
    const group = groups.get(key) ?? {
      evaluator: judgement.evaluator,
      cohort: judgement.cohort,
      cases: new Map<string, Judgement[]>(),
    };
    groups.set(key, group);
    group.cases.set(judgement.case, [...(group.cases.get(judgement.case) ?? []), judgement]);
  }
  return [...groups.values()].map(({ evaluator, cohort, cases }) => {
    const settled: Judgement[] = [];
    let conflicted = 0;
    for (const copies of cases.values()) {
      const [first] = copies;
      if (
        first !== undefined &&
        copies.every(({ verdict, reference }) => verdict === first.verdict && reference === first.reference)
      ) {
        settled.push(first);
      } else {
        conflicted++;
      }
    }
    const decided = settled.filter(({ verdict, reference }) => verdict !== 'abstain' && reference !== 'unknown');
    const referenceFailed = decided.filter(({ reference }) => reference === 'fail');
    const referencePassed = decided.filter(({ reference }) => reference === 'pass');
    const abstained = settled.filter(({ verdict }) => verdict === 'abstain').length;
    return {
      evaluator,
      cohort,
      judged: settled.length,
      abstained,
      measured: decided.length,
      unreferenced: settled.filter(({ reference }) => reference === 'unknown').length,
      conflicted,
      bySource: {
        deterministic: decided.filter(({ referenceSource }) => referenceSource === 'deterministic').length,
        expert: decided.filter(({ referenceSource }) => referenceSource === 'expert').length,
      },
      agreement: rate(decided.filter(({ verdict, reference }) => verdict === reference).length, decided.length),
      falseSuccess: rate(referenceFailed.filter(({ verdict }) => verdict === 'pass').length, referenceFailed.length),
      falseFailure: rate(referencePassed.filter(({ verdict }) => verdict === 'fail').length, referencePassed.length),
      abstention: rate(abstained, settled.length),
    };
  });
};
