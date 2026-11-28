/**
 * Flake ledger v2 ingestion: the IO half (`ci-flake-ledger-state.ts` holds the logic). FQ-2 of the CI flake
 * quarantine blueprint (Brain `research/ci-flake-quarantine-blueprint.md`, D2 and D3).
 *
 * Reads the ledger state from the `flake-ledger` branch, lists the completed `ci.yml` runs of the merge queue and of
 * pushes to `--branch` from the last `--lookback-hours` that it has not ingested at their current attempt (or the
 * runs named by `--runs`), downloads each run's `test-outcomes-*` artifacts, counts their outcome rows into the state,
 * confirms lineage pairs through compares, counts the shadow rows' runs (FQ-13, `ci-shadow-rows.ts`; the rows are read
 * from the `project.json` files under `--root`), counts each quarantined test's gating executions toward its release
 * bar (FQ-9, `ci-flake-quarantine-release.ts`; the entries are the `quarantine.json` files under `--root`), drops the
 * events `flake-ledger.json` `retractions` names (`applyRetractions`), and writes the state back as one commit on the branch. A run it did not
 * reach (`--max-runs`, the request budget) is left for the next invocation, which looks back over the same hours, so
 * a `workflow_run` the concurrency group dropped is caught up by the next one or by the daily schedule.
 *
 * The commit's parent is the state it read and the ref moves only fast-forward, so a concurrent writer makes this
 * one fail instead of losing its update. `flake-ledger.yml` runs it; it posts nothing.
 *
 * Usage: node scripts/src/ci-flake-ledger-ingest-cli.ts [--runs "<id> <id>"] [--lookback-hours 72] [--max-runs 40]
 *          [--workflow ci.yml] [--branch main] [--state-branch flake-ledger] [--state-file <path>]
 *          [--ledger scripts/src/flake-ledger.json] [--root .] [--summary <file>] [--max-requests 4000]
 * `--state-file` reads and writes a local file instead of the branch (a replay; nothing is written to GitHub).
 * Env: GITHUB_TOKEN (`actions: read`; `contents: write` to update the branch), GITHUB_REPOSITORY (default
 * taucad/tau), GITHUB_API_URL.
 * With `GITHUB_OUTPUT` set it writes `complete`: `true` when every pending run of the lookback was counted (never for
 * `--runs`), which the release step needs before it releases anything.
 * Exit codes: 0 ingested, or nothing to ingest; 1 API failure (what was counted before it is still written), or the
 * branch moved while this ran; 2 usage, or an
 * invalid `flake-ledger.json`; 3 state written, but outcome lines were rejected (unknown schema or malformed).
 */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { client, listRuns } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { ledgerProblems } from '#ci-flake-ledger.js';
import type { ComparedFile, Ledger } from '#ci-flake-ledger.js';
import {
  applyAliases,
  applyRetractions,
  confirmLineage,
  emptyState,
  ingestRun,
  isInherited,
  isIngested,
  lineageConfirmed,
  parseOutcomes,
  pruneState,
  renderLedgerMarkdown,
  summarizeLedger,
} from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IngestRun, LedgerState, LineageCandidate, OutcomeRow } from '#ci-flake-ledger-state.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import { readWorkspace } from '#ci-flake-quarantine-entry-cli.js';
import {
  countQuarantineRun,
  openQuarantineTracks,
  quarantinedTests,
  retainQuarantineTracks,
} from '#ci-flake-quarantine-release.js';
import { countShadowRun, readShadowRegistry, renderShadowMarkdown, retainShadowRows } from '#ci-shadow-rows.js';

/** The outcome artifacts FQ-1's test lanes upload: `test-outcomes-<lane>`. */
export const artifactPrefix = 'test-outcomes-';
/** The outcome artifacts of the non-gating shadow rows (DC-25): `test-outcomes-shadow-<suite>`. */
export const shadowArtifactPrefix = `${artifactPrefix}shadow-`;
/** The largest unzipped outcome text one artifact may hold. */
const maximumArtifactBytes = 512 * 1024 * 1024;

/**
 * The rows of one artifact as the ledger counts them: a shadow row (DC-25) gates nothing, so its rows are marked and
 * their events never count toward the entry rule (FQ-6).
 */
export const artifactRows = (name: string, rows: readonly OutcomeRow[]): OutcomeRow[] =>
  name.startsWith(shadowArtifactPrefix) ? rows.map((row) => ({ ...row, shadow: true })) : [...rows];

