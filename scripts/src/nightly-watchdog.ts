/**
 * Alert the operator when a scheduled (nightly or weekly) workflow on `main` was red, cancelled or did not run.
 *
 * `nightly-watchdog.yml` runs this once a day. It finds every workflow under `.github/workflows` with a `schedule`
 * trigger, so a new nightly is watched without editing this file, and reads each one's newest `schedule` run on `main`
 * (and any red one of the last 24 hours behind it, for a workflow scheduled more than once a day, such as the release
 * gate).
 * A daily cron must have a run created in the last 36 hours (GitHub starts scheduled runs up to about 7 hours late under load: on 2026-11-07 the 03:17 crons were created at 10:03), a weekly cron (day-of-week set) in the last 8 days. A run
 * that is still in progress is reported as pending, not as a failure. When anything is red, cancelled or missing it
 * sends one Grafana IRM formatted-webhook alert, so the operator gets a phone push without a GitHub issue (operator
 * decision 2026-11-08, tau-brain `research/ci-throughput-review.md`).
 *
 * It also checks the release gate (WD-1a of the CI affected-first program): every `desktop-staging@*` candidate tag
 * whose `release-desktop-staging.yml` run started in the last 36 hours must have a green "Shell gate" (the
 * `shell-conformance.yml` call that runs on the candidate commit before the tag exists, #1591). A tag with no such run,
 * or whose gate jobs are not all green, is a problem like a red nightly. WD-1c adds the second gate the same run holds:
 * each such candidate must also have a green "Packaged desktop gate" (the `desktop-packaged.yml` call that runs the
 * packaged suite on the candidate commit after the shell gate, DS-3 #1810). Each gate is reported as its own row.
 *
 * The daily drift check (`drift-check.yml`, Q-7) is watched as any scheduled workflow is (WD-1b): it waits for every
 * workflow it dispatches and fails on a red one, so its newest scheduled run being green and in the 36-hour window
 * means it ran and every dispatch it made is green.
 *
 * It also pages for the flake quarantine (FQ-9 of the CI flake quarantine blueprint; testing policy § 16.3): every
 * `quarantine.json` entry on `main` at or past its `expires` day (day 14, or 28 after the one operator renewal) is a
 * problem row, every day until the flake ledger's removal lands and the test gates again.
 *
 * And it watches the rest of the flake quarantine (FQ-11, the alerts of blueprint D9), each as its own row:
 *
 * - **The ledger job.** A `flake-ledger.yml` run of the last 24 hours that failed or timed out, whatever started it:
 *   the ingestion runs after every CI run, and its daily schedule (watched above) only catches up a quiet day.
 * - **A full debt.** The workspace's `quarantine.json` files hold the workspace cap (20) or one holds the project cap
 *   (8): the next qualifying flake is refused and keeps gating.
 * - **A never-quarantine flake.** A gating flake event of the last 24 hours, in the ledger state on the `flake-ledger`
 *   branch, of a test in the never-quarantine set (testing policy § 16.4): it keeps gating and is paged on the event.
 *
 * Usage: node scripts/src/nightly-watchdog.ts [--summary <file>] [--test-alert]
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY (`owner/name`), CI_ALERT_WEBHOOK_URL (unset: report only and exit 1 on a
 * problem, so the run itself turns red), GITHUB_SERVER_URL, GITHUB_RUN_ID (for the alert's link).
 * Exit codes: 0 every scheduled workflow is healthy or the alert was delivered; 1 a problem with no delivered alert,
 * or a delivery failure; 2 usage.
 */
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { load } from 'js-yaml';

import { neverQuarantineArea, parseQuarantine, quarantineBounds } from '@taucad/vitest-ci/quarantine';

import { client } from '#ci-github-client.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';
import { branchStore, stateBranch } from '#ci-flake-ledger-store.js';
import { readWorkspace } from '#ci-flake-quarantine-entry-cli.js';
import type { WorkspaceProject } from '#ci-flake-quarantine-entry.js';

