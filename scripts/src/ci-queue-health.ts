/**
 * Merge-queue health: the pure half of the weekly queue-health report (`ci-queue-health-cli.ts` does the IO).
 *
 * Blueprint defect X7 (Brain `research/ci-decomposition-blueprint.md`, Part 5a, DC-21): queue rebuilds multiply
 * the demand that causes every runner wait. Each week the report counts the `merge_group` runs of `ci.yml` by
 * conclusion, attributes every failed run to the job (lane) that failed first and to the suites that job's
 * annotations name, and measures how much of each job's and each run's wall time was spent waiting for a runner.
 * The method is the one Part 5a used by hand (`research/artifacts/ci-decomposition-blueprint/chain-audit/`), so
 * the numbers are comparable with F10 and F11.
 *
 * Everything here takes the GitHub REST shapes as they come from the API, so the fixtures are API JSON.
 */

/*
 * The API sends `null` for an absent value; the types say `undefined` (workspace lint rule) and every check below
 * tests truthiness, which treats both alike.
 */
/** A workflow run (`GET /repos/{repo}/actions/workflows/{file}/runs`), only the fields the report reads. */
export type WorkflowRun = {
  readonly id: number;
  /** The merge-group commit the run tested; the queue moves the base branch to it when the group lands. */
  readonly head_sha?: string;
  readonly status: string | undefined;
  readonly conclusion: string | undefined;
  readonly created_at: string;
  readonly updated_at: string;
  readonly html_url: string;
};

/** A job step, only the fields the report reads. */
export type JobStep = {
  readonly name: string;
  readonly conclusion: string | undefined;
};

/** A workflow job (`GET /repos/{repo}/actions/runs/{id}/jobs`), only the fields the report reads. */
export type WorkflowJob = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | undefined;
  readonly created_at: string;
  readonly started_at: string | undefined;
  readonly completed_at: string | undefined;
  readonly html_url?: string | undefined;
  readonly steps?: readonly JobStep[];
};

/** A check-run annotation (`GET /repos/{repo}/check-runs/{job id}/annotations`). */
export type Annotation = {
  readonly path: string;
  readonly annotation_level: string;
  readonly title: string | undefined;
  readonly message: string;
};

/** One run with whatever the CLI fetched for it: jobs when the request budget allowed, annotations for a failure. */
export type RunEvidence = {
  readonly run: WorkflowRun;
  readonly jobs?: readonly WorkflowJob[];
  readonly annotations?: readonly Annotation[];
  /**
   * For a cancelled run: whether its `head_sha` is reachable from the base branch, so the group landed and the
   * sweep cancelled the rest of its run after the merge. Absent when the CLI did not or could not check.
   */
  readonly landed?: boolean;
};

export type ConclusionCounts = {
  /** Every run created in the window, finished or not. */
  readonly total: number;
  /** Runs still queued or in progress when the report ran; left out of every share. */
  readonly unfinished: number;
  readonly success: number;
  readonly failure: number;
  readonly cancelled: number;
  /** Any other conclusion (`timed_out`, `startup_failure`, `action_required`, ...). */
  readonly other: number;
  /** Cancelled runs over finished runs, 0 to 1. */
  readonly cancelledShare: number;
};

export type LaneSuite = {
  /** A file and rule from a failure annotation, or `step: <name>` when the job annotated nothing but the exit code. */
  readonly name: string;
  readonly runs: number;
};

export type LaneFailures = {
  /** The job that failed first in each failed run. */
  readonly lane: string;
  readonly runs: number;
  readonly suites: readonly LaneSuite[];
  /** Up to five failed runs, newest first, for the owner to open. */
  readonly examples: readonly string[];
};

export type JobWait = {
  readonly job: string;
  /** Job instances that ran (not skipped) in finished, non-cancelled runs. */
  readonly instances: number;
  readonly runnerWaitMedianSeconds: number;
  readonly runnerWaitP90Seconds: number;
  /** Total runner wait over total job wall time (created to completed), 0 to 1. */
  readonly runnerWaitShare: number;
};

export type RunWait = {
  readonly runs: number;
  readonly wallMedianSeconds: number;
  /** Runner wait on each run's critical path over its wall time (F10's "runner-wait share of wall"). */
  readonly criticalPathWaitShareMedian: number;
  readonly criticalPathWaitShareP90: number;
};

