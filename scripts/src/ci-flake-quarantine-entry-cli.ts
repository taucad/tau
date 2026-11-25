/**
 * Quarantine entry: the IO half of `ci-flake-quarantine-entry.ts` (FQ-6 of the CI flake quarantine blueprint, Brain
 * `research/ci-flake-quarantine-blueprint.md`, D5 and D8; testing policy § 16.3). `flake-ledger.yml` runs it after
 * each ingestion.
 *
 * It reads the ledger state from the `flake-ledger` branch, the projects and `quarantine.json` files of the checkout,
 * and the `quarantine.json` files of every open entry branch (`flake-quarantine/*`), and plans the entries. It checks
 * the proposed tree with `validate-quarantine`'s rules, dropping an entry the validator rejects. It then opens or
 * links one owner issue per admitted test (and per never-quarantine offender, which keeps gating), pushes one branch
 * that changes only `quarantine.json` files, opens the pull request and, when the proposed tree validates and touches
 * nothing else, enables squash auto-merge so it lands through the merge queue (blueprint O2).
 *
 * A token that may not open pull requests (the Actions `GITHUB_TOKEN` when the repository does not allow Actions to
 * create them) still pushes the branch and the issues: each issue then names the branch to open. Any token works; the
 * pull request starts CI only when its author is not the Actions token.
 *
 * Usage: node scripts/src/ci-flake-quarantine-entry-cli.ts [--dry-run] [--offline] [--state-file <path>]
 *          [--state-branch flake-ledger] [--ledger scripts/src/flake-ledger.json] [--base main] [--today YYYY-MM-DD]
 *          [--owner rifont] [--out <dir>] [--summary <file>] [--max-requests 1500]
 * `--dry-run` writes nothing to GitHub; `--out` writes the proposed `quarantine.json` files under a directory.
 * `--offline` (with `--state-file`) reads nothing from GitHub either: no open entry branches, test files from disk.
 * Env: GITHUB_TOKEN (`contents: write`, `issues: write`, `pull-requests: write`; read-only for a dry run),
 * GITHUB_REPOSITORY (default taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 done, or nothing to enter; 1 API failure; 2 usage, or an invalid `flake-ledger.json`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { parseQuarantine, splitTest, utcDay } from '@taucad/vitest-ci/quarantine';

import { client, GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { ledgerProblems } from '#ci-flake-ledger.js';
import type { Ledger } from '#ci-flake-ledger.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import {
  entryBranchPrefix,
  flakeLabel,
  identityMarker,
  issueBody,
  issueTitle,
  planEntries,
  pullRequestBody,
  pullRequestTitle,
  quarantinePath,
  renderPlanMarkdown,
  renderQuarantine,
} from '#ci-flake-quarantine-entry.js';
import type {
  EntryPlan,
  Offender,
  PlannedEntry,
  QuarantineText,
  Refusal,
  WorkspaceProject,
} from '#ci-flake-quarantine-entry.js';
import { quarantineProblems } from '#validate-quarantine.js';
import type { QuarantineSource } from '#validate-quarantine.js';

/** The checkout's projects and `quarantine.json` files. */
export type Workspace = {
  readonly projects: ReadonlyMap<string, WorkspaceProject>;
  readonly quarantines: readonly QuarantineText[];
};

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The projects (`project.json`) and quarantine files of a checkout, sparse or not: git lists what the disk lacks. */
export const readWorkspace = async (root: string): Promise<Workspace> => {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '*project.json', '*quarantine.json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter((path) => path !== '');
  const projects = new Map<string, WorkspaceProject>();
  const quarantines: QuarantineText[] = [];
  for (const path of tracked) {
    const file = join(root, path);
    if (!existsSync(file)) {
      continue;
    }
    const directory = posix.dirname(path) === '.' ? '' : posix.dirname(path);
    if (baseName(path) === 'project.json') {
      // oxlint-disable-next-line no-await-in-loop -- a few hundred small files, read in order
      const parsed = JSON.parse(await readFile(file, 'utf8')) as { name?: unknown; tags?: unknown };
      const name = typeof parsed.name === 'string' ? parsed.name : directory;
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      projects.set(name, { name, root: directory, tags });
    } else if (baseName(path) === 'quarantine.json') {
      // oxlint-disable-next-line no-await-in-loop -- at most a few dozen files
      quarantines.push({ path, text: await readFile(file, 'utf8') });
    }
  }
  return { projects, quarantines };
};

