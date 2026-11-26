/**
 * Flaky-regression detection and its bisect under stress: the pure half (`flake-regression-cli.ts` does the IO).
 *
 * **The class.** A test that ran 300 or more times on one variant without a flake event ({@link stableExecutions})
 * and then meets the quarantine entry rule on that variant (two events in its last 80 executions, or three in 230)
 * did not become flaky by chance: one landing introduced an intermittent defect, often a race in the product. It is a
 * regression candidate, not an ordinary flake: {@link isFlakyRegression} is the check for quarantine entry
 * automation to refuse it. This module and its workflow change no ledger or quarantine state; they flag the
 * candidate for the operator, bisect it to the landing that introduced it, and name the culprit on its issue.
 *
 * **One stream per variant.** The baseline, the gaps and the entry rule are all counted on one variant's executions
 * (`linux-x64`, `linux-x64 browser=firefox`), so a flake on one variant never joins a burst or a stable run of
 * another. The ledger tracks a test from its first failed or retried execution; the executions of its target on a
 * variant before the ledger first counted the test there are that variant's `stableBefore`
 * (`ci-flake-ledger-state.ts`). The stable run before an onset is the executions between the event before it and the
 * onset; for the first event the ledger still holds, the executions since the newest event it dropped
 * (`evictedExecution`), or, when it never dropped one, `stableBefore` plus the executions before the onset.
 *
 * **The bisect.** Between the last stable commit (the last push to `main` the CI ran before the onset) and the first
 * flaky one (the commit of the onset's failing run), on the linear history of `main`. Each probe is one dispatch of
 * `flake-repro.yml` at one commit, so the harness's own gate holds it to three runs at once, 3,000 runner-minutes a
 * week and its per-dispatch cap of 120 minutes. The first probe, at the flaky commit, runs the requested modes and
 * keeps the variant with the highest failure rate; every later probe runs only that variant. A commit is clean after
 * n straight passes, n from the 95 % lower bound of that rate ({@link cleanAttempts}). Assuming attempts are
 * independent and the culprit's rate holds on every later commit, a flaky commit passes n straight attempts at most 5 %
 * of the time; the culprit is provisional on that assumption. A last stable commit that reproduces moves the clean
 * end back by doubling the distance. A commit where the test does not exist yet is clean, and a culprit whose parent
 * lacks the test introduced it.
 *
 * **Bounds** ({@link bisectLimits}): at most 10 probes and 300 runner-minutes for one bisect, every dispatch counted,
 * and a history window of 250 commits; one bisect runs at a time. Whatever the bounds cut short is reported with the
 * range it narrowed to, for the operator.
 */
import { createHash } from 'node:crypto';

import { entryRule } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState, LedgerState, VariantState } from '#ci-flake-ledger-state.js';
import { exactInterval, limits as reproLimits } from '#flake-repro.js';

/** Executions of one variant without a flake event that make a test stable there. */
export const stableExecutions = 300;

/** The bounds of one bisect. */
export const bisectLimits = {
  /** `flake-repro.yml` dispatches. Ten probes bracket and split a range of 256 commits. */
  probes: 10,
  /** Runner-minutes of every dispatch of one bisect: the stress budget of one flake. */
  minutes: 300,
  /** Each dispatch's own cap, `flake-repro.yml`'s `minutes` limit. */
  dispatchMinutes: reproLimits.dispatchMinutes,
  /** A probe needs at least this many minutes of the budget to start. */
  minimumProbeMinutes: 15,
  /** Commits of `main` history the bisect reads back from the flaky commit. */
  commits: 250,
  /** Attempts per variant of the first probe, at the flaky commit. */
  initialAttempts: 30,
  /** The fewest straight passes that make a commit clean. */
  minimumCleanAttempts: 20,
  /** The most attempts one clean verdict may need; a rarer flake cannot be bisected inside the budget. */
  maximumCleanAttempts: 400,
} as const;

/** {@link bisectLimits}' shape, for overrides. */
export type BisectLimits = { readonly [Key in keyof typeof bisectLimits]: number };

/** The modes the first probe runs when the caller names none: the base rate, contention and collisions. */
export const defaultModes = 'repeat,cpu,parallel';

// ---------------------------------------------------------------------------------------------------------------
// Detection.