export type CancelledWaste = {
  /** Cancelled runs whose commit did not land (or was not checked): rebuilt, evicted or abandoned groups. */
  readonly runs: number;
  /** Jobs those runs had already dispatched (not skipped). */
  readonly jobs: number;
  /** Runner minutes those jobs used before they were cancelled or finished. */
  readonly runnerMinutes: number;
  /** Cancelled runs whose commit landed: the work merged, so it is not rebuild waste. */
  readonly landed: { readonly runs: number; readonly runnerMinutes: number };
  /** Cancelled runs counted as waste because their landing was not checked (no `head_sha`, budget or API refusal). */
  readonly unchecked: number;
};

export type QueueHealthReport = {
  readonly repository: string;
  readonly workflow: string;
  readonly event: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly generatedAt: string;
  readonly runs: ConclusionCounts;
  readonly failures: {
    readonly lanes: readonly LaneFailures[];
    /** Failed runs with no failed job (a workflow-level failure) or whose jobs were not fetched. */
    readonly unattributed: number;
  };
  readonly jobs: readonly JobWait[];
  readonly runWait: RunWait;
  readonly cancelled: CancelledWaste;
  /** Runs whose jobs were fetched, against finished runs; below 1 when the API request budget ran out. */
  readonly coverage: {
    readonly runsWithJobs: number;
    readonly finishedRuns: number;
  };
};

const failedConclusions = new Set(['failure', 'timed_out']);

/** Whole seconds from `from` to `to`, never negative. */
export const secondsBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));

/** The value at quantile `q` (0 to 1) of `values`, nearest rank; 0 for no values. */
export const quantile = (values: readonly number[], q: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
};

const ratio = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

/** An ISO timestamp to the second, the precision the runs API's `created` filter takes. */
const isoSeconds = (milliseconds: number): string => `${new Date(milliseconds).toISOString().slice(0, 19)}Z`;

/** The report window: the `days` days that end at `now`. */
export const reportWindow = (now: Date, days: number): { from: string; to: string } => ({
  from: isoSeconds(now.getTime() - days * 24 * 60 * 60 * 1000),
  to: isoSeconds(now.getTime()),
});

/**
 * Split a window in two halves. The runs API returns at most 1,000 results per query, so the CLI splits any
 * window whose `total_count` is over that until every part fits.
 */
export const splitWindow = (window: {
  readonly from: string;
  readonly to: string;
}): [{ from: string; to: string }, { from: string; to: string }] => {
  const middle = isoSeconds((Date.parse(window.from) + Date.parse(window.to)) / 2);
  return [
    { from: window.from, to: middle },
    { from: middle, to: window.to },
  ];
};

/** Count runs by conclusion. Runs that have not finished are counted apart and left out of the cancelled share. */
export const countConclusions = (runs: readonly WorkflowRun[]): ConclusionCounts => {
  const counts = { unfinished: 0, success: 0, failure: 0, cancelled: 0, other: 0 };
  for (const run of runs) {
    const key = run.status === 'completed' ? run.conclusion : 'unfinished';
    switch (key) {
      case 'unfinished':
      case 'success':
      case 'failure':
      case 'cancelled': {
        counts[key] += 1;
        break;
      }
      default: {
        counts.other += 1;
      }
    }
  }
  return {
    total: runs.length,
    ...counts,
    cancelledShare: ratio(counts.cancelled, runs.length - counts.unfinished),
  };
};

/**
 * The job that failed first: the earliest-completed job with a failed or timed-out conclusion. The required gate
 * (`affected`) fails after the lane it depends on, so it is the culprit only when nothing else failed.
 */
export const firstFailedJob = (jobs: readonly WorkflowJob[]): WorkflowJob | undefined =>
  jobs
    .filter((job) => Boolean(job.conclusion && failedConclusions.has(job.conclusion) && job.completed_at))
    .sort(
      (a, b) => Date.parse(a.completed_at ?? '') - Date.parse(b.completed_at ?? '') || a.name.localeCompare(b.name),
    )[0];

/**
 * The suites a failed job names. A failure-level annotation on a file (lint and typecheck problem matchers write
 * them) names the file and its rule. GitHub's own `Process completed with exit code 1.` sits on the `.github` path
 * and names nothing, so without a file annotation the failed step stands in for the suite.
 */
