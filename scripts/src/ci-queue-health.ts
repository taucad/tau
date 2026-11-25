/**
 * Merge-queue health: the pure half of the weekly queue-health report (`ci-queue-health-cli.ts` does the IO).
 *
 * Blueprint defect X7 (Brain `research/ci-decomposition-blueprint.md`, Part 5a, DC-21): queue rebuilds multiply
 * the demand that causes every runner wait. Each week the report counts the `merge_group` runs of `ci.yml` by
 * conclusion and by class (success, origin failure, inherited failure, victim), attributes every origin failure to
 * the job (lane) that failed first and to the suites that job's annotations name, sums every attempt's runner
 * minutes per class, and measures how much of each job's and each run's wall time was spent waiting for a runner.
 * The wait method is the one Part 5a used by hand (`research/artifacts/ci-decomposition-blueprint/chain-audit/`), so
 * the numbers are comparable with F10 and F11; the classes are the global review's (2026-11-24, G1, ruling 9).
 *
 * Since the merge queue's `Fail fast` jobs landed (2026-11-17) a failed queue run concludes `cancelled`, so a run
 * is classed by its jobs, not its conclusion: a **failed** run has a job other than the required gate and the
 * `Fail fast` jobs that failed in its first attempt. It is an **origin** failure when the group it was built on
 * (the base SHA in its `gh-readonly-queue/<branch>/pr-<n>-<sha>` branch) is the branch itself or a run that did not
 * fail, and **inherited** when that base is the head of a failed run. A **victim** is cancelled with no failed job.
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
  /** `gh-readonly-queue/main/pr-<n>-<base sha>` for a merge group, the branch for a push (flake ledger). */
  readonly head_branch?: string | undefined;
  /** `merge_group`, `push`, ... (flake ledger). */
  readonly event?: string | undefined;
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
  /** The run attempt the job ran in (`filter=all` lists every attempt); absent means the first. */
  readonly run_attempt?: number | undefined;
};

/** A check-run annotation (`GET /repos/{repo}/check-runs/{job id}/annotations`). */
export type Annotation = {
  readonly path: string;
  readonly annotation_level: string;
  readonly title: string | undefined;
  readonly message: string;
};

/**
 * One run with whatever the CLI fetched for it: the jobs of every attempt when the request budget allowed,
 * annotations for a failure.
 */
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
  /** The job that failed first in each origin failure. */
  readonly lane: string;
  readonly runs: number;
  readonly suites: readonly LaneSuite[];
  /** Up to five origin failures, newest first, for the owner to open. */
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
  /** Every cancelled run, whatever cancelled it: `Fail fast` after a failure, a rebuild, or the sweep after a merge. */
  readonly runs: number;
  /** Job executions those runs dispatched (not skipped), over every attempt. */
  readonly jobs: number;
  /** Runner minutes those jobs used before they were cancelled or finished, over every attempt. */
  readonly runnerMinutes: number;
  /** Of those, the victims whose commit landed: the sweep cancelled the rest of a group that merged (F14). */
  readonly landed: { readonly runs: number; readonly runnerMinutes: number };
  /** Victims whose landing was not checked (no `head_sha`, budget or API refusal). */
  readonly unchecked: number;
};

/**
 * One job-level infrastructure retry event: an `infra-retry` annotation that `.github/actions/apt-install/infra-retry.sh`
 * (and `apt-install.sh`) write for each retried attempt of a setup step and for a step that ran out of attempts.
 */
export type InfraRetryEvent = {
  /** The setup step: `apt-install`, `playwright-install`, `pandoc-download`, `pnpm-download`, `pnpm-install`. */
  readonly step: string;
  /** The stable failure signature, e.g. `connection-failed`, `dpkg-interrupted`, `timeout`, `exit-100`. */
  readonly signature: string;
  /** True when the step failed every attempt (an error annotation), false for a retried attempt (a warning). */
  readonly exhausted: boolean;
};

export type InfraRetryCount = {
  readonly step: string;
  readonly signature: string;
  /** Retried attempts. */
  readonly retries: number;
  /** Steps that failed every attempt. */
  readonly exhausted: number;
};

/** What a run was, from its jobs (see the module comment). */
export type RunClass = 'success' | 'origin' | 'inherited' | 'victim' | 'other' | 'unfetched';

export type ClassCount = {
  readonly runs: number;
  readonly runnerMinutes: number;
};