type Ref = { readonly ref: string; readonly object: { readonly sha: string } };
type Pull = { readonly number: number; readonly state: string; readonly merged_at?: string | null };
type ComparedFile = { readonly filename: string; readonly status: string };

/**
 * The `quarantine.json` files of every entry branch still in play: one with an open pull request, or with none yet.
 * A branch whose pull request was closed or merged holds nothing pending.
 */
export const readPending = async (github: Client, base: string): Promise<QuarantineText[]> => {
  const repo = `/repos/${github.repository}`;
  const prefix = `refs/heads/${entryBranchPrefix}`;
  const refs = (await github.get<Ref[]>(`${repo}/git/matching-refs/${prefix.slice('refs/'.length, -1)}`)).filter(
    (ref) => ref.ref.startsWith(prefix),
  );
  const owner = github.repository.split('/')[0] ?? '';
  const pending: QuarantineText[] = [];
  for (const ref of refs) {
    const branch = ref.ref.replace(/^refs\/heads\//u, '');
    // oxlint-disable-next-line no-await-in-loop -- few branches, read in order
    const pulls = await github.get<Pull[]>(
      `${repo}/pulls?state=all&per_page=10&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    );
    if (pulls.some((pull) => pull.state === 'closed')) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one compare per branch
    const compare = await github.get<{ files?: ComparedFile[] }>(
      `${repo}/compare/${encodeURIComponent(base)}...${ref.object.sha}?per_page=100`,
    );
    for (const file of compare.files ?? []) {
      if (baseName(file.filename) !== 'quarantine.json' || file.status === 'removed') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
      const text = await github.getText(
        `${repo}/contents/${encodePath(file.filename)}?ref=${ref.object.sha}`,
        'application/vnd.github.raw+json',
      );
      pending.push({ path: file.filename, text });
    }
  }
  return pending;
};

/** The quarantine files after the plan: each changed path with its new text. */
export const proposedFiles = (
  quarantines: readonly QuarantineText[],
  admitted: readonly PlannedEntry[],
): QuarantineText[] => {
  const byPath = new Map<string, PlannedEntry[]>();
  for (const planned of admitted) {
    byPath.set(planned.path, [...(byPath.get(planned.path) ?? []), planned]);
  }
  return [...byPath].map(([path, entries]) => ({
    path,
    text: renderQuarantine(
      path,
      quarantines.find((file) => file.path === path)?.text,
      entries.map((planned) => planned.entry),
    ),
  }));
};

const sources = (workspace: Workspace, files: readonly QuarantineText[]): QuarantineSource[] => {
  const roots = new Map([...workspace.projects.values()].map((project) => [quarantinePath(project.root), project]));
  return files.map((file) => ({ path: file.path, project: roots.get(file.path), text: file.text }));
};

const withFiles = (base: readonly QuarantineText[], changed: readonly QuarantineText[]): QuarantineText[] => [
  ...base.filter((file) => !changed.some((other) => other.path === file.path)),
  ...changed,
];

/**
 * Check the plan with `validate-quarantine`'s rules, one admitted entry at a time: an entry that adds a problem the
 * tree on `main` does not have is refused. Returns the checked plan and the problems left on the proposed tree.
 */
export const validatePlan = (
  plan: EntryPlan,
  context: {
    readonly workspace: Workspace;
    readonly readTracked: (path: string) => string | undefined;
    readonly today: string;
  },
): { plan: EntryPlan; problems: string[] } => {
  const { workspace, readTracked, today } = context;
  // The owner issue is opened after the check; any issue number validates.
  const checked = (planned: PlannedEntry): PlannedEntry =>
    planned.entry.issue > 0 ? planned : { ...planned, entry: { ...planned.entry, issue: 1 } };
  const problemsWith = (admitted: readonly PlannedEntry[]): string[] =>
    quarantineProblems(
      sources(workspace, withFiles(workspace.quarantines, proposedFiles(workspace.quarantines, admitted.map(checked)))),
      readTracked,
      today,
    );
  const baseline = new Set(problemsWith([]));
  const admitted: PlannedEntry[] = [];
  const refused: Refusal[] = [...plan.refused];
  for (const planned of plan.admitted) {
    const added = problemsWith([...admitted, planned]).filter((problem) => !baseline.has(problem));
    if (added.length === 0) {
      admitted.push(planned);
    } else {
      refused.push({ ...planned, kind: 'invalid', reason: `validate-quarantine: ${added.join('; ')}` });
    }
  }
  return { plan: { ...plan, admitted, refused }, problems: problemsWith(admitted) };
};

/** The test files the validator reads: those of every entry on `main` and of every admitted entry. */
export const trackedPaths = (workspace: Workspace, admitted: readonly PlannedEntry[]): string[] => {
  const roots = new Map(
    [...workspace.projects.values()].map((project) => [quarantinePath(project.root), project.root]),
  );
  const paths = new Set(
    admitted.map((planned) => posix.join(planned.project.root, planned.entry.test.split(' > ')[0] ?? '')),
  );
  for (const file of workspace.quarantines) {
    const root = roots.get(file.path);
    for (const entry of parseQuarantine(file.text).entries) {
      const test = typeof entry === 'object' && entry !== null ? (entry as { test?: unknown }).test : undefined;
      const split = typeof test === 'string' ? splitTest(test) : undefined;
      if (root !== undefined && split) {
        paths.add(root === '' ? split.file : `${root}/${split.file}`);
      }
    }
  }
  return [...paths].sort();
};

type Issue = { readonly number: number; readonly body?: string | null; readonly pull_request?: unknown };

/** Open owner issues by their identity marker. */
const openIssues = async (github: Client): Promise<Map<string, number>> => {
  const byMarker = new Map<string, number>();
  for (let page = 1; page <= 10; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order
    const issues = await github.get<Issue[]>(
      `/repos/${github.repository}/issues?state=open&labels=${flakeLabel}&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      const marker = /<!-- flake-identity: [\da-f]{32} -->/u.exec(issue.body ?? '')?.[0];
      if (marker && issue.pull_request === undefined) {
        byMarker.set(marker, issue.number);
      }
    }
    if (issues.length < 100) {
      return byMarker;
    }
  }
  return byMarker;
};

const ensureLabel = async (github: Client): Promise<void> => {
  try {
    await github.get(`/repos/${github.repository}/labels/${flakeLabel}`);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) {
      throw error;
    }
    await github.send('POST', `/repos/${github.repository}/labels`, {
      name: flakeLabel,
      color: 'd93f0b',
      description: 'A flaky test: the flake ledger opened it; the flake-fixing agent works it (testing policy § 16)',
    });
  }
};