export const failedSuites = (job: WorkflowJob, annotations: readonly Annotation[]): string[] => {
  const named = annotations
    .filter((annotation) => annotation.annotation_level === 'failure' && annotation.path !== '.github')
    .map((annotation) => (annotation.title ? `${annotation.path} (${annotation.title})` : annotation.path));
  if (named.length > 0) {
    return [...new Set(named)];
  }
  const steps = (job.steps ?? [])
    .filter((step) => Boolean(step.conclusion && failedConclusions.has(step.conclusion)))
    .map((step) => `step: ${step.name}`);
  return [...new Set(steps)];
};

/** Attribute every failed run to the job that failed first, and that job to the suites it names. */
export const attributeFailures = (
  evidence: readonly RunEvidence[],
): { lanes: LaneFailures[]; unattributed: number } => {
  const lanes = new Map<
    string,
    {
      runs: number;
      suites: Map<string, number>;
      examples: Array<[string, string]>;
    }
  >();
  let unattributed = 0;
  for (const { run, jobs, annotations } of evidence) {
    if (run.status !== 'completed' || run.conclusion !== 'failure') {
      continue;
    }
    const culprit = jobs ? firstFailedJob(jobs) : undefined;
    if (!culprit) {
      unattributed += 1;
      continue;
    }
    const lane = lanes.get(culprit.name) ?? {
      runs: 0,
      suites: new Map<string, number>(),
      examples: [],
    };
    lane.runs += 1;
    for (const suite of failedSuites(culprit, annotations ?? [])) {
      lane.suites.set(suite, (lane.suites.get(suite) ?? 0) + 1);
    }
    lane.examples.push([run.created_at, culprit.html_url ?? run.html_url]);
    lanes.set(culprit.name, lane);
  }
  const result = [...lanes.entries()]
    .map(([name, lane]) => ({
      lane: name,
      runs: lane.runs,
      suites: [...lane.suites.entries()]
        .map(([suite, runs]) => ({ name: suite, runs }))
        .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name)),
      examples: lane.examples
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 5)
        .map(([, url]) => url),
    }))
    .sort((a, b) => b.runs - a.runs || a.lane.localeCompare(b.lane));
  return { lanes: result, unattributed };
};

type TimedJob = WorkflowJob & {
  readonly started_at: string;
  readonly completed_at: string;
};

/** Jobs that took a runner: not skipped, with start and completion times. */
const ranJobs = (jobs: readonly WorkflowJob[]): TimedJob[] =>
  jobs.filter(
    (job): job is TimedJob => job.conclusion !== 'skipped' && Boolean(job.started_at) && Boolean(job.completed_at),
  );

/** A finished run that was not cancelled: its jobs' waits are whole, not cut short by the cancellation. */
const measurable = (run: WorkflowRun): boolean =>
  run.status === 'completed' && Boolean(run.conclusion) && run.conclusion !== 'cancelled';

/** Runner wait (started minus created) of every job, grouped by job name, over measurable runs. */
export const jobWaits = (evidence: readonly RunEvidence[]): JobWait[] => {
  const byName = new Map<string, { waits: number[]; wait: number; wall: number }>();
  for (const { run, jobs } of evidence) {
    if (!jobs || !measurable(run)) {
      continue;
    }
    for (const job of ranJobs(jobs)) {
      const entry = byName.get(job.name) ?? { waits: [], wait: 0, wall: 0 };
      const wait = secondsBetween(job.created_at, job.started_at);
      entry.waits.push(wait);
      entry.wait += wait;
      entry.wall += secondsBetween(job.created_at, job.completed_at);
      byName.set(job.name, entry);
    }
  }
  return [...byName.entries()]
    .map(([job, entry]) => ({
      job,
      instances: entry.waits.length,
      runnerWaitMedianSeconds: quantile(entry.waits, 0.5),
      runnerWaitP90Seconds: quantile(entry.waits, 0.9),
      runnerWaitShare: ratio(entry.wait, entry.wall),
    }))
    .sort((a, b) => b.runnerWaitShare - a.runnerWaitShare || a.job.localeCompare(b.job));
};

/** Slack between a job completing and the job it unblocks being created. */
const handoffSlackSeconds = 5;