type Artifact = { readonly id: number; readonly name: string; readonly expired: boolean };

const listArtifacts = async (github: Client, runId: number): Promise<Artifact[]> => {
  const artifacts: Artifact[] = [];
  for (let page = 1; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order until the count is reached
    const body = await github.get<{ total_count: number; artifacts: Artifact[] }>(
      `/repos/${github.repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
    );
    artifacts.push(...body.artifacts);
    if (body.artifacts.length === 0 || artifacts.length >= body.total_count) {
      return artifacts;
    }
  }
};

/** The outcome text of one artifact: every `*.outcomes.jsonl` in its zip, concatenated. */
const readArtifact = async (github: Client, artifact: Artifact, directory: string): Promise<string> => {
  const zip = join(directory, `${artifact.id}.zip`);
  await writeFile(zip, await github.getBytes(`/repos/${github.repository}/actions/artifacts/${artifact.id}/zip`));
  try {
    // `-p` writes the members to stdout and nothing to disk; the pattern keeps anything else in the zip out.
    return execFileSync('unzip', ['-p', zip, '*.outcomes.jsonl'], {
      encoding: 'utf8',
      maxBuffer: maximumArtifactBytes,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    // `unzip` exits 11 when no member matches: an artifact with no outcome file holds no rows.
    if ((error as { status?: number }).status === 11) {
      return '';
    }
    throw error;
  } finally {
    await rm(zip, { force: true });
  }
};

type Compares = {
  readonly github: Client;
  readonly cache: Map<string, Promise<ComparedFile[] | undefined>>;
};

type RunOutcomes = { readonly artifacts: number; readonly rows: OutcomeRow[]; readonly problems: string[] };

/** Every outcome row of a run's `test-outcomes-*` artifacts, and the lines that were not a valid row. */
const readRun = async (github: Client, runId: number, directory: string): Promise<RunOutcomes> => {
  const listed = await listArtifacts(github, runId);
  const artifacts = listed.filter((artifact) => artifact.name.startsWith(artifactPrefix) && !artifact.expired);
  const rows: OutcomeRow[] = [];
  const problems: string[] = [];
  for (const artifact of artifacts) {
    // oxlint-disable-next-line no-await-in-loop -- one artifact at a time keeps memory to one zip
    const parsed = parseOutcomes(await readArtifact(github, artifact, directory), `${runId}/${artifact.name}`);
    rows.push(...artifactRows(artifact.name, parsed.rows));
    problems.push(...parsed.problems);
  }
  return { artifacts: artifacts.length, rows, problems };
};

const compareFiles = async (
  { github, cache }: Compares,
  base: string | undefined,
  head: string | undefined,
): Promise<ComparedFile[] | undefined> => {
  if (!base || !head) {
    return undefined;
  }
  const key = `${base}...${head}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const fetchFiles = async (): Promise<ComparedFile[] | undefined> => {
    try {
      const body = await github.get<{ files?: ComparedFile[] }>(
        `/repos/${github.repository}/compare/${key}?per_page=300`,
      );
      return (body.files ?? []).map((file) => ({ filename: file.filename, sha: file.sha }));
    } catch {
      // A commit GitHub no longer has leaves the pair unconfirmed.
      return undefined;
    }
  };
  const pending = fetchFiles();
  cache.set(key, pending);
  return pending;
};

/** Confirm one lineage candidate through compares; the event when it became one. */
const confirmCandidate = async (
  compares: Compares,
  state: LedgerState,
  candidate: LineageCandidate,
): Promise<FlakeEvent | undefined> => {
  if (candidate.pass.kind === 'queue') {
    if (isInherited(state, candidate)) {
      return undefined;
    }
    const [failed, passed] = await Promise.all([
      compareFiles(compares, candidate.failure.base, candidate.failure.sha),
      compareFiles(compares, candidate.pass.base, candidate.pass.sha),
    ]);
    return lineageConfirmed(candidate, { failed, passed }) ? confirmLineage(state, candidate) : undefined;
  }
  const between = await compareFiles(compares, candidate.failure.sha, candidate.pass.sha);
  return lineageConfirmed(candidate, { between }) ? confirmLineage(state, candidate) : undefined;
};

const runsToIngest = async (
  github: Client,
  options: { workflow: string; branch: string; lookbackHours: number; runs: readonly number[]; now: Date },
): Promise<IngestRun[]> => {
  if (options.runs.length > 0) {
    return Promise.all(
      options.runs.map(async (id) => github.get<IngestRun>(`/repos/${github.repository}/actions/runs/${id}`)),
    );
  }
  const window = {
    from: new Date(options.now.getTime() - options.lookbackHours * 60 * 60 * 1000).toISOString().slice(0, 19) + 'Z',
    to: options.now.toISOString().slice(0, 19) + 'Z',
  };
  const [queue, push] = await Promise.all([
    listRuns(github, { workflow: options.workflow, event: 'merge_group', status: 'completed', ...window }),
    listRuns(github, { workflow: options.workflow, event: 'push', status: 'completed', ...window }),
  ]);
  return [...queue, ...push.filter((run) => run.head_branch === options.branch)] as IngestRun[];
};

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        runs: { type: 'string', default: '' },
        'lookback-hours': { type: 'string', default: '72' },
        'max-runs': { type: 'string', default: '40' },
        workflow: { type: 'string', default: 'ci.yml' },
        branch: { type: 'string', default: 'main' },
        'state-branch': { type: 'string', default: stateBranch },
        'state-file': { type: 'string', default: '' },
        ledger: { type: 'string', default: 'scripts/src/flake-ledger.json' },
        root: { type: 'string', default: '.' },
        summary: { type: 'string', default: process.env['GITHUB_STEP_SUMMARY'] ?? '' },
        'max-requests': { type: 'string', default: '4000' },
      },
    }));
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  const lookbackHours = Number(values['lookback-hours']);
  const maxRuns = Number(values['max-runs']);
  const maxRequests = Number(values['max-requests']);
  const runIds = values.runs
    .split(/[\s,]+/u)
    .filter((entry) => entry !== '')
    .map(Number);
  const token = process.env['GITHUB_TOKEN'];
  if (
    !token ||
    !(lookbackHours > 0) ||
    !Number.isInteger(maxRuns) ||
    maxRuns <= 0 ||
    !Number.isInteger(maxRequests) ||
    maxRequests <= 0 ||
    runIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/ci-flake-ledger-ingest-cli.ts [--runs "<id> <id>"] [--lookback-hours <n>] [--max-runs <n>] [--state-file <path>]',
    );
    return 2;
  }
  const ledger = JSON.parse(await readFile(resolve(values.ledger), 'utf8')) as Ledger;
  const problems = ledgerProblems(ledger);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 2;
  }
  const aliases = ledger.aliases ?? [];
  const shadow = await readShadowRegistry(resolve(values.root));
  const shadowTargets = new Set(shadow.rows.map((row) => `${row.project}:${row.target}`));
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const store = values['state-file']
    ? fileStore(resolve(values['state-file']))
    : branchStore(github, values['state-branch']);
  const now = new Date();
  // The entries on `main` whose gating executions count toward the release bar (FQ-9).
  const quarantined = quarantinedTests(await readWorkspace(resolve(values.root)), now.toISOString().slice(0, 10));

  const existing = await store.read();
  const state = existing ?? emptyState(now);
  const folded = applyAliases(state, aliases);
  // An entry seen on `main` for the first time counts only runs created from now on.
  const openedTracks = openQuarantineTracks(state, quarantined, now.toISOString());
  const listed = await runsToIngest(github, {
    workflow: values.workflow,
    branch: values.branch,
    lookbackHours,
    runs: runIds,
    now,
  });
  const pending = [...new Map(listed.map((run) => [run.id, run])).values()]
    .filter((run) => run.status === 'completed' && !isIngested(state, run.id, run.run_attempt ?? 1))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const batch = pending.slice(0, maxRuns);
  console.error(`${pending.length} runs to ingest; this invocation takes ${batch.length}`);

  const directory = await mkdtemp(join(tmpdir(), 'flake-ledger-'));
  const compares: Compares = { github, cache: new Map() };
  const events: Array<{ id: string; event: FlakeEvent }> = [];
  const rejectedLines: string[] = [];
  const ingested: number[] = [];
  let failed = false;
  try {
    for (const run of batch) {
      // Runs are counted in order, since a run's passes close the failures of the runs before it.
      if (github.budget() <= 0) {
        console.error('The request budget ran out; the remaining runs are left for the next invocation');
        break;
      }
      let read: RunOutcomes;
      try {
        // oxlint-disable-next-line no-await-in-loop -- runs are ingested in order
        read = await readRun(github, run.id, directory);
      } catch (error) {
        // What was counted so far is still written; this run and the ones after it wait for the next invocation.
        console.error(`Run ${run.id}: ${error instanceof Error ? error.message : String(error)}`);
        failed = true;
        break;
      }
      const { artifacts, rows, problems } = read;
      const rejected = problems.length;
      rejectedLines.push(...problems.slice(0, 20));
      // Before `ingestRun`, which records the attempt as ingested.
      countShadowRun(state, { run, rows, registry: shadow.rows });
      // Only the gating runs the discovery would list count toward a release bar: a `--runs` backfill may name others.
      if (run.event === 'merge_group' || (run.event === 'push' && run.head_branch === values.branch)) {
        countQuarantineRun(state, { run, rows, tests: quarantined, shadowTargets, unreadable: rejected > 0 });
      }
      const result = ingestRun(state, { run, rows, artifacts, rejected, aliases });
      events.push(...result.events);
      for (const candidate of result.candidates) {
        // oxlint-disable-next-line no-await-in-loop -- a confirmation belongs to the run just counted
        const event = await confirmCandidate(compares, state, candidate);
        if (event) {
          events.push({ id: candidate.id, event });
        }
      }
      ingested.push(run.id);
      console.error(
        `Run ${run.id} attempt ${run.run_attempt ?? 1}: ${artifacts} artifacts, ${result.record.counted} executions, ` +
          `${result.record.replayed} replayed, ${rejected} rejected, ${result.events.length} events`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  // After the runs, so an event a `--runs` backfill records again from before a retraction's cut-off is dropped too.
  const retractions = applyRetractions(state, ledger.retractions ?? [], { now, aliases });
  const retracted = retractions.filter((result) => result.events > 0);
  pruneState(state, now);
  retainShadowRows(state, shadow.rows);
  const droppedTracks = retainQuarantineTracks(state, quarantined);
  if (
    !existing ||
    ingested.length > 0 ||
    folded.length > 0 ||
    retracted.length > 0 ||
    droppedTracks.length > 0 ||
    openedTracks.length > 0
  ) {
    state.updatedAt = now.toISOString();
    const message = [
      `chore(flake-ledger): Ingest ${ingested.length} CI runs`,
      '',
      ...(ingested.length > 0 ? [`Runs: ${ingested.join(', ')}.`] : []),
      ...(folded.length > 0 ? [`Folded by alias: ${folded.join('; ')}.`] : []),
      ...retracted.map(
        (result) =>
          `Retracted ${result.events} events and ${result.retriedPasses} retried passes of ${result.identity} (before ${result.before}).`,
      ),
      `Events: ${events.length}.`,
    ].join('\n');
    const written = await store.write(state, message);
    console.error(`Wrote the ledger state: ${written}`);
  }

  const batchFrom = batch[0]?.updated_at ?? now.toISOString();
  const markdown = [
    renderLedgerMarkdown(summarizeLedger(state, { from: batchFrom, to: now.toISOString() })),
    renderShadowMarkdown(state, shadow),
    `This invocation: ${ingested.length} of ${pending.length} pending runs ingested, ${events.length} new events` +
      `${folded.length > 0 ? `, ${folded.length} renamed identities folded` : ''}.`,
    ...retractions
      .filter((result) => result.events > 0 || result.unknown)
      .map((result) =>
        result.unknown
          ? `- Retraction of ${result.identity.replaceAll('`', "'")}: no such identity in the state; nothing dropped.`
          : `- Retracted ${result.events} events and ${result.retriedPasses} retried passes of ${result.identity.replaceAll('`', "'")} (before ${result.before}).`,
      ),
    ...events
      .slice(0, 50)
      .map(({ id, event }) => `- \`${event.kind}\` ${id.replaceAll('`', "'")} (${event.variant}, run ${event.run})`),
    ...(rejectedLines.length > 0
      ? ['', '### Rejected outcome lines', '', ...rejectedLines.slice(0, 20).map((line) => `- ${line}`)]
      : []),
    '',
  ].join('\n');
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  // Whether every pending run was counted: the release step releases nothing on a partial count, which may miss a
  // newer failure of a test it would release (FQ-9).
  // A `--runs` backfill is never complete: a newer run it did not name may hold a failure.
  const complete = !failed && runIds.length === 0 && ingested.length === pending.length;
  if (process.env['GITHUB_OUTPUT']) {
    await appendFile(process.env['GITHUB_OUTPUT'], `complete=${String(complete)}\n`);
  }
  if (failed) {
    return 1;
  }
  return rejectedLines.length > 0 ? 3 : 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
