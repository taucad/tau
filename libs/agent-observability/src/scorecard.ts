import type { Evidence } from '#contract.js';
import { compareEvidence, evidenceKeys } from '#identity.js';

/*
 * Task and release scorecards (blueprint T15).
 *
 * Reads admitted evidence, from any mix of uploaders, replays and replicas,
 * and scores each run once. A fact counts once by its source; a copy of the
 * same semantic fact from another row (an abandoned turn's copied rows keep
 * their semantic identity) counts once by its semantic key; a changed claim
 * on the same identity is a conflict, kept apart, never a second fact.
 *
 * Only the summary and feedback planes are read, so a scorecard is the same
 * whether or not content capture is on. Nothing unknown is guessed: a run
 * with no outcome fact reports `unreported`, a success no assessment decided
 * stays `unknown`, and an interval with no end is counted as open rather than
 * timed. Durations are the union of a phase's intervals within one clock
 * domain, so parallel tools are not summed and clocks are never mixed.
 */

type Outcome = 'completed' | 'cancelled' | 'failed' | 'abandoned' | 'unknown';
type Protection = Evidence['lineage'][number]['protection'];
type Interval = Evidence['clocks']['intervals'][number];
type SummaryFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'];
type ToolFact = Extract<SummaryFact, { kind: 'tool' }>;
type ProviderFact = Extract<SummaryFact, { kind: 'provider' }>;
type Usage = ProviderFact['usage'];
type FinancialFact = Extract<SummaryFact, { kind: 'financial' }>;

/** What deduplication found in the evidence read. @public */
export type EvidenceReconciliation = Readonly<{
  /** Facts read, before deduplication. */
  read: number;
  /** Byte-identical facts from another uploader, replay or attempt, or another projector version of one. */
  duplicates: number;
  /** The same semantic fact from another source row. */
  replicas: number;
  /** A changed claim on an identity already read; the first claim stands. */
  conflicts: number;
  /** Content-plane facts, which a scorecard never reads. */
  content: number;
}>;

/** One run, scored from its own facts. @public */
export type RunScore = Readonly<{
  /** The run's contract id, as its facts name it. */
  run: string;
  /** The chat its trace groups under. */
  chat: string;
  /** The most protective lineage any of its facts carries. */
  protection: Protection;
  /** The release that reported it: its host build, else its API build. */
  release: string;
  termination: Outcome | 'unreported';
  success: 'verified' | 'failed' | 'unknown';
  tools: Readonly<{
    total: number;
    byClass: Readonly<Record<string, number>>;
    byOutcome: Readonly<Record<string, number>>;
  }>;
  /** Tool classes in the order the run first used each. */
  pattern: string;
  checks: Readonly<Record<string, number>>;
  /** Milliseconds per `phase@domain`, as the union of that phase's closed intervals. */
  phases: Readonly<Record<string, number>>;
  /** Intervals with no end: censored, never timed. */
  openIntervals: number;
  presented: boolean;
  rating: 'positive' | 'negative' | 'none';
  /** Explicit acceptance, rejection or correction, the first one stated. */
  judgement: 'accepted' | 'rejected' | 'corrected' | 'none';
}>;

/** Runs per bucket; an unknown or absent value is its own bucket. @public */
export type Distribution = Readonly<Record<string, number>>;

/** A cohort's scores: every count is of runs, and every unknown is its own bucket. @public */
export type CohortScore = Readonly<{
  runs: number;
  termination: Distribution;
  success: Distribution;
  rating: Distribution;
  judgement: Distribution;
  presented: number;
  patterns: Distribution;
  checks: Distribution;
  /** Per `phase@domain`: how many runs timed it, and their median and 90th percentile, in milliseconds. */
  phases: Readonly<Record<string, Readonly<{ runs: number; median: number; p90: number }>>>;
  openIntervals: number;
}>;

/** One supplier attempt, as its provider fact reports it. @public */
export type AttemptRecord = Readonly<{
  /** The logical call it serves; a retry is another attempt of the same call. */
  call: string;
  provider: string;
  /** The requested model, else `unknown`. */
  model: string;
  /** Whether the resolved model is known and differs from the requested one. */
  rerouted: boolean;
  purpose: ProviderFact['purpose'];
  stop: ProviderFact['stop'];
  /** Milliseconds from the attempt's start, in its clock domain. */
  firstOutput: ProviderFact['firstOutput'];
  usage: Usage;
}>;

