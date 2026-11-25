/**
 * Flake ledger v2 ingestion: the IO half (`ci-flake-ledger-state.ts` holds the logic). FQ-2 of the CI flake
 * quarantine blueprint (Brain `research/ci-flake-quarantine-blueprint.md`, D2 and D3).
 *
 * Reads the ledger state from the `flake-ledger` branch, lists the completed `ci.yml` runs of the merge queue and of
 * pushes to `--branch` from the last `--lookback-hours` that it has not ingested at their current attempt (or the
 * runs named by `--runs`), downloads each run's `test-outcomes-*` artifacts, counts their outcome rows into the state,
 * confirms lineage pairs through compares, and writes the state back as one commit on the branch. A run it did not
 * reach (`--max-runs`, the request budget) is left for the next invocation, which looks back over the same hours, so
 * a `workflow_run` the concurrency group dropped is caught up by the next one or by the daily schedule.
 *
 * The commit's parent is the state it read and the ref moves only fast-forward, so a concurrent writer makes this
 * one fail instead of losing its update. `flake-ledger.yml` runs it; it posts nothing.
 *
 * Usage: node scripts/src/ci-flake-ledger-ingest-cli.ts [--runs "<id> <id>"] [--lookback-hours 72] [--max-runs 40]
 *          [--workflow ci.yml] [--branch main] [--state-branch flake-ledger] [--state-file <path>]
 *          [--ledger scripts/src/flake-ledger.json] [--summary <file>] [--max-requests 4000]
 * `--state-file` reads and writes a local file instead of the branch (a replay; nothing is written to GitHub).
 * Env: GITHUB_TOKEN (`actions: read`; `contents: write` to update the branch), GITHUB_REPOSITORY (default
 * taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 ingested, or nothing to ingest; 1 API failure, or the branch moved while this ran; 2 usage, or an
 * invalid `flake-ledger.json`; 3 state written, but outcome lines were rejected (unknown schema or malformed).
 */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { client, GitHubError, listRuns } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { ledgerProblems } from '#ci-flake-ledger.js';
import type { ComparedFile, Ledger } from '#ci-flake-ledger.js';
import {
  applyAliases,
  confirmLineage,
  emptyState,
  ingestRun,
  isInherited,
  isIngested,
  lineageConfirmed,
  parseOutcomes,
  parseState,
  pruneState,
  renderLedgerMarkdown,
  serializeState,
  summarizeLedger,
} from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IngestRun, LedgerState, LineageCandidate } from '#ci-flake-ledger-state.js';

/** The state document's path on the state branch. */
export const statePath = 'ledger.json';
/** The outcome artifacts FQ-1's test lanes upload: `test-outcomes-<lane>`. */
export const artifactPrefix = 'test-outcomes-';
/** The largest unzipped outcome text one artifact may hold. */
const maximumArtifactBytes = 512 * 1024 * 1024;

const readme = `# Flake ledger state

Written only by \`.github/workflows/flake-ledger.yml\` on \`main\` (\`scripts/src/ci-flake-ledger-ingest-cli.ts\`).
\`${statePath}\` is the per-test history of the flake ledger: executions, failures, flake events, variants, first and
last seen, built from the \`test-outcomes-*\` artifacts of merge-queue and \`main\` runs of \`ci.yml\`. Each commit is
one ingestion; its parent is the state it read. The schema is \`LedgerState\` in
\`scripts/src/ci-flake-ledger-state.ts\`. Do not edit or push this branch by hand: change the code on \`main\`.
`;

type StateStore = {
  readonly read: () => Promise<LedgerState | undefined>;
  readonly write: (state: LedgerState, message: string) => Promise<string>;
};

/** The state on a branch, through the Git data API. */
export const branchStore = (github: Client, branch: string): StateStore => {
  let parent: string | undefined;
  return {
    async read() {
      try {
        const ref = await github.get<{ object: { sha: string } }>(
          `/repos/${github.repository}/git/ref/heads/${encodeURIComponent(branch)}`,
        );
        parent = ref.object.sha;
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) {
          return undefined;
        }
        throw error;
      }
      const text = await github.getText(
        `/repos/${github.repository}/contents/${statePath}?ref=${parent}`,
        'application/vnd.github.raw+json',
      );
      return parseState(text);
    },
    async write(state, message) {
      const repo = `/repos/${github.repository}`;
      const blob = await github.send<{ sha: string }>('POST', `${repo}/git/blobs`, {
        content: serializeState(state),
        encoding: 'utf-8',
      });
      const files = [{ path: statePath, mode: '100644', type: 'blob', sha: blob.sha }];
      let baseTree: string | undefined;
      if (parent) {
        baseTree = (await github.get<{ tree: { sha: string } }>(`${repo}/git/commits/${parent}`)).tree.sha;
      } else {
        const readmeBlob = await github.send<{ sha: string }>('POST', `${repo}/git/blobs`, {
          content: readme,
          encoding: 'utf-8',
        });
        files.push({ path: 'README.md', mode: '100644', type: 'blob', sha: readmeBlob.sha });
      }
      const tree = await github.send<{ sha: string }>('POST', `${repo}/git/trees`, {
        ...(baseTree ? { base_tree: baseTree } : {}),
        tree: files,
      });
      const commit = await github.send<{ sha: string }>('POST', `${repo}/git/commits`, {
        message,
        tree: tree.sha,
        parents: parent ? [parent] : [],
      });
      await (parent
        ? github.send('PATCH', `${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
            sha: commit.sha,
            force: false,
          })
        : github.send('POST', `${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha }));
      parent = commit.sha;
      return commit.sha;
    },
  };
};