/** A workflow file with at least one cron schedule. */
export type ScheduledWorkflow = {
  readonly file: string;
  readonly name: string;
  readonly crons: readonly string[];
};

/** The newest scheduled run of a workflow, as the Actions API reports it. */
export type ScheduledRun = {
  readonly status: string;
  readonly conclusion: string | undefined;
  readonly created_at: string;
  readonly html_url: string;
};

export type Verdict = {
  readonly workflow: ScheduledWorkflow;
  readonly state: 'ok' | 'pending' | 'failed' | 'missing';
  readonly detail: string;
  readonly url?: string;
};

const hour = 60 * 60 * 1000;

/** Conclusions that mean the scheduled work passed or had nothing to do. */
const passing = new Set(['success', 'skipped', 'neutral']);

/** A cron runs weekly or less often when its day-of-month or day-of-week field is set. */
/** Milliseconds. */
export const maxAge = (crons: readonly string[]): number => {
  const daily = crons.some((cron) => {
    const fields = cron.trim().split(/\s+/u);
    return fields[2] === '*' && fields[4] === '*';
  });
  return daily ? 36 * hour : 8 * 24 * hour;
};

/** Read every workflow file and keep those with a cron schedule. */
export const scheduledWorkflows = async (directory: string): Promise<ScheduledWorkflow[]> => {
  const entries = await readdir(directory);
  const files = entries.filter((file) => /\.ya?ml$/u.test(file)).sort();
  const parsed = await Promise.all(
    files.map(async (file) => {
      const workflow = load(await readFile(resolve(directory, file), 'utf8')) as
        | {
            readonly name?: string;
            readonly on?: { readonly schedule?: ReadonlyArray<{ readonly cron?: string }> };
          }
        | undefined;
      const crons = (workflow?.on?.schedule ?? [])
        .map((entry) => entry.cron)
        .filter((cron): cron is string => Boolean(cron));
      return { file, name: workflow?.name ?? file, crons };
    }),
  );
  const found = parsed.filter((workflow) => workflow.crons.length > 0);
  return found;
};

/** Judge one workflow from its newest scheduled run on `main`. */
export const judge = (workflow: ScheduledWorkflow, run: ScheduledRun | undefined, now: Date): Verdict => {
  const limit = maxAge(workflow.crons);
  if (!run || now.getTime() - Date.parse(run.created_at) > limit) {
    return { workflow, state: 'missing', detail: `no scheduled run in the last ${Math.round(limit / hour)} h` };
  }
  if (run.status !== 'completed') {
    return { workflow, state: 'pending', detail: run.status, url: run.html_url };
  }
  if (run.conclusion && passing.has(run.conclusion)) {
    return { workflow, state: 'ok', detail: run.conclusion, url: run.html_url };
  }
  return { workflow, state: 'failed', detail: run.conclusion ?? 'no conclusion', url: run.html_url };
};

/** How far back a red scheduled run behind a newer one is still reported: one watchdog day, so none is reported twice. */
export const recentWindow = 24 * hour;

/**
 * Judge one workflow from its scheduled runs on `main`, newest first. The newest run decides, except that a run
 * created in the last {@link recentWindow} that completed red or cancelled reports the workflow failed even when a
 * newer run passed or is still running: a workflow scheduled more than once a day (the release gate's three daily
 * runs, CI scaling review C3) cannot hide a red run behind a later green one.
 */
export const judgeRuns = (workflow: ScheduledWorkflow, runs: readonly ScheduledRun[], now: Date): Verdict => {
  const newest = judge(workflow, runs[0], now);
  if (newest.state === 'failed' || newest.state === 'missing') {
    return newest;
  }
  const red = runs
    .slice(1)
    .find(
      (run) =>
        now.getTime() - Date.parse(run.created_at) <= recentWindow &&
        run.status === 'completed' &&
        !(run.conclusion && passing.has(run.conclusion)),
    );
  if (red) {
    return {
      workflow,
      state: 'failed',
      detail: `${red.conclusion ?? 'no conclusion'} (an earlier run of the last 24 h; the newest is ${newest.detail})`,
      url: red.html_url,
    };
  }
  return newest;
};