/** One ledger settlement, as its financial fact reports it. @public */
export type CostRecord = Readonly<Pick<FinancialFact, 'credits' | 'supplierCost' | 'adjustment'>>;

/** How many attempts reported a time, and its median and 90th percentile, in milliseconds. @public */
export type Latency = Readonly<{ attempts: number; median: number; p90: number }>;

/** Supplier attempts; every count is of attempts unless it names calls. @public */
export type AttemptCohort = Readonly<{
  attempts: number;
  /** Distinct logical calls. */
  calls: number;
  /** Calls with more than one attempt. */
  retried: number;
  stops: Distribution;
  purposes: Distribution;
  rerouted: number;
  /** Per `chunk@domain` and `text@domain`: time to the attempt's first chunk and first text. */
  firstOutput: Readonly<Record<string, Latency>>;
  /** Reported token counts, summed; a count an attempt did not report adds nothing. */
  usage: Readonly<Record<Exclude<keyof Usage, 'missing'>, number>>;
  /** Attempts by how completely they reported usage. */
  usageCoverage: Distribution;
}>;

/** Ledger settlements: credits charged and supplier cost, with what is unknown counted. @public */
export type CostScore = Readonly<{
  settlements: number;
  adjustments: number;
  credits: number;
  /** Summed over settlements that reported it, in USD. */
  supplierCost: number;
  supplierCostUnknown: number;
}>;

/** Supplier attempts and their settlement, overall and per provider and requested model. @public */
export type AttemptScorecard = Readonly<{
  overall: AttemptCohort;
  byProvider: Readonly<Record<string, AttemptCohort>>;
  byModel: Readonly<Record<string, AttemptCohort>>;
  cost: CostScore;
}>;

/** A scorecard over admitted evidence. @public */
export type Scorecard = Readonly<{
  reconciliation: EvidenceReconciliation;
  overall: CohortScore;
  /** Keyed by the release that reported each run. */
  byRelease: Readonly<Record<string, CohortScore>>;
  /** Keyed by each run's most protective lineage. */
  byProtection: Readonly<Record<string, CohortScore>>;
  runs: readonly RunScore[];
  attempts: AttemptScorecard;
}>;

/**
 * Count each fact once: by source, then by semantic identity.
 *
 * @param evidence - Admitted evidence, in any order and from any uploader.
 * @returns The facts that stand, in first-read order, and what was set aside.
 * @public
 */
export const reconcileEvidence = (
  evidence: readonly Evidence[],
): Readonly<{ facts: readonly Evidence[]; reconciliation: EvidenceReconciliation }> => {
  const bySource = new Map<string, Evidence>();
  const bySemantic = new Set<string>();
  const facts: Evidence[] = [];
  let duplicates = 0;
  let replicas = 0;
  let conflicts = 0;
  let content = 0;
  for (const item of evidence) {
    if (item.payload.plane === 'content') {
      content++;
      continue;
    }
    const keys = evidenceKeys(item);
    const seen = bySource.get(keys.source);
    if (seen !== undefined) {
      /* Another projector version of the same source is the same fact; only a changed claim conflicts. */
      if (compareEvidence(seen, item) === 'conflict') {
        conflicts++;
      } else {
        duplicates++;
      }
      continue;
    }
    bySource.set(keys.source, item);
    if (bySemantic.has(keys.semantic)) {
      replicas++;
      continue;
    }
    bySemantic.add(keys.semantic);
    facts.push(item);
  }
  return { facts, reconciliation: { read: evidence.length, duplicates, replicas, conflicts, content } };
};

const protectionRank: Readonly<Record<Protection, number>> = { free: 0, unknown: 1, pro: 2 };

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** Total length of the union of closed intervals. */
const unionLength = (intervals: ReadonlyArray<Readonly<{ start: number; end: number }>>): number => {
  let total = 0;
  let reach = Number.NEGATIVE_INFINITY;
  for (const { start, end } of [...intervals].sort((a, b) => a.start - b.start)) {
    const from = Math.max(start, reach);
    if (end > from) {
      total += end - from;
    }
    reach = Math.max(reach, end);
  }
  return total;
};

