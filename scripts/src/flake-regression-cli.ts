/* eslint-disable @typescript-eslint/naming-convention -- GitHub REST JSON fields. */
/**
 * Flaky-regression detection and bisect: the IO half (`flake-regression.ts` holds the logic). FQ-12 of the CI flake
 * quarantine blueprint (Brain `research/ci-flake-quarantine-blueprint.md`, D4 and D7). `flake-regression.yml` runs it
 * after each flake ledger ingestion.
 *
 * Reads the ledger state from the `flake-ledger` branch (read only), finds the flaky-regression candidates, and makes
 * sure each has an open issue flagged for the operator (`flake`, `flake:regression`, `flake:needs-operator`), found by
 * its identity marker or opened. Then it bisects one candidate per invocation, the oldest whose onset has no bisect
 * yet: the first flaky commit is the commit of the onset's failing run, the last stable commit the last push to
 * `main` the CI ran before it, and each probe is a `flake-repro.yml` dispatch at one commit (that workflow's gate
 * holds it to three runs at once and 3,000 runner-minutes a week; `bisectLimits` holds one bisect to 10 probes and 300
 * runner-minutes). The result, a named culprit or the range it narrowed to, is a comment on the issue. Nothing is
 * quarantined and nothing is written to the ledger.
 *
 * Usage: node scripts/src/flake-regression-cli.ts [--state-file <path>] [--state-branch flake-ledger]
 *          [--id <identity>] [--good <sha>] [--bad <sha>] [--modes repeat,cpu,parallel] [--dry-run]
 *          [--summary <file>] [--max-requests 3000]
 * `--id` bisects that identity whatever the detection says (an operator's dispatch); `--good` and `--bad` replace the
 * commits the ledger gives. `--dry-run` detects and prints, and writes and dispatches nothing.
 * Env: GITHUB_TOKEN (`contents: read` for the state and history, `issues: write`, `actions: write` to dispatch
 * `flake-repro.yml` and read its runs), GITHUB_REPOSITORY (default taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 done (or nothing to do); 1 an API failure; 2 usage.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import process from 'node:process';
import { setTimeout as sleepFor } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { client } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import type { StateStore } from '#ci-flake-ledger-store.js';
import type { IdentityState } from '#ci-flake-ledger-state.js';
import {
  bisectLimits,
  bisectMarker,
  bisectRecorded,
  bisectRegression,
  defaultModes,
  detectRegressions,
  identityMarker,
  latestOnset,
  renderBisectComment,
  renderIssueBody,
  reproIdentity,
} from '#flake-regression.js';
import type {
  BisectResult,
  CommitInfo,
  Prober,
  ProbeReport,
  ProbeRow,
  RegressionCandidate,
  ReproIdentity,
} from '#flake-regression.js';

/** Labels of a flaky-regression issue: the flake family, the class, and the operator's queue. */
export const issueLabels = ['flake', 'flake:regression', 'flake:needs-operator'] as const;
/** Issues opened or flagged per invocation; the rest wait for the next. */
const maximumIssues = 5;
/** Waits for a `flake-repro.yml` slot when its gate refuses a probe (three runs at once). */
const gateRetries = 6;
const gateWaitMinutes = 10;
/** Time a dispatched run may queue before it starts, beyond its own cap. */
const queueSlackMinutes = 60;

type Commit = {
  readonly sha: string;
  readonly commit?: { readonly message?: string };
  /** `null` for an author GitHub does not know; read only with `?.`. */
  readonly author?: { readonly login?: string };
};
type Run = {
  readonly id: number;
  readonly head_sha?: string;
  readonly status?: string;
  /** `null` while the run is going; read only with `??` or a comparison. */
  readonly conclusion?: string;
  readonly created_at: string;
  readonly run_started_at?: string;
  readonly updated_at: string;
  readonly html_url: string;
  readonly display_title?: string;
};
type Issue = { readonly number: number; readonly body?: string; readonly pull_request?: unknown };

// ---------------------------------------------------------------------------------------------------------------
// The commits.

