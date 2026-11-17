/**
 * Weekly CI health report: the IO half (`ci-queue-health.ts` and `ci-flake-ledger.ts` hold the logic).
 *
 * Queue health: reads the `merge_group` runs of `ci.yml` created in the window, their jobs, the annotations of each
 * failed run's first failed job and whether each cancelled run's commit landed on `--branch` from the GitHub REST
 * API. Blueprint DC-21 (Brain `research/ci-decomposition-blueprint.md`, Part 5a, X7).
 *
 * Flakes (taucad/tau#1281): over `--flake-days`, pairs each failed lane job of a merge group or a push to
 * `--branch` with the next run of the same PR (or of the push sequence) that ran the job, confirms the pair through
 * compares, reads the failed job's log for the failing tests and tasks, and checks repeat offenders against the
 * owners and expiries in `--ledger` and the expected-failure markers in the checkout.
 *
 * Writes the JSON report and appends the Markdown summary to `--summary` (default `$GITHUB_STEP_SUMMARY`).
 * `ci-queue-health.yml` runs it weekly and posts nothing.
 *
 * Usage: node scripts/src/ci-queue-health-cli.ts [--days 7] [--flake-days 14] [--out <path>] [--summary <file>]
 *          [--workflow ci.yml] [--event merge_group] [--max-requests 900] [--branch main]
 *          [--ledger scripts/src/flake-ledger.json]
 * Env: GITHUB_TOKEN (needs `actions: read`), GITHUB_REPOSITORY (default taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 report written (it may be partial when the request budget ran out); 1 API failure; 2 usage;
 * 3 report written and a flake needs someone: an unowned or expired repeat offender, ledger entry or marker.
 */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
import {
  entriesOf,
  expiredLedgerEntries,
  expiredMarkers,
  failedLaneJobs,
  followUpsOf,
  ledgerProblems,
  lineageOf,
  needsAction,
  pairFailures,
  parseJobLog,
  renderFlakeMarkdown,
  repeatOffenders,
  sameDiff,
  scanExpectedFailureMarkers,
  touchesFailingTest,
} from '#ci-flake-ledger.js';
import type { ComparedFile, FlakeEntry, FlakePair, FlakeReport, Ledger } from '#ci-flake-ledger.js';

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
  /** A text body (a job log); the API redirects to a signed URL, which `fetch` follows without the token. */
  readonly getText: (path: string) => Promise<string>;
  /** Requests this run may still make. */
  readonly budget: () => number;
};

