/**
 * The D9 metrics table (FQ-11 of the CI flake quarantine blueprint, Brain `research/ci-flake-quarantine-blueprint.md`,
 * D9): the IO half of `ci-flake-metrics.ts`, and the readers the weekly report (`ci-queue-health-cli.ts`) shares.
 *
 * `flake-ledger.yml` runs it after every ingestion, so the ledger job writes the D9 table to its summary on every
 * run. It reads the ledger state from the `flake-ledger` branch, the `quarantine.json` files of the checkout and the
 * owner issues the release automation marks (`flake:released`, `flake:needs-operator`) with their automation
 * comments. The rows that need every merge-group run's jobs, the merged pull requests' queue events or the stress
 * workflows' jobs (thousands of requests) are left to the weekly report, which shows every row.
 *
 * Usage: node scripts/src/ci-flake-metrics-cli.ts [--days 7] [--state-branch flake-ledger] [--root .]
 *          [--today YYYY-MM-DD] [--summary <file>] [--max-requests 300]
 * Env: GITHUB_TOKEN (`contents: read`, `issues: read`), GITHUB_REPOSITORY (default taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 written; 1 API failure; 2 usage.
 */
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { utcDay } from '@taucad/vitest-ci/quarantine';

import { client, listRuns } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { branchStore, stateBranch } from '#ci-flake-ledger-store.js';
import { metricRows, renderMetricsMarkdown, stressWorkflows } from '#ci-flake-metrics.js';
import type { Landing, OwnerIssue, UsageStats, Window } from '#ci-flake-metrics.js';
import { automationComments, readPages, readWorkspace } from '#ci-flake-quarantine-entry-cli.js';
import { operatorLabel, releasedLabel, returnWindowDays } from '#ci-flake-quarantine-release.js';
import { reportWindow, runnerMinutesOf } from '#ci-queue-health.js';
import type { WorkflowJob } from '#ci-queue-health.js';

const dayMilliseconds = 24 * 60 * 60 * 1000;

type ListedIssue = {
  readonly number: number;
  readonly labels?: ReadonlyArray<{ readonly name?: string } | string>;
  readonly pull_request?: unknown;
};

/**
 * The owner issues a release or an expiry touched in the last 30 days (labels `flake:released` and
 * `flake:needs-operator`), each with its labels and the comments the automation wrote: the markers are read only from
 * those, so a person's comment cannot pose as a record.
 */
export const readOwnerIssues = async (github: Client, today: string): Promise<OwnerIssue[]> => {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - returnWindowDays * dayMilliseconds).toISOString();
  const repo = `/repos/${github.repository}`;
  const listed = new Map<number, ListedIssue>();
  for (const label of [releasedLabel, operatorLabel]) {
    // oxlint-disable-next-line no-await-in-loop -- two labels, read in order
    const issues = await readPages<ListedIssue>(
      github,
      `${repo}/issues?state=all&labels=${encodeURIComponent(label)}&since=${since}`,
    );
    for (const issue of issues.filter((entry) => entry.pull_request === undefined)) {
      listed.set(issue.number, issue);
    }
  }
  const owners: OwnerIssue[] = [];
  for (const issue of [...listed.values()].sort((a, b) => a.number - b.number)) {
    owners.push({
      number: issue.number,
      labels: (issue.labels ?? []).flatMap((label) => {
        const name = typeof label === 'string' ? label : label.name;
        return name === undefined ? [] : [name];
      }),
      // oxlint-disable-next-line no-await-in-loop -- one issue's comments at a time
      comments: await automationComments(github, issue.number),
    });
  }
  return owners;
};

type ClosedPull = {
  readonly number: number;
  readonly merged_at?: string | undefined;
  readonly updated_at: string;
};

type IssueEvent = {
  readonly event: string;
  readonly created_at: string;
};

/** The most pages of closed pull requests read, newest updated first: a week holds about four. */
const maximumPullPages = 20;

/**
 * The pull requests merged into `base` in the window and their first `added_to_merge_queue` event (the re-measure's
 * `merged-prs` method). Closed pull requests are read newest updated first, until one was last updated before the
 * window: a pull request merged in it was updated then or later.
 */