/** A `quarantine.json` on `main`: its workspace-relative path and its text. */
export type QuarantineFile = { readonly path: string; readonly text: string };

/**
 * One problem row per quarantine entry at or past its `expires` day (testing policy § 16.3): the operator is paged on
 * day 14 (28 after a renewal), and every day after until the entry leaves `main`. An entry that is not an object with
 * a `test` and an `expires` is `validate-quarantine`'s to report.
 */
export const judgeQuarantine = (
  files: readonly QuarantineFile[],
  today: string,
  repository = 'taucad/tau',
): Verdict[] =>
  files.flatMap((file) =>
    parseQuarantine(file.text).entries.flatMap((entry): Verdict[] => {
      if (typeof entry !== 'object' || entry === null) {
        return [];
      }
      const { test, expires, issue, renewal } = entry as Record<string, unknown>;
      if (typeof test !== 'string' || typeof expires !== 'string' || expires > today) {
        return [];
      }
      const owner = typeof issue === 'number' ? ` (owner issue #${issue})` : '';
      return [
        {
          workflow: { file: file.path, name: 'Flake quarantine expiry', crons: [] },
          state: 'failed',
          detail:
            `${test.replaceAll(/\s+/gu, ' ').slice(0, 200)}${owner} ${expires === today ? 'expires today' : `expired on ${expires}`}: ` +
            `the flake ledger removes the entry and the test gates again${renewal === undefined ? '; the operator may renew it once, to 28 days' : ''}`,
          ...(typeof issue === 'number' ? { url: `https://github.com/${repository}/issues/${issue}` } : {}),
        },
      ];
    }),
  );

/** The flake ledger's workflow, under which its job's verdict is reported. */
export const ledgerWorkflow: ScheduledWorkflow = { file: 'flake-ledger.yml', name: 'Flake ledger job', crons: [] };

/** A `flake-ledger.yml` run, as the Actions API lists it. */
export type LedgerRun = ScheduledRun & { readonly event?: string | undefined };

/** Conclusions that make the ledger job red. A cancelled run is one the concurrency group replaced, not a failure. */
const redLedger = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * The ledger job's row: red when a run of the last 24 hours, started by a CI run or by hand, failed. Its scheduled
 * runs are left to the scheduled-workflow row, so a red schedule is reported once.
 */