const client = (options: { api: string; token: string; repository: string; maxRequests: number }): Client => {
  const { api, token, repository, maxRequests } = options;
  let made = 0;
  let remaining = Number.POSITIVE_INFINITY;
  const request = async (path: string): Promise<Response> => {
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
        return response;
      }
      if (response && (response.status < 500 || attempt > retries)) {
        throw new Error(`GET ${path}: GitHub API ${response.status}`);
      }
      // oxlint-disable-next-line no-await-in-loop -- the backoff is sequential by design
      await sleep(2000 * 2 ** (attempt - 1));
    }
  };
  return {
    repository,
    budget: () => Math.min(maxRequests - made, remaining - rateReserve),
    async get<T>(path: string): Promise<T> {
      const response = await request(path);
      return (await response.json()) as T;
    },
    async getText(path: string): Promise<string> {
      const response = await request(path);
      return response.text();
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

/** Jobs already fetched, by run id: the flake pass and the queue report share them. */
type JobCache = Map<number, WorkflowJob[]>;

const jobsOf = async (github: Client, cache: JobCache, runId: number): Promise<WorkflowJob[]> => {
  const cached = cache.get(runId);
  if (cached) {
    return cached;
  }
  const jobs = await listJobs(github, runId);
  cache.set(runId, jobs);
  return jobs;
};

const gather = async (options: {
  readonly github: Client;
  readonly runs: readonly WorkflowRun[];
  readonly branch: string;
  readonly cache: JobCache;
}): Promise<RunEvidence[]> => {
  const { github, runs, branch, cache } = options;
  const evidence = new Map<number, RunEvidence>(runs.map((run) => [run.id, { run }]));
  const queue = fetchOrder(runs);
  let fetched = 0;
  const worker = async (): Promise<void> => {
    for (let run = queue.shift(); run && github.budget() > 0; run = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- each worker takes one run at a time; four run in parallel
      const jobs = await jobsOf(github, cache, run.id);
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

/** Run `task` over `items`, four at a time, while the request budget lasts. */
const eachWithBudget = async <T>(
  github: Client,
  items: readonly T[],
  task: (item: T) => Promise<void>,
): Promise<void> => {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined && github.budget() > 0; item = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- each worker takes one item at a time; four run in parallel
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
};

/** The files a compare names, or undefined when GitHub refuses it (a commit it no longer has). */
const compareFiles = async (github: Client, base: string, head: string): Promise<ComparedFile[] | undefined> => {
  try {
    const body = await github.get<{ files?: ComparedFile[] }>(
      `/repos/${github.repository}/compare/${base}...${head}?per_page=300`,
    );
    return (body.files ?? []).map((file) => ({ filename: file.filename, sha: file.sha }));
  } catch {
    return undefined;
  }
};

/** Whether a pair is a flake, a fix between the runs, or unconfirmed, and what its failed job's log names. */
const confirmPair = async (
  github: Client,
  pair: FlakePair,
): Promise<{ verdict: 'flake' | 'fixed' | 'unconfirmed'; entries: FlakeEntry[] }> => {
  let log: string | undefined;
  try {
    log = await github.getText(`/repos/${github.repository}/actions/jobs/${pair.failed.job.id}/logs`);
  } catch {
    log = undefined;
  }
  const failures = parseJobLog(log ?? '');
  const failedSha = pair.failed.run.head_sha;
  const passedSha = pair.passed.run.head_sha;
  if (!failedSha || !passedSha) {
    return { verdict: 'unconfirmed', entries: [] };
  }
  if (pair.lineage.kind === 'queue') {
    const passedLineage = lineageOf(pair.passed.run);
    if (passedLineage?.kind !== 'queue') {
      return { verdict: 'unconfirmed', entries: [] };
    }
    const [before, after] = await Promise.all([
      compareFiles(github, pair.lineage.base, failedSha),
      compareFiles(github, passedLineage.base, passedSha),
    ]);
    if (!before || !after) {
      return { verdict: 'unconfirmed', entries: [] };
    }
    return sameDiff(before, after)
      ? { verdict: 'flake', entries: entriesOf(pair, failures) }
      : { verdict: 'fixed', entries: [] };
  }
  const changed = await compareFiles(github, failedSha, passedSha);
  if (!changed) {
    return { verdict: 'unconfirmed', entries: [] };
  }
  return touchesFailingTest(changed, failures.tests)
    ? { verdict: 'fixed', entries: [] }
    : { verdict: 'flake', entries: entriesOf(pair, failures) };
};

/** Tracked test sources, read from the checkout, for the expected-failure markers. */
const testSources = async (): Promise<Array<{ path: string; text: string }>> => {
  const listed = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const paths = listed.split('\0').filter((path) => path !== '');
  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(path, 'utf8') })));
};

const flakePass = async (options: {
  readonly github: Client;
  readonly cache: JobCache;
  readonly runs: readonly WorkflowRun[];
  readonly window: { readonly from: string; readonly to: string };
  readonly ledger: Ledger;
  readonly now: Date;
}): Promise<FlakeReport> => {
  const { github, cache, runs, window, ledger, now } = options;
  const tracked = runs.filter((run) => lineageOf(run) && run.status === 'completed');
  const failedRuns = tracked
    .filter((run) => run.conclusion === 'failure')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  await eachWithBudget(github, failedRuns, async (run) => {
    await jobsOf(github, cache, run.id);
  });
  const evidenceOf = (): RunEvidence[] =>
    tracked.map((run) => {
      const jobs = cache.get(run.id);
      return jobs ? { run, jobs } : { run };
    });
  const followUps = failedRuns
    .filter((run) => failedLaneJobs(cache.get(run.id) ?? []).length > 0)
    .flatMap((run) => followUpsOf(evidenceOf(), run));
  await eachWithBudget(github, [...new Map(followUps.map((run) => [run.id, run])).values()], async (run) => {
    await jobsOf(github, cache, run.id);
  });
  const pairing = pairFailures(evidenceOf());
  const flakes: FlakeEntry[] = [];
  let fixedBetween = 0;
  let flakePairs = 0;
  await eachWithBudget(github, pairing.pairs, async (pair) => {
    const result = await confirmPair(github, pair);
    if (result.verdict === 'flake') {
      flakePairs += 1;
      flakes.push(...result.entries);
    } else if (result.verdict === 'fixed') {
      fixedBetween += 1;
    }
  });
  /* Pairs the budget never reached count here too. */
  const unconfirmed = pairing.pairs.length - flakePairs - fixedBetween;
  const markers = scanExpectedFailureMarkers(await testSources());
  return {
    window,
    flakes,
    fixedBetween,
    unconfirmed,
    inherited: pairing.inherited,
    unresolved: pairing.unresolved,
    offenders: repeatOffenders(flakes, ledger, now),
    expiredLedger: expiredLedgerEntries(ledger, now),
    expiredMarkers: expiredMarkers(markers, now),
  };
};

const dedupe = (runs: readonly WorkflowRun[]): WorkflowRun[] => [...new Map(runs.map((run) => [run.id, run])).values()];

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        days: { type: 'string', default: '7' },
        'flake-days': { type: 'string', default: '14' },
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
        ledger: { type: 'string', default: 'scripts/src/flake-ledger.json' },
      },
    }));
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  const days = Number(values.days);
  const flakeDays = Number(values['flake-days']);
  const maxRequests = Number(values['max-requests']);
  const token = process.env['GITHUB_TOKEN'];
  if (
    !token ||
    !Number.isFinite(days) ||
    days <= 0 ||
    !Number.isFinite(flakeDays) ||
    flakeDays <= 0 ||
    !Number.isInteger(maxRequests) ||
    maxRequests <= 0
  ) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/ci-queue-health-cli.ts [--days <n>] [--flake-days <n>] [--out <path>]',
    );
    return 2;
  }
  const ledger = JSON.parse(await readFile(resolve(values.ledger), 'utf8')) as Ledger;
  const problems = ledgerProblems(ledger);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 2;
  }
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const now = new Date();
  const window = reportWindow(now, days);
  const flakeWindow = reportWindow(now, flakeDays);
  const cache: JobCache = new Map();

  // Split windows share their boundary second, so a run created then is listed twice.
  const [queueRuns, pushRuns] = await Promise.all([
    listRuns(github, { workflow: values.workflow, event: 'merge_group', ...flakeWindow }).then(dedupe),
    listRuns(github, { workflow: values.workflow, event: 'push', ...flakeWindow }).then((runs) =>
      dedupe(runs).filter((run) => run.head_branch === values.branch),
    ),
  ]);
  const flakes = await flakePass({
    github,
    cache,
    runs: [...queueRuns, ...pushRuns],
    window: flakeWindow,
    ledger,
    now,
  });

  const inWindow = (run: WorkflowRun): boolean => run.created_at >= window.from && run.created_at <= window.to;
  const runs =
    values.event === 'merge_group'
      ? queueRuns.filter((run) => inWindow(run))
      : dedupe(await listRuns(github, { workflow: values.workflow, event: values.event, ...window }));
  const evidence = await gather({ github, runs, branch: values.branch, cache });
  const report = {
    ...buildReport({
      repository,
      workflow: values.workflow,
      event: values.event,
      window,
      generatedAt: now.toISOString(),
      evidence,
    }),
    flakes,
  };

  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = `${renderMarkdown(report)}\n${renderFlakeMarkdown(flakes, now)}`;
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  console.log(`Wrote ${out}`);
  return needsAction(flakes) ? 3 : 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