/** Where a stable test started flaking, on one variant. */
export type RegressionOnset = {
  /** The variant whose stream the onset, the stable run and the entry rule were counted on. */
  readonly variant: string;
  /** The first event after the stable run. */
  readonly onset: FlakeEvent;
  /** The onset and the variant's events after it. */
  readonly events: readonly FlakeEvent[];
  /** Executions of the variant without an event before the onset. */
  readonly stableBefore: number;
  /** The variant's event before the stable run, if the ledger holds one. */
  readonly previous?: FlakeEvent | undefined;
};

/** One variant's events with their position in its stream, oldest first. */
const streamOf = (identity: IdentityState, variant: string): Array<FlakeEvent & { variantExecution: number }> =>
  identity.events
    .filter(
      (event): event is FlakeEvent & { variantExecution: number } =>
        event.variant === variant && event.variantExecution !== undefined,
    )
    .toSorted((a, b) => a.variantExecution - b.variantExecution || a.at.localeCompare(b.at));

/** Executions of the variant without an event before its `index`th event; −1 when that is not known. */
const gapBefore = (
  state: VariantState,
  events: ReadonlyArray<FlakeEvent & { variantExecution: number }>,
  index: number,
): number => {
  const event = events[index];
  const before = events[index - 1];
  if (!event) {
    return -1;
  }
  if (before) {
    return Math.max(0, event.variantExecution - before.variantExecution - 1);
  }
  if (state.evictedExecution !== undefined) {
    return Math.max(0, event.variantExecution - state.evictedExecution - 1);
  }
  return state.stableBefore === undefined ? -1 : state.stableBefore + event.variantExecution - 1;
};

/**
 * The onset of one variant's latest burst of events: the first event after a run of at least `threshold` of its
 * executions without one. Undefined when the latest burst has no such run before it (or it is not known).
 */
export const variantOnset = (
  identity: IdentityState,
  variant: string,
  threshold = stableExecutions,
): RegressionOnset | undefined => {
  const state = identity.variants[variant];
  const events = streamOf(identity, variant);
  if (!state || events.length === 0) {
    return undefined;
  }
  let start = events.length - 1;
  while (start > 0 && gapBefore(state, events, start) < threshold) {
    start -= 1;
  }
  const onset = events[start];
  const stableBefore = gapBefore(state, events, start);
  if (!onset || stableBefore < threshold) {
    return undefined;
  }
  return { variant, onset, events: events.slice(start), stableBefore, previous: events[start - 1] };
};

/** Whether one variant's own events meet the entry rule over its own executions. */
const meetsVariantEntryRule = (identity: IdentityState, variant: string): boolean => {
  const executions = identity.variants[variant]?.executions ?? 0;
  const events = streamOf(identity, variant);
  return entryRule.some(
    (rule) => events.filter((event) => event.variantExecution > executions - rule.executions).length >= rule.events,
  );
};

/**
 * The flaky-regression onset of an identity: on some variant, its latest burst meets the entry rule and followed a
 * stable run of that variant; the earliest such onset. Undefined for an ordinary flake (or none).
 */
export const regressionOnset = (identity: IdentityState): RegressionOnset | undefined =>
  Object.keys(identity.variants)
    .filter((variant) => meetsVariantEntryRule(identity, variant))
    .flatMap((variant) => variantOnset(identity, variant) ?? [])
    .toSorted((a, b) => a.onset.at.localeCompare(b.onset.at) || a.variant.localeCompare(b.variant))[0];

/** The latest event of any variant, as an onset with no stable run: what an operator's named identity falls back to. */
export const latestEvent = (identity: IdentityState): RegressionOnset | undefined =>
  Object.keys(identity.variants)
    .flatMap((variant) => variantOnset(identity, variant, -1) ?? [])
    .toSorted((a, b) => b.onset.at.localeCompare(a.onset.at))[0];

/**
 * Whether an identity is a flaky-regression candidate. It is the check for quarantine entry automation: once that
 * automation lands with it (#2864), such a test goes to the operator with its culprit instead of being quarantined as
 * an ordinary flake. Until then nothing calls it, and a flaky regression can still be quarantined.
 */
export const isFlakyRegression = (identity: IdentityState): boolean => regressionOnset(identity) !== undefined;

/** A flaky-regression candidate of the ledger. */
export type RegressionCandidate = RegressionOnset & { readonly id: string; readonly identity: IdentityState };

