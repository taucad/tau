/**
 * Weekly CI health report: the IO half (`ci-queue-health.ts` and `ci-flake-ledger.ts` hold the logic).
 *
 * Queue health: reads the `merge_group` runs of `ci.yml` created in the window, the jobs of every attempt, the
 * annotations of each failed run's first failed job and whether each victim's commit landed on `--branch` from the
 * GitHub REST API. Blueprint DC-21 (Brain `research/ci-decomposition-blueprint.md`, Part 5a, X7; global review
 * ruling 9). A run whose jobs the API keeps refusing after the retries is reported as not fetched.
 *
 * Flakes (taucad/tau#1281): over `--flake-days`, pairs each failed lane job of a merge group or a push to
 * `--branch` with the next run of the same PR (or of the push sequence) that ran the job, confirms the pair through
 * compares, reads the failed job's log for the failing tests and tasks, and checks repeat offenders against the
 * owners and expiries in `--ledger` and the expected-failure markers in the checkout.
 *
 * Test flake ledger (FQ-2): reads the per-test state `flake-ledger.yml` keeps on the `--ledger-branch` branch and lists
 * the tests with a flake event in the flake window, with their executions, variants, first and last seen, and whether
 * they meet the entry rule. The job-pair section above stays for failures with no outcome row (a job that failed
 * outside a test). `--since` and `--until` replay a fixed window.
 *
 * Flake quarantine metrics (FQ-11, blueprint D9): every row of D9's table from the same window, by
 * `ci-flake-metrics.ts`. It adds the pull requests merged into `--branch` in the window and their queue events, the
 * owner issues the release automation marks, the runs and jobs of the stress and agent workflows, and the checkout's
 * `quarantine.json` files to what the sections above read.
 *
 * Writes the JSON report and appends the Markdown summary to `--summary` (default `$GITHUB_STEP_SUMMARY`).
 * `ci-queue-health.yml` runs it weekly and posts nothing.
 *
 * Usage: node scripts/src/ci-queue-health-cli.ts [--days 7] [--flake-days 14] [--out <path>] [--summary <file>]
 *          [--workflow ci.yml] [--event merge_group] [--max-requests 5000] [--branch main]
 *          [--ledger scripts/src/flake-ledger.json] [--ledger-branch flake-ledger] [--since <iso>] [--until <iso>]
 * Env: GITHUB_TOKEN (needs `actions: read`, `issues: read`, `pull-requests: read`), GITHUB_REPOSITORY (default
 * taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 report written (it may be partial when the request budget ran out or a run's jobs were refused);
 * 1 API failure listing the runs; 2 usage;
 * 3 report written and a flake needs someone: an unowned or expired repeat offender, ledger entry or marker.
 */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { client, listRuns, retries } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import {
  buildReport,
  fetchOrder,
  firstFailedJob,
  landedFromCompare,
  latestAttempt,
  renderMarkdown,
  reportWindow,
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
import { renderLedgerMarkdown, summarizeLedger } from '#ci-flake-ledger-state.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';
import { branchStore, stateBranch } from '#ci-flake-ledger-store.js';
import { metricRows, renderMetricsMarkdown } from '#ci-flake-metrics.js';
import type { MetricRow } from '#ci-flake-metrics.js';
import { readLandings, readOwnerIssues, readUsage } from '#ci-flake-metrics-cli.js';
import { readWorkspace } from '#ci-flake-quarantine-entry-cli.js';

const concurrency = 4;

const listJobs = async (github: Client, runId: number): Promise<WorkflowJob[]> => {
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

/**
 * Whether a victim's commit (a cancelled run with no failed job) is reachable from `branch`. Undefined for any other
 * run, when the run names no commit or GitHub refuses the compare (for example a commit it no longer has), so the
 * report counts it as unchecked.
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

/** Jobs of every attempt already fetched, by run id: the flake pass and the queue report share them. */
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
  let refused = 0;
  const worker = async (): Promise<void> => {
    for (let run = queue.shift(); run && github.budget() > 0; run = queue.shift()) {
      let jobs: WorkflowJob[];
      try {
        // oxlint-disable-next-line no-await-in-loop -- each worker takes one run at a time; four run in parallel
        jobs = await jobsOf(github, cache, run.id);
      } catch (error) {
        // One listing the API keeps refusing leaves that run unfetched (the report says partial), not the week.
        refused += 1;
        console.error(error instanceof Error ? error.message : String(error));
        continue;
      }
      // A failed queue run concludes `cancelled` since the `Fail fast` jobs landed: its jobs say it failed.
      const culprit = firstFailedJob(jobs);
      const annotations = culprit
        ? // oxlint-disable-next-line no-await-in-loop -- the annotations belong to the run just fetched
          await github
            .get<Annotation[]>(`/repos/${github.repository}/check-runs/${culprit.id}/annotations?per_page=100`)
            .catch(() => undefined)
        : undefined;
      // oxlint-disable-next-line no-await-in-loop -- the landing check belongs to the run just fetched
      const landed = culprit ? undefined : await checkLanded(github, run, branch);
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
  if (refused > 0) {
    console.error(`The API refused the jobs of ${refused} runs after ${retries} retries; they are reported unfetched`);
  }
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
  // A failed merge-group run concludes `cancelled` (its `Fail fast` job cancels it), so its jobs decide.
  const failedRuns = tracked
    .filter((run) => run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  await eachWithBudget(github, failedRuns, async (run) => {
    await jobsOf(github, cache, run.id).catch(() => undefined);
  });
  const evidenceOf = (): RunEvidence[] =>
    tracked.map((run) => {
      const jobs = cache.get(run.id);
      return jobs ? { run, jobs: latestAttempt(jobs) } : { run };
    });
  const followUps = failedRuns
    .filter((run) => failedLaneJobs(latestAttempt(cache.get(run.id) ?? [])).length > 0)
    .flatMap((run) => followUpsOf(evidenceOf(), run));
  await eachWithBudget(github, [...new Map(followUps.map((run) => [run.id, run])).values()], async (run) => {
    await jobsOf(github, cache, run.id).catch(() => undefined);
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

/**
 * The test flake ledger section (FQ-2): the identities with a flake event in the window, from the state the ingestion
 * workflow keeps on its branch, and how many completed queue and `main` runs of the window the state has not counted.
 * A missing branch is reported (the ledger has not run yet); a state that cannot be read fails the report.
 */
const ledgerSection = (options: {
  readonly state: LedgerState | undefined;
  readonly branch: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly runs: readonly WorkflowRun[];
}): { markdown: string; json: unknown } => {
  const { state, branch, window, runs } = options;
  if (!state) {
    return {
      markdown: `## Test flake ledger (FQ-2)\n\nNo ledger state on the \`${branch}\` branch yet: \`flake-ledger.yml\` writes it after its first run.\n`,
      json: { branch, state: 'missing' },
    };
  }
  const summary = summarizeLedger(state, window);
  const ingested = new Set(state.ingested.map((entry) => entry.run));
  const missing = runs.filter((run) => run.status === 'completed' && !ingested.has(run.id)).length;
  const coverage =
    missing > 0
      ? `${missing} completed queue and \`main\` runs of the window are not in the ledger (they finished before it ran, aged out of its 72-hour catch-up, or are still waiting for it).\n`
      : '';
  return {
    markdown: `${renderLedgerMarkdown(summary)}${coverage}`,
    json: {
      ...summary,
      missing,
      rows: summary.rows.map((row) => ({
        id: row.id,
        events: row.inWindow,
        variants: row.variants,
        entryRule: row.entryRule,
        executions: row.identity.executions,
        failures: row.identity.failures,
        retriedPasses: row.identity.retriedPasses,
        firstSeen: row.identity.firstSeen,
        lastSeen: row.identity.lastSeen,
      })),
    },
  };
};

/**
 * The flake quarantine metrics section (FQ-11): every row of blueprint D9 from the window's live data. The queue rows
 * need the merge-group evidence, so a report run with another `--event` leaves them unmeasured and says why.
 */
const metricsSection = async (options: {
  readonly github: Client;
  readonly window: { readonly from: string; readonly to: string };
  readonly branch: string;
  /** The queue report's evidence, when it read merge-group runs. */
  readonly queue: {
    readonly evidence: readonly RunEvidence[];
    readonly mergedNothingShare: number;
    readonly event: string;
  };
  readonly queueRuns: readonly WorkflowRun[];
  readonly ledger: LedgerState | undefined;
}): Promise<MetricRow[]> => {
  const { github, window, branch, queue, queueRuns, ledger } = options;
  const today = window.to.slice(0, 10);
  const [landings, issues, usage, workspace] = await Promise.all([
    readLandings(github, window, branch),
    readOwnerIssues(github, today),
    readUsage(github, window),
    readWorkspace(process.cwd()),
  ]);
  return metricRows({
    window,
    today,
    queue: queue.event === 'merge_group' ? queue : undefined,
    landings: { landings, queueRuns },
    ledger,
    quarantines: workspace.quarantines,
    issues,
    usage,
    absent: 'the report ran with an `--event` other than `merge_group`, or without `--ledger-branch`',
  });
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
        // GitHub Enterprise Cloud gives GITHUB_TOKEN 15,000 requests an hour; the rate-limit reserve still applies.
        'max-requests': { type: 'string', default: '5000' },
        branch: { type: 'string', default: 'main' },
        ledger: { type: 'string', default: 'scripts/src/flake-ledger.json' },
        // The ledger v2 state branch (FQ-2); empty leaves the test ledger section out.
        'ledger-branch': { type: 'string', default: stateBranch },
        // A replay: the report's windows end here instead of now, and start at `--since` when it is set.
        until: { type: 'string', default: '' },
        since: { type: 'string', default: '' },
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
  const until = values.until ? new Date(values.until) : new Date();
  const since = values.since ? new Date(values.since) : undefined;
  if (
    !token ||
    Number.isNaN(until.getTime()) ||
    (since !== undefined && (Number.isNaN(since.getTime()) || since >= until)) ||
    !Number.isFinite(days) ||
    days <= 0 ||
    !Number.isFinite(flakeDays) ||
    flakeDays <= 0 ||
    !Number.isInteger(maxRequests) ||
    maxRequests <= 0
  ) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/ci-queue-health-cli.ts [--days <n>] [--flake-days <n>] [--since <iso>] [--until <iso>] [--out <path>]',
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
  const now = until;
  const fixed = (window: { from: string; to: string }): { from: string; to: string } =>
    since ? { ...window, from: since.toISOString().slice(0, 19) + 'Z' } : window;
  const window = fixed(reportWindow(now, days));
  const flakeWindow = fixed(reportWindow(now, flakeDays));
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

  const ledgerState = values['ledger-branch'] ? await branchStore(github, values['ledger-branch']).read() : undefined;
  const testLedger = values['ledger-branch']
    ? ledgerSection({
        state: ledgerState,
        branch: values['ledger-branch'],
        window: flakeWindow,
        runs: [...queueRuns, ...pushRuns],
      })
    : undefined;

  const inWindow = (run: WorkflowRun): boolean => run.created_at >= window.from && run.created_at <= window.to;
  const runs =
    values.event === 'merge_group'
      ? queueRuns.filter((run) => inWindow(run))
      : dedupe(await listRuns(github, { workflow: values.workflow, event: values.event, ...window }));
  const evidence = await gather({ github, runs, branch: values.branch, cache });
  const queueReport = buildReport({
    repository,
    workflow: values.workflow,
    event: values.event,
    window,
    generatedAt: now.toISOString(),
    evidence,
  });
  const metrics = await metricsSection({
    github,
    window,
    branch: values.branch,
    queue: { evidence, mergedNothingShare: queueReport.classes.mergedNothingShare, event: values.event },
    queueRuns: queueRuns.filter((run) => inWindow(run)),
    ledger: ledgerState,
  });
  const report = { ...queueReport, flakes, ...(testLedger ? { testLedger: testLedger.json } : {}), metrics };

  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = `${renderMarkdown(report)}\n${renderMetricsMarkdown(metrics, window)}\n${renderFlakeMarkdown(flakes, now)}${testLedger ? `\n${testLedger.markdown}` : ''}`;
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