/** The state in a local file, for a replay. */
const fileStore = (path: string): StateStore => ({
  async read() {
    try {
      return parseState(await readFile(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  },
  async write(state) {
    await writeFile(path, serializeState(state));
    return path;
  },
});

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

const compareFiles = async (
  github: Client,
  cache: Map<string, Promise<ComparedFile[] | undefined>>,
  base: string | null,
  head: string | null,
): Promise<ComparedFile[] | undefined> => {
  if (!base || !head) {
    return undefined;
  }
  const key = `${base}...${head}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const pending = github
    .get<{ files?: ComparedFile[] }>(`/repos/${github.repository}/compare/${key}?per_page=300`)
    .then((body) => (body.files ?? []).map((file) => ({ filename: file.filename, sha: file.sha })))
    .catch(() => undefined);
  cache.set(key, pending);
  return pending;
};

/** Confirm one lineage candidate through compares; true when it became an event. */
const confirmCandidate = async (
  github: Client,
  cache: Map<string, Promise<ComparedFile[] | undefined>>,
  state: LedgerState,
  candidate: LineageCandidate,
): Promise<FlakeEvent | undefined> => {
  if (candidate.pass.kind === 'queue') {
    if (isInherited(state, candidate)) {
      return undefined;
    }
    const [failed, passed] = await Promise.all([
      compareFiles(github, cache, candidate.failure.base, candidate.failure.sha),
      compareFiles(github, cache, candidate.pass.base, candidate.pass.sha),
    ]);
    return lineageConfirmed(candidate, { failed, passed }) ? confirmLineage(state, candidate) : undefined;
  }
  const between = await compareFiles(github, cache, candidate.failure.sha, candidate.pass.sha);
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
        'state-branch': { type: 'string', default: 'flake-ledger' },
        'state-file': { type: 'string', default: '' },
        ledger: { type: 'string', default: 'scripts/src/flake-ledger.json' },
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
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const store = values['state-file'] ? fileStore(resolve(values['state-file'])) : branchStore(github, values['state-branch']);
  const now = new Date();

  const existing = await store.read();
  const state = existing ?? emptyState(now);
  const folded = applyAliases(state, aliases);
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
  const compares = new Map<string, Promise<ComparedFile[] | undefined>>();
  const events: Array<{ id: string; event: FlakeEvent }> = [];
  const rejectedLines: string[] = [];
  const ingested: number[] = [];
  try {
    for (const run of batch) {
      // Runs are counted in order, since a run's passes close the failures of the runs before it.
      if (github.budget() <= 0) {
        console.error('The request budget ran out; the remaining runs are left for the next invocation');
        break;
      }
      // oxlint-disable-next-line no-await-in-loop -- runs are ingested in order
      const artifacts = (await listArtifacts(github, run.id)).filter(
        (artifact) => artifact.name.startsWith(artifactPrefix) && !artifact.expired,
      );
      const rows = [];
      let rejected = 0;
      for (const artifact of artifacts) {
        // oxlint-disable-next-line no-await-in-loop -- one artifact at a time keeps memory to one zip
        const parsed = parseOutcomes(await readArtifact(github, artifact, directory), `${run.id}/${artifact.name}`);
        rows.push(...parsed.rows);
        rejected += parsed.problems.length;
        rejectedLines.push(...parsed.problems.slice(0, 20));
      }
      const result = ingestRun(state, { run, rows, artifacts: artifacts.length, rejected, aliases });
      events.push(...result.events);
      for (const candidate of result.candidates) {
        // oxlint-disable-next-line no-await-in-loop -- a confirmation belongs to the run just counted
        const event = await confirmCandidate(github, compares, state, candidate);
        if (event) {
          events.push({ id: candidate.id, event });
        }
      }
      ingested.push(run.id);
      console.error(
        `Run ${run.id} attempt ${run.run_attempt ?? 1}: ${artifacts.length} artifacts, ${result.record.counted} executions, ` +
          `${result.record.replayed} replayed, ${rejected} rejected, ${result.events.length} events`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  pruneState(state, now);
  if (!existing || ingested.length > 0 || folded.length > 0) {
    state.updatedAt = now.toISOString();
    const message = [
      `chore(flake-ledger): Ingest ${ingested.length} CI runs`,
      '',
      ...(ingested.length > 0 ? [`Runs: ${ingested.join(', ')}.`] : []),
      ...(folded.length > 0 ? [`Folded by alias: ${folded.join('; ')}.`] : []),
      `Events: ${events.length}.`,
    ].join('\n');
    const written = await store.write(state, message);
    console.error(`Wrote the ledger state: ${written}`);
  }

  const batchFrom = batch[0]?.updated_at ?? now.toISOString();
  const markdown = [
    renderLedgerMarkdown(summarizeLedger(state, { from: batchFrom, to: now.toISOString() })),
    `This invocation: ${ingested.length} of ${pending.length} pending runs ingested, ${events.length} new events` +
      `${folded.length > 0 ? `, ${folded.length} renamed identities folded` : ''}.`,
    ...events.slice(0, 50).map(({ id, event }) => `- \`${event.kind}\` ${id.replaceAll('`', "'")} (${event.variant}, run ${event.run})`),
    ...(rejectedLines.length > 0
      ? ['', '### Rejected outcome lines', '', ...rejectedLines.slice(0, 20).map((line) => `- ${line}`)]
      : []),
    '',
  ].join('\n');
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
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