export type ApplyContext = {
  readonly base: string;
  readonly baseSha: string;
  readonly quarantines: readonly QuarantineText[];
  /** Validator problems left on the proposed tree; auto-merge only when there are none. */
  readonly problems: readonly string[];
  readonly today: string;
};

export type ApplyResult = {
  /** Issue numbers by identity. */
  readonly issues: ReadonlyMap<string, number>;
  readonly branch?: string | undefined;
  readonly pullRequest?: number | undefined;
  readonly autoMerge: boolean;
  /** One line per thing done or skipped, for the summary. */
  readonly outcome: string[];
};

/** Whether a change may merge without a person: it touches only `quarantine.json` files and validates (O2). */
export const mayAutoMerge = (paths: readonly string[], problems: readonly string[]): boolean =>
  paths.length > 0 && problems.length === 0 && paths.every((path) => baseName(path) === 'quarantine.json');

const enableAutoMerge = async (github: Client, nodeId: string): Promise<string | undefined> => {
  const response = await github.send<{ errors?: Array<{ message?: string }> }>('POST', '/graphql', {
    query:
      'mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }',
    variables: { id: nodeId },
  });
  return response.errors?.map((error) => error.message ?? 'unknown error').join('; ');
};

const comment = async (github: Client, issue: number, body: string): Promise<void> => {
  await github.send('POST', `/repos/${github.repository}/issues/${issue}/comments`, { body });
};

