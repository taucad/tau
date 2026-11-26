/**
 * Quarantine release and expiry: the IO half of `ci-flake-quarantine-release.ts` (FQ-9 of the CI flake quarantine
 * blueprint, Brain `research/ci-flake-quarantine-blueprint.md`, D5 and D8; testing policy § 16.3 and § 16.5).
 * `flake-ledger.yml` runs it after each complete ingestion, after the entry step.
 *
 * It reads the ledger state (each quarantined test's count, `quarantineTracks`) from the `flake-ledger` branch, the
 * projects and `quarantine.json` files of the checkout, the linked fixes of every test whose count could meet the bar
 * (a merged pull request from `flake/<issue>`, or one labelled `flake` that references the owner issue) and the
 * removal branches still in play (`flake-release/*`, `flake-expiry/*`). Then:
 *
 * - **Release.** An entry that meets the bar is removed on one `flake-release/*` branch that changes only
 *   `quarantine.json` files; its owner issue gets a comment recording the entry and the `flake:releasing` label. Once
 *   the entry has left `main`, a later run closes the issue (`flake:released`).
 * - **Expiry.** An entry at or past its `expires` day is removed on one `flake-expiry/*` branch; its owner issue gets
 *   a comment and `flake:needs-operator`. The nightly watchdog pages the operator (`nightly-watchdog.ts`, its existing
 *   Grafana IRM route) for every entry on `main` at or past its expiry, until the removal lands. The automation never
 *   renews an entry: that is the operator's edit on `main`, which leaves a pending expiry stale.
 * - **Pending removals.** A branch whose entries are all still on `main` as it found them (and, for a release, still
 *   meet the bar) holds them; a later run opens its pull request when it has none. A stale one is not opened, and its
 *   open pull request is closed.
 *
 * Opening a pull request needs a token that may create one, as for the entry step (`ci-flake-quarantine-entry-cli.ts`):
 * the Actions `GITHUB_TOKEN` may not while the repository does not let Actions create pull requests, so the branch is
 * pushed and each owner issue names it with a compare link. Writes start only when the checkout is the base branch's
 * current commit.
 *
 * Usage: node scripts/src/ci-flake-quarantine-release-cli.ts [--dry-run] [--offline] [--state-file <path>]
 *          [--state-branch flake-ledger] [--base main] [--today YYYY-MM-DD] [--root .] [--out <dir>]
 *          [--summary <file>] [--max-requests 1500]
 * `--dry-run` writes nothing to GitHub; `--out` writes the proposed `quarantine.json` files under a directory.
 * `--offline` (with `--state-file`) reads nothing from GitHub either: no fixes, no pending removals.
 * Env: GITHUB_TOKEN (`contents: write`, `issues: write`, `pull-requests: write`; read-only for a dry run),
 * GITHUB_REPOSITORY (default taucad/tau), GITHUB_API_URL.
 * Exit codes: 0 done, or nothing to remove; 1 API failure; 2 usage.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { dayNumber, utcDay } from '@taucad/vitest-ci/quarantine';
import type { QuarantineRenewal, QuarantineVariant } from '@taucad/vitest-ci/quarantine';

import { client, GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import { addDays, identityHashOf, quarantinePath, returnKey } from '#ci-flake-quarantine-entry.js';
import {
  automationComments,
  branchExists,
  comment,
  enableAutoMerge,
  encodePath,
  mayAutoMerge,
  pushFiles,
  readTestFiles,
  readPages,
  readWorkspace,
  trackedPaths,
  treeProblems,
} from '#ci-flake-quarantine-entry-cli.js';
import type { Workspace } from '#ci-flake-quarantine-entry-cli.js';
import {
  markersIn,
  expiryBranchPrefix,
  expiryComment,
  lastRemoval,
  linkedFix,
  operatorLabel,
  planRemovals,
  quarantinedTests,
  releaseBar,
  releaseBranchPrefix,
  releaseComment,
  releasedLabel,
  releasingLabel,
  returnMarker,
  returnWindowDays,
  removalBody,
  removalMarker,
  removalFiles,
  removalTitle,
  removedEntries,
  renderRemovalMarkdown,
} from '#ci-flake-quarantine-release.js';
import type {
  LinkedFix,
  PendingRemoval,
  PlannedRemoval,
  QuarantinedTest,
  RemovalKind,
  RemovalPlan,
} from '#ci-flake-quarantine-release.js';

/* eslint-disable @typescript-eslint/naming-convention -- REST API field names */
type Ref = { readonly ref: string; readonly object: { readonly sha: string } };
/** A pull request; `merged_at` is `null` until it merges. */
type Pull = { readonly number: number; readonly state: string; readonly merged_at?: string };
type BranchCommit = {
  readonly commit?: { readonly message?: string };
  readonly parents?: ReadonlyArray<{ readonly sha: string }>;
  readonly files?: ReadonlyArray<{ readonly filename: string; readonly status: string }>;
};
type TimelineEvent = {
  readonly event?: string;
  readonly source?: {
    readonly issue?: {
      readonly number: number;
      readonly pull_request?: { readonly merged_at?: string };
      readonly labels?: ReadonlyArray<{ readonly name?: string } | string>;
      readonly repository?: { readonly full_name?: string };
    };
  };
};
type LabelledIssue = {
  readonly number: number;
  readonly state: string;
  readonly labels?: ReadonlyArray<{ readonly name?: string } | string>;
  readonly pull_request?: unknown;
};
/* eslint-enable @typescript-eslint/naming-convention -- REST API field names end here */

