/**
 * The D9 metrics of the CI flake quarantine (FQ-11 of the blueprint, Brain `research/ci-flake-quarantine-blueprint.md`,
 * D9 "Metrics and dashboards"): the pure half. The weekly report (`ci-queue-health-cli.ts`) shows every row from live
 * data; the ledger job (`ci-flake-metrics-cli.ts`, after each ingestion) writes the same table to its summary with the
 * rows it can compute without reading the queue's jobs, and names the weekly report for the rest.
 *
 * Each row comes from the source D9 names:
 *
 * - **Origin failure rate of `ui`-affected entries** and its split: the merge-group runs of the window, classed as the
 *   weekly report classes them. A run is `ui`-affected when its first attempt dispatched a `ui-e2e` browser row
 *   (`Browser end-to-end (ui-e2e …)`), the global review's definition. The rate is origin failures over origin
 *   failures and successes. An origin failure is **infrastructure** when its first failed job ran out of an
 *   `infra-retry` step, a **flake** when the ledger recorded a flake event (`same-hash` or `lineage`) whose failing
 *   execution was in that run, **unattributed** when no failed job names it, and **deterministic** otherwise. A
 *   retried pass that failed its task under the retry rules is not told apart from a deterministic failure here.
 * - **Share of queue minutes that merge nothing**: the report's own class totals.
 * - **First enqueue to merge, runs per landing**: the pull requests merged into the base branch in the window, their
 *   `added_to_merge_queue` events and their merge-group runs (the re-measure's `merged-prs` method).
 * - **Retried passes per 1,000 test executions, runs with at least one**: the ledger's `retry` events and the test
 *   executions it counted in the window, against the seven days before.
 * - **Quarantine debt**: the `quarantine.json` files on `main`.
 * - **Second flake event to quarantined**: for each entry the ledger first saw on `main` in the window, from the gating
 *   event at which the entry rule was last met before then to that first sight (the ingestion's granularity).
 * - **MTTR, released without a human, returns**: the owner issues' automation markers (FQ-9) over the last
 *   30 days: each landed release, each expiry, and each return note.
 * - **Stress and agent runner-minutes**: the jobs of `flake-repro.yml` and `flake-regression.yml` runs in the window.
 */
import { dayNumber, parseQuarantine, quarantineBounds } from '@taucad/vitest-ci/quarantine';

import { entryRule } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, LedgerState } from '#ci-flake-ledger-state.js';
import { markersIn, operatorLabel, returnMarker, returnWindowDays } from '#ci-flake-quarantine-release.js';
import type { ReleaseRecord } from '#ci-flake-quarantine-release.js';
import { classifyRuns, failedSuites, firstAttempt, firstFailedJob, quantile } from '#ci-queue-health.js';
import type { RunEvidence, WorkflowRun } from '#ci-queue-health.js';

/** A report window, ISO timestamps. */
export type Window = { readonly from: string; readonly to: string };

/** One row of the D9 table. */
export type MetricRow = {
  readonly metric: string;
  /** The measured value, or why it is not measured here. */
  readonly value: string;
  readonly phase2: string;
  readonly phase3: string;
  readonly source: string;
};

/** The workflows whose runner minutes are the stress harness's and the agent's (D7, FQ-7, FQ-12). */
export const stressWorkflows = ['flake-repro.yml', 'flake-regression.yml'] as const;

/** The job-name prefix of a `ui-e2e` browser row in the merge queue (`e2e-queue` in `ci.yml`). */
export const uiRowPrefix = 'Browser end-to-end (ui-e2e ';

const dayMilliseconds = 24 * 60 * 60 * 1000;

const ratio = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);
const fixed = (value: number, digits = 1): string => value.toFixed(digits);
const percent = (value: number): string => `${fixed(value * 100)} %`;
const inWindow = (at: string, window: Window): boolean => at >= window.from && at <= window.to;

/** Whether a run's first attempt dispatched a `ui-e2e` browser row. */
export const uiAffected = (entry: RunEvidence): boolean =>
  firstAttempt(entry.jobs ?? []).some((job) => job.name.startsWith(uiRowPrefix) && job.conclusion !== 'skipped');

