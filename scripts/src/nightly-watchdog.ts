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
  alert_uid: `tau-nightly-${now.toISOString().slice(0, 10)}`,
  title: `${problems.length} Tau nightly workflow${problems.length === 1 ? '' : 's'} need attention`,
  state: 'alerting',
  link_to_upstream_details: runUrl,
  message: problems
    .map(
      (problem) =>
        `${problem.workflow.name} (${problem.workflow.file}): ${problem.state}, ${problem.detail}${problem.url ? ` ${problem.url}` : ''}`,
    )
    .join('\n'),
});

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
  const verdicts = await Promise.all(
    workflows.map(async (workflow) => judge(workflow, await newestScheduledRun(repository, workflow.file, token), now)),
  );
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
