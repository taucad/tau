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
 * Two settings decide how far it gets, and they are separate. Opening the pull request needs a token that may create
 * one: the Actions `GITHUB_TOKEN` may not while the repository does not let Actions create pull requests (tau-cloud
 * `can_approve_pull_request_reviews = false`); such a token still pushes the branch and opens the issues, and each
 * issue names the branch to open. Running CI on the pull request is another matter: events a `GITHUB_TOKEN` causes start
 * no workflow, or one that waits for approval, so landing it without a person needs a token whose pull requests start
 * CI. Either way the token needs the permissions listed under Env. A later run opens the pull request of any entry
 * branch left without one, unless its proposal has expired.
 *
 * Writes start only when the checkout is the base branch's current commit: a checkout `main` has moved past, or one
 * of another ref, plans against stale `quarantine.json` files, so that run writes nothing and the next one catches up.
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

import { dayNumber, parseQuarantine, quarantineBounds, splitTest, utcDay } from '@taucad/vitest-ci/quarantine';

import { client, GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { ledgerProblems } from '#ci-flake-ledger.js';
import type { Ledger } from '#ci-flake-ledger.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import {
  addDays,
  entryBranchPrefix,
  flakeLabel,
  issueBody,
  issueTitle,
  planEntries,
  pullRequestBody,
  pullRequestTitle,
  quarantinePath,
  renderPlanMarkdown,
  renderQuarantine,
} from '#ci-flake-quarantine-entry.js';
import { identityMarker } from '#flake-regression.js';
import type {
  EntryPlan,
  Offender,
  PlannedEntry,
  QuarantineText,
  Refusal,
  WorkspaceProject,
} from '#ci-flake-quarantine-entry.js';
import {
  isRecentRelease,
  lastLanded,
  operatorLabel,
  releasedLabel,
  returnWindowDays,
} from '#ci-flake-quarantine-release.js';
import type { ReturnRecord } from '#ci-flake-quarantine-release.js';
import { readShadowRegistry } from '#ci-shadow-rows.js';
import { quarantineProblems } from '#validate-quarantine.js';
import type { QuarantineSource } from '#validate-quarantine.js';

/** The checkout's projects and `quarantine.json` files. */
export type Workspace = {
  readonly projects: ReadonlyMap<string, WorkspaceProject>;
  readonly quarantines: readonly QuarantineText[];
};

/** A path in an API URL: each segment encoded, the slashes kept. */
export const encodePath = (path: string): string =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

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
type Pull = { readonly number: number; readonly state: string };
type ComparedFile = { readonly filename: string; readonly status: string };

/**
 * The `quarantine.json` files of every entry branch still in play: one with an open pull request, or with none yet.
 * A branch whose pull request was closed or merged holds nothing pending.
 */