/** The runs in which a gating test failed and later passed on the same inputs: each `same-hash` or `lineage` event's failing run. */
export const flakeFailureRuns = (state: LedgerState): Set<number> =>
  new Set(
    Object.values(state.identities).flatMap((identity) =>
      identity.events
        .filter((event) => event.shadow !== true && event.kind !== 'retry')
        .map((event) => event.failedRun),
    ),
  );

export type OriginBreakdown = {
  /** `ui`-affected runs that succeeded or failed on their own. */
  readonly runs: number;
  readonly origin: number;
  readonly flake: number;
  readonly infrastructure: number;
  readonly deterministic: number;
  readonly unattributed: number;
};

/** Origin failures of `ui`-affected runs, by cause, among runs whose jobs were fetched. */
export const originBreakdown = (
  evidence: readonly RunEvidence[],
  flakeRuns: ReadonlySet<number> | undefined,
): OriginBreakdown => {
  const classes = classifyRuns(evidence);
  const counts = {
    runs: 0,
    origin: 0,
    flake: 0,
    infrastructure: 0,
    deterministic: 0,
    unattributed: 0,
  };
  for (const entry of evidence) {
    const runClass = classes.get(entry.run.id);
    if (!entry.jobs || (runClass !== 'origin' && runClass !== 'success') || !uiAffected(entry)) {
      continue;
    }
    counts.runs += 1;
    if (runClass === 'success') {
      continue;
    }
    counts.origin += 1;
    const culprit = firstFailedJob(entry.jobs);
    if (
      culprit &&
      failedSuites(culprit, entry.annotations ?? []).some((suite) => suite.startsWith('infrastructure:'))
    ) {
      counts.infrastructure += 1;
    } else if (flakeRuns?.has(entry.run.id)) {
      counts.flake += 1;
    } else if (culprit) {
      counts.deterministic += 1;
    } else {
      counts.unattributed += 1;
    }
  }
  return counts;
};

/** A pull request merged into the base branch, with its first `added_to_merge_queue` event. */
export type Landing = {
  readonly number: number;
  readonly mergedAt: string;
  /** Absent when it never entered the queue (merged by an admin, say). */
  readonly firstEnqueuedAt?: string | undefined;
};

const queuePull = /^gh-readonly-queue\/[^/]+\/pr-(\d+)-/u;

/** The pull request a merge-group run tested, from its `gh-readonly-queue/<branch>/pr-<n>-<sha>` branch. */
export const queuePullNumber = (run: WorkflowRun): number | undefined => {
  const match = queuePull.exec(run.head_branch ?? '')?.[1];
  return match ? Number(match) : undefined;
};

export type LandingStats = {
  readonly landed: number;
  readonly queued: number;
  readonly p50Minutes: number;
  readonly p90Minutes: number;
  /** Merge-group runs of the queued pull requests over those pull requests. */
  readonly runsPerLanding: number;
};

/**
 * First enqueue to merge and runs per landing over the pull requests merged in the window. A landing's runs are its
 * merge-group runs created up to its merge, whenever they started: pass every run the caller listed, not only the
 * window's, so attempts before the window count (a pull request first enqueued before the runs listed is undercounted).
 */
export const landingStats = (
  landings: readonly Landing[],
  queueRuns: readonly WorkflowRun[],
  window: Window,
): LandingStats => {
  const queued = landings.filter(
    (landing): landing is Landing & { firstEnqueuedAt: string } =>
      inWindow(landing.mergedAt, window) && landing.firstEnqueuedAt !== undefined,
  );
  const minutes = queued.map(
    (landing) => (Date.parse(landing.mergedAt) - Date.parse(landing.firstEnqueuedAt)) / 60_000,
  );
  const mergedAt = new Map(queued.map((landing) => [landing.number, landing.mergedAt]));
  const runs = queueRuns.filter((run) => {
    const merged = mergedAt.get(queuePullNumber(run) ?? -1);
    return merged !== undefined && run.created_at <= merged;
  }).length;
  return {
    landed: landings.filter((landing) => inWindow(landing.mergedAt, window)).length,
    queued: queued.length,
    p50Minutes: quantile(minutes, 0.5),
    p90Minutes: quantile(minutes, 0.9),
    runsPerLanding: ratio(runs, queued.length),
  };
};