/**
 * Time each phase as the union of its closed intervals within one clock domain.
 *
 * @param intervals - Phase intervals, from any number of facts.
 * @returns Milliseconds per `phase@domain`, and how many intervals had no end and were left untimed.
 * @public
 */
export const phaseDurations = (
  intervals: readonly Interval[],
): Readonly<{ durations: Readonly<Record<string, number>>; open: number }> => {
  const closed = new Map<string, Array<Readonly<{ start: number; end: number }>>>();
  let open = 0;
  for (const phaseInterval of intervals) {
    if (phaseInterval.end === null) {
      open++;
      continue;
    }
    const key = `${phaseInterval.phase}@${phaseInterval.domain}`;
    closed.set(key, [...(closed.get(key) ?? []), { start: phaseInterval.start, end: phaseInterval.end }]);
  }
  return { durations: Object.fromEntries([...closed].map(([key, members]) => [key, unionLength(members)])), open };
};

type RunDraft = {
  run: string;
  chat: string;
  protection: Protection;
  release: string;
  termination: Outcome | 'unreported';
  success: 'verified' | 'failed' | 'unknown';
  tools: ToolFact[];
  firstUse: Array<Readonly<{ at: number; toolClass: string }>>;
  checks: Record<string, number>;
  intervals: Interval[];
  presented: boolean;
  rating: RunScore['rating'];
  judgement: RunScore['judgement'];
};

const draftOf = (drafts: Map<string, RunDraft>, item: Evidence, run: string): RunDraft => {
  let draft = drafts.get(run);
  if (draft === undefined) {
    draft = {
      run,
      chat: item.run,
      protection: 'free',
      release: item.versions.hostBuild ?? item.versions.apiBuild ?? 'unknown',
      termination: 'unreported',
      success: 'unknown',
      tools: [],
      firstUse: [],
      checks: {},
      intervals: [],
      presented: false,
      rating: 'none',
      judgement: 'none',
    };
    drafts.set(run, draft);
  }
  for (const { protection } of item.lineage) {
    if (protectionRank[protection] > protectionRank[draft.protection]) {
      draft.protection = protection;
    }
  }
  return draft;
};

/** The run a host fact belongs to: its outcome, response and rating name it; its tool and check facts carry it. */
const runOf = (item: Evidence): string | undefined => {
  if (item.authority !== 'host-reported' || item.payload.plane === 'content') {
    return undefined;
  }
  const { fact } = item.payload;
  return fact.kind === 'response' || fact.kind === 'rating' ? fact.evidence : item.execution.attempt;
};

const applyFact = (draft: RunDraft, item: Evidence): void => {
  if (item.payload.plane === 'feedback') {
    const { fact } = item.payload;
    if (fact.kind === 'rating' && draft.rating === 'none') {
      draft.rating = fact.value;
    } else if (fact.kind === 'response' && draft.judgement === 'none') {
      draft.judgement = fact.action;
    }
    return;
  }
  if (item.payload.plane !== 'summary') {
    return;
  }
  const { fact } = item.payload;
  draft.intervals.push(...item.clocks.intervals);
  switch (fact.kind) {
    case 'tool': {
      draft.tools.push(fact);
      draft.firstUse.push({ at: item.clocks.occurredAt ?? Number.MAX_SAFE_INTEGER, toolClass: fact.toolClass });
      break;
    }
    case 'cad': {
      increment(draft.checks, fact.result);
      break;
    }
    case 'outcome': {
      draft.termination = fact.termination;
      draft.success = fact.success;
      break;
    }
    case 'response': {
      draft.presented ||= fact.action === 'presented';
      break;
    }
    default: {
      break;
    }
  }
};