/** Open or link the owner issues, push the entry branch, open its pull request and enable auto-merge. */
export const applyPlan = async (github: Client, plan: EntryPlan, context: ApplyContext): Promise<ApplyResult> => {
  const repo = `/repos/${github.repository}`;
  const outcome: string[] = [];
  const issues = new Map<string, number>();
  const neverQuarantine = plan.refused.filter((refusal) => refusal.kind === 'never-quarantine');
  if (plan.admitted.length === 0 && neverQuarantine.length === 0) {
    return { issues, autoMerge: false, outcome: ['Nothing to enter.'] };
  }
  const existing = await openIssues(github);
  let labelled = false;
  const ownerIssue = async (
    offender: Offender & { readonly linkedIssue?: number | undefined },
    body: string,
  ): Promise<number> => {
    const known = offender.linkedIssue ?? existing.get(identityMarker(offender.id));
    if (known !== undefined) {
      outcome.push(`Linked owner issue #${known} for \`${offender.id.replaceAll('`', "'")}\`.`);
      return known;
    }
    if (!labelled) {
      await ensureLabel(github);
      labelled = true;
    }
    const created = await github.send<{ number: number }>('POST', `${repo}/issues`, {
      title: issueTitle(offender),
      body,
      labels: [flakeLabel],
    });
    existing.set(identityMarker(offender.id), created.number);
    outcome.push(`Opened owner issue #${created.number}.`);
    return created.number;
  };

  for (const refusal of neverQuarantine) {
    // oxlint-disable-next-line no-await-in-loop -- issues are opened one at a time
    issues.set(
      refusal.id,
      await ownerIssue(refusal, issueBody(refusal, { repository: github.repository, refusal: refusal.reason })),
    );
  }
  const admitted: PlannedEntry[] = [];
  for (const planned of plan.admitted) {
    // oxlint-disable-next-line no-await-in-loop -- issues are opened one at a time
    const issue = await ownerIssue(
      planned,
      issueBody(planned, { repository: github.repository, entry: planned.entry }),
    );
    issues.set(planned.id, issue);
    admitted.push({ ...planned, entry: { ...planned.entry, issue } });
  }
  if (admitted.length === 0) {
    return { issues, autoMerge: false, outcome };
  }

  const files = proposedFiles(context.quarantines, admitted);
  const key = createHash('sha256')
    .update(admitted.map((planned) => `${planned.path}\n${planned.entry.test}`).join('\n'))
    .digest('hex')
    .slice(0, 8);
  const branch = `${entryBranchPrefix}${context.today}-${key}`;
  try {
    await github.get(`${repo}/git/ref/heads/${encodePath(branch)}`);
    outcome.push(`Branch \`${branch}\` already exists; nothing pushed.`);
    return { issues, branch, autoMerge: false, outcome };
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) {
      throw error;
    }
  }
  const baseCommit = await github.get<{ tree: { sha: string } }>(`${repo}/git/commits/${context.baseSha}`);
  const tree = await github.send<{ sha: string }>('POST', `${repo}/git/trees`, {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the Git data API's field name
    base_tree: baseCommit.tree.sha,
    tree: files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.text })),
  });
  const title = pullRequestTitle(admitted);
  const autoMerge = mayAutoMerge(
    files.map((file) => file.path),
    context.problems,
  );
  const body = pullRequestBody(admitted, { autoMerge, problems: context.problems });
  const commit = await github.send<{ sha: string }>('POST', `${repo}/git/commits`, {
    message: `${title}\n\n${admitted.map((planned) => `- ${planned.entry.test} (#${planned.entry.issue})`).join('\n')}\n`,
    tree: tree.sha,
    parents: [context.baseSha],
  });
  await github.send('POST', `${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  outcome.push(`Pushed \`${branch}\` (${files.map((file) => `\`${file.path}\``).join(', ')}).`);

  let pull: { number: number; node_id: string } | undefined;
  try {
    pull = await github.send<{ number: number; node_id: string }>('POST', `${repo}/pulls`, {
      title,
      head: branch,
      base: context.base,
      body,
    });
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 422)) {
      throw error;
    }
    outcome.push(`Could not open the pull request (${error.message}); the owner issues name the branch to open.`);
  }
  const compare = `https://github.com/${github.repository}/compare/${context.base}...${encodePath(branch)}?expand=1`;
  let merging = false;
  if (pull) {
    outcome.push(`Opened #${pull.number}.`);
    if (autoMerge) {
      try {
        const refused = await enableAutoMerge(github, pull.node_id);
        merging = refused === undefined;
        outcome.push(merging ? 'Enabled squash auto-merge.' : `Auto-merge refused: ${refused}.`);
      } catch (error) {
        outcome.push(`Auto-merge refused: ${error instanceof Error ? error.message : String(error)}.`);
      }
    } else {
      outcome.push('Auto-merge left off: the proposed tree does not validate, or touches more than quarantine.json.');
    }
  }
  for (const planned of admitted) {
    const note = pull
      ? `Quarantined by #${pull.number} until ${planned.entry.expires}${merging ? ' (squash auto-merge on)' : ''}.`
      : `The quarantine entry is on branch \`${branch}\`, but this token may not open pull requests: open it at ${compare} (it touches only quarantine.json files${autoMerge ? ' and validates, so it may auto-merge' : ''}).`;
    // oxlint-disable-next-line no-await-in-loop -- one comment per issue, in order
    await comment(github, planned.entry.issue, note);
  }
  return { issues, branch, pullRequest: pull?.number, autoMerge: merging, outcome };
};