export type RunClasses = Readonly<Record<RunClass, ClassCount>> & {
  /** Runner minutes of every finished run, over every attempt. */
  readonly runnerMinutes: number;
  /** Minutes of origin, inherited and victim runs (runs that merged nothing) over all minutes, 0 to 1. */
  readonly mergedNothingShare: number;
};

export type QueueHealthReport = {
  readonly repository: string;
  readonly workflow: string;
  readonly event: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly generatedAt: string;
  readonly runs: ConclusionCounts;
  /** Finished runs by class, with every attempt's runner minutes. */
  readonly classes: RunClasses;
  readonly failures: {
    /** Origin failures by the lane that failed first; inherited failures repeat their base's and are left out. */
    readonly lanes: readonly LaneFailures[];
    /** Origin failures with no failed job (a workflow-level failure) or whose jobs were not fetched. */
    readonly unattributed: number;
  };
  readonly jobs: readonly JobWait[];
  readonly runWait: RunWait;
  readonly cancelled: CancelledWaste;
  /**
   * Infrastructure step retries by step and signature, from the annotations the CLI fetched (the first failed job of
   * each failed run), so retries in jobs that passed are not counted here.
   */
  readonly infraRetries: readonly InfraRetryCount[];
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

/** The required gate (`affected` in `ci.yml`): it fails because a lane failed, so it never fails on its own. */
export const requiredGateJob = 'Run affected tasks';
/** The merge queue's `Fail fast (<lane>)` jobs cancel their run after a lane failed; they are not the failure. */
const failFastPrefix = 'Fail fast';

const attemptOf = (job: WorkflowJob): number => job.run_attempt ?? 1;

/** The jobs of a run's first attempt: the queue's verdict on the group, before anyone re-ran it. */
export const firstAttempt = (jobs: readonly WorkflowJob[]): WorkflowJob[] => {
  const first = Math.min(...jobs.map((job) => attemptOf(job)));
  return jobs.filter((job) => attemptOf(job) === first);
};

/** The jobs of a run's latest attempt (what `filter=latest` lists): the waits a finished run ended with. */
export const latestAttempt = (jobs: readonly WorkflowJob[]): WorkflowJob[] => {
  const latest = Math.max(...jobs.map((job) => attemptOf(job)));
  return jobs.filter((job) => attemptOf(job) === latest);
};

/** Jobs of the first attempt that failed on their own: not the required gate and not a `Fail fast` job. */
export const failedJobs = (jobs: readonly WorkflowJob[]): WorkflowJob[] =>
  firstAttempt(jobs).filter(
    (job) =>
      Boolean(job.conclusion && failedConclusions.has(job.conclusion)) &&
      job.name !== requiredGateJob &&
      !job.name.startsWith(failFastPrefix),
  );

/** The job that failed first: the earliest-completed of {@link failedJobs}, a completion tie broken by name. */
export const firstFailedJob = (jobs: readonly WorkflowJob[]): WorkflowJob | undefined =>
  failedJobs(jobs)
    .filter((job) => Boolean(job.completed_at))
    .sort(
      (a, b) => Date.parse(a.completed_at ?? '') - Date.parse(b.completed_at ?? '') || a.name.localeCompare(b.name),
    )[0];

/**
 * Whether a finished run failed: a failed job, whatever the run concluded. Without its jobs, or with none failed,
 * a `failure` or `timed_out` conclusion still counts (a workflow-level failure); a cancelled run without jobs is
 * undefined, because only its jobs tell a failure from a victim.
 */
export const runFailed = (entry: RunEvidence): boolean | undefined => {
  if (entry.jobs && failedJobs(entry.jobs).length > 0) {
    return true;
  }
  if (entry.run.conclusion && failedConclusions.has(entry.run.conclusion)) {
    return true;
  }
  return entry.jobs === undefined && entry.run.conclusion === 'cancelled' ? undefined : false;
};

const queueBranch = /^gh-readonly-queue\/[^/]+\/pr-\d+-([0-9a-f]{40})$/u;

/** The commit a merge group was built on, from its `gh-readonly-queue/<branch>/pr-<n>-<sha>` branch. */
export const queueBase = (run: WorkflowRun): string | undefined => queueBranch.exec(run.head_branch ?? '')?.[1];

/** Every finished run's class, by run id. Unfinished runs have none. */
export const classifyRuns = (evidence: readonly RunEvidence[]): Map<number, RunClass> => {
  const failedAt = new Map<string, boolean>();
  for (const entry of evidence) {
    if (entry.run.head_sha && entry.run.status === 'completed') {
      failedAt.set(entry.run.head_sha, runFailed(entry) === true);
    }
  }
  const classes = new Map<number, RunClass>();
  for (const entry of evidence) {
    const { run } = entry;
    if (run.status !== 'completed') {
      continue;
    }
    const failed = runFailed(entry);
    if (failed === undefined) {
      classes.set(run.id, 'unfetched');
    } else if (failed) {
      const base = queueBase(run);
      classes.set(run.id, base && failedAt.get(base) === true ? 'inherited' : 'origin');
    } else if (run.conclusion === 'success') {
      classes.set(run.id, 'success');
    } else {
      classes.set(run.id, run.conclusion === 'cancelled' ? 'victim' : 'other');
    }
  }
  return classes;
};

const infraRetryTitle = 'infra-retry';
const infraRetryWarning = /^(\S+) attempt \d+ of \d+ failed: (\S+); retrying in \d+s$/u;
const infraRetryError = /^(\S+) failed after \d+ attempts: (\S+)$/u;

/** The `infra-retry` events among a job's annotations; any other annotation, or a message of another shape, is skipped. */
export const infraRetryEvents = (annotations: readonly Annotation[]): InfraRetryEvent[] =>
  annotations.flatMap((annotation) => {
    if (annotation.title !== infraRetryTitle) {
      return [];
    }
    const exhausted = annotation.annotation_level === 'failure';
    const match = (exhausted ? infraRetryError : infraRetryWarning).exec(annotation.message.trim());
    return match?.[1] && match[2] ? [{ step: match[1], signature: match[2], exhausted }] : [];
  });

/** Infrastructure retry events counted by step and signature, most frequent first. */
export const countInfraRetries = (evidence: readonly RunEvidence[]): InfraRetryCount[] => {
  const counts = new Map<string, { step: string; signature: string; retries: number; exhausted: number }>();
  for (const { annotations } of evidence) {
    for (const event of infraRetryEvents(annotations ?? [])) {
      const key = `${event.step}\u0000${event.signature}`;
      const entry = counts.get(key) ?? { step: event.step, signature: event.signature, retries: 0, exhausted: 0 };
      if (event.exhausted) {
        entry.exhausted += 1;
      } else {
        entry.retries += 1;
      }
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.retries + b.exhausted - (a.retries + a.exhausted) ||
      a.step.localeCompare(b.step) ||
      a.signature.localeCompare(b.signature),
  );
};

/**
 * The suites a failed job names. A setup step that failed every attempt (an `infra-retry` error) names the job's
 * failure as infrastructure, `infrastructure: <step> (<signature>)`, before anything else. A failure-level annotation on a file (lint and typecheck problem matchers write
 * them) names the file and its rule. GitHub's own `Process completed with exit code 1.` sits on the `.github` path
 * and names nothing, so without a file annotation the failed step stands in for the suite.
 */
export const failedSuites = (job: WorkflowJob, annotations: readonly Annotation[]): string[] => {
  const infrastructure = infraRetryEvents(annotations)
    .filter((event) => event.exhausted)
    .map((event) => `infrastructure: ${event.step} (${event.signature})`);
  if (infrastructure.length > 0) {
    return [...new Set(infrastructure)];
  }
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

/** Attribute every origin failure to the job that failed first, and that job to the suites it names. */
export const attributeFailures = (
  evidence: readonly RunEvidence[],
  classes: ReadonlyMap<number, RunClass> = classifyRuns(evidence),
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
    if (classes.get(run.id) !== 'origin') {
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

/**
 * The job executions of every attempt that took a runner. A re-run attempt lists the jobs it did not re-run again,
 * with their first execution's times; one name with the same start and completion is one execution.
 */
const executions = (jobs: readonly WorkflowJob[]): TimedJob[] => [
  ...new Map(ranJobs(jobs).map((job) => [`${job.name}\u0000${job.started_at}\u0000${job.completed_at}`, job])).values(),
];

/** Runner seconds of every attempt of a run. */
const runnerSeconds = (jobs: readonly WorkflowJob[]): number =>
  executions(jobs).reduce((total, job) => total + secondsBetween(job.started_at, job.completed_at), 0);

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
    for (const job of ranJobs(latestAttempt(jobs))) {
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
    const path = criticalPath(run, latestAttempt(jobs));
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
 * What the cancelled runs had spent, over every attempt: dispatched jobs and their runner minutes. Every cancelled
 * run counts, including the failed runs `Fail fast` cancelled. The victims whose commit landed are named apart:
 * the merge-queue sweep cancels the rest of a group's run once it merged (CI audit 2026-11-12, F14), so their
 * minutes bought a merge.
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
    const used = runnerSeconds(entry.jobs ?? []);
    runs += 1;
    jobs += executions(entry.jobs ?? []).length;
    seconds += used;
    if (runFailed(entry) === true) {
      continue;
    }
    if (entry.landed === true) {
      landedRuns += 1;
      landedSeconds += used;
    } else if (entry.landed === undefined) {
      unchecked += 1;
    }
  }
  return {
    runs,
    jobs,
    runnerMinutes: runnerMinutes(seconds),
    landed: { runs: landedRuns, runnerMinutes: runnerMinutes(landedSeconds) },
    unchecked,
  };
};

/** Finished runs by class, with every attempt's runner minutes. */
export const classTotals = (
  evidence: readonly RunEvidence[],
  classes: ReadonlyMap<number, RunClass> = classifyRuns(evidence),
): RunClasses => {
  const seconds: Record<RunClass, { runs: number; seconds: number }> = {
    success: { runs: 0, seconds: 0 },
    origin: { runs: 0, seconds: 0 },
    inherited: { runs: 0, seconds: 0 },
    victim: { runs: 0, seconds: 0 },
    other: { runs: 0, seconds: 0 },
    unfetched: { runs: 0, seconds: 0 },
  };
  for (const entry of evidence) {
    const runClass = classes.get(entry.run.id);
    if (runClass) {
      seconds[runClass].runs += 1;
      seconds[runClass].seconds += runnerSeconds(entry.jobs ?? []);
    }
  }
  const count = (runClass: RunClass): ClassCount => ({
    runs: seconds[runClass].runs,
    runnerMinutes: runnerMinutes(seconds[runClass].seconds),
  });
  const all = Object.values(seconds).reduce((total, entry) => total + entry.seconds, 0);
  const wasted = seconds.origin.seconds + seconds.inherited.seconds + seconds.victim.seconds;
  return {
    success: count('success'),
    origin: count('origin'),
    inherited: count('inherited'),
    victim: count('victim'),
    other: count('other'),
    unfetched: count('unfetched'),
    runnerMinutes: runnerMinutes(all),
    mergedNothingShare: ratio(wasted, all),
  };
};

/**
 * The order in which the CLI fetches jobs while the request budget lasts: failed and cancelled runs first (a failed
 * queue run concludes `cancelled`; they carry the classes, the attribution and the waste), then successes (they
 * carry the waits), then the rest; newest first within each.
 */
export const fetchOrder = (runs: readonly WorkflowRun[]): WorkflowRun[] => {
  const rank = (run: WorkflowRun): number => {
    if (run.conclusion === 'success') {
      return 1;
    }
    return run.conclusion && (failedConclusions.has(run.conclusion) || run.conclusion === 'cancelled') ? 0 : 2;
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
  const classes = classifyRuns(input.evidence);
  return {
    repository: input.repository,
    workflow: input.workflow,
    event: input.event,
    window: input.window,
    generatedAt: input.generatedAt,
    runs: counts,
    classes: classTotals(input.evidence, classes),
    failures: attributeFailures(input.evidence, classes),
    jobs: jobWaits(input.evidence),
    runWait: runWaits(input.evidence),
    cancelled: cancelledWaste(input.evidence),
    infraRetries: countInfraRetries(input.evidence),
    coverage: {
      runsWithJobs: input.evidence.filter((entry) => entry.jobs && entry.run.status === 'completed').length,
      finishedRuns: counts.total - counts.unfinished,
    },
  };
};

const percent = (value: number): string => `${Math.round(value * 100)} %`;

/** Pipes and newlines would break a Markdown table cell. */
const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The report as Markdown, for `$GITHUB_STEP_SUMMARY`: counts, classes, the per-lane failure table for owners, waits. */
export const renderMarkdown = (report: QueueHealthReport): string => {
  const { runs, classes } = report;
  const classRow = (label: string, entry: ClassCount): string =>
    `| ${label} | ${entry.runs} | ${entry.runnerMinutes} | ${percent(ratio(entry.runnerMinutes, classes.runnerMinutes))} |`;
  const lines = [
    `## Merge-queue health: \`${report.workflow}\` ${report.event} runs`,
    '',
    `${report.window.from.slice(0, 16)}Z to ${report.window.to.slice(0, 16)}Z, ${report.repository}.`,
    '',
    '| Runs | Success | Failure | Cancelled | Other | Unfinished | Cancelled share |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${runs.total} | ${runs.success} | ${runs.failure} | ${runs.cancelled} | ${runs.other} | ${runs.unfinished} | ${percent(runs.cancelledShare)} |`,
    '',
    'A failed run has a failed job other than the gate and `Fail fast`, whatever it concluded. An origin failure was built on a base that had not failed, an inherited one on a failed run; a victim was cancelled with no failed job. Runner minutes count every attempt.',
    '',
    '| Class | Runs | Runner minutes | Share of minutes |',
    '| --- | ---: | ---: | ---: |',
    classRow('Success', classes.success),
    classRow('Origin failure', classes.origin),
    classRow('Inherited failure', classes.inherited),
    classRow('Victim', classes.victim),
    ...(classes.other.runs > 0 ? [classRow('Other', classes.other)] : []),
    ...(classes.unfetched.runs > 0 ? [classRow('Cancelled, jobs not fetched', classes.unfetched)] : []),
    '',
    `Runs that merged nothing (origin, inherited, victim) used ${percent(classes.mergedNothingShare)} of ${classes.runnerMinutes} runner minutes. ` +
      `Cancelled runs: ${report.cancelled.runs}, which dispatched ${report.cancelled.jobs} jobs and used ${report.cancelled.runnerMinutes} runner minutes; ` +
      `of those, victims whose commit had landed: ${report.cancelled.landed.runs} (${report.cancelled.landed.runnerMinutes} runner minutes)` +
      `${report.cancelled.unchecked > 0 ? `, victims not checked for landing: ${report.cancelled.unchecked}` : ''}. ` +
      `Over ${report.runWait.runs} finished, non-cancelled runs the median wall was ${Math.round(report.runWait.wallMedianSeconds / 6) / 10} min ` +
      `and runner wait was ${percent(report.runWait.criticalPathWaitShareMedian)} of the critical path (p90 ${percent(report.runWait.criticalPathWaitShareP90)}).`,
  ];
  if (report.coverage.runsWithJobs < report.coverage.finishedRuns) {
    lines.push(
      '',
      `> Partial: jobs were fetched for ${report.coverage.runsWithJobs} of ${report.coverage.finishedRuns} finished runs (API request budget).`,
    );
  }
  lines.push('', '### Origin failures by the lane that failed first', '');
  if (report.failures.lanes.length === 0) {
    lines.push('No origin failures were attributed to a lane.');
  } else {
    lines.push('| Lane | Origin failures | Failing suites (runs) | Recent failures |', '| --- | ---: | --- | --- |');
    for (const lane of report.failures.lanes) {
      const suites = lane.suites.map((suite) => `${cell(suite.name)} (${suite.runs})`).join('<br>') || 'none named';
      const examples = lane.examples.map((url, index) => `[${index + 1}](${url})`).join(' ');
      lines.push(`| ${cell(lane.lane)} | ${lane.runs} | ${suites} | ${examples} |`);
    }
  }
  if (report.failures.unattributed > 0) {
    lines.push('', `${report.failures.unattributed} origin failures had no failed job to attribute.`);
  }
  lines.push('', '### Infrastructure step retries', '');
  if (report.infraRetries.length === 0) {
    lines.push('No `infra-retry` events in the failed jobs whose annotations were read.');
  } else {
    lines.push(
      'From the annotations of the first failed job of each failed run; retries in jobs that passed are not counted here.',
      '',
      '| Step | Signature | Retried attempts | Failed every attempt |',
      '| --- | --- | ---: | ---: |',
      ...report.infraRetries.map(
        (entry) => `| ${cell(entry.step)} | ${cell(entry.signature)} | ${entry.retries} | ${entry.exhausted} |`,
      ),
    );
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