/**
 * A run's wall time and the runner wait on its critical path, reconstructed from timestamps as Part 5a did: start
 * at the job that completed last, step to the job whose completion is closest to the current job's creation, within a
 * few seconds' slack (its dependency), and sum each step's runner wait. The wall runs from the run's creation to its last completion.
 */
export const criticalPath = (
  run: WorkflowRun,
  jobs: readonly WorkflowJob[],
): { wallSeconds: number; waitSeconds: number; jobs: string[] } | undefined => {
  const ran = ranJobs(jobs).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
  let current = ran[0];
  if (!current) {
    return undefined;
  }
  const wallSeconds = secondsBetween(run.created_at, current.completed_at);
  let waitSeconds = 0;
  const path: string[] = [];
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    waitSeconds += secondsBetween(current.created_at, current.started_at);
    const createdAt = Date.parse(current.created_at);
    const gap = (job: TimedJob): number => Math.abs(createdAt - Date.parse(job.completed_at));
    current = ran
      .filter((job) => !seen.has(job.id) && Date.parse(job.completed_at) <= createdAt + handoffSlackSeconds * 1000)
      .sort((a, b) => gap(a) - gap(b))[0];
  }
  return { wallSeconds, waitSeconds, jobs: path };
};

/** Wall time and critical-path runner-wait share over measurable runs. */
export const runWaits = (evidence: readonly RunEvidence[]): RunWait => {
  const walls: number[] = [];
  const shares: number[] = [];
  for (const { run, jobs } of evidence) {
    if (!jobs || !measurable(run)) {
      continue;
    }
    const path = criticalPath(run, jobs);
    if (path) {
      walls.push(path.wallSeconds);
      shares.push(ratio(path.waitSeconds, path.wallSeconds));
    }
  }
  return {
    runs: walls.length,
    wallMedianSeconds: quantile(walls, 0.5),
    criticalPathWaitShareMedian: quantile(shares, 0.5),
    criticalPathWaitShareP90: quantile(shares, 0.9),
  };
};

/**
 * Whether a GitHub compare of `{head_sha}...{base branch}` shows the commit on the branch: the branch is level with
 * it or ahead of it. `behind` or `diverged` means the group never landed.
 */
export const landedFromCompare = (status: string | undefined): boolean => status === 'identical' || status === 'ahead';

const runnerMinutes = (seconds: number): number => Math.round(seconds / 6) / 10;

/**
 * What the cancelled runs had already spent: dispatched jobs and their runner minutes. A cancelled run whose commit
 * landed is counted apart: the merge-queue sweep cancels the rest of a group's run once it merged (CI audit
 * 2026-11-12, F14), so its minutes bought a merge, not a rebuild. An unchecked run stays waste.
 */
export const cancelledWaste = (evidence: readonly RunEvidence[]): CancelledWaste => {
  let runs = 0;
  let jobs = 0;
  let seconds = 0;
  let landedRuns = 0;
  let landedSeconds = 0;
  let unchecked = 0;
  for (const entry of evidence) {
    if (entry.run.status !== 'completed' || entry.run.conclusion !== 'cancelled') {
      continue;
    }
    const spent = ranJobs(entry.jobs ?? []);
    const used = spent.reduce((total, job) => total + secondsBetween(job.started_at, job.completed_at), 0);
    if (entry.landed === true) {
      landedRuns += 1;
      landedSeconds += used;
      continue;
    }
    if (entry.landed === undefined) {
      unchecked += 1;
    }
    runs += 1;
    jobs += spent.length;
    seconds += used;
  }
  return {
    runs,
    jobs,
    runnerMinutes: runnerMinutes(seconds),
    landed: { runs: landedRuns, runnerMinutes: runnerMinutes(landedSeconds) },
    unchecked,
  };
};

/**
 * The order in which the CLI fetches jobs while the request budget lasts: failures first (they carry the
 * attribution), then successes (they carry the waits), then cancellations (they carry the waste); newest first
 * within each.
 */
export const fetchOrder = (runs: readonly WorkflowRun[]): WorkflowRun[] => {
  const rank = (run: WorkflowRun): number => {
    if (run.conclusion === 'failure') {
      return 0;
    }
    if (run.conclusion === 'success') {
      return 1;
    }
    return run.conclusion === 'cancelled' ? 2 : 3;
  };
  return runs
    .filter((run) => run.status === 'completed')
    .sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
};