export const judgeLedgerJob = (runs: readonly LedgerRun[], now: Date): Verdict => {
  const red = runs
    .filter(
      (run) =>
        run.event !== 'schedule' &&
        now.getTime() - Date.parse(run.created_at) <= recentWindow &&
        run.status === 'completed' &&
        redLedger.has(run.conclusion ?? ''),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [newest] = red;
  if (!newest) {
    return { workflow: ledgerWorkflow, state: 'ok', detail: 'no red ledger run in the last 24 h' };
  }
  return {
    workflow: ledgerWorkflow,
    state: 'failed',
    detail: `${red.length} red ledger run${red.length === 1 ? '' : 's'} in the last 24 h (newest ${newest.conclusion ?? 'no conclusion'}): the ledger stops counting, entering, releasing and expiring until it runs green`,
    url: newest.html_url,
  };
};

/** The name the quarantine debt is reported under. */
export const debtWorkflow: ScheduledWorkflow = { file: 'quarantine.json', name: 'Flake quarantine debt', crons: [] };

/**
 * The quarantine debt's row: failed when the workspace holds its cap of entries or one file holds a project's, so the
 * next qualifying flake is refused (testing policy § 16.3). Every entry on `main` counts, expired or not, until the
 * ledger removes it.
 */
export const judgeDebt = (files: readonly QuarantineFile[]): Verdict => {
  const counts = files
    .map((file) => ({
      path: file.path,
      entries: parseQuarantine(file.text).entries.filter((entry) => typeof entry === 'object' && entry !== null).length,
    }))
    .sort((a, b) => b.entries - a.entries || a.path.localeCompare(b.path));
  const total = counts.reduce((sum, file) => sum + file.entries, 0);
  const full = counts.filter((file) => file.entries >= quarantineBounds.projectEntries);
  const [fullest] = counts;
  const workspace = `${total} of ${quarantineBounds.workspaceEntries} entries in the workspace`;
  if (total < quarantineBounds.workspaceEntries && full.length === 0) {
    return {
      workflow: debtWorkflow,
      state: 'ok',
      detail: `${workspace}${fullest && fullest.entries > 0 ? `; fullest ${fullest.path} ${fullest.entries} of ${quarantineBounds.projectEntries}` : ''}`,
    };
  }
  return {
    workflow: debtWorkflow,
    state: 'failed',
    detail:
      `the quarantine debt is full: ${workspace}` +
      `${full.map((file) => `; ${file.path} ${file.entries} of ${quarantineBounds.projectEntries}`).join('')}` +
      ': a new qualifying flake is refused and keeps gating; the fix loop is behind',
  };
};

/** The name a never-quarantine flake is reported under. */
export const neverQuarantineWorkflow: ScheduledWorkflow = {
  file: 'flake-ledger',
  name: 'Never-quarantine flake',
  crons: [],
};

/**
 * One problem row per test in the never-quarantine set (testing policy § 16.4) with a gating flake event in the last
 * 24 hours: D8 pages the operator on the event, and the test keeps gating. Without a ledger state there is nothing to
 * read, which is a healthy row; a test whose project the checkout does not hold is left to the entry job's refusal.
 */
export const judgeNeverQuarantine = (
  state: LedgerState | undefined,
  projects: ReadonlyMap<string, WorkspaceProject>,
  now: Date,
): Verdict[] => {
  if (!state) {
    return [{ workflow: neverQuarantineWorkflow, state: 'ok', detail: 'no ledger state yet' }];
  }
  const problems = Object.entries(state.identities).flatMap(([id, identity]): Verdict[] => {
    const project = projects.get(identity.project);
    if (!project || identity.file === undefined) {
      return [];
    }
    const area = neverQuarantineArea(posix.join(project.root, identity.file), project.tags);
    const events = identity.events.filter(
      (event) => event.shadow !== true && now.getTime() - Date.parse(event.at) <= recentWindow,
    );
    if (area === undefined || events.length === 0) {
      return [];
    }
    const runs = [...new Set(events.map((event) => event.failedRun))];
    return [
      {
        workflow: neverQuarantineWorkflow,
        state: 'failed',
        detail:
          `${id.replaceAll(/\s+/gu, ' ').slice(0, 200)} (${area}): ${events.length} flake event${events.length === 1 ? '' : 's'} in the last 24 h, ` +
          `failing run${runs.length === 1 ? '' : 's'} ${runs.slice(0, 5).join(', ')}: it keeps gating; the agent owes a class within 24 hours`,
      },
    ];
  });
  return problems.length > 0
    ? problems
    : [
        {
          workflow: neverQuarantineWorkflow,
          state: 'ok',
          detail: 'no flake event of a never-quarantine test in the last 24 h',
        },
      ];
};

/** Every tracked `quarantine.json` under `root`. */
export const readQuarantineFiles = async (root: string): Promise<QuarantineFile[]> => {
  const paths = execFileSync('git', ['ls-files', '-z', '--', ':(glob)**/quarantine.json'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((path) => path !== '')
    .sort();
  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(resolve(root, path), 'utf8') })));
};