/** The run's commit. */
const runSha = async (github: Client, run: number): Promise<{ sha: string; createdAt: string }> => {
  const body = await github.get<Run>(`/repos/${github.repository}/actions/runs/${run}`);
  if (!body.head_sha) {
    throw new Error(`run ${run} has no head commit`);
  }
  return { sha: body.head_sha, createdAt: body.created_at };
};

/** The commit of the last push to `main` the CI ran before `before`, other than `not`. */
export const lastStableSha = async (github: Client, before: string, not: string): Promise<string | undefined> => {
  const runs = await github.get<{ workflow_runs: Run[] }>(
    `/repos/${github.repository}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=20&created=${encodeURIComponent(`<${before}`)}`,
  );
  return runs.workflow_runs.find((run) => run.head_sha && run.head_sha !== not)?.head_sha;
};

/** Up to `limit` commits of history ending at `head`, oldest first, with what the comment names. */
export const historyTo = async (
  github: Client,
  head: string,
  limit = bisectLimits.commits,
): Promise<{ shas: string[]; info: Map<string, CommitInfo> }> => {
  const commits: Commit[] = [];
  for (let page = 1; commits.length < limit; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order
    const batch = await github.get<Commit[]>(
      `/repos/${github.repository}/commits?sha=${head}&per_page=100&page=${page}`,
    );
    commits.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }
  const kept = commits.slice(0, limit).toReversed();
  return {
    shas: kept.map((commit) => commit.sha),
    info: new Map(
      kept.map((commit) => [
        commit.sha,
        { sha: commit.sha, title: commit.commit?.message?.split('\n')[0], author: commit.author?.login ?? undefined },
      ]),
    ),
  };
};

// ---------------------------------------------------------------------------------------------------------------
// The issue.

/** The open issue that carries the identity's marker. */
export const findIssue = async (github: Client, id: string): Promise<number | undefined> => {
  const marker = identityMarker(id);
  for (let page = 1; page <= 5; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until a short one
    const issues = await github.get<Issue[]>(
      `/repos/${github.repository}/issues?state=open&labels=flake&per_page=100&page=${page}`,
    );
    const found = issues.find((issue) => !issue.pull_request && issue.body?.includes(marker));
    if (found) {
      return found.number;
    }
    if (issues.length < 100) {
      return undefined;
    }
  }
  return undefined;
};

/** The identity's issue, flagged for the operator: an existing one gains the labels, else one is opened. */
export const flagIssue = async (github: Client, candidate: RegressionCandidate): Promise<number> => {
  const existing = await findIssue(github, candidate.id);
  if (existing !== undefined) {
    await github.send('POST', `/repos/${github.repository}/issues/${existing}/labels`, { labels: [...issueLabels] });
    return existing;
  }
  const title = candidate.id.length > 200 ? `${candidate.id.slice(0, 199)}…` : candidate.id;
  const created = await github.send<{ number: number }>('POST', `/repos/${github.repository}/issues`, {
    title: `Flaky regression: ${title}`,
    body: renderIssueBody(candidate, github.repository),
    labels: [...issueLabels],
  });
  return created.number;
};

const issueComments = async (github: Client, issue: number): Promise<string[]> => {
  const bodies: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until a short one
    const comments = await github.get<Array<{ body?: string }>>(
      `/repos/${github.repository}/issues/${issue}/comments?per_page=100&page=${page}`,
    );
    bodies.push(...comments.map((comment) => comment.body ?? ''));
    if (comments.length < 100) {
      break;
    }
  }
  return bodies;
};

const comment = async (github: Client, issue: number, body: string): Promise<void> => {
  await github.send('POST', `/repos/${github.repository}/issues/${issue}/comments`, { body });
};

// ---------------------------------------------------------------------------------------------------------------
// The probes: `flake-repro.yml` dispatches.