export const readPending = async (github: Client, base: string): Promise<QuarantineText[]> => {
  const repo = `/repos/${github.repository}`;
  const prefix = `refs/heads/${entryBranchPrefix}`;
  const listed = await github.get<Ref[]>(`${repo}/git/matching-refs/${prefix.slice('refs/'.length, -1)}`);
  const branches = listed.filter((reference) => reference.ref.startsWith(prefix));
  const owner = github.repository.split('/')[0] ?? '';
  const pending: QuarantineText[] = [];
  for (const reference of branches) {
    const branch = reference.ref.replace(/^refs\/heads\//u, '');
    // oxlint-disable-next-line no-await-in-loop -- few branches, read in order
    const pulls = await github.get<Pull[]>(
      `${repo}/pulls?state=all&per_page=10&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    );
    if (pulls.some((pull) => pull.state === 'closed')) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one compare per branch
    const compare = await github.get<{ files?: ComparedFile[] }>(
      `${repo}/compare/${encodeURIComponent(base)}...${reference.object.sha}?per_page=100`,
    );
    for (const file of compare.files ?? []) {
      if (baseName(file.filename) !== 'quarantine.json' || file.status === 'removed') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
      const text = await github.getText(
        `${repo}/contents/${encodePath(file.filename)}?ref=${reference.object.sha}`,
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

/** `validate-quarantine`'s problems on the workspace's quarantine files with `changed` written over them. */
export const treeProblems = (
  workspace: Workspace,
  changed: readonly QuarantineText[],
  context: { readonly readTracked: (path: string) => string | undefined; readonly today: string },
): string[] =>
  quarantineProblems(sources(workspace, withFiles(workspace.quarantines, changed)), context.readTracked, context.today);

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
      sources(
        workspace,
        withFiles(
          workspace.quarantines,
          proposedFiles(
            workspace.quarantines,
            admitted.map((planned) => checked(planned)),
          ),
        ),
      ),
      readTracked,
      today,
    );
  const baseline = new Set(problemsWith([]));
  const admitted: PlannedEntry[] = [];
  const refused: Refusal[] = [...plan.refused];
  for (const planned of plan.admitted) {
    let added: string[];
    try {
      added = problemsWith([...admitted, planned]).filter((problem) => !baseline.has(problem));
    } catch (error) {
      // An existing file that is not a quarantine object cannot take an entry; the baseline names its problem.
      added = [`${planned.path} cannot take an entry: ${error instanceof Error ? error.message : String(error)}`];
    }
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

/**
 * The test files the validator reads: from disk when the checkout has them (a sparse checkout does not), else at
 * `ref` through the API, unless offline. A file that does not exist is left out.
 */
export const readTestFiles = async (
  github: Client | undefined,
  files: { readonly root: string; readonly paths: readonly string[]; readonly ref: string },
): Promise<Map<string, string | undefined>> => {
  const contents = new Map<string, string | undefined>();
  for (const path of files.paths) {
    const local = join(files.root, path);
    if (existsSync(local)) {
      // oxlint-disable-next-line no-await-in-loop -- a few files
      contents.set(path, await readFile(local, 'utf8'));
    } else if (github) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- a few files
        const text = await github.getText(
          `/repos/${github.repository}/contents/${encodePath(path)}?ref=${files.ref}`,
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
  return contents;
};

type Issue = { readonly number: number; readonly body?: string; readonly pull_request?: unknown };

/** Open owner issues by their identity marker. */
const openIssues = async (github: Client): Promise<Map<string, number>> => {
  const byMarker = new Map<string, number>();
  for (let page = 1; page <= 10; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order
    const issues = await github.get<Issue[]>(
      `/repos/${github.repository}/issues?state=open&labels=${flakeLabel}&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      const marker = /<!-- flake-identity: [\da-f]+ -->/u.exec(issue.body ?? '')?.[0];
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

/** Request squash auto-merge on a pull request; the refusal's message when GitHub refuses. */
export const enableAutoMerge = async (github: Client, nodeId: string): Promise<string | undefined> => {
  const response = await github.send<{ errors?: Array<{ message?: string }> }>('POST', '/graphql', {
    query:
      'mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }',
    variables: { id: nodeId },
  });
  return response.errors?.map((error) => error.message ?? 'unknown error').join('; ');
};

/** Comment on an issue. */
export const comment = async (github: Client, issue: number, body: string): Promise<void> => {
  await github.send('POST', `/repos/${github.repository}/issues/${issue}/comments`, { body });
};

/** Whether a branch exists. */
export const branchExists = async (github: Client, branch: string): Promise<boolean> => {
  try {
    await github.get(`/repos/${github.repository}/git/ref/heads/${encodePath(branch)}`);
    return true;
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) {
      throw error;
    }
    return false;
  }
};

/** Push one commit on `baseSha` that writes `files`, as a new branch, through the Git data API. */
export const pushFiles = async (
  github: Client,
  push: {
    readonly baseSha: string;
    readonly branch: string;
    readonly files: readonly QuarantineText[];
    readonly message: string;
  },
): Promise<void> => {
  const repo = `/repos/${github.repository}`;
  const baseCommit = await github.get<{ tree: { sha: string } }>(`${repo}/git/commits/${push.baseSha}`);
  const tree = await github.send<{ sha: string }>('POST', `${repo}/git/trees`, {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the Git data API's field name
    base_tree: baseCommit.tree.sha,
    tree: push.files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.text })),
  });
  const commit = await github.send<{ sha: string }>('POST', `${repo}/git/commits`, {
    message: push.message,
    tree: tree.sha,
    parents: [push.baseSha],
  });
  await github.send('POST', `${repo}/git/refs`, { ref: `refs/heads/${push.branch}`, sha: commit.sha });
};

/**
 * Hand an owner issue to the operator: label it `flake:needs-operator`, say why, and reopen it last. A return within
 * 30 days of release goes to the operator, not the agent (FQ-9, D5). The handoff is complete only when the issue is
 * open and labelled, so a run that failed half-way is finished by the next.
 */
export const reopenForOperator = async (github: Client, issue: number, note: string): Promise<void> => {
  const repo = `/repos/${github.repository}`;
  await github.send('POST', `${repo}/issues/${issue}/labels`, { labels: [operatorLabel] });
  await comment(github, issue, note);
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
  await github.send('PATCH', `${repo}/issues/${issue}`, { state: 'open', state_reason: 'reopened' });
};