/** Grafana IRM formatted-webhook fields. */
export type AlertPayload = {
  alert_uid: string;
  readonly title: string;
  readonly state: 'alerting';
  readonly link_to_upstream_details: string;
  readonly message: string;
};

/** The Grafana IRM formatted-webhook payload for one day's problems. */
export const alertPayload = (problems: readonly Verdict[], now: Date, runUrl: string): AlertPayload => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Grafana IRM formatted-webhook field.
  alert_uid: `tau-nightly-${now.toISOString().slice(0, 10)}`,
  title: `${problems.length} Tau nightly workflow${problems.length === 1 ? '' : 's'} need attention`,
  state: 'alerting',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Grafana IRM formatted-webhook field.
  link_to_upstream_details: runUrl,
  message: problems
    .map(
      (problem) =>
        `${problem.workflow.name} (${problem.workflow.file}): ${problem.state}, ${problem.detail}${problem.url ? ` ${problem.url}` : ''}`,
    )
    .join('\n'),
});

/** A `release-desktop-staging.yml` run, as the Actions API reports it. */
export type CandidateRun = {
  readonly id: number;
  readonly run_number: number;
  readonly created_at: string;
  readonly html_url: string;
};

/** A job of a run, as the Actions API reports it. */
export type RunJob = { readonly name: string; readonly status: string; readonly conclusion: string | undefined };

/** The workflow that cuts candidates, under which candidate shell gate verdicts are reported. */
export const candidateWorkflow: ScheduledWorkflow = {
  file: 'release-desktop-staging.yml',
  name: 'Candidate shell gate',
  crons: [],
};

/** The same workflow, under which candidate packaged gate verdicts are reported (WD-1c). */
export const candidatePackagedWorkflow: ScheduledWorkflow = {
  file: 'release-desktop-staging.yml',
  name: 'Candidate packaged gate',
  crons: [],
};

/**
 * The gates every candidate run must pass, by the job-name prefix GitHub gives a reusable workflow's jobs
 * (`<caller job name> / <callee job name>`): `shell` and `packaged` in `release-desktop-staging.yml`.
 */
export const candidateGates: ReadonlyArray<{ readonly prefix: string; readonly workflow: ScheduledWorkflow }> = [
  { prefix: 'Shell gate', workflow: candidateWorkflow },
  { prefix: 'Packaged desktop gate', workflow: candidatePackagedWorkflow },
];

/** The build number a candidate tag carries: `desktop-staging@<version>-staging.<run number>`. */
export const candidateRunNumber = (tag: string): number | undefined => {
  const match = /^desktop-staging@\d+\.\d+\.\d+-staging\.(\d+)$/u.exec(tag);
  return match ? Number(match[1]) : undefined;
};

/**
 * Judge each candidate tag of the last 36 hours by its run's gate jobs: one verdict per gate in `candidateGates`.
 *
 * A tag is in the window when the run with its build number started in the last 36 hours. A tag whose build number is
 * newer than every listed run has no run at all (it was not cut by the workflow), and is judged `missing`.
 */