export const readLandings = async (github: Client, window: Window, base = 'main'): Promise<Landing[]> => {
  const repo = `/repos/${github.repository}`;
  const merged: ClosedPull[] = [];
  for (let page = 1; page <= maximumPullPages; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until one predates the window
    const pulls = await github.get<ClosedPull[]>(
      `${repo}/pulls?state=closed&base=${encodeURIComponent(base)}&sort=updated&direction=desc&per_page=100&page=${page}`,
    );
    merged.push(
      ...pulls.filter((pull) => pull.merged_at && pull.merged_at >= window.from && pull.merged_at <= window.to),
    );
    if (pulls.length < 100 || pulls.some((pull) => pull.updated_at < window.from)) {
      break;
    }
  }
  const landings: Landing[] = [];
  for (const pull of merged) {
    // oxlint-disable-next-line no-await-in-loop -- one pull request's events at a time
    const events = await readPages<IssueEvent>(github, `${repo}/issues/${pull.number}/events`);
    const enqueued = events
      .filter((event) => event.event === 'added_to_merge_queue')
      .map((event) => event.created_at)
      .sort()[0];
    landings.push({
      number: pull.number,
      mergedAt: pull.merged_at ?? '',
      firstEnqueuedAt: enqueued,
    });
  }
  return landings;
};

/** Every job of every attempt of a run, page by page until the count is reached. */
const readJobs = async (github: Client, runId: number): Promise<WorkflowJob[]> => {
  const jobs: WorkflowJob[] = [];
  for (let page = 1; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until the count is reached
    const body = await github.get<{ total_count: number; jobs: WorkflowJob[] }>(
      `/repos/${github.repository}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`,
    );
    jobs.push(...body.jobs);
    if (body.jobs.length === 0 || jobs.length >= body.total_count) {
      return jobs;
    }
  }
};

/** Runner minutes of the stress harness and agent workflows' runs created in the window, over every attempt. */
export const readUsage = async (github: Client, window: Window): Promise<UsageStats> => {
  let runs = 0;
  let runnerMinutes = 0;
  for (const workflow of stressWorkflows) {
    // oxlint-disable-next-line no-await-in-loop -- two workflows, read in order
    const listed = await listRuns(github, { workflow, ...window });
    for (const run of listed) {
      // oxlint-disable-next-line no-await-in-loop -- one run's jobs at a time
      const jobs = await readJobs(github, run.id);
      runs += 1;
      runnerMinutes += runnerMinutesOf(jobs);
    }
  }
  return { runs, runnerMinutes: Math.round(runnerMinutes * 10) / 10 };
};

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        days: { type: 'string', default: '7' },
        'state-branch': { type: 'string', default: stateBranch },
        root: { type: 'string', default: '.' },
        today: { type: 'string', default: '' },
        summary: {
          type: 'string',
          default: process.env['GITHUB_STEP_SUMMARY'] ?? '',
        },
        'max-requests': { type: 'string', default: '300' },
      },
    }));
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  const days = Number(values.days);
  const maxRequests = Number(values['max-requests']);
  const token = process.env['GITHUB_TOKEN'];
  if (!token || !Number.isFinite(days) || days <= 0 || !Number.isInteger(maxRequests) || maxRequests <= 0) {
    console.error('Usage: GITHUB_TOKEN=... node scripts/src/ci-flake-metrics-cli.ts [--days <n>] [--summary <file>]');
    return 2;
  }
  const now = new Date();
  const today = values.today || utcDay(now);
  const github = client({
    api: process.env['GITHUB_API_URL'] ?? 'https://api.github.com',
    token,
    repository: process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau',
    maxRequests,
  });
  const window = reportWindow(now, days);
  const [ledger, workspace, issues] = await Promise.all([
    branchStore(github, values['state-branch']).read(),
    readWorkspace(resolve(values.root)),
    readOwnerIssues(github, today),
  ]);
  const rows = metricRows({
    window,
    today,
    ledger,
    quarantines: workspace.quarantines,
    issues,
  });
  const markdown = `${renderMetricsMarkdown(rows, window)}${ledger ? '' : `\nNo ledger state on \`${values['state-branch']}\` yet.\n`}`;
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
