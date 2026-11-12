/**
 * Weekly merge-queue health report: the IO half (`ci-queue-health.ts` holds the logic).
 *
 * Reads the `merge_group` runs of `ci.yml` created in the window, their jobs, the annotations of each failed run's
 * first failed job and whether each cancelled run's commit landed on `--branch` from the GitHub REST API, then
 * writes the JSON report and appends the Markdown summary to `--summary` (default `$GITHUB_STEP_SUMMARY`).
 * `ci-queue-health.yml` runs it weekly; it is advisory and posts nothing. Blueprint DC-21 (Brain
 * `research/ci-decomposition-blueprint.md`, Part 5a, X7).
 *
 * Usage: node scripts/src/ci-queue-health-cli.ts [--days 7] [--out <path>] [--summary <file>]
 *          [--workflow ci.yml] [--event merge_group] [--max-requests 900] [--branch main]
 * Env: GITHUB_TOKEN (needs `actions: read`), GITHUB_REPOSITORY (default taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 report written (it may be partial when the request budget ran out); 1 API failure; 2 usage.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import {
  buildReport,
  fetchOrder,
  firstFailedJob,
  landedFromCompare,
  renderMarkdown,
  reportWindow,
  splitWindow,
} from '#ci-queue-health.js';
import type { Annotation, RunEvidence, WorkflowJob, WorkflowRun } from '#ci-queue-health.js';

/** The runs API returns at most this many results for one query. */
const searchLimit = 1000;
/** Requests left untouched when the rate limit runs low, so a rerun in the same hour can still start. */
const rateReserve = 50;
const concurrency = 4;
const retries = 3;

type Client = {
  /** `owner/name`, the prefix of every path below `/repos`. */
  readonly repository: string;
  readonly get: <T>(path: string) => Promise<T>;
  /** Requests this run may still make. */
  readonly budget: () => number;
};

const client = (options: { api: string; token: string; repository: string; maxRequests: number }): Client => {
  const { api, token, repository, maxRequests } = options;
  let made = 0;
  let remaining = Number.POSITIVE_INFINITY;
  return {
    repository,
    budget: () => Math.min(maxRequests - made, remaining - rateReserve),
    async get<T>(path: string): Promise<T> {
      // The API answers 502/503 now and then on job listings; retry those and network resets a bounded number
      // of times (2 s, 4 s, 8 s) rather than lose the week's report.
      for (let attempt = 1; ; attempt += 1) {
        made += 1;
        let response: Response | undefined;
        try {
          // oxlint-disable-next-line no-await-in-loop -- a retry waits for the attempt before it
          response = await fetch(`${api}${path}`, {
            headers: {
              authorization: `Bearer ${token}`,
              accept: 'application/vnd.github+json',
              'x-github-api-version': '2022-11-28',
            },
            signal: AbortSignal.timeout(30_000),
          });
        } catch (error) {
          if (attempt > retries) {
            throw error;
          }
        }
        const header = response?.headers.get('x-ratelimit-remaining');
        if (header !== null && header !== undefined) {
          remaining = Number(header);
        }
        if (response?.ok) {
          // oxlint-disable-next-line no-await-in-loop -- returns on the first successful attempt
          return (await response.json()) as T;
        }
        if (response && (response.status < 500 || attempt > retries)) {
          throw new Error(`GET ${path}: GitHub API ${response.status}`);
        }
        // oxlint-disable-next-line no-await-in-loop -- the backoff is sequential by design
        await sleep(2000 * 2 ** (attempt - 1));
      }
    },
  };
};

type RunQuery = { readonly workflow: string; readonly event: string; readonly from: string; readonly to: string };

const listRuns = async (github: Client, query: RunQuery): Promise<WorkflowRun[]> => {
  const { workflow, event, ...window } = query;
  const base = `/repos/${github.repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=${encodeURIComponent(event)}&created=${window.from}..${window.to}&per_page=100`;
  const first = await github.get<{
    total_count: number;
    workflow_runs: WorkflowRun[];
  }>(`${base}&page=1`);
  if (first.total_count > searchLimit) {
    const [early, late] = splitWindow(window);
    const parts = await Promise.all([
      listRuns(github, { workflow, event, ...early }),
      listRuns(github, { workflow, event, ...late }),
    ]);
    return parts.flat();
  }
  const runs = [...first.workflow_runs];
  for (let page = 2; runs.length < first.total_count; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until the count is reached
    const next = await github.get<{ workflow_runs: WorkflowRun[] }>(`${base}&page=${page}`);
    if (next.workflow_runs.length === 0) {
      break;
    }
    runs.push(...next.workflow_runs);
  }
  return runs;
};