/** What the prober needs beyond the client: the dispatch call, the report reader and a clock, all replaceable. */
export type ReproDeps = {
  readonly github: Client;
  readonly identity: ReproIdentity;
  /** POSTs the dispatch; returns the run id when the API reports it. */
  readonly dispatch: (inputs: Record<string, string>) => Promise<number | undefined>;
  /** `report.json` from an artifact's zip. */
  readonly readReport: (zip: Uint8Array<ArrayBuffer>) => Promise<unknown>;
  readonly sleep: (minutes: number) => Promise<void>;
  readonly now: () => Date;
  readonly workflow?: string;
};

type ReportJson = {
  readonly rows?: ReadonlyArray<{
    readonly mode?: string;
    readonly variant?: string;
    readonly outcomes?: Record<string, number>;
    readonly unavailable?: string;
  }>;
};

/** The rows of a `flake-repro` report (`flake-repro.ts` `Report`), field by field. */
export const reportRows = (value: unknown): ProbeRow[] => {
  const rows = (value as ReportJson | undefined)?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row: NonNullable<ReportJson['rows']>[number]) => {
    if (typeof row.mode !== 'string' || typeof row.variant !== 'string') {
      return [];
    }
    const outcomes: Record<string, number> = {};
    for (const key of ['passed', 'failed', 'timeout', 'error', 'missing']) {
      const count = row.outcomes?.[key];
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
        outcomes[key] = count;
      }
    }
    return [
      {
        key: `${row.mode}:${row.variant}`,
        outcomes,
        ...(typeof row.unavailable === 'string' ? { unavailable: row.unavailable } : {}),
      },
    ];
  });
};

const runMinutes = (run: Run): number =>
  Math.max(0, Date.parse(run.updated_at) - Date.parse(run.run_started_at ?? run.created_at)) / 60_000;

/** The dispatched run: by the id the API returned, else the newest dispatch of the workflow at this commit. */
const locateRun = async (
  deps: ReproDeps,
  dispatched: { readonly id: number | undefined; readonly sha: string; readonly since: string },
): Promise<number | undefined> => {
  const { id, sha, since } = dispatched;
  if (id !== undefined) {
    return id;
  }
  const workflow = deps.workflow ?? 'flake-repro.yml';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- the run appears after a delay
    await deps.sleep(0.5);
    // oxlint-disable-next-line no-await-in-loop -- as above
    const runs = await deps.github.get<{ workflow_runs: Run[] }>(
      `/repos/${deps.github.repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=20&created=${encodeURIComponent(`>=${since}`)}`,
    );
    const found = runs.workflow_runs.find((run) => run.display_title?.includes(sha));
    if (found) {
      return found.id;
    }
  }
  return undefined;
};

/** Whether a failed run was refused by `flake-repro.yml`'s gate (its `Admit the run` step failed). */
const refusedByGate = async (github: Client, run: number): Promise<boolean> => {
  const body = await github.get<{ jobs: Array<{ steps?: Array<{ name: string; conclusion?: string }> }> }>(
    `/repos/${github.repository}/actions/runs/${run}/jobs`,
  );
  return body.jobs.some((job) =>
    job.steps?.some((step) => step.name === 'Admit the run' && step.conclusion === 'failure'),
  );
};