export type RetryStats = {
  readonly executions: number;
  readonly retriedPasses: number;
  readonly perThousand: number;
  readonly runs: number;
  readonly runsWithRetry: number;
};

/** Retried passes (`retry` events) per 1,000 test executions the ledger counted, and runs with at least one. */
export const retryStats = (state: LedgerState, window: Window): RetryStats => {
  const ingested = state.ingested.filter((entry) => inWindow(entry.at, window));
  const executions = ingested.reduce((sum, entry) => sum + entry.counted, 0);
  const retries = Object.values(state.identities).flatMap((identity) =>
    identity.events.filter((event) => event.kind === 'retry' && inWindow(event.at, window)),
  );
  return {
    executions,
    retriedPasses: retries.length,
    perThousand: ratio(retries.length * 1000, executions),
    runs: new Set(ingested.map((entry) => entry.run)).size,
    runsWithRetry: new Set(retries.map((event) => event.run)).size,
  };
};

/** The seven days before a window, for a week-on-week comparison. */
export const previousWeek = (window: Window): Window => {
  const shift = (at: string): string => new Date(Date.parse(at) - 7 * dayMilliseconds).toISOString();
  return { from: shift(window.from), to: window.from };
};

/** A `quarantine.json` on `main`: its path and its text. */
export type QuarantineText = { readonly path: string; readonly text: string };

export type DebtStats = {
  readonly entries: number;
  /** Days in quarantine summed over the entries, each counted from its `created` day to today. */
  readonly testDays: number;
  readonly oldestDays: number;
  /** Entries in quarantine for more than 14 days (renewed ones). */
  readonly overFourteen: number;
  /** The file that holds the most entries, and how many. */
  readonly fullest?: { readonly path: string; readonly entries: number } | undefined;
};

/** The quarantine debt on `main`: entries, test-days and the oldest. An entry with no valid `created` counts no days. */
export const debtStats = (files: readonly QuarantineText[], today: string): DebtStats => {
  const todayNumber = dayNumber(today) ?? 0;
  let entries = 0;
  let testDays = 0;
  let oldestDays = 0;
  let overFourteen = 0;
  let fullest: { path: string; entries: number } | undefined;
  for (const file of files) {
    const held = parseQuarantine(file.text).entries.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>)['test'] === 'string',
    );
    for (const entry of held) {
      const created = dayNumber(entry['created']);
      const age = created === undefined ? 0 : Math.max(0, todayNumber - created);
      testDays += age;
      oldestDays = Math.max(oldestDays, age);
      overFourteen += age > quarantineBounds.maximumAgeDays ? 1 : 0;
    }
    entries += held.length;
    if (held.length > 0 && (!fullest || held.length > fullest.entries)) {
      fullest = { path: file.path, entries: held.length };
    }
  }
  return { entries, testDays, oldestDays, overFourteen, fullest };
};

/**
 * Whether the first `end` gating events meet D3's entry rule at `execution`. Passing executions record no event, so
 * the rule can lapse between two events: the events before one are judged at that event's execution, not their own.
 */
const ruleMetAt = (events: readonly FlakeEvent[], end: number, execution: number): boolean =>
  entryRule.some(
    (rule) =>
      events.slice(0, end).filter((event) => event.execution > execution - rule.executions).length >= rule.events,
  );

/**
 * Hours from the event at which a quarantined test last came to meet the entry rule to the ingestion that first saw
 * its entry on `main`, for each entry first seen in the window.
 */
export const hoursToQuarantine = (state: LedgerState, window: Window): number[] =>
  Object.values(state.quarantineTracks ?? {}).flatMap((track) => {
    const identity = state.identities[track.id];
    if (!identity || !inWindow(track.since, window)) {
      return [];
    }
    const events = identity.events
      .filter((event) => event.shadow !== true && event.at <= track.since)
      .sort((a, b) => a.execution - b.execution);
    let onset: FlakeEvent | undefined;
    for (const [index, event] of events.entries()) {
      if (ruleMetAt(events, index + 1, event.execution) && !ruleMetAt(events, index, event.execution)) {
        onset = event;
      }
    }
    return onset ? [(Date.parse(track.since) - Date.parse(onset.at)) / 3_600_000] : [];
  });