export const judgeCandidates = ({
  tags,
  runs,
  jobsOf,
  now,
}: {
  readonly tags: readonly string[];
  readonly runs: readonly CandidateRun[];
  readonly jobsOf: (run: CandidateRun) => readonly RunJob[];
  readonly now: Date;
}): Verdict[] => {
  const byNumber = new Map(runs.map((run) => [run.run_number, run]));
  const newest = Math.max(0, ...runs.map((run) => run.run_number));
  const verdicts: Verdict[] = [];
  for (const tag of [...tags].sort()) {
    const number = candidateRunNumber(tag);
    if (number === undefined) {
      continue;
    }
    const run = byNumber.get(number);
    if (!run) {
      if (number > newest) {
        verdicts.push({ workflow: candidateWorkflow, state: 'missing', detail: `${tag}: no release run cut it` });
      }
      continue;
    }
    if (now.getTime() - Date.parse(run.created_at) > 36 * hour) {
      continue;
    }
    const jobs = jobsOf(run);
    for (const { prefix, workflow } of candidateGates) {
      const gate = jobs.filter((job) => job.name.startsWith(prefix));
      const green =
        gate.length > 0 &&
        gate.every((job) => job.status === 'completed' && passing.has(job.conclusion ?? '')) &&
        gate.some((job) => job.conclusion === 'success');
      const label = prefix.toLowerCase();
      verdicts.push({
        workflow,
        state: green ? 'ok' : 'failed',
        detail: green
          ? `${tag}: ${gate.length} ${label} jobs green`
          : `${tag}: ${label} not green (${gate.map((job) => job.conclusion ?? job.status).join(', ') || 'no gate jobs'})`,
        url: run.html_url,
      });
    }
  }
  return verdicts;
};

const githubGet = async <T>(path: string, token: string): Promise<T> => {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`${path}: GitHub API ${response.status}`);
  }
  return (await response.json()) as T;
};