/** The most pages a list is read to: 1,000 items. */
const maximumPages = 10;

/** Every item of a paged REST list, up to {@link maximumPages} pages of 100. */
export const readPages = async <T>(github: Client, path: string): Promise<T[]> => {
  const items: T[] = [];
  for (let page = 1; page <= maximumPages; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order
    const batch = await github.get<T[]>(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }
  return items;
};

/** An issue comment; `user` is `null` for a deleted account. */
type IssueComment = { readonly body?: string; readonly user?: { readonly type?: string } };

/**
 * The comments of an issue that an app wrote, oldest first: the ledger's markers are read only from them, so a
 * person's comment cannot pose as the automation's record (a GitHub App acts as a `Bot` user).
 */
export const automationComments = async (github: Client, issue: number): Promise<string[]> => {
  const comments = await readPages<IssueComment>(github, `/repos/${github.repository}/issues/${issue}/comments`);
  return comments.filter((entry) => entry.user?.type === 'Bot').map((entry) => entry.body ?? '');
};

type ReleasedIssue = {
  readonly number: number;
  readonly state?: string;
  readonly labels?: ReadonlyArray<{ readonly name?: string } | string>;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
  readonly pull_request?: unknown;
};

/**
 * The releases of the last 30 days, by identity hash: each owner issue labelled `flake:released` and the entry its
 * newest landed-release comment records, with the day it landed (FQ-9). A test that meets the entry rule again
 * re-enters as that entry. An issue an earlier run reopened stays in the list, so the return stays the same entry.
 */
export const readReturns = async (github: Client, today: string): Promise<Map<string, ReturnRecord>> => {
  const repo = `/repos/${github.repository}`;
  const since = `${addDays(today, -returnWindowDays)}T00:00:00Z`;
  const returns = new Map<string, ReturnRecord>();
  for (let page = 1; page <= 3; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order
    const issues = await github.get<ReleasedIssue[]>(
      `${repo}/issues?state=all&labels=${encodeURIComponent(releasedLabel)}&since=${since}&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      if (issue.pull_request !== undefined) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one issue's comments at a time
      const landed = lastLanded(await automationComments(github, issue.number));
      const known = landed ? returns.get(landed.identity) : undefined;
      if (
        landed &&
        isRecentRelease(landed.released, today) &&
        (known === undefined || known.released < landed.released)
      ) {
        const labels = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
        returns.set(landed.identity, {
          ...landed,
          issue: issue.number,
          handedOff: issue.state === 'open' && labels.includes(operatorLabel),
        });
      }
    }
    if (issues.length < 100) {
      break;
    }
  }
  return returns;
};

/** Open or link the owner issues, push the entry branch, open its pull request and enable auto-merge. */
export const applyPlan = async (github: Client, plan: EntryPlan, context: ApplyContext): Promise<ApplyResult> => {
  const repo = `/repos/${github.repository}`;
  const outcome: string[] = [];
  const issues = new Map<string, number>();
  const neverQuarantine = plan.refused.filter((refusal) => refusal.kind === 'never-quarantine');
  if (
    plan.admitted.length === 0 &&
    neverQuarantine.length === 0 &&
    !plan.refused.some((refusal) => refusal.returned !== undefined)
  ) {
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
    const body = issueBody(refusal, { repository: github.repository, refusal: refusal.reason });
    // oxlint-disable-next-line no-await-in-loop -- issues are opened one at a time
    const issue = await ownerIssue(refusal, body);
    issues.set(refusal.id, issue);
  }
  // A return within 30 days of release goes to the operator, whether it re-enters or not (FQ-9, D5).
  for (const refusal of plan.refused.filter((entry) => entry.returned !== undefined)) {
    const issue = refusal.returned?.issue ?? 0;
    issues.set(refusal.id, issue);
    if (refusal.returned?.handedOff === true) {
      outcome.push(`#${issue} is already open for the operator: a return that is not quarantined again.`);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- issues are updated one at a time
    await reopenForOperator(
      github,
      issue,
      `**Returned** within ${returnWindowDays} days of its release on ${refusal.returned?.released ?? ''}: not quarantined again, ${refusal.reason.replaceAll('`', "'")}. It goes to the operator, not the agent.`,
    );
    outcome.push(`Reopened #${issue} for the operator: a return that is not quarantined again.`);
  }
  const admitted: PlannedEntry[] = [];
  for (const planned of plan.admitted) {
    // oxlint-disable-next-line no-await-in-loop -- issues are opened one at a time
    const issue = await ownerIssue(
      planned,
      issueBody(planned, { repository: github.repository, entry: planned.entry }),
    );
    issues.set(planned.id, issue);
    if (planned.returned && planned.returned.handedOff !== true) {
      // oxlint-disable-next-line no-await-in-loop -- issues are updated one at a time
      await reopenForOperator(
        github,
        issue,
        `**Returned** within ${returnWindowDays} days of its release on ${planned.returned.released}: it re-enters as the same entry (created ${planned.entry.created}, expires ${planned.entry.expires}) and goes to the operator, not the agent (testing policy § 16.3).`,
      );
      outcome.push(`Reopened #${issue} for the operator: a return re-enters as the same entry.`);
    }
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
  if (await branchExists(github, branch)) {
    outcome.push(`Branch \`${branch}\` already exists; nothing pushed.`);
    return { issues, branch, autoMerge: false, outcome };
  }
  const title = pullRequestTitle(admitted);
  const autoMerge = mayAutoMerge(
    files.map((file) => file.path),
    context.problems,
  );
  const body = pullRequestBody(admitted, { autoMerge, problems: context.problems });
  await pushFiles(github, {
    baseSha: context.baseSha,
    branch,
    files,
    message: `${title}\n\n${admitted.map((planned) => `- ${planned.entry.test} (#${planned.entry.issue})`).join('\n')}\n`,
  });
  outcome.push(`Pushed \`${branch}\` (${files.map((file) => `\`${file.path}\``).join(', ')}).`);

  let pull: { number: number; node_id: string } | undefined;
  // A failure other than a refusal is raised after the issues name the branch, so the pushed entry is never orphaned.
  let failure: Error | undefined;
  try {
    pull = await github.send<{ number: number; node_id: string }>('POST', `${repo}/pulls`, {
      title,
      head: branch,
      base: context.base,
      body,
    });
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 422)) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    outcome.push(
      `Could not open the pull request (${error instanceof Error ? error.message : String(error)}); the owner issues name the branch to open.`,
    );
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
    try {
      // oxlint-disable-next-line no-await-in-loop -- one comment per issue, in order
      await comment(github, planned.entry.issue, note);
    } catch (error) {
      // One failed comment must not keep the other owners from the link; the pull request body names every issue.
      outcome.push(
        `Could not comment on #${planned.entry.issue}: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
  return { issues, branch, pullRequest: pull?.number, autoMerge: merging, outcome };
};

/**
 * The entries a branch's commit adds: those of its `quarantine.json` files that the commit it was built on lacks. A
 * returned entry keeps its first `expires` (FQ-9), so a proposal can expire sooner than 14 days after its push.
 */
export const proposedEntries = async (github: Client, sha: string): Promise<Array<Record<string, unknown>>> => {
  const repo = `/repos/${github.repository}`;
  const commit = await github.get<{
    readonly parents?: ReadonlyArray<{ readonly sha: string }>;
    readonly files?: ReadonlyArray<{ readonly filename: string; readonly status: string }>;
  }>(`${repo}/commits/${sha}`);
  const parent = commit.parents?.[0]?.sha;
  const added: Array<Record<string, unknown>> = [];
  for (const file of commit.files ?? []) {
    if (baseName(file.filename) !== 'quarantine.json' || file.status === 'removed') {
      continue;
    }
    const read = async (ref: string): Promise<string> =>
      github.getText(`${repo}/contents/${encodePath(file.filename)}?ref=${ref}`, 'application/vnd.github.raw+json');
    // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
    const after = await read(sha);
    // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
    const before = file.status === 'added' || parent === undefined ? '{"entries":[]}' : await read(parent);
    const known = new Set(parseQuarantine(before).entries.map((entry) => JSON.stringify(entry)));
    for (const entry of parseQuarantine(after).entries) {
      if (typeof entry === 'object' && entry !== null && !known.has(JSON.stringify(entry))) {
        added.push(entry as Record<string, unknown>);
      }
    }
  }
  return added;
};

/**
 * Open the pull request of every entry branch that has none: a run whose pull request failed, or a token that may not
 * open one, leaves the branch behind, and `readPending` holds its tests, so a later run with a token that may opens it
 * from the branch's own commit. Auto-merge stays with whoever reviews it: this run did not validate that tree. Returns
 * one line per branch.
 */
export const reconcileEntryBranches = async (github: Client, base: string, today: string): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  const prefix = `refs/heads/${entryBranchPrefix}`;
  const listed = await github.get<Ref[]>(`${repo}/git/matching-refs/${prefix.slice('refs/'.length, -1)}`);
  const owner = github.repository.split('/')[0] ?? '';
  const outcome: string[] = [];
  for (const reference of listed.filter((entry) => entry.ref.startsWith(prefix))) {
    const branch = reference.ref.slice('refs/heads/'.length);
    // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
    const pulls = await github.get<Pull[]>(
      `${repo}/pulls?state=all&per_page=10&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    );
    if (pulls.length > 0) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
    const commit = await github.get<{ message: string; committer?: { date?: string } }>(
      `${repo}/git/commits/${reference.object.sha}`,
    );
    const pushed = commit.committer?.date?.slice(0, 10);
    // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
    const proposed = await proposedEntries(github, reference.object.sha);
    if (
      (pushed !== undefined && addDays(pushed, quarantineBounds.maximumAgeDays) < today) ||
      proposed.some((entry) => typeof entry['expires'] === 'string' && entry['expires'] < today)
    ) {
      outcome.push(`\`${branch}\` holds an expired proposal; it is not opened and reserves nothing.`);
      continue;
    }
    const [title = `test(root): Quarantine entries from ${branch}`, ...rest] = commit.message.split('\n');
    try {
      // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
      const pull = await github.send<{ number: number }>('POST', `${repo}/pulls`, {
        title,
        head: branch,
        base,
        body: `${rest.join('\n').trim()}\n\nOpened by a later run of the flake ledger for an entry branch that had no pull request; auto-merge is left to the reviewer.\n`,
      });
      outcome.push(`Opened #${pull.number} for \`${branch}\`, which had no pull request.`);
    } catch (error) {
      if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 422)) {
        throw error;
      }
      outcome.push(`\`${branch}\` still has no pull request: this token may not open one.`);
    }
  }
  return outcome;
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
  const { offline } = values;
  const dryRun = values['dry-run'] || offline;
  const maxRequests = Number(values['max-requests']);
  if (
    (!offline && token === '') ||
    (offline && values['state-file'] === '') ||
    dayNumber(values.today) === undefined ||
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
  let write = !dryRun;
  const notes: string[] = [];
  if (write) {
    const base = await github.get<{ object: { sha: string } }>(
      `/repos/${repository}/git/ref/heads/${encodePath(values.base)}`,
    );
    if (base.object.sha !== baseSha) {
      write = false;
      notes.push(
        `The checkout (${baseSha.slice(0, 12)}) is not \`${values.base}\` (${base.object.sha.slice(0, 12)}): nothing is written; the next run plans on the current base.`,
      );
    }
  }
  const workspace = await readWorkspace(root);
  const registry = await readShadowRegistry(root);
  const shadowTargets = new Set(registry.rows.map((row) => `${row.project}:${row.target}`));
  const reconciled = write ? await reconcileEntryBranches(github, values.base, values.today) : [];
  const pending = offline ? [] : await readPending(github, baseSha);
  const returns = offline ? undefined : await readReturns(github, values.today);
  const planned = planEntries({
    state,
    projects: workspace.projects,
    quarantines: workspace.quarantines,
    pending,
    owners: ledger,
    today: values.today,
    owner: values.owner || undefined,
    shadowTargets,
    returns,
  });

  // The validator reads the test files: from disk when the checkout has them, else at the checkout's commit.
  const contents = await readTestFiles(offline ? undefined : github, {
    root,
    paths: trackedPaths(workspace, planned.admitted),
    ref: baseSha,
  });
  const { plan, problems: left } = validatePlan(planned, {
    workspace,
    readTracked: (path) => contents.get(path),
    today: values.today,
  });

  // The writes take a few dozen requests at most (20 entries, an issue and a comment each, one branch); stop short of
  // them rather than run out half-way, and leave the plan to the next run.
  const writeBudget = 4 * plan.admitted.length + plan.refused.length + 20;
  if (write && github.budget() < writeBudget) {
    write = false;
    notes.push(
      `The request budget (${github.budget()} left) is short of the writes (${writeBudget}): nothing is written.`,
    );
  }
  let outcome: string[];
  if (write) {
    ({ outcome } = await applyPlan(github, plan, {
      base: values.base,
      baseSha,
      quarantines: workspace.quarantines,
      problems: left,
      today: values.today,
    }));
  } else {
    outcome = [...notes, dryRun ? 'Dry run: nothing written to GitHub.' : 'Nothing written to GitHub.'];
    if (values.out) {
      for (const file of proposedFiles(workspace.quarantines, plan.admitted)) {
        const target = join(resolve(values.out), file.path);
        // oxlint-disable-next-line no-await-in-loop -- a few files, written in order
        await mkdir(dirname(target), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- a few files, written in order
        await writeFile(target, file.text);
        outcome.push(`Wrote ${target}.`);
      }
    }
  }
  const markdown = renderPlanMarkdown(plan, [...reconciled, ...outcome]);
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