export const buildReport = (input: {
  readonly repository: string;
  readonly workflow: string;
  readonly event: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly generatedAt: string;
  readonly evidence: readonly RunEvidence[];
}): QueueHealthReport => {
  const runs = input.evidence.map((entry) => entry.run);
  const counts = countConclusions(runs);
  return {
    repository: input.repository,
    workflow: input.workflow,
    event: input.event,
    window: input.window,
    generatedAt: input.generatedAt,
    runs: counts,
    failures: attributeFailures(input.evidence),
    jobs: jobWaits(input.evidence),
    runWait: runWaits(input.evidence),
    cancelled: cancelledWaste(input.evidence),
    coverage: {
      runsWithJobs: input.evidence.filter((entry) => entry.jobs && entry.run.status === 'completed').length,
      finishedRuns: counts.total - counts.unfinished,
    },
  };
};

const percent = (value: number): string => `${Math.round(value * 100)} %`;

/** Pipes and newlines would break a Markdown table cell. */
const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The report as Markdown, for `$GITHUB_STEP_SUMMARY`: counts, the per-lane failure table for owners, waits. */
export const renderMarkdown = (report: QueueHealthReport): string => {
  const { runs } = report;
  const lines = [
    `## Merge-queue health: \`${report.workflow}\` ${report.event} runs`,
    '',
    `${report.window.from.slice(0, 16)}Z to ${report.window.to.slice(0, 16)}Z, ${report.repository}.`,
    '',
    '| Runs | Success | Failure | Cancelled | Other | Unfinished | Cancelled share |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${runs.total} | ${runs.success} | ${runs.failure} | ${runs.cancelled} | ${runs.other} | ${runs.unfinished} | ${percent(runs.cancelledShare)} |`,
    '',
    `${report.cancelled.landed.runs} cancelled runs had landed (${report.cancelled.landed.runnerMinutes} runner minutes, not waste). ` +
      `The other ${report.cancelled.runs} had dispatched ${report.cancelled.jobs} jobs and used ${report.cancelled.runnerMinutes} runner minutes` +
      `${report.cancelled.unchecked > 0 ? ` (${report.cancelled.unchecked} not checked for landing)` : ''}. ` +
      `Over ${report.runWait.runs} finished, non-cancelled runs the median wall was ${Math.round(report.runWait.wallMedianSeconds / 6) / 10} min ` +
      `and runner wait was ${percent(report.runWait.criticalPathWaitShareMedian)} of the critical path (p90 ${percent(report.runWait.criticalPathWaitShareP90)}).`,
  ];
  if (report.coverage.runsWithJobs < report.coverage.finishedRuns) {
    lines.push(
      '',
      `> Partial: jobs were fetched for ${report.coverage.runsWithJobs} of ${report.coverage.finishedRuns} finished runs (API request budget).`,
    );
  }
  lines.push('', '### Failed runs by the lane that failed first', '');
  if (report.failures.lanes.length === 0) {
    lines.push('No failed runs were attributed to a lane.');
  } else {
    lines.push('| Lane | Failed runs | Failing suites (runs) | Recent failures |', '| --- | ---: | --- | --- |');
    for (const lane of report.failures.lanes) {
      const suites = lane.suites.map((suite) => `${cell(suite.name)} (${suite.runs})`).join('<br>') || 'none named';
      const examples = lane.examples.map((url, index) => `[${index + 1}](${url})`).join(' ');
      lines.push(`| ${cell(lane.lane)} | ${lane.runs} | ${suites} | ${examples} |`);
    }
  }
  if (report.failures.unattributed > 0) {
    lines.push('', `${report.failures.unattributed} failed runs had no failed job to attribute.`);
  }
  lines.push(
    '',
    '### Runner wait by job',
    '',
    '| Job | Instances | Median wait | p90 wait | Wait share of job wall |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.jobs.map(
      (job) =>
        `| ${cell(job.job)} | ${job.instances} | ${job.runnerWaitMedianSeconds} s | ${job.runnerWaitP90Seconds} s | ${percent(job.runnerWaitShare)} |`,
    ),
    '',
  );
  return lines.join('\n');
};