const scoreOf = (draft: RunDraft): RunScore => {
  const byClass: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  for (const tool of draft.tools) {
    increment(byClass, tool.toolClass);
    increment(byOutcome, tool.outcome);
  }
  const pattern = [...new Set([...draft.firstUse].sort((a, b) => a.at - b.at).map((use) => use.toolClass))].join('>');
  const { durations, open } = phaseDurations(draft.intervals);
  return {
    run: draft.run,
    chat: draft.chat,
    protection: draft.protection,
    release: draft.release,
    termination: draft.termination,
    success: draft.success,
    tools: { total: draft.tools.length, byClass, byOutcome },
    pattern: pattern === '' ? 'none' : pattern,
    checks: draft.checks,
    phases: durations,
    openIntervals: open,
    presented: draft.presented,
    rating: draft.rating,
    judgement: draft.judgement,
  };
};

/**
 * Score each run once from its host facts.
 *
 * @param facts - Reconciled facts, from {@link reconcileEvidence}.
 * @returns One score per run that any host fact names, in first-seen order.
 * @public
 */
export const scoreRuns = (facts: readonly Evidence[]): readonly RunScore[] => {
  const drafts = new Map<string, RunDraft>();
  for (const item of facts) {
    const run = runOf(item);
    if (run !== undefined) {
      applyFact(draftOf(drafts, item, run), item);
    }
  }
  return [...drafts.values()].map((draft) => scoreOf(draft));
};

const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;

/**
 * Aggregate run scores into one cohort.
 *
 * @param runs - The cohort's runs.
 * @returns Its distributions; every bucket counts runs.
 * @public
 */
export const scoreCohort = (runs: readonly RunScore[]): CohortScore => {
  const termination: Record<string, number> = {};
  const success: Record<string, number> = {};
  const rating: Record<string, number> = {};
  const judgement: Record<string, number> = {};
  const patterns: Record<string, number> = {};
  const checks: Record<string, number> = {};
  const timings = new Map<string, number[]>();
  let presented = 0;
  let openIntervals = 0;
  for (const run of runs) {
    increment(termination, run.termination);
    increment(success, run.success);
    increment(rating, run.rating);
    increment(judgement, run.judgement);
    increment(patterns, run.pattern);
    for (const [result, count] of Object.entries(run.checks)) {
      checks[result] = (checks[result] ?? 0) + count;
    }
    for (const [key, milliseconds] of Object.entries(run.phases)) {
      timings.set(key, [...(timings.get(key) ?? []), milliseconds]);
    }
    presented += run.presented ? 1 : 0;
    openIntervals += run.openIntervals;
  }
  const phases = Object.fromEntries(
    [...timings].map(([key, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [key, { runs: sorted.length, median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) }];
    }),
  );
  return {
    runs: runs.length,
    termination,
    success,
    rating,
    judgement,
    presented,
    patterns,
    checks,
    phases,
    openIntervals,
  };
};

/* Summed in sorted order, so a total never depends on the order facts were read in. */
const total = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b).reduce((sum, value) => sum + value, 0);

const latency = (values: readonly number[]): Latency => {
  const sorted = [...values].sort((a, b) => a - b);
  return { attempts: sorted.length, median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) };
};

const usageKeys = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'] as const;

const attemptCohort = (attempts: readonly AttemptRecord[]): AttemptCohort => {
  const calls = new Map<string, number>();
  const stops: Record<string, number> = {};
  const purposes: Record<string, number> = {};
  const usageCoverage: Record<string, number> = {};
  const times = new Map<string, number[]>();
  let rerouted = 0;
  for (const attempt of attempts) {
    calls.set(attempt.call, (calls.get(attempt.call) ?? 0) + 1);
    increment(stops, attempt.stop);
    increment(purposes, attempt.purpose);
    increment(usageCoverage, attempt.usage.missing);
    rerouted += attempt.rerouted ? 1 : 0;
    const { firstOutput } = attempt;
    for (const [measure, value] of [
      ['chunk', firstOutput?.chunk],
      ['text', firstOutput?.text],
    ] as const) {
      if (firstOutput !== null && value !== null && value !== undefined) {
        const key = `${measure}@${firstOutput.domain}`;
        times.set(key, [...(times.get(key) ?? []), value]);
      }
    }
  }
  const usage = Object.fromEntries(
    usageKeys.map((key) => [key, total(attempts.flatMap((attempt) => attempt.usage[key] ?? []))]),
  ) as AttemptCohort['usage'];
  return {
    attempts: attempts.length,
    calls: calls.size,
    retried: [...calls.values()].filter((count) => count > 1).length,
    stops,
    purposes,
    rerouted,
    firstOutput: Object.fromEntries([...times].map(([key, values]) => [key, latency(values)])),
    usage,
    usageCoverage,
  };
};