/** An owner issue (label `flake`) with its labels and the comments the automation wrote. */
export type OwnerIssue = {
  readonly number: number;
  readonly labels: readonly string[];
  readonly comments: readonly string[];
};

export type ReleaseStats = {
  readonly releases: number;
  readonly expiries: number;
  /** Days from `created` to the release landing, p50. */
  readonly mttrDays: number;
  /** Releases with no renewal whose issue never went to the operator. */
  readonly withoutHuman: number;
  /** Releases whose test met the entry rule again and was handed back. */
  readonly returned: number;
};

const recordKey = (record: ReleaseRecord, day: string): string =>
  `${record.identity} ${JSON.stringify(record.variant ?? null)} ${day}`;

/** Releases and expiries of the last 30 days from the owner issues' markers (FQ-9). */
export const releaseStats = (issues: readonly OwnerIssue[], today: string): ReleaseStats => {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - returnWindowDays * dayMilliseconds)
    .toISOString()
    .slice(0, 10);
  const recent = (day: string | undefined): day is string => day !== undefined && day >= since && day <= today;
  const releases = new Map<string, { record: ReleaseRecord & { released: string }; issue: OwnerIssue }>();
  const expiries = new Set<string>();
  for (const issue of issues) {
    for (const { kind, record } of markersIn(issue.comments)) {
      if (kind === 'released' && recent(record.released)) {
        releases.set(recordKey(record, record.released), {
          record: { ...record, released: record.released },
          issue,
        });
      } else if (kind === 'expiry' && recent(record.expires)) {
        expiries.add(recordKey(record, record.expires));
      }
    }
  }
  const all = [...releases.values()];
  const days = all.flatMap(({ record }) => {
    const created = dayNumber(record.created);
    const released = dayNumber(record.released);
    return created === undefined || released === undefined ? [] : [released - created];
  });
  return {
    releases: all.length,
    expiries: expiries.size,
    mttrDays: quantile(days, 0.5),
    withoutHuman: all.filter(({ record, issue }) => !record.renewal && !issue.labels.includes(operatorLabel)).length,
    returned: all.filter(({ record, issue }) => issue.comments.some((text) => text.includes(returnMarker(record))))
      .length,
  };
};

/** Runner minutes of the stress harness and agent workflows in the window. */
export type UsageStats = {
  readonly runs: number;
  readonly runnerMinutes: number;
};

/** Everything the table is built from; an absent input leaves its rows unmeasured, with the reason. */
export type MetricInputs = {
  readonly window: Window;
  readonly today: string;
  readonly queue?:
    | {
        readonly evidence: readonly RunEvidence[];
        readonly mergedNothingShare: number;
      }
    | undefined;
  readonly landings?:
    | {
        readonly landings: readonly Landing[];
        readonly queueRuns: readonly WorkflowRun[];
      }
    | undefined;
  readonly ledger?: LedgerState | undefined;
  readonly quarantines?: readonly QuarantineText[] | undefined;
  readonly issues?: readonly OwnerIssue[] | undefined;
  readonly usage?: UsageStats | undefined;
  /** Why an absent input is absent, shown in its rows; the default names the weekly report. */
  readonly absent?: string | undefined;
};

const weeklyOnly = 'in the weekly `ci-queue-health` report';

/** One D9 row: its targets, its source, the input it needs and its value from that input. */
type RowSpec = Omit<MetricRow, 'value'> & {
  /** The input named when it is absent. */
  readonly input: string;
  /** The value, or `undefined` when its input is absent. */
  readonly value: (inputs: MetricInputs) => string | undefined;
};

const breakdownOf = (inputs: MetricInputs): (OriginBreakdown & { readonly ledger: boolean }) | undefined =>
  inputs.queue
    ? {
        ...originBreakdown(inputs.queue.evidence, inputs.ledger ? flakeFailureRuns(inputs.ledger) : undefined),
        ledger: inputs.ledger !== undefined,
      }
    : undefined;