const prefixes: ReadonlyArray<readonly [RemovalKind, string]> = [
  ['release', releaseBranchPrefix],
  ['expiry', expiryBranchPrefix],
];

const labelNames = (labels: LabelledIssue['labels']): string[] =>
  (labels ?? []).map((label) => (typeof label === 'string' ? label : (label.name ?? ''))).filter((name) => name !== '');

const isQuarantineFile = (path: string): boolean => path === 'quarantine.json' || path.endsWith('/quarantine.json');

/** A removal whose pull request merged: the entries it removed and when. */
export type LandedRemoval = {
  readonly kind: RemovalKind;
  readonly branch: string;
  readonly mergedAt: string;
  readonly removed: PendingRemoval['removed'];
};

/** A closed pull request, as the list of closed pull requests gives it. */
type ClosedPull = Pull & {
  readonly head?: { readonly ref?: string; readonly sha?: string };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
  readonly updated_at?: string;
};

/** The commit a removal branch pushed: its message and the entries it removes against the commit it was built on. */
const readRemoval = async (
  github: Client,
  sha: string,
): Promise<{ message: string | undefined; removed: Array<{ path: string; entry: unknown }> }> => {
  const repo = `/repos/${github.repository}`;
  const commit = await github.get<BranchCommit>(`${repo}/commits/${sha}`);
  const parent = commit.parents?.[0]?.sha;
  const removed: Array<{ path: string; entry: unknown }> = [];
  for (const file of commit.files ?? []) {
    if (!isQuarantineFile(file.filename) || file.status !== 'modified' || parent === undefined) {
      continue;
    }
    const read = async (ref: string): Promise<string> =>
      github.getText(`${repo}/contents/${encodePath(file.filename)}?ref=${ref}`, 'application/vnd.github.raw+json');
    // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
    const [before, after] = await Promise.all([read(parent), read(sha)]);
    removed.push(...removedEntries(before, after).map((entry) => ({ path: file.filename, entry })));
  }
  return { message: commit.commit?.message, removed };
};

/** The most pages of closed pull requests read for removals that landed: newest updated first. */
const maximumClosedPages = 10;

/**
 * Every removal branch still in play: one whose pull request is open, or that has none yet; a branch whose pull
 * request was closed or merged holds nothing. And every removal whose pull request merged on or after `since`, found
 * from the merged pull request itself, so a branch deleted after its merge is still settled (`closeReleased`). Each
 * lists the entries it removes, read from the commit it was built on and its own: entries added to `main` since are
 * not removals.
 */