/** Every flaky-regression candidate in the ledger state, the oldest onset first. */
export const detectRegressions = (state: LedgerState): RegressionCandidate[] =>
  Object.entries(state.identities)
    .flatMap(([id, identity]) => {
      const onset = regressionOnset(identity);
      return onset ? [{ id, identity, ...onset }] : [];
    })
    .sort((a, b) => a.onset.at.localeCompare(b.onset.at) || a.id.localeCompare(b.id));

/** The hidden line that ties an issue to one test identity: one issue per identity. */
export const identityMarker = (id: string): string =>
  `<!-- flake-identity: ${createHash('sha256').update(id).digest('hex').slice(0, 16)} -->`;

/** The hidden line of a bisect comment: the onset it answers and whether it finished. */
export const bisectMarker = (onsetRun: number, status: 'started' | 'done', at: string): string =>
  `<!-- flake-regression-bisect onset=${onsetRun} status=${status} at=${at} -->`;

/** A started bisect with no result after this long died with its job (the job's limit is six hours). */
const staleBisectHours = 7;

/** A bisect of this onset that finished, or one started less than seven hours ago and presumably still running. */
export const bisectRecorded = (
  comments: readonly string[],
  onsetRun: number,
  now: Date,
): 'done' | 'running' | undefined => {
  const pattern = new RegExp(
    String.raw`<!-- flake-regression-bisect onset=${onsetRun} status=(started|done) at=(\S+) -->`,
    'u',
  );
  let running = false;
  for (const body of comments) {
    const match = pattern.exec(body);
    if (match?.[1] === 'done') {
      return 'done';
    }
    if (match?.[1] === 'started' && now.getTime() - Date.parse(match[2] ?? '') < staleBisectHours * 3_600_000) {
      running = true;
    }
  }
  return running ? 'running' : undefined;
};

/** What `flake-repro.yml` needs to run one test. */
export type ReproIdentity = {
  readonly project: string;
  readonly target: string;
  /** Workspace-relative. */
  readonly file: string;
  /** Vitest's JSON-reporter full name: the suite titles and the test title joined by spaces. */
  readonly test: string;
};

const separator = ' > ';

/**
 * The repro inputs of a ledger identity (`<project> › <file> > <suite> > <title>`, the file relative to the project
 * root). Undefined when the id does not have that shape. A title that itself holds ` > ` maps to a name Vitest does
 * not report, and the first probe then finds nothing to run (not reproduced, never a culprit).
 */
export const reproIdentity = (
  id: string,
  identity: Pick<IdentityState, 'project' | 'targetKey' | 'file'>,
  projectRoot: string,
): ReproIdentity | undefined => {
  const prefix = `${identity.project} › `;
  const { file } = identity;
  if (!id.startsWith(prefix) || file === undefined || !id.startsWith(`${prefix}${file}${separator}`)) {
    return undefined;
  }
  const name = id.slice(`${prefix}${file}${separator}`.length);
  const root = projectRoot.replace(/\/+$/u, '');
  return {
    project: identity.project,
    target: identity.targetKey,
    file: root === '' || root === '.' ? file : `${root}/${file}`,
    test: name.split(separator).join(' '),
  };
};

// ---------------------------------------------------------------------------------------------------------------
// The bisect.

/** One variant row of a probe's `flake-repro` report, as the bisect reads it. */
export type ProbeRow = {
  /** `mode:variant`. */
  readonly key: string;
  /** Attempts by outcome: `passed`, `failed`, `timeout`, `error` (no report: a crash or a failed build), `missing`. */
  readonly outcomes: Readonly<Partial<Record<'passed' | 'failed' | 'timeout' | 'error' | 'missing', number>>>;
  readonly unavailable?: string | undefined;
};

/** One `flake-repro.yml` dispatch at one commit. */
export type ProbeReport = {
  readonly sha: string;
  /** Empty when the dispatch produced no report. */
  readonly rows: readonly ProbeRow[];
  /** Runner-minutes it took. */
  readonly minutes: number;
  readonly run?: { readonly id: number; readonly url: string } | undefined;
  /** Why there is no report. */
  readonly error?: string | undefined;
};