const groupBy = <T, R>(
  items: readonly T[],
  key: (item: T) => string,
  score: (members: readonly T[]) => R,
): Readonly<Record<string, R>> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  }
  return Object.fromEntries([...groups].map(([name, members]) => [name, score(members)]));
};

/**
 * Aggregate supplier attempts and settlements, however they were read.
 *
 * @param attempts - Each attempt once.
 * @param costs - Each settlement once.
 * @returns The attempt cohorts and cost.
 * @public
 */
export const summarizeAttempts = (
  attempts: readonly AttemptRecord[],
  costs: readonly CostRecord[],
): AttemptScorecard => {
  const known = costs.flatMap((cost) => (cost.supplierCost === null ? [] : [cost.supplierCost]));
  return {
    overall: attemptCohort(attempts),
    byProvider: groupBy(attempts, (attempt) => attempt.provider, attemptCohort),
    byModel: groupBy(attempts, (attempt) => attempt.model, attemptCohort),
    cost: {
      settlements: costs.length,
      adjustments: costs.filter((cost) => cost.adjustment).length,
      credits: total(costs.map((cost) => cost.credits)),
      supplierCost: total(known),
      supplierCostUnknown: costs.length - known.length,
    },
  };
};

/**
 * The supplier attempts and settlements in reconciled facts. Only the API reports them: a host never sees the
 * supplier or the ledger.
 *
 * @param facts - Reconciled facts, from {@link reconcileEvidence}.
 * @returns Each attempt and settlement once.
 * @public
 */
export const attemptRecords = (
  facts: readonly Evidence[],
): Readonly<{ attempts: readonly AttemptRecord[]; costs: readonly CostRecord[] }> => {
  const attempts: AttemptRecord[] = [];
  const costs: CostRecord[] = [];
  for (const item of facts) {
    if (item.authority !== 'api-reported' || item.payload.plane !== 'summary') {
      continue;
    }
    const { fact } = item.payload;
    if (fact.kind === 'provider') {
      attempts.push({
        call: fact.logicalCall,
        provider: fact.provider ?? 'unknown',
        model: fact.requestedModel ?? 'unknown',
        rerouted:
          fact.requestedModel !== null && fact.resolvedModel !== null && fact.requestedModel !== fact.resolvedModel,
        purpose: fact.purpose,
        stop: fact.stop,
        firstOutput: fact.firstOutput,
        usage: fact.usage,
      });
    } else if (fact.kind === 'financial') {
      costs.push({ credits: fact.credits, supplierCost: fact.supplierCost, adjustment: fact.adjustment });
    }
  }
  return { attempts, costs };
};

/**
 * Aggregate run scores overall and per release and protection cohort, however they were read.
 *
 * @param runs - Each run once.
 * @returns The cohorts.
 * @public
 */
export const summarizeRuns = (
  runs: readonly RunScore[],
): Pick<Scorecard, 'overall' | 'byRelease' | 'byProtection'> => ({
  overall: scoreCohort(runs),
  byRelease: groupBy(runs, (run) => run.release, scoreCohort),
  byProtection: groupBy(runs, (run) => run.protection, scoreCohort),
});

/**
 * Score admitted evidence: reconcile it, score each run once, and aggregate overall and per cohort.
 *
 * A rating of `none` means no rating fact: the run was not rated, or its account did not allow ratings. Evidence alone
 * cannot tell the two apart, so a rate is only read against runs whose grant is known.
 *
 * @param evidence - Admitted evidence.
 * @returns The scorecard.
 * @public
 */
export const scorecard = (evidence: readonly Evidence[]): Scorecard => {
  const { facts, reconciliation } = reconcileEvidence(evidence);
  const runs = scoreRuns(facts);
  const { attempts, costs } = attemptRecords(facts);
  return { reconciliation, ...summarizeRuns(runs), runs, attempts: summarizeAttempts(attempts, costs) };
};