export const readRemovalBranches = async (
  github: Client,
  since: string,
): Promise<{ pending: PendingRemoval[]; landed: LandedRemoval[] }> => {
  const repo = `/repos/${github.repository}`;
  const owner = github.repository.split('/')[0] ?? '';
  const pending: PendingRemoval[] = [];
  for (const [kind, prefix] of prefixes) {
    // oxlint-disable-next-line no-await-in-loop -- two prefixes, read in order
    const listed = await github.get<Ref[]>(`${repo}/git/matching-refs/heads/${prefix.slice(0, -1)}`);
    for (const reference of listed.filter((entry) => entry.ref.startsWith(`refs/heads/${prefix}`))) {
      const branch = reference.ref.slice('refs/heads/'.length);
      // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
      const pulls = await github.get<Pull[]>(
        `${repo}/pulls?state=all&per_page=10&head=${encodeURIComponent(`${owner}:${branch}`)}`,
      );
      if (pulls.some((pull) => pull.state === 'closed')) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one commit per branch
      const { message, removed } = await readRemoval(github, reference.object.sha);
      pending.push({ branch, kind, pull: pulls.find((pull) => pull.state === 'open')?.number, message, removed });
    }
  }
  const landed: LandedRemoval[] = [];
  for (let page = 1; page <= maximumClosedPages; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order, newest first
    const pulls = await github.get<ClosedPull[]>(
      `${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
    );
    for (const pull of pulls) {
      const branch = pull.head?.ref ?? '';
      const kind = prefixes.find(([, prefix]) => branch.startsWith(prefix))?.[0];
      const sha = pull.head?.sha;
      if (kind === undefined || sha === undefined || typeof pull.merged_at !== 'string' || pull.merged_at < since) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one commit per merged removal
      const { removed } = await readRemoval(github, sha);
      landed.push({ kind, branch, mergedAt: pull.merged_at, removed });
    }
    // A pull request merged after `since` was updated after it too, so the list stops being of use there.
    if (pulls.length < 100 || pulls.some((pull) => (pull.updated_at ?? '') < since)) {
      break;
    }
  }
  return { pending, landed };
};

/**
 * The fixes linked to an owner issue: merged pull requests from `flake/<issue>`, and merged pull requests labelled
 * `flake` that reference the issue (its timeline's cross-references) — the two ways `validate-flake-fix` recognises
 * a fix.
 */
export const readLinkedFixes = async (github: Client, issue: number): Promise<LinkedFix[]> => {
  const repo = `/repos/${github.repository}`;
  const owner = github.repository.split('/')[0] ?? '';
  const fixes: LinkedFix[] = [];
  const pulls = await github.get<Pull[]>(
    `${repo}/pulls?state=closed&per_page=10&head=${encodeURIComponent(`${owner}:flake/${issue}`)}`,
  );
  for (const pull of pulls) {
    if (pull.merged_at) {
      fixes.push({ pull: pull.number, mergedAt: pull.merged_at });
    }
  }
  const timeline = await readPages<TimelineEvent>(github, `${repo}/issues/${issue}/timeline`);
  for (const event of timeline) {
    const source = event.source?.issue;
    const mergedAt = source?.pull_request?.merged_at;
    if (
      event.event === 'cross-referenced' &&
      source &&
      mergedAt &&
      (source.repository?.full_name ?? github.repository) === github.repository &&
      labelNames(source.labels).includes('flake')
    ) {
      fixes.push({ pull: source.number, mergedAt });
    }
  }
  return fixes;
};

/** The linked fix of every test whose count could meet the bar after one; the others need none. */
export const readFixes = async (
  github: Client,
  tests: readonly QuarantinedTest[],
  state: LedgerState,
): Promise<Map<string, LinkedFix | undefined>> => {
  const fixes = new Map<string, LinkedFix | undefined>();
  for (const test of tests) {
    if ((state.quarantineTracks?.[test.key]?.streak ?? 0) < releaseBar.withFix) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one issue at a time
    fixes.set(test.key, linkedFix(await readLinkedFixes(github, test.entry.issue), test.entry));
  }
  return fixes;
};

/** Whether every entry a removal removes is still in the base's `quarantine.json` exactly as the branch found it. */
const stillOnBase = async (github: Client, pending: PendingRemoval, base: string): Promise<boolean> => {
  const paths = [...new Set(pending.removed.map((removed) => removed.path))];
  for (const path of paths) {
    let text: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
      text = await github.getText(
        `/repos/${github.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(base)}`,
        'application/vnd.github.raw+json',
      );
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return false;
      }
      throw error;
    }
    const onBase = new Set(removedEntries(text, '{"entries":[]}').map((entry) => JSON.stringify(entry)));
    if (pending.removed.some((removed) => removed.path === path && !onBase.has(JSON.stringify(removed.entry)))) {
      return false;
    }
  }
  return true;
};

/**
 * Open the pull request of every current removal branch that has none, once its entries are read again on the base
 * (one renewed since the plan was made is not removed), and close the open pull request of every stale one.
 * Auto-merge stays with whoever reviews a pull request this run did not push. Returns one line per branch.
 */
export const reconcileRemovals = async (
  github: Client,
  plan: RemovalPlan,
  context: { readonly base: string; readonly kinds?: ReadonlySet<RemovalKind> | undefined },
): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  const { base } = context;
  const outcome: string[] = [];
  const pendingWithout = plan.current.filter(
    (entry) => entry.pull === undefined && (context.kinds === undefined || context.kinds.has(entry.kind)),
  );
  for (const pending of pendingWithout) {
    // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
    if (!(await stillOnBase(github, pending, base))) {
      outcome.push(
        `\`${pending.branch}\` is not opened: an entry it removes changed on \`${base}\` since this run planned.`,
      );
      continue;
    }
    const [first, ...rest] = (pending.message ?? '').split('\n');
    const title =
      first === undefined || first.trim() === ''
        ? `test(root): Remove quarantine entries from ${pending.branch}`
        : first;
    try {
      // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
      const pull = await github.send<{ number: number }>('POST', `${repo}/pulls`, {
        title,
        head: pending.branch,
        base,
        body: `${rest.join('\n').trim()}\n\nOpened by a later run of the flake ledger for a ${pending.kind} branch that had no pull request. When this run checked, its entries were on \`${base}\` as the branch found them; check that none was renewed since before merging. Auto-merge is left to the reviewer.\n`,
      });
      outcome.push(`Opened #${pull.number} for \`${pending.branch}\`, which had no pull request.`);
    } catch (error) {
      if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 422)) {
        throw error;
      }
      outcome.push(`\`${pending.branch}\` still has no pull request: this token may not open one.`);
    }
  }
  for (const stale of plan.stale) {
    if (stale.pull === undefined) {
      outcome.push(`\`${stale.branch}\` is stale (${stale.reason}); it holds nothing and is not opened.`);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
    await comment(github, stale.pull, `Closed by the flake ledger: ${stale.reason}.`);
    // oxlint-disable-next-line no-await-in-loop -- few branches, one at a time
    await github.send('PATCH', `${repo}/pulls/${stale.pull}`, { state: 'closed' });
    outcome.push(`Closed #${stale.pull} (\`${stale.branch}\`): ${stale.reason}.`);
  }
  return outcome;
};