export type ProbeRequest = {
  readonly sha: string;
  /** `flake-repro.yml`'s `modes` input. */
  readonly modes: string;
  /** Attempts per variant. */
  readonly attempts: number;
  /** The dispatch's minute cap. */
  readonly minutes: number;
};

/** Runs one probe: in CI a `flake-repro.yml` dispatch; in tests a stub. */
export type Prober = (request: ProbeRequest) => Promise<ProbeReport>;

/** A commit's verdict: `absent` means the test did not exist there, which is clean. */
export type Verdict = 'flaky' | 'clean' | 'absent' | 'inconclusive';

const failuresOf = (row: ProbeRow): number => (row.outcomes.failed ?? 0) + (row.outcomes.timeout ?? 0);
const ranOf = (row: ProbeRow): number => failuresOf(row) + (row.outcomes.passed ?? 0);

/**
 * The verdict of one row: a failed or timed-out attempt is flaky (an attempt with no report at all, a crash or a
 * build broken at that commit, is not counted either way); `required` straight passes are clean; a test the report
 * never ran (`missing` only) is absent.
 */
export const verdictOf = (row: ProbeRow | undefined, required: number): Verdict => {
  if (!row || row.unavailable !== undefined) {
    return 'inconclusive';
  }
  if (failuresOf(row) > 0) {
    return 'flaky';
  }
  if (ranOf(row) === 0 && (row.outcomes.missing ?? 0) > 0 && (row.outcomes.error ?? 0) === 0) {
    return 'absent';
  }
  return (row.outcomes.passed ?? 0) >= required ? 'clean' : 'inconclusive';
};

/**
 * Straight passes that make a commit clean after the flaky commit failed k of m attempts: the least n with
 * (1 − p)ⁿ ≤ 5 %, where p is the Clopper–Pearson 95 % lower bound of the rate k/m, and at least
 * {@link bisectLimits.minimumCleanAttempts}. The observed rate itself would be no guarantee: a test failing 1 % of
 * the time shows one failure in 30 attempts often enough. Assumes independent attempts at a rate that holds from the
 * culprit on. Undefined when nothing failed.
 */
export const cleanAttempts = (k: number, m: number): number | undefined => {
  if (k === 0 || m === 0) {
    return undefined;
  }
  const lower = Math.min(exactInterval(Math.min(k, m), m).lower, 1 - Number.EPSILON);
  return Math.max(bisectLimits.minimumCleanAttempts, Math.ceil(Math.log(0.05) / Math.log1p(-lower)));
};

/** One probe as the result records it. */
export type ProbeLog = {
  readonly sha: string;
  readonly verdict: Verdict;
  readonly failures: number;
  /** Attempts that ran the test. */
  readonly ran: number;
  readonly minutes: number;
  readonly run?: { readonly id: number; readonly url: string } | undefined;
  readonly error?: string | undefined;
};

export type BisectOutcome =
  /** The culprit is named. */
  | 'culprit'
  /** The flaky commit did not reproduce in any mode: nothing to bisect. */
  | 'not-reproduced'
  /** The reproduced rate needs more straight passes per clean verdict than a probe may run. */
  | 'rate-too-low'
  /** Even the oldest commit of the window reproduced. */
  | 'unbracketed'
  /** The probe or minute budget ran out. */
  | 'budget'
  /** A probe gave no usable verdict (no report, cut short, or the variant could not run). */
  | 'inconclusive';

export type BisectResult = {
  readonly outcome: BisectOutcome;
  /** The first flaky commit: set for `culprit`. */
  readonly culprit?: string | undefined;
  /** The newest commit found clean, the culprit's parent for `culprit`. */
  readonly clean?: string | undefined;
  /** The oldest commit found flaky. */
  readonly flaky?: string | undefined;
  /** Commits after `clean` up to and including `flaky`: the culprit is one of them. */
  readonly candidates: number;
  /** The culprit's parent did not have the test: the culprit added it. */
  readonly introduced: boolean;
  /** The variant the bisect ran, and what it reproduced at the flaky commit. */
  readonly mode?: string | undefined;
  readonly failures?: number | undefined;
  readonly attempts?: number | undefined;
  /** Straight passes per clean verdict ({@link cleanAttempts}). */
  readonly required?: number | undefined;
  readonly probes: readonly ProbeLog[];
  readonly minutes: number;
};

