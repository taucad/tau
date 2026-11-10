/**
 * Alert the operator when a scheduled (nightly or weekly) workflow on `main` was red, cancelled or did not run.
 *
 * `nightly-watchdog.yml` runs this once a day. It finds every workflow under `.github/workflows` with a `schedule`
 * trigger, so a new nightly is watched without editing this file, and reads each one's newest `schedule` run on `main`.
 * A daily cron must have a run created in the last 36 hours (GitHub starts scheduled runs up to about 7 hours late under load: on 2026-11-07 the 03:17 crons were created at 10:03), a weekly cron (day-of-week set) in the last 8 days. A run
 * that is still in progress is reported as pending, not as a failure. When anything is red, cancelled or missing it
 * sends one Grafana IRM formatted-webhook alert, so the operator gets a phone push without a GitHub issue (operator
 * decision 2026-11-08, tau-brain `research/ci-throughput-review.md`).
 *
 * It also checks the release gate (WD-1a of the CI affected-first program): every `desktop-staging@*` candidate tag
 * whose `release-desktop-staging.yml` run started in the last 36 hours must have a green "Shell gate" (the
 * `shell-conformance.yml` call that runs on the candidate commit before the tag exists, #1591). A tag with no such run,
 * or whose gate jobs are not all green, is a problem like a red nightly.
 *
 * Usage: node scripts/src/nightly-watchdog.ts [--summary <file>] [--test-alert]
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY (`owner/name`), CI_ALERT_WEBHOOK_URL (unset: report only and exit 1 on a
 * problem, so the run itself turns red), GITHUB_SERVER_URL, GITHUB_RUN_ID (for the alert's link).
 * Exit codes: 0 every scheduled workflow is healthy or the alert was delivered; 1 a problem with no delivered alert,
 * or a delivery failure; 2 usage.
 */
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { load } from 'js-yaml';

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

/** The workflow that cuts candidates, under which candidate verdicts are reported. */
export const candidateWorkflow: ScheduledWorkflow = {
  file: 'release-desktop-staging.yml',
  name: 'Candidate shell gate',
  crons: [],
};

/** The build number a candidate tag carries: `desktop-staging@<version>-staging.<run number>`. */
export const candidateRunNumber = (tag: string): number | undefined => {
  const match = /^desktop-staging@\d+\.\d+\.\d+-staging\.(\d+)$/u.exec(tag);
  return match ? Number(match[1]) : undefined;
};

/**
 * Judge each candidate tag of the last 36 hours by its run's "Shell gate" jobs.
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
    const gate = jobsOf(run).filter((job) => job.name.startsWith('Shell gate'));
    const green =
      gate.length > 0 &&
      gate.every((job) => job.status === 'completed' && passing.has(job.conclusion ?? '')) &&
      gate.some((job) => job.conclusion === 'success');
    verdicts.push({
      workflow: candidateWorkflow,
      state: green ? 'ok' : 'failed',
      detail: green
        ? `${tag}: ${gate.length} gate jobs green`
        : `${tag}: shell gate not green (${gate.map((job) => job.conclusion ?? job.status).join(', ') || 'no gate jobs'})`,
      url: run.html_url,
    });
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

const newestScheduledRun = async (
  repository: string,
  file: string,
  token: string,
): Promise<ScheduledRun | undefined> => {
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(file)}/runs?event=schedule&branch=main&per_page=1`;
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
  return body.workflow_runs[0];
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

  const workflows = await scheduledWorkflows(resolve(import.meta.dirname, '../../.github/workflows'));
  const verdicts = [
    ...(await Promise.all(
      workflows.map(async (workflow) =>
        judge(workflow, await newestScheduledRun(repository, workflow.file, token), now),
      ),
    )),
    ...(await candidateVerdicts(repository, token, now)),
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