/** One owner issue to tell about a removal branch. */
export type OwnerNote = {
  readonly kind: RemovalKind;
  readonly removal: PlannedRemoval;
  readonly branch: string;
  /** Where the removal is: its pull request, or the branch and a compare link. */
  readonly where: string;
};

/**
 * Make sure each owner issue carries its removal's comment (once per branch, found by the marker's branch) and label
 * (`flake:releasing` for a release, `flake:needs-operator` for an expiry). It runs after a push and again on every
 * later run while the branch is pending, so an update that failed is finished then, without a second comment.
 */
export const ensureOwnerNotes = async (github: Client, notes: readonly OwnerNote[]): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  const outcome: string[] = [];
  for (const note of notes) {
    const { issue } = note.removal.entry;
    const label = note.kind === 'release' ? releasingLabel : operatorLabel;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time, in order
      const [current, comments] = await Promise.all([
        github.get<LabelledIssue>(`${repo}/issues/${issue}`),
        automationComments(github, issue),
      ]);
      const noted = markersIn(comments).some(
        (marker) => marker.kind === note.kind && marker.record.branch === note.branch,
      );
      if (!noted) {
        const context = { identity: identityHashOf(note.removal.id), where: note.where, branch: note.branch };
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time, in order
        await comment(
          github,
          issue,
          note.kind === 'release' ? releaseComment(note.removal, context) : expiryComment(note.removal, context),
        );
      }
      if (!labelNames(current.labels).includes(label)) {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time, in order
        await github.send('POST', `${repo}/issues/${issue}/labels`, { labels: [label] });
      }
    } catch (error) {
      // One failed issue must not keep the other owners from the link; the next run tries it again.
      outcome.push(`Could not update #${issue}: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  return outcome;
};

/** Where a pending removal is, for its owner issue. */
const whereOf = (repository: string, base: string, pending: { branch: string; pull?: number | undefined }): string =>
  pending.pull === undefined
    ? `The removal is on branch \`${pending.branch}\`, but this token may not open pull requests: open it at https://github.com/${repository}/compare/${base}...${encodePath(pending.branch)}?expand=1 (it touches only quarantine.json files).`
    : `The removal is #${pending.pull}.`;

export type RemovalContext = {
  readonly kind: RemovalKind;
  readonly removals: readonly PlannedRemoval[];
  readonly base: string;
  readonly baseSha: string;
  readonly quarantines: Workspace['quarantines'];
  /** Validator problems left on the proposed tree; auto-merge only when there are none. */
  readonly problems: readonly string[];
  readonly today: string;
};

/**
 * Push one removal branch for `removals`, open its pull request (with squash auto-merge when it validates) and tell
 * each owner issue: a release records the entry and labels the issue `flake:releasing`; an expiry hands it to the
 * operator. Returns one line per thing done or skipped.
 */
export const applyRemovals = async (github: Client, context: RemovalContext): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  const { kind, removals } = context;
  if (removals.length === 0) {
    return [];
  }
  const outcome: string[] = [];
  const files = removalFiles(context.quarantines, removals);
  const key = createHash('sha256')
    .update(removals.map((removal) => `${removal.path}\n${removal.key}`).join('\n'))
    .digest('hex')
    .slice(0, 8);
  const branch = `${kind === 'release' ? releaseBranchPrefix : expiryBranchPrefix}${context.today}-${key}`;
  if (await branchExists(github, branch)) {
    return [`Branch \`${branch}\` already exists; nothing pushed.`];
  }
  const title = removalTitle(kind, removals);
  const autoMerge = mayAutoMerge(
    files.map((file) => file.path),
    context.problems,
  );
  await pushFiles(github, {
    baseSha: context.baseSha,
    branch,
    files,
    message: `${title}\n\n${removals.map((removal) => `- ${removal.entry.test} (#${removal.entry.issue})`).join('\n')}\n`,
  });
  outcome.push(`Pushed \`${branch}\` (${files.map((file) => `\`${file.path}\``).join(', ')}).`);

  let pull: { number: number; node_id: string } | undefined;
  let failure: Error | undefined;
  try {
    pull = await github.send<{ number: number; node_id: string }>('POST', `${repo}/pulls`, {
      title,
      head: branch,
      base: context.base,
      body: `${removalBody(kind, removals, { autoMerge, problems: context.problems })}${autoMerge ? `${autoMergeMarker}\n` : ''}`,
    });
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 422)) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    outcome.push(
      `Could not open the pull request (${error instanceof Error ? error.message : String(error)}); the owner issues name the branch to open.`,
    );
  }
  if (pull) {
    outcome.push(`Opened #${pull.number}.`);
  }
  const compare = `https://github.com/${github.repository}/compare/${context.base}...${encodePath(branch)}?expand=1`;
  const where = pull
    ? `The removal is #${pull.number}${autoMerge ? ', eligible for squash auto-merge' : ''}.`
    : `The removal is on branch \`${branch}\`, but this token may not open pull requests: open it at ${compare} (it touches only quarantine.json files${autoMerge ? ' and validates, so it may auto-merge' : ''}).`;
  // The owners first: auto-merge waits until every owner issue carries its note and label.
  const unnoted = await ensureOwnerNotes(
    github,
    removals.map((removal) => ({ kind, removal, branch, where })),
  );
  outcome.push(...unnoted);
  if (pull && autoMerge) {
    if (unnoted.length > 0) {
      outcome.push('Auto-merge left off: an owner issue was not updated; a later run retries it.');
    } else {
      try {
        const refused = await enableAutoMerge(github, pull.node_id);
        outcome.push(refused === undefined ? 'Enabled squash auto-merge.' : `Auto-merge refused: ${refused}.`);
      } catch (error) {
        outcome.push(`Auto-merge refused: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
  return outcome;
};

/** Remove one label from an issue; one already gone is not an error. */
const removeLabel = async (github: Client, issue: number, label: string): Promise<void> => {
  try {
    await github.send(
      'DELETE',
      `/repos/${github.repository}/issues/${issue}/labels/${encodeURIComponent(label)}`,
      undefined,
    );
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) {
      throw error;
    }
  }
};

/**
 * Whether a pending removal's deferred auto-merge may be requested: every owner issue told, the removal still
 * validating, and, for a release, a complete count this run, the only one on which its bar is rechecked.
 */
export const mayResumeAutoMerge = (check: {
  readonly kind: RemovalKind;
  readonly releases: boolean;
  readonly unnoted: readonly string[];
  readonly problems: readonly string[];
}): boolean => check.unnoted.length === 0 && check.problems.length === 0 && (check.releases || check.kind === 'expiry');

/** Marks the body of a removal pull request the ledger means to auto-merge once every owner issue is told. */
export const autoMergeMarker = '<!-- flake-ledger: auto-merge -->';

/**
 * Request the auto-merge a removal pull request deferred: one whose body carries {@link autoMergeMarker}, that has no
 * auto-merge yet, whose owner issues are all told and whose removal still validates.
 */
export const resumeAutoMerge = async (github: Client, pull: number): Promise<string | undefined> => {
  const current = await github.get<{
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
    readonly node_id: string;
    readonly body?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
    readonly auto_merge?: unknown;
    readonly state?: string;
  }>(`/repos/${github.repository}/pulls/${pull}`);
  if (
    current.state !== 'open' ||
    !(current.body ?? '').includes(autoMergeMarker) ||
    (current.auto_merge !== undefined && current.auto_merge !== null)
  ) {
    return undefined;
  }
  const refused = await enableAutoMerge(github, current.node_id);
  return refused === undefined
    ? `Enabled the deferred squash auto-merge on #${pull}.`
    : `Auto-merge refused on #${pull}: ${refused}.`;
};

/**
 * Make sure the owner issue of every expiry that merged carries its note and `flake:needs-operator`: an update that
 * failed before someone merged the expiry by hand is finished here.
 */
const settleExpiry = async (
  github: Client,
  context: {
    readonly release: LandedRemoval;
    readonly identityOf: (path: string, test: string) => string | undefined;
    /** Entries on `main` as `<issue> <return key>`: a variant still quarantined is not this expiry's. */
    readonly onMain: ReadonlySet<string>;
  },
): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  const outcome: string[] = [];
  for (const { path, entry } of context.release.removed) {
    const fields = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const { issue, test, created, expires, renewal, variant } = fields;
    const id = typeof test === 'string' ? context.identityOf(path, test) : undefined;
    if (
      typeof issue !== 'number' ||
      id === undefined ||
      typeof created !== 'string' ||
      typeof expires !== 'string' ||
      context.onMain.has(
        `${issue} ${returnKey(identityHashOf(id), typeof variant === 'object' && variant !== null ? (variant as QuarantineVariant) : undefined)}`,
      )
    ) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one issue at a time
    const [current, comments] = await Promise.all([
      github.get<LabelledIssue>(`${repo}/issues/${issue}`),
      automationComments(github, issue),
    ]);
    const noted = markersIn(comments).some(
      (marker) => marker.kind === 'expiry' && marker.record.branch === context.release.branch,
    );
    if (!noted) {
      const record = {
        identity: identityHashOf(id),
        path,
        created,
        expires,
        ...(typeof renewal === 'object' && renewal !== null ? { renewal: renewal as QuarantineRenewal } : {}),
        branch: context.release.branch,
        ...(typeof variant === 'object' && variant !== null ? { variant: variant as QuarantineVariant } : {}),
      };
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time
      await comment(
        github,
        issue,
        `${removalMarker('expiry', record)}\n**Expired** on ${expires}: the removal merged on ${context.release.mergedAt.slice(0, 10)} and the test gates again (testing policy § 16.3). It goes to the operator.`,
      );
    }
    if (!labelNames(current.labels).includes(operatorLabel)) {
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time
      await github.send('POST', `${repo}/issues/${issue}/labels`, { labels: [operatorLabel] });
    }
    if (!noted || !labelNames(current.labels).includes(operatorLabel)) {
      outcome.push(`Finished the expiry note on #${issue}.`);
    }
  }
  return outcome;
};

/**
 * Close the owner issue of every release that landed: for each release branch whose pull request merged (and whose
 * entry is no longer on `main`), the issue gets one comment recording the entry and the day it merged, the start of
 * the 30-day return window, and closes as completed, labelled `flake:released`. It is found through the merged branch,
 * not through a label, so an owner update that failed before the merge is recovered. An issue still labelled
 * `flake:releasing` whose entry left `main` without a landed release only loses that label. Markers are read only
 * from comments an app wrote.
 */
export const closeReleased = async (
  github: Client,
  context: {
    readonly tests: readonly QuarantinedTest[];
    readonly landed: readonly LandedRemoval[];
    /** The ledger identity of a test in a `quarantine.json`, or `undefined` when no project owns the file. */
    readonly identityOf: (path: string, test: string) => string | undefined;
  },
): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  // An entry on `main` is one variant of a test: another variant sharing its owner issue may have been released.
  const onMainEntries = new Set(
    context.tests.map((test) => `${test.entry.issue} ${returnKey(identityHashOf(test.id), test.entry.variant)}`),
  );
  const onMain = new Set(context.tests.map((test) => test.entry.issue));
  const outcome: string[] = [];
  const handled = new Set<number>();
  // Each variant entry an issue releases is settled on its own: `<issue> <return key>`.
  const settled = new Set<string>();
  // Newest merge first: when two releases of one entry landed, the newer settles it.
  const landed = [...context.landed].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
  for (const release of landed) {
    const released = release.mergedAt.slice(0, 10);
    if (release.kind === 'expiry') {
      // oxlint-disable-next-line no-await-in-loop -- one merged expiry at a time
      outcome.push(...(await settleExpiry(github, { release, identityOf: context.identityOf, onMain: onMainEntries })));
      continue;
    }
    for (const { path, entry } of release.removed) {
      const fields = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
      const { issue, test, created, expires, renewal, variant } = fields;
      const id = typeof test === 'string' ? context.identityOf(path, test) : undefined;
      if (typeof issue !== 'number' || id === undefined || typeof created !== 'string' || typeof expires !== 'string') {
        continue;
      }
      const entryVariant = typeof variant === 'object' && variant !== null ? (variant as QuarantineVariant) : undefined;
      const key = returnKey(identityHashOf(id), entryVariant);
      if (settled.has(`${issue} ${key}`) || onMainEntries.has(`${issue} ${key}`)) {
        continue;
      }
      settled.add(`${issue} ${key}`);
      handled.add(issue);
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time
      const [current, comments] = await Promise.all([
        github.get<LabelledIssue>(`${repo}/issues/${issue}`),
        automationComments(github, issue),
      ]);
      const notedAt = comments.findIndex((body) =>
        markersIn([body]).some(
          (marker) =>
            marker.kind === 'released' &&
            marker.record.branch === release.branch &&
            returnKey(marker.record.identity, marker.record.variant) === key,
        ),
      );
      const noted = notedAt !== -1;
      // A return of any variant after this release was recorded reopened the issue for the operator: leave it open.
      const returnedSince = noted && comments.slice(notedAt + 1).some((body) => body.includes('<!-- flake-returned:'));
      // Another variant of the test is still quarantined under this issue: record this release, keep the issue open.
      const shared = onMain.has(issue);
      const labels = labelNames(current.labels);
      const done =
        noted && current.state === 'closed' && labels.includes(releasedLabel) && !labels.includes(releasingLabel);
      // A return after this release reopened the issue for the operator: it is theirs now, never closed again.
      const returned = comments.some((body) =>
        body.includes(returnMarker({ identity: identityHashOf(id), released, variant: entryVariant })),
      );
      if (done || returned || returnedSince || (noted && shared)) {
        continue;
      }
      if (!noted) {
        const record = {
          identity: identityHashOf(id),
          path,
          created,
          expires,
          ...(typeof renewal === 'object' && renewal !== null ? { renewal: renewal as QuarantineRenewal } : {}),
          branch: release.branch,
          released,
          ...(typeof variant === 'object' && variant !== null ? { variant: variant as QuarantineVariant } : {}),
        };
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await comment(
          github,
          issue,
          `${removalMarker('released', record)}\nThe release merged on ${released}: the entry is no longer on main and the test gates again. A return within 30 days reopens this issue as the same entry, for the operator.`,
        );
      }
      // Label by label, and the state alone: a label someone added meanwhile is kept.
      if (!labels.includes(releasedLabel)) {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await github.send('POST', `${repo}/issues/${issue}/labels`, { labels: [releasedLabel] });
      }
      if (shared) {
        // `flake:released` lets the 30-day return find this record; the issue stays with the variant on main.
        outcome.push(`Recorded the release of one variant on #${issue}; another is still quarantined under it.`);
        continue;
      }
      if (labels.includes(releasingLabel)) {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await removeLabel(github, issue, releasingLabel);
      }
      if (current.state === 'open') {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await github.send('PATCH', `${repo}/issues/${issue}`, {
          state: 'closed',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
          state_reason: 'completed',
        });
      }
      outcome.push(`Closed #${issue}: released on ${released}.`);
    }
  }
  const labelled = await readPages<LabelledIssue>(
    github,
    `${repo}/issues?state=all&labels=${encodeURIComponent(releasingLabel)}`,
  );
  for (const issue of labelled) {
    if (issue.pull_request !== undefined || onMain.has(issue.number) || handled.has(issue.number)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one issue at a time
    await removeLabel(github, issue.number, releasingLabel);
    outcome.push(
      `#${issue.number} left quarantine without its release landing: \`${releasingLabel}\` removed, the issue stays as it is.`,
    );
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
        base: { type: 'string', default: 'main' },
        today: { type: 'string', default: utcDay() },
        root: { type: 'string', default: '.' },
        out: { type: 'string', default: '' },
        summary: { type: 'string', default: process.env['GITHUB_STEP_SUMMARY'] ?? '' },
        'max-requests': { type: 'string', default: '1500' },
        releases: { type: 'string', default: 'true' },
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
    (values.releases !== 'true' && values.releases !== 'false') ||
    !Number.isInteger(maxRequests) ||
    maxRequests <= 0
  ) {
    console.error(
      'Usage: GITHUB_TOKEN=... node scripts/src/ci-flake-quarantine-release-cli.ts [--dry-run] [--offline --state-file <path>] [--today YYYY-MM-DD] [--out <dir>]',
    );
    return 2;
  }
  const root = resolve(values.root);
  const repository = process.env['GITHUB_REPOSITORY'] ?? 'taucad/tau';
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const github = client({ api, token, repository, maxRequests });
  const store = values['state-file']
    ? fileStore(resolve(values['state-file']))
    : branchStore(github, values['state-branch']);
  const state: LedgerState | undefined = await store.read();
  if (!state) {
    console.error('No ledger state yet; nothing to release.');
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
  const tests = quarantinedTests(workspace, values.today);
  const { pending, landed } = offline
    ? { pending: [], landed: [] }
    : await readRemovalBranches(github, `${addDays(values.today, -returnWindowDays)}T00:00:00Z`);
  const releases = values.releases === 'true';
  // An expiry-only run needs no fix: its lookups could only stop the expiries.
  const fixes = offline || !releases ? new Map<string, LinkedFix | undefined>() : await readFixes(github, tests, state);
  const plan = planRemovals({
    tests,
    tracks: state.quarantineTracks ?? {},
    fixes,
    pending,
    today: values.today,
    releases,
  });
  if (!releases) {
    notes.push('The ingestion did not count every pending run: nothing is released this run; expiries proceed.');
  }

  const removals = [...plan.releases, ...plan.expiries];
  const contents = await readTestFiles(offline ? undefined : github, {
    root,
    paths: trackedPaths(workspace, []),
    ref: baseSha,
  });
  // Only the problems a removal brings: an expired entry elsewhere on `main` is its own expiry's to remove.
  const checks = { readTracked: (path: string) => contents.get(path), today: values.today };
  const baseline = new Set(treeProblems(workspace, [], checks));
  const problemsOf = (kind: readonly PlannedRemoval[]): string[] =>
    treeProblems(workspace, removalFiles(workspace.quarantines, kind), checks).filter(
      (problem) => !baseline.has(problem),
    );

  // Two branches, an issue comment and a label each, the reconciliation and the closing: stop short of the writes
  // rather than run out half-way, and leave them to the next run.
  const writeBudget = 5 * removals.length + 4 * plan.held.length + 3 * plan.current.length + 2 * plan.stale.length + 40;
  if (write && github.budget() < writeBudget) {
    write = false;
    notes.push(
      `The request budget (${github.budget()} left) is short of the writes (${writeBudget}): nothing is written.`,
    );
  }
  const outcome: string[] = [...notes];
  if (write) {
    outcome.push(
      ...(await reconcileRemovals(github, plan, {
        base: values.base,
        kinds: releases ? undefined : new Set<RemovalKind>(['expiry']),
      })),
    );
    // The owner issues of pending removals: a comment or label an earlier run failed to write. Once a branch's owners
    // are all told, the auto-merge its pull request deferred is requested, if its removal still validates.
    for (const pending of plan.current) {
      const held = plan.held.filter((entry) => entry.branch === pending.branch);
      const where = whereOf(repository, values.base, pending);
      // oxlint-disable-next-line no-await-in-loop -- one branch at a time
      const unnoted = await ensureOwnerNotes(
        github,
        held.map((removal) => ({ kind: pending.kind, removal, branch: pending.branch, where })),
      );
      outcome.push(...unnoted);
      if (
        pending.pull !== undefined &&
        mayResumeAutoMerge({ kind: pending.kind, releases, unnoted, problems: problemsOf(held) })
      ) {
        // oxlint-disable-next-line no-await-in-loop -- one branch at a time
        const resumed = await resumeAutoMerge(github, pending.pull);
        if (resumed !== undefined) {
          outcome.push(resumed);
        }
      }
    }
    for (const [kind, planned] of [
      ['release', plan.releases],
      ['expiry', plan.expiries],
    ] as const) {
      outcome.push(
        // oxlint-disable-next-line no-await-in-loop -- one branch at a time
        ...(await applyRemovals(github, {
          kind,
          removals: planned,
          base: values.base,
          baseSha,
          quarantines: workspace.quarantines,
          problems: problemsOf(planned),
          today: values.today,
        })),
      );
    }
    const roots = new Map(
      [...workspace.projects.values()].map((project) => [quarantinePath(project.root), project.name]),
    );
    outcome.push(
      ...(await closeReleased(github, {
        tests,
        landed,
        identityOf: (path, test) => {
          const project = roots.get(path);
          return project === undefined ? undefined : `${project} › ${test}`;
        },
      })),
    );
  } else {
    outcome.push(dryRun ? 'Dry run: nothing written to GitHub.' : 'Nothing written to GitHub.');
    if (values.out) {
      for (const file of removalFiles(workspace.quarantines, removals)) {
        const target = join(resolve(values.out), file.path);
        // oxlint-disable-next-line no-await-in-loop -- a few files, written in order
        await mkdir(dirname(target), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- a few files, written in order
        await writeFile(target, file.text);
        outcome.push(`Wrote ${target}.`);
      }
    }
  }
  const markdown = renderRemovalMarkdown(plan, outcome);
  console.log(markdown);
  if (values.summary) {
    await appendFile(values.summary, `${markdown}\n`);
  }
  for (const expired of plan.expiries) {
    console.log(
      `::warning title=Quarantine expired::${expired.id.replaceAll(/[\n\r%]/gu, ' ')}: expires ${expired.entry.expires}; the entry is removed and the test gates again`,
    );
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