export type BisectInput = {
  /** The linear history of `main`, oldest first, ending at the first flaky commit. */
  readonly history: readonly string[];
  /** The index in `history` of the last stable commit; below the last index. */
  readonly good: number;
  /** The modes of the first probe. */
  readonly modes: string;
  readonly prober: Prober;
  /** Overrides of {@link bisectLimits}, for tests. */
  readonly limits?: Partial<BisectLimits>;
};

/**
 * Bisect a flaky regression under stress: name the first commit of `history` where the test flakes, assuming it
 * flakes from that commit on. Never more than `limits.probes` probes or `limits.minutes` runner-minutes.
 */
export const bisectRegression = async (input: BisectInput): Promise<BisectResult> => {
  const bounds: BisectLimits = { ...bisectLimits, ...input.limits };
  const { history, prober } = input;
  const bad = history.length - 1;
  const probes: ProbeLog[] = [];
  let minutes = 0;
  let required = 0;
  /** The variant the first probe chose, and what it reproduced there. */
  const chosen: { mode?: string; failures?: number; attempts?: number } = {};
  const verdicts = new Map<number, Verdict>();

  /** The range as it stands: the newest clean index below the oldest flaky one. */
  const range = (): Pick<BisectResult, 'clean' | 'flaky' | 'candidates'> => {
    const flakyIndexes = [...verdicts].filter(([, verdict]) => verdict === 'flaky').map(([index]) => index);
    const flakyIndex = flakyIndexes.length > 0 ? Math.min(...flakyIndexes) : undefined;
    const cleanIndexes = [...verdicts]
      .filter(
        ([index, verdict]) =>
          (verdict === 'clean' || verdict === 'absent') && (flakyIndex === undefined || index < flakyIndex),
      )
      .map(([index]) => index);
    const cleanIndex = cleanIndexes.length > 0 ? Math.max(...cleanIndexes) : undefined;
    return {
      clean: cleanIndex === undefined ? undefined : history[cleanIndex],
      flaky: flakyIndex === undefined ? undefined : history[flakyIndex],
      candidates: flakyIndex === undefined ? 0 : flakyIndex - (cleanIndex ?? -1),
    };
  };
  const finish = (outcome: BisectOutcome, extra: Partial<BisectResult> = {}): BisectResult => ({
    outcome,
    ...range(),
    introduced: false,
    mode: chosen.mode,
    failures: chosen.failures,
    attempts: chosen.attempts,
    required: chosen.mode === undefined ? undefined : required,
    probes,
    minutes,
    ...extra,
  });
  /** Run one probe at `index`, or report that the budget does not allow it. */
  const probe = async (
    index: number,
    request: { modes: string; attempts: number },
  ): Promise<ProbeReport | 'budget'> => {
    const left = bounds.minutes - minutes;
    if (probes.length >= bounds.probes || left < bounds.minimumProbeMinutes) {
      return 'budget';
    }
    const sha = history[index] ?? '';
    const report = await prober({
      sha,
      modes: request.modes,
      attempts: request.attempts,
      minutes: Math.floor(Math.min(bounds.dispatchMinutes, left)),
    });
    minutes += report.minutes;
    return report;
  };
  const log = (report: ProbeReport, row: ProbeRow | undefined, verdict: Verdict): void => {
    probes.push({
      sha: report.sha,
      verdict,
      failures: row ? failuresOf(row) : 0,
      ran: row ? ranOf(row) : 0,
      minutes: report.minutes,
      run: report.run,
      error: report.error,
    });
  };
  /** The verdict of the bisect's variant at `index`. */
  const classify = async (index: number): Promise<Verdict | 'budget'> => {
    const report = await probe(index, { modes: chosen.mode ?? '', attempts: required });
    if (report === 'budget') {
      return 'budget';
    }
    const row = report.rows.find((entry) => entry.key === chosen.mode);
    const verdict = verdictOf(row, required);
    log(report, row, verdict);
    verdicts.set(index, verdict);
    return verdict;
  };

  if (history.length < 2 || input.good < 0 || input.good >= bad) {
    throw new Error(
      `bisect: the last stable commit must come before the flaky one (good ${input.good}, ${history.length} commits)`,
    );
  }

  // 1. The flaky commit, in every requested mode: the variant with the highest rate drives the rest.
  const first = await probe(bad, { modes: input.modes, attempts: bounds.initialAttempts });
  if (first === 'budget') {
    return finish('budget');
  }
  const best = first.rows
    .filter((row) => row.unavailable === undefined && failuresOf(row) > 0)
    .toSorted((a, b) => failuresOf(b) / ranOf(b) - failuresOf(a) / ranOf(a))[0];
  if (!best) {
    /* No failure is evidence only from a variant that ran the test; build errors and unavailable variants are not. */
    const ran = first.rows.some((row) => row.unavailable === undefined && ranOf(row) > 0);
    log(first, first.rows[0], ran ? 'clean' : 'inconclusive');
    return finish(ran ? 'not-reproduced' : 'inconclusive');
  }
  log(first, best, 'flaky');
  verdicts.set(bad, 'flaky');
  chosen.mode = best.key;
  chosen.failures = failuresOf(best);
  chosen.attempts = ranOf(best);
  required = cleanAttempts(chosen.failures, chosen.attempts) ?? bounds.minimumCleanAttempts;
  if (required > bounds.maximumCleanAttempts) {
    return finish('rate-too-low');
  }

  // 2. Bracket: the last stable commit must be clean; if it flakes, double the distance back.
  let { good } = input;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each probe decides the next
    const verdict = await classify(good);
    if (verdict === 'budget') {
      return finish('budget');
    }
    if (verdict === 'inconclusive') {
      return finish('inconclusive');
    }
    if (verdict !== 'flaky') {
      break;
    }
    if (good === 0) {
      return finish('unbracketed');
    }
    good = Math.max(0, bad - 2 * (bad - good));
  }

  // 3. Split: the newest clean commit and the oldest flaky one close in on each other.
  let low = good;
  let high = Math.min(...[...verdicts].filter(([, verdict]) => verdict === 'flaky').map(([index]) => index));
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    // oxlint-disable-next-line no-await-in-loop -- each probe decides the next
    const verdict = await classify(middle);
    if (verdict === 'budget') {
      return finish('budget');
    }
    if (verdict === 'inconclusive') {
      return finish('inconclusive');
    }
    if (verdict === 'flaky') {
      high = middle;
    } else {
      low = middle;
    }
  }
  return finish('culprit', { culprit: history[high], introduced: verdicts.get(low) === 'absent' });
};