/** A {@link Prober} that dispatches `flake-repro.yml` at the commit, waits for it and reads its report. */
export const reproProber =
  (deps: ReproDeps): Prober =>
  async (request) => {
    const { github, identity } = deps;
    let minutes = 0;
    for (let attempt = 0; attempt <= gateRetries; attempt += 1) {
      const since = new Date(deps.now().getTime() - 60_000).toISOString();
      // oxlint-disable-next-line no-await-in-loop -- one dispatch at a time
      const dispatched = await deps.dispatch({
        ref: request.sha,
        project: identity.project,
        target: identity.target,
        file: identity.file,
        test: identity.test,
        modes: request.modes,
        attempts: String(request.attempts),
        seed: '1',
        minutes: String(request.minutes),
      });
      // oxlint-disable-next-line no-await-in-loop -- as above
      const id = await locateRun(deps, { id: dispatched, sha: request.sha, since });
      if (id === undefined) {
        return { sha: request.sha, rows: [], minutes, error: 'the dispatched run was not found' };
      }
      const url = `https://github.com/${github.repository}/actions/runs/${id}`;
      const deadline = deps.now().getTime() + (request.minutes + queueSlackMinutes) * 60_000;
      let run: Run;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- polling
        run = await github.get<Run>(`/repos/${github.repository}/actions/runs/${id}`);
        if (run.status === 'completed' || deps.now().getTime() > deadline) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- polling
        await deps.sleep(1);
      }
      minutes += runMinutes(run);
      if (run.status !== 'completed') {
        return { sha: request.sha, rows: [], minutes, run: { id, url }, error: 'the run did not finish in time' };
      }
      // oxlint-disable-next-line no-await-in-loop -- a refused probe waits for a slot
      if (run.conclusion === 'failure' && (await refusedByGate(github, id))) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await deps.sleep(gateWaitMinutes);
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one run at a time
      const artifacts = await github.get<{ artifacts: Array<{ id: number; name: string; expired?: boolean }> }>(
        `/repos/${github.repository}/actions/runs/${id}/artifacts?per_page=100`,
      );
      const artifact = artifacts.artifacts.find((entry) => entry.name === `flake-repro-${id}` && !entry.expired);
      if (!artifact) {
        return {
          sha: request.sha,
          rows: [],
          minutes,
          run: { id, url },
          error: `no report (${run.conclusion ?? 'unknown'})`,
        };
      }
      // oxlint-disable-next-line no-await-in-loop -- as above
      const zip = await github.getBytes(`/repos/${github.repository}/actions/artifacts/${artifact.id}/zip`);
      // oxlint-disable-next-line no-await-in-loop -- as above
      const rows = reportRows(await deps.readReport(zip));
      return {
        sha: request.sha,
        rows,
        minutes,
        run: { id, url },
        ...(rows.length === 0 ? { error: 'an empty report' } : {}),
      };
    }
    return { sha: request.sha, rows: [], minutes, error: `the repro gate refused ${gateRetries + 1} dispatches` };
  };