const main = async (args: readonly string[]): Promise<number> => {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        'dry-run': { type: 'boolean', default: false },
        offline: { type: 'boolean', default: false },
        'state-file': { type: 'string', default: '' },
        'state-branch': { type: 'string', default: stateBranch },
        ledger: { type: 'string', default: 'scripts/src/flake-ledger.json' },
        base: { type: 'string', default: 'main' },
        today: { type: 'string', default: utcDay() },
        owner: { type: 'string', default: '' },
        out: { type: 'string', default: '' },
        root: { type: 'string', default: '.' },
        summary: { type: 'string', default: process.env['GITHUB_STEP_SUMMARY'] ?? '' },
        'max-requests': { type: 'string', default: '1500' },
      },
    }));
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  const token = process.env['GITHUB_TOKEN'] ?? '';
  const offline = values.offline;
  const dryRun = values['dry-run'] || offline;
  const maxRequests = Number(values['max-requests']);
  if (
    (!offline && token === '') ||
    (offline && values['state-file'] === '') ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(values.today) ||
    !Number.isInteger(maxRequests) ||
    maxRequests <= 0
  ) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/ci-flake-quarantine-entry-cli.ts [--dry-run] [--offline --state-file <path>] [--today YYYY-MM-DD] [--out <dir>]',
    );
    return 2;
  }
  const root = resolve(values.root);
  const ledger = JSON.parse(await readFile(resolve(root, values.ledger), 'utf8')) as Ledger;
  const problems = ledgerProblems(ledger);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 2;
  }
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const store = values['state-file']
    ? fileStore(resolve(values['state-file']))
    : branchStore(github, values['state-branch']);
  const state: LedgerState | undefined = await store.read();
  if (!state) {
    console.error('No ledger state yet; nothing to enter.');
    return 0;
  }
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const workspace = await readWorkspace(root);
  const pending = offline ? [] : await readPending(github, values.base);
  const planned = planEntries({
    state,
    projects: workspace.projects,
    quarantines: workspace.quarantines,
    pending,
    owners: ledger,
    today: values.today,
    owner: values.owner || undefined,
  });

  // The validator reads the test files: from disk when the checkout has them, else at the checkout's commit.
  const contents = new Map<string, string | undefined>();
  for (const path of trackedPaths(workspace, planned.admitted)) {
    const local = join(root, path);
    if (existsSync(local)) {
      // oxlint-disable-next-line no-await-in-loop -- a few files
      contents.set(path, await readFile(local, 'utf8'));
    } else if (!offline) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- a few files
        const text = await github.getText(
          `/repos/${repository}/contents/${encodePath(path)}?ref=${baseSha}`,
          'application/vnd.github.raw+json',
        );
        contents.set(path, text);
      } catch (error) {
        if (!(error instanceof GitHubError) || error.status !== 404) {
          throw error;
        }
      }
    }
  }
  const { plan, problems: left } = validatePlan(planned, {
    workspace,
    readTracked: (path) => contents.get(path),
    today: values.today,
  });

  let outcome: string[];
  if (dryRun) {
    outcome = ['Dry run: nothing written to GitHub.'];
    if (values.out) {
      for (const file of proposedFiles(workspace.quarantines, plan.admitted)) {
        const target = join(resolve(values.out), file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.text);
        outcome.push(`Wrote ${target}.`);
      }
    }
  } else {
    ({ outcome } = await applyPlan(github, plan, {
      base: values.base,
      baseSha,
      quarantines: workspace.quarantines,
      problems: left,
      today: values.today,
    }));
  }
  const markdown = renderPlanMarkdown(plan, outcome);
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  for (const refusal of plan.refused.filter((entry) => entry.kind === 'never-quarantine' || entry.kind === 'cap')) {
    console.log(`::warning title=Flake not quarantined::${refusal.id.replaceAll(/[\n\r%]/gu, ' ')}: ${refusal.reason}`);
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