// ---------------------------------------------------------------------------------------------------------------
// Issue text.

/** What happens to the quarantine: this workflow changes none, and entry automation refuses the test once it lands. */
export const quarantineNote =
  'This workflow changes no ledger or quarantine state; the quarantine entry automation refuses flaky regressions ' +
  'once it lands (#2864), and until then nothing here keeps it from quarantining this test.';

const code = (text: string): string => `\`${text.replaceAll('`', "'")}\``;
const short = (sha: string | undefined): string => (sha === undefined ? 'unknown' : sha.slice(0, 12));

/** The body of the issue a regression candidate opens when its identity has none. */
export const renderIssueBody = (candidate: RegressionCandidate, repository: string): string => {
  const { identity, onset } = candidate;
  const runUrl = (run: number): string => `https://github.com/${repository}/actions/runs/${run}`;
  return [
    identityMarker(candidate.id),
    '',
    `**Flaky regression candidate**: ${code(candidate.id)}`,
    '',
    `After ${candidate.stableBefore} executions on ${code(candidate.variant)} without a flake event, this test has ` +
      `${candidate.events.length} events there from ${onset.at.slice(0, 16)}Z on, which meets the quarantine entry rule ` +
      '(2 in 80 or 3 in 230). A stable test that starts flaking after one landing is a regression with a culprit, not an ' +
      `ordinary flake, so it goes to the operator. ${quarantineNote} The bisect under stress names the culprit in a comment.`,
    '',
    `- Project and target: ${code(`${identity.project}:${identity.targetKey}`)}${identity.file ? `, file ${code(identity.file)}` : ''}`,
    `- Executions tracked: ${identity.executions}, failures ${identity.failures}, retried passes ${identity.retriedPasses}`,
    '',
    '| Event | At | Variant | Failing run | Passing run | Error |',
    '| --- | --- | --- | --- | --- | --- |',
    ...candidate.events
      .slice(0, 20)
      .map(
        (event) =>
          `| ${event.kind} | ${event.at.slice(0, 16)}Z | ${code(event.variant)} | [${event.failedRun}](${runUrl(event.failedRun)}) | ` +
          `[${event.run}](${runUrl(event.run)}) | ${event.error ? code(event.error.slice(0, 200)).replaceAll('|', String.raw`\|`) : ''} |`,
      ),
    '',
  ].join('\n');
};