/** The dispatch API call, asking for the run id (`return_run_details`); a 204 leaves the run to be found by listing. */
const dispatchWith =
  (options: { api: string; token: string; repository: string; workflow: string }) =>
  async (inputs: Record<string, string>): Promise<number | undefined> => {
    const response = await fetch(
      `${options.api}/repos/${options.repository}/actions/workflows/${options.workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main', inputs, return_run_details: true }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`dispatch ${options.workflow}: GitHub API ${response.status} ${detail.slice(0, 200)}`);
    }
    if (response.status === 204) {
      return undefined;
    }
    const body = (await response.json()) as { workflow_run_id?: number };
    return typeof body.workflow_run_id === 'number' ? body.workflow_run_id : undefined;
  };

const unzipReport = async (zip: Uint8Array<ArrayBuffer>): Promise<unknown> => {
  const directory = await mkdtemp(join(tmpdir(), 'flake-regression-'));
  try {
    const path = join(directory, 'report.zip');
    await writeFile(path, zip);
    // The report is data from a run of pull-request code: parsed, never executed.
    return JSON.parse(
      execFileSync('unzip', ['-p', path, 'report.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
    );
  } catch {
    return undefined;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------------------------------------------------------
// One invocation.

/** Nx project names to their roots, from the `project.json` files of a checkout. */
export const projectRoots = (root: string): Map<string, string> => {
  const roots = new Map<string, string>();
  const files = execFileSync('git', ['ls-files', '-z', '--', '*project.json'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => posix.basename(file) === 'project.json');
  for (const file of files) {
    try {
      const { name } = JSON.parse(readFileSync(join(root, file), 'utf8')) as { name?: unknown };
      if (typeof name === 'string') {
        roots.set(name, posix.dirname(file));
      }
    } catch {
      // Not checked out, or not JSON: that project cannot be bisected from here.
    }
  }
  return roots;
};

export type InvocationOptions = {
  readonly id?: string | undefined;
  readonly good?: string | undefined;
  readonly bad?: string | undefined;
  readonly modes: string;
  readonly dryRun: boolean;
};

export type InvocationDeps = {
  readonly github: Client;
  readonly store: StateStore;
  readonly roots: ReadonlyMap<string, string>;
  /** The prober for one identity. */
  readonly prober: (identity: ReproIdentity) => Prober;
  readonly now: () => Date;
  readonly log?: (line: string) => void;
};

export type InvocationResult = {
  readonly candidates: readonly RegressionCandidate[];
  /** Issue numbers flagged, by identity. */
  readonly issues: ReadonlyMap<string, number>;
  readonly bisected?: {
    readonly id: string;
    readonly issue: number | undefined;
    readonly result: BisectResult;
    readonly comment: string;
  };
  readonly markdown: string;
};

/** A candidate for an identity named by hand: its latest onset, or its latest event when it has no stable run. */
const manualCandidate = (id: string, identity: IdentityState): RegressionCandidate | undefined => {
  const onset = latestOnset(identity, 0);
  return onset ? { id, identity, ...onset } : undefined;
};

/** Bisect one candidate between its last stable and first flaky commits, and name the result on its issue. */
const bisectCandidate = async (
  chosen: { readonly candidate: RegressionCandidate; readonly issue: number },
  options: InvocationOptions,
  deps: InvocationDeps,
): Promise<{ result: BisectResult; comment: string }> => {
  const { github } = deps;
  const { candidate, issue } = chosen;
  const root = deps.roots.get(candidate.identity.project);
  const identity = root === undefined ? undefined : reproIdentity(candidate.id, candidate.identity, root);
  const failing = await runSha(github, candidate.onset.failedRun);
  const bad = options.bad ?? failing.sha;
  const good = options.good ?? (await lastStableSha(github, failing.createdAt, bad));
  const history = await historyTo(github, bad);
  const goodIndex = good === undefined ? -1 : history.shas.indexOf(good);
  let result: BisectResult = { outcome: 'inconclusive', candidates: 0, introduced: false, probes: [], minutes: 0 };
  if (identity) {
    await comment(
      github,
      issue,
      `${bisectMarker(candidate.onset.failedRun, 'started', deps.now().toISOString())}\n\nBisecting under stress between ` +
        `${good ?? 'the oldest commit of the window'} and ${bad} (at most ${bisectLimits.probes} \`flake-repro.yml\` probes and ${bisectLimits.minutes} runner-minutes).\n`,
    );
    result = await bisectRegression({
      history: history.shas,
      good: Math.max(0, goodIndex),
      modes: options.modes,
      prober: deps.prober(identity),
    });
  } else {
    (deps.log ?? console.error)(`${candidate.id}: no project root or test name to dispatch a repro with`);
  }
  const body = renderBisectComment({
    result,
    onsetRun: candidate.onset.failedRun,
    culprit: result.culprit === undefined ? undefined : (history.info.get(result.culprit) ?? { sha: result.culprit }),
    repository: github.repository,
    now: deps.now(),
  });
  await comment(github, issue, body);
  return { result, comment: body };
};