const listJobs = async (github: Client, runId: number): Promise<WorkflowJob[]> => {
  const jobs: WorkflowJob[] = [];
  for (let page = 1; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until the count is reached
    const body = await github.get<{ total_count: number; jobs: WorkflowJob[] }>(
      `/repos/${github.repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`,
    );
    jobs.push(...body.jobs);
    if (body.jobs.length === 0 || jobs.length >= body.total_count) {
      return jobs;
    }
  }
};

/**
 * Whether a cancelled run's commit is reachable from `branch`. Undefined when the run names no commit or GitHub
 * refuses the compare (for example a commit it no longer has), so the report counts it as unchecked waste.
 */
const checkLanded = async (github: Client, run: WorkflowRun, branch: string): Promise<boolean | undefined> => {
  if (run.conclusion !== 'cancelled' || !run.head_sha || github.budget() <= 0) {
    return undefined;
  }
  try {
    const { status } = await github.get<{ status?: string }>(
      `/repos/${github.repository}/compare/${run.head_sha}...${encodeURIComponent(branch)}?per_page=1`,
    );
    return landedFromCompare(status);
  } catch {
    return undefined;
  }
};

const gather = async (github: Client, runs: readonly WorkflowRun[], branch: string): Promise<RunEvidence[]> => {
  const evidence = new Map<number, RunEvidence>(runs.map((run) => [run.id, { run }]));
  const queue = fetchOrder(runs);
  let fetched = 0;
  const worker = async (): Promise<void> => {
    for (let run = queue.shift(); run && github.budget() > 0; run = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- each worker takes one run at a time; four run in parallel
      const jobs = await listJobs(github, run.id);
      const culprit = run.conclusion === 'failure' ? firstFailedJob(jobs) : undefined;
      const annotations = culprit
        ? // oxlint-disable-next-line no-await-in-loop -- the annotations belong to the run just fetched
          await github.get<Annotation[]>(
            `/repos/${github.repository}/check-runs/${culprit.id}/annotations?per_page=100`,
          )
        : undefined;
      // oxlint-disable-next-line no-await-in-loop -- the landing check belongs to the run just fetched
      const landed = await checkLanded(github, run, branch);
      evidence.set(run.id, {
        run,
        jobs,
        ...(annotations ? { annotations } : {}),
        ...(landed === undefined ? {} : { landed }),
      });
      fetched += 1;
      if (fetched % 100 === 0) {
        console.error(`Fetched jobs for ${fetched} of ${runs.length} runs`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return [...evidence.values()];
};

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        days: { type: 'string', default: '7' },
        out: {
          type: 'string',
          default: 'out/reports/ci-queue-health/queue-health.json',
        },
        summary: {
          type: 'string',
          default: process.env['GITHUB_STEP_SUMMARY'] ?? '',
        },
        workflow: { type: 'string', default: 'ci.yml' },
        event: { type: 'string', default: 'merge_group' },
        'max-requests': { type: 'string', default: '900' },
        branch: { type: 'string', default: 'main' },
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
    console.error('Usage: GITHUB_TOKEN=... node scripts/src/ci-queue-health-cli.ts [--days <n>] [--out <path>]');
    return 2;
  }
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const now = new Date();
  const window = reportWindow(now, days);

  // Split windows share their boundary second, so a run created then is listed twice.
  const listed = await listRuns(github, { workflow: values.workflow, event: values.event, ...window });
  const runs = [...new Map(listed.map((run) => [run.id, run])).values()];
  const evidence = await gather(github, runs, values.branch);
  const report = buildReport({
    repository,
    workflow: values.workflow,
    event: values.event,
    window,
    generatedAt: now.toISOString(),
    evidence,
  });

  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = renderMarkdown(report);
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  console.log(`Wrote ${out}`);
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