const candidateVerdicts = async (repository: string, token: string, now: Date): Promise<Verdict[]> => {
  const references = await githubGet<ReadonlyArray<{ readonly ref: string }>>(
    `repos/${repository}/git/matching-refs/tags/desktop-staging@`,
    token,
  );
  const tags = references.map((ref) => ref.ref.replace(/^refs\/tags\//u, ''));
  const { workflow_runs: runs } = await githubGet<{ readonly workflow_runs: readonly CandidateRun[] }>(
    `repos/${repository}/actions/workflows/${candidateWorkflow.file}/runs?per_page=100`,
    token,
  );
  const recent = runs.filter((run) => now.getTime() - Date.parse(run.created_at) <= 36 * hour);
  const jobs = new Map(
    await Promise.all(
      recent.map(async (run) => {
        const page = await githubGet<{ readonly jobs: readonly RunJob[] }>(
          `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`,
          token,
        );
        return [run.id, page.jobs] as const;
      }),
    ),
  );
  return judgeCandidates({ tags, runs, jobsOf: (run) => jobs.get(run.id) ?? [], now });
};

/** The newest scheduled runs of a workflow on `main`, newest first: enough to cover a day of several crons. */
const recentScheduledRuns = async (
  repository: string,
  file: string,
  token: string,
): Promise<readonly ScheduledRun[]> => {
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(file)}/runs?event=schedule&branch=main&per_page=10`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`${file}: GitHub API ${response.status}`);
  }
  const body = (await response.json()) as { readonly workflow_runs: readonly ScheduledRun[] };
  return body.workflow_runs;
};

/** The most pages of ledger runs read for one day: a run per CI run, most of them skipped pull-request runs. */
const maximumLedgerPages = 20;

/** The ledger job's completed runs of the last 24 hours, any event, every page; the judge picks the red ones. */
const recentLedgerRuns = async (repository: string, token: string, now: Date): Promise<LedgerRun[]> => {
  const since = `${new Date(now.getTime() - recentWindow).toISOString().slice(0, 19)}Z`;
  const runs: LedgerRun[] = [];
  for (let page = 1; page <= maximumLedgerPages; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until the count is reached
    const body = await githubGet<{ readonly total_count: number; readonly workflow_runs: readonly LedgerRun[] }>(
      `repos/${repository}/actions/workflows/${ledgerWorkflow.file}/runs?status=completed&created=${encodeURIComponent(`>=${since}`)}&per_page=100&page=${page}`,
      token,
    );
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length === 0 || runs.length >= body.total_count) {
      return runs;
    }
  }
  throw new Error(`more than ${maximumLedgerPages * 100} ledger runs in a day; not read in part`);
};

/**
 * The ledger job's row from its runs, or a problem row when they cannot be read: a failed read never stops the other
 * rows from being reported and delivered.
 */
export const ledgerJobVerdict = async (read: () => Promise<readonly LedgerRun[]>, now: Date): Promise<Verdict> => {
  try {
    return judgeLedgerJob(await read(), now);
  } catch (error) {
    return {
      workflow: ledgerWorkflow,
      state: 'failed',
      detail: `the ledger job's runs could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/** The never-quarantine rows from the ledger state, or one problem row when the state cannot be read. */
const neverQuarantineVerdicts = async (options: {
  readonly repository: string;
  readonly token: string;
  readonly root: string;
  readonly now: Date;
}): Promise<Verdict[]> => {
  const { repository, token, root, now } = options;
  let state: LedgerState | undefined;
  try {
    const github = client({ api: 'https://api.github.com', token, repository, maxRequests: 10 });
    state = await branchStore(github, stateBranch).read();
  } catch (error) {
    return [
      {
        workflow: neverQuarantineWorkflow,
        state: 'failed',
        detail: `the ledger state could not be read: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
  const { projects } = await readWorkspace(root);
  return judgeNeverQuarantine(state, projects, now);
};

const main = async (args: readonly string[]): Promise<number> => {
  let summary: string | undefined;
  let testAlert = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--summary' && args[index + 1]) {
      summary = args[++index];
    } else if (args[index] === '--test-alert') {
      testAlert = true;
    } else {
      return 2;
    }
  }
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository, CI_ALERT_WEBHOOK_URL: webhook } = process.env;
  if (!token || !repository) {
    return 2;
  }
  const runUrl = `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${repository}/actions/runs/${process.env['GITHUB_RUN_ID'] ?? ''}`;
  const now = new Date();

  const root = resolve(import.meta.dirname, '../..');
  const workflows = await scheduledWorkflows(resolve(root, '.github/workflows'));
  const quarantineFiles = await readQuarantineFiles(root);
  const verdicts = [
    ...(await Promise.all(
      workflows.map(async (workflow) =>
        judgeRuns(workflow, await recentScheduledRuns(repository, workflow.file, token), now),
      ),
    )),
    ...(await candidateVerdicts(repository, token, now)),
    ...judgeQuarantine(quarantineFiles, now.toISOString().slice(0, 10), repository),
    await ledgerJobVerdict(async () => recentLedgerRuns(repository, token, now), now),
    judgeDebt(quarantineFiles),
    ...(await neverQuarantineVerdicts({ repository, token, root, now })),
  ];
  const problems = verdicts.filter((verdict) => verdict.state === 'failed' || verdict.state === 'missing');

  const table = [
    '| Workflow | State | Detail |',
    '| --- | --- | --- |',
    ...verdicts.map(
      (verdict) =>
        `| ${verdict.workflow.name} (\`${verdict.workflow.file}\`) | ${verdict.state} | ${verdict.url ? `[${verdict.detail}](${verdict.url})` : verdict.detail} |`,
    ),
  ].join('\n');
  console.log(table);
  if (summary) {
    await appendFile(summary, `## Nightly watchdog\n\n${table}\n`);
  }

  const toSend: readonly Verdict[] = testAlert
    ? [
        {
          workflow: { file: 'nightly-watchdog.yml', name: 'Nightly watchdog', crons: [] },
          state: 'failed',
          detail: 'test alert, no action needed',
        },
      ]
    : problems;
  if (toSend.length === 0) {
    return 0;
  }
  if (!webhook) {
    console.error('CI_ALERT_WEBHOOK_URL is not set: nothing was delivered.');
    return 1;
  }
  const payload = alertPayload(toSend, now, runUrl);
  if (testAlert) {
    payload.alert_uid = `tau-nightly-test-${now.toISOString()}`;
  }
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error(`Alert delivery failed: HTTP ${response.status}`);
    return 1;
  }
  console.log(`Alert delivered for ${toSend.length} workflow(s).`);
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