/** Detect, flag and bisect: everything one run of `flake-regression.yml` does. */
export const runInvocation = async (options: InvocationOptions, deps: InvocationDeps): Promise<InvocationResult> => {
  const { github } = deps;
  const log =
    deps.log ??
    ((line: string) => {
      console.error(line);
    });
  const state = await deps.store.read();
  if (!state) {
    return { candidates: [], issues: new Map(), markdown: '## Flaky regressions (FQ-12)\n\nNo ledger state yet.\n' };
  }
  const detected = detectRegressions(state);
  const named = options.id === undefined ? undefined : state.identities[options.id];
  if (options.id !== undefined && !named) {
    throw new Error(`no identity ${JSON.stringify(options.id)} in the ledger state`);
  }
  const manual = options.id !== undefined && named ? manualCandidate(options.id, named) : undefined;
  const candidates = options.id === undefined ? detected : manual ? [manual] : [];
  const lines = [
    '## Flaky regressions (FQ-12)',
    '',
    `${detected.length} flaky-regression candidates in the ledger (a test with ${'≥'}300 stable executions that meets the entry rule). ` +
      'None is quarantined automatically; each is flagged for the operator and bisected under stress.',
    '',
    ...detected.map(
      (candidate) =>
        `- ${candidate.id.replaceAll('`', "'")}: ${candidate.stableBefore} stable executions, then ${candidate.events.length} events from ${candidate.onset.at.slice(0, 16)}Z (run ${candidate.onset.failedRun})`,
    ),
  ];
  const issues = new Map<string, number>();
  if (options.dryRun) {
    lines.push('', 'Dry run: no issue, comment or dispatch.');
    return { candidates, issues, markdown: `${lines.join('\n')}\n` };
  }

  let chosen: { candidate: RegressionCandidate; issue: number } | undefined;
  for (const candidate of candidates.slice(0, maximumIssues)) {
    // oxlint-disable-next-line no-await-in-loop -- issues are flagged one at a time
    const issue = await flagIssue(github, candidate);
    issues.set(candidate.id, issue);
    if (chosen) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    const recorded = bisectRecorded(await issueComments(github, issue), candidate.onset.failedRun, deps.now());
    if (recorded === undefined || options.id !== undefined) {
      chosen = { candidate, issue };
    } else {
      log(`${candidate.id}: bisect ${recorded} on #${issue}`);
    }
  }
  if (!chosen) {
    lines.push('', 'No candidate waits for a bisect.');
    return { candidates, issues, markdown: `${lines.join('\n')}\n` };
  }

  const { result, comment: body } = await bisectCandidate(chosen, options, deps);
  lines.push(
    '',
    `Bisected ${chosen.candidate.id.replaceAll('`', "'")} on #${chosen.issue}: ${result.outcome}${result.culprit ? ` ${result.culprit}` : ''}.`,
  );
  return {
    candidates,
    issues,
    bisected: { id: chosen.candidate.id, issue: chosen.issue, result, comment: body },
    markdown: `${lines.join('\n')}\n`,
  };
};

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        'state-file': { type: 'string', default: '' },
        'state-branch': { type: 'string', default: stateBranch },
        id: { type: 'string', default: '' },
        good: { type: 'string', default: '' },
        bad: { type: 'string', default: '' },
        modes: { type: 'string', default: defaultModes },
        'dry-run': { type: 'boolean', default: false },
        summary: { type: 'string', default: process.env['GITHUB_STEP_SUMMARY'] ?? '' },
        'max-requests': { type: 'string', default: '3000' },
      },
    }));
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  const token = process.env['GITHUB_TOKEN'];
  const maxRequests = Number(values['max-requests']);
  const sha = /^[\da-f]{40}$/u;
  if (
    !token ||
    !Number.isInteger(maxRequests) ||
    maxRequests <= 0 ||
    (values.good !== '' && !sha.test(values.good)) ||
    (values.bad !== '' && !sha.test(values.bad)) ||
    !/^[\w:,\s-]+$/u.test(values.modes)
  ) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/flake-regression-cli.ts [--state-file <path>] [--id <identity>] [--good <sha>] [--bad <sha>] [--modes <modes>] [--dry-run]',
    );
    return 2;
  }
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const store = values['state-file'] ? fileStore(values['state-file']) : branchStore(github, values['state-branch']);
  const workflow = 'flake-repro.yml';
  const result = await runInvocation(
    {
      id: values.id === '' ? undefined : values.id,
      good: values.good === '' ? undefined : values.good,
      bad: values.bad === '' ? undefined : values.bad,
      modes: values.modes,
      dryRun: values['dry-run'],
    },
    {
      github,
      store,
      roots: projectRoots(process.cwd()),
      prober: (identity) =>
        reproProber({
          github,
          identity,
          dispatch: dispatchWith({ api, token, repository, workflow }),
          readReport: unzipReport,
          sleep: async (minutes) => {
            await sleepFor(minutes * 60_000);
          },
          now: () => new Date(),
          workflow,
        }),
      now: () => new Date(),
    },
  );
  console.log(result.markdown);
  if (values.summary) {
    await appendFile(values.summary, result.markdown);
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