/** A commit as the comment names it. */
export type CommitInfo = {
  readonly sha: string;
  /** The first line of its message. */
  readonly title?: string | undefined;
  /** The GitHub login of its author, written without `@` so the comment notifies nobody by itself. */
  readonly author?: string | undefined;
};

const pullNumber = (title: string | undefined): number | undefined => {
  const match = /\(#(\d+)\)\s*$/u.exec(title ?? '');
  return match?.[1] ? Number(match[1]) : undefined;
};

const outcomeText: Record<BisectOutcome, string> = {
  culprit: 'culprit named',
  'not-reproduced': 'not reproduced at the first flaky commit; nothing to bisect',
  'rate-too-low': 'the reproduced rate is too low to bisect inside the budget',
  unbracketed: 'every commit of the window reproduced; the culprit is older',
  budget: 'the probe or minute budget ran out',
  inconclusive: 'a probe gave no usable verdict',
};

/** The comment that reports a finished bisect on the identity's issue. */
export const renderBisectComment = (input: {
  readonly result: BisectResult;
  readonly onsetRun: number;
  readonly culprit?: CommitInfo | undefined;
  readonly repository: string;
  readonly now: Date;
}): string => {
  const { result, culprit, repository } = input;
  const commitLink = (sha: string | undefined): string =>
    sha === undefined ? 'unknown' : `[${short(sha)}](https://github.com/${repository}/commit/${sha})`;
  const lines = [bisectMarker(input.onsetRun, 'done', input.now.toISOString()), ''];
  if (result.outcome === 'culprit' && culprit) {
    const pull = pullNumber(culprit.title);
    lines.push(
      `### Flaky regression: provisional culprit ${commitLink(culprit.sha)}`,
      '',
      `${culprit.title ? code(culprit.title) : 'Commit'}${pull === undefined ? '' : ` (#${pull})`}` +
        `${culprit.author ? ` by ${code(culprit.author)}` : ''} ` +
        (result.introduced
          ? 'added this test, and it flakes from that commit on: the flake landed with the test.'
          : 'is the first commit where the test flakes under stress; its parent ' +
            `${commitLink(result.clean)} passed ${result.required ?? 0} straight attempts.`),
      '',
      'Provisional: each clean verdict assumes independent attempts at the rate the first flaky commit showed. ' +
        "The culprit's author or agent fixes or reverts it; the operator decides whether the test is quarantined in the " +
        `meantime (class \`flaky-regression\`). ${quarantineNote}`,
    );
  } else {
    lines.push(
      `### Flaky regression: no culprit (${outcomeText[result.outcome]})`,
      '',
      result.flaky === undefined
        ? 'The bisect did not narrow the range.'
        : `The culprit is one of the ${result.candidates} commits after ${commitLink(result.clean)} up to and including ` +
            `${commitLink(result.flaky)}.`,
      '',
      `The operator decides the next step. ${quarantineNote}`,
    );
  }
  lines.push(
    '',
    `Mode ${result.mode ? code(result.mode) : 'none'}: ${result.failures ?? 0} failures in ${result.attempts ?? 0} attempts ` +
      `at the first flaky commit; a commit is clean after ${result.required ?? '—'} straight passes ((1 − p)ⁿ ≤ 5 % at the 95 % lower bound p of its rate). ` +
      `${result.probes.length} probes, ${Math.round(result.minutes)} runner-minutes (limits ${bisectLimits.probes} and ${bisectLimits.minutes}).`,
    '',
    '| Commit | Verdict | Failures / attempts | Minutes | Run |',
    '| --- | --- | --- | --- | --- |',
    ...result.probes.map(
      (probe) =>
        `| ${commitLink(probe.sha)} | ${probe.verdict} | ${probe.failures} / ${probe.ran} | ${Math.round(probe.minutes)} | ` +
        `${probe.run ? `[${probe.run.id}](${probe.run.url})` : (probe.error ?? '')} |`,
    ),
    '',
  );
  return lines.join('\n');
};