const landingOf = (inputs: MetricInputs): LandingStats | undefined =>
  inputs.landings ? landingStats(inputs.landings.landings, inputs.landings.queueRuns, inputs.window) : undefined;

const releaseOf = (inputs: MetricInputs): ReleaseStats | undefined =>
  inputs.issues ? releaseStats(inputs.issues, inputs.today) : undefined;

const noRelease = `no release in the last ${returnWindowDays} days`;

const rowSpecs: readonly RowSpec[] = [
  {
    metric: 'Origin failure rate, `ui`-affected entries',
    phase2: '≤ 9.5 %',
    phase3: '≤ 8 %',
    source: '`ci-queue-health`',
    input: 'merge-group jobs',
    value: (inputs) => {
      const breakdown = breakdownOf(inputs);
      return breakdown
        ? `${percent(ratio(breakdown.origin, breakdown.runs))} (${breakdown.origin} of ${breakdown.runs} runs)`
        : undefined;
    },
  },
  {
    metric: 'of which flake / infrastructure / deterministic / unattributed (points)',
    phase2: '≤ 1.0 / ≤ 1.0 / — / ≤ 0.5',
    phase3: '≤ 0.5 / ≤ 1.0 / — / 0',
    source: 'Outcome records and classes',
    input: 'merge-group jobs',
    value: (inputs) => {
      const breakdown = breakdownOf(inputs);
      if (!breakdown) {
        return undefined;
      }
      const points = (count: number): string => fixed(ratio(count * 100, breakdown.runs));
      const { flake, infrastructure, deterministic, unattributed } = breakdown;
      return (
        `${breakdown.ledger ? points(flake) : 'no ledger'} / ${points(infrastructure)} / ${points(deterministic)} / ` +
        `${points(unattributed)} (runs ${flake} / ${infrastructure} / ${deterministic} / ${unattributed})`
      );
    },
  },
  {
    metric: 'Share of queue minutes that merge nothing',
    phase2: '≤ 20 %',
    phase3: '≤ 15 %',
    source: '`ci-queue-health`',
    input: 'merge-group jobs',
    value: (inputs) => (inputs.queue ? percent(inputs.queue.mergedNothingShare) : undefined),
  },
  {
    metric: 'First enqueue → merge, p50 / p90',
    phase2: 'p90 ≤ 45 min',
    phase3: 'p90 ≤ 40 min',
    source: '`merged-prs` method',
    input: 'merged pull requests',
    value: (inputs) => {
      const landing = landingOf(inputs);
      return landing
        ? `${fixed(landing.p50Minutes)} / ${fixed(landing.p90Minutes)} min (${landing.queued} pull requests through the queue)`
        : undefined;
    },
  },
  {
    metric: 'Runs per landing',
    phase2: '≤ 1.25',
    phase3: '≤ 1.2',
    source: '`merged-prs` method',
    input: 'merged pull requests',
    value: (inputs) => {
      const landing = landingOf(inputs);
      return landing ? fixed(landing.runsPerLanding, 2) : undefined;
    },
  },
  {
    metric: 'Retried passes per 1,000 test executions; runs with at least one',
    phase2: 'Measured; falling week on week',
    phase3: '—',
    source: 'Outcome records',
    input: 'ledger state',
    value: (inputs) => {
      if (!inputs.ledger) {
        return undefined;
      }
      const retry = retryStats(inputs.ledger, inputs.window);
      const before = retryStats(inputs.ledger, previousWeek(inputs.window));
      return (
        `${fixed(retry.perThousand, 2)} (${retry.retriedPasses} in ${retry.executions} executions; the week before ` +
        `${fixed(before.perThousand, 2)}); ${retry.runsWithRetry} of ${retry.runs} runs`
      );
    },
  },
  {
    metric: 'Quarantine debt: entries, test-days, oldest',
    phase2: '≤ 20, none over 14 days',
    phase3: '≤ 10 at the median',
    source: '`quarantine.json` files',
    input: '`quarantine.json` files',
    value: (inputs) => {
      if (!inputs.quarantines) {
        return undefined;
      }
      const debt = debtStats(inputs.quarantines, inputs.today);
      const over = debt.overFourteen > 0 ? `, ${debt.overFourteen} over 14 days` : '';
      const fullest = debt.fullest
        ? `; fullest \`${debt.fullest.path}\` ${debt.fullest.entries} of ${quarantineBounds.projectEntries}`
        : '';
      return `${debt.entries} of ${quarantineBounds.workspaceEntries}, ${debt.testDays} test-days, oldest ${debt.oldestDays} days${over}${fullest}`;
    },
  },
  {
    metric: 'Time from second flake event to quarantined',
    phase2: '≤ 2 hours',
    phase3: '—',
    source: 'Ledger',
    input: 'ledger state',
    value: (inputs) => {
      if (!inputs.ledger) {
        return undefined;
      }
      const hours = hoursToQuarantine(inputs.ledger, inputs.window);
      return hours.length === 0
        ? 'no entry reached `main` in the window'
        : `p50 ${fixed(quantile(hours, 0.5))} h, longest ${fixed(Math.max(...hours))} h (${hours.length} entries)`;
    },
  },
  {
    metric: 'Time from quarantine to release (MTTR), p50',
    phase2: '—',
    phase3: '≤ 7 days',
    source: 'Ledger',
    input: 'owner issues',
    value: (inputs) => {
      const release = releaseOf(inputs);
      if (!release) {
        return undefined;
      }
      return release.releases === 0
        ? noRelease
        : `${fixed(release.mttrDays)} days (${release.releases} releases in the last ${returnWindowDays} days)`;
    },
  },
  {
    metric: 'Share released without a human',
    phase2: '—',
    phase3: '≥ 50 %',
    source: 'Issues',
    input: 'owner issues',
    value: (inputs) => {
      const release = releaseOf(inputs);
      if (!release) {
        return undefined;
      }
      const exits = release.releases + release.expiries;
      return exits === 0
        ? `no release or expiry in the last ${returnWindowDays} days`
        : `${percent(ratio(release.withoutHuman, exits))} (${release.withoutHuman} of ${release.releases} releases and ${release.expiries} expiries)`;
    },
  },
  {
    metric: 'Returns within 30 days of release',
    phase2: '—',
    phase3: '≤ 10 %',
    source: 'Ledger',
    input: 'owner issues',
    value: (inputs) => {
      const release = releaseOf(inputs);
      if (!release) {
        return undefined;
      }
      return release.releases === 0
        ? noRelease
        : `${percent(ratio(release.returned, release.releases))} (${release.returned} of ${release.releases})`;
    },
  },
  {
    metric: 'Stress and agent runner-minutes per week',
    phase2: '—',
    phase3: '≤ 3,000',
    source: 'Workflow usage',
    input: 'workflow usage',
    value: ({ usage, window }) => {
      if (!usage) {
        return undefined;
      }
      const perWeek = usage.runnerMinutes * ratio(7 * dayMilliseconds, Date.parse(window.to) - Date.parse(window.from));
      return `${fixed(perWeek, 0)} (${usage.runs} run${usage.runs === 1 ? '' : 's'})`;
    },
  },
];

/** The D9 table: every row, with its value from live data or the reason it has none. */
export const metricRows = (inputs: MetricInputs): MetricRow[] =>
  rowSpecs.map(({ input, value, ...row }) => ({
    ...row,
    value: value(inputs) ?? `not measured here: ${inputs.absent ?? weeklyOnly} (${input})`,
  }));

const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The D9 table as a Markdown section. */
export const renderMetricsMarkdown = (rows: readonly MetricRow[], window: Window): string =>
  [
    '## Flake quarantine metrics (D9)',
    '',
    `${window.from.slice(0, 16)}Z to ${window.to.slice(0, 16)}Z. Releases, expiries and returns are the last ${returnWindowDays} days'; runner minutes are scaled to a week.`,
    '',
    '| Metric | This window | Target after phase 2 | After phase 3 | Source |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${cell(row.metric)} | ${cell(row.value)} | ${cell(row.phase2)} | ${cell(row.phase3)} | ${cell(row.source)} |`,
    ),
    '',
  ].join('\n');
