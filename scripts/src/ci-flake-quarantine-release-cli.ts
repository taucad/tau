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

import { client, GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import type { LedgerState } from '#ci-flake-ledger-state.js';
import { branchStore, fileStore, stateBranch } from '#ci-flake-ledger-store.js';
import { identityHashOf } from '#ci-flake-quarantine-entry.js';
import {
  branchExists,
  comment,
  enableAutoMerge,
  encodePath,
  mayAutoMerge,
  pushFiles,
  readTestFiles,
  readWorkspace,
  trackedPaths,
  treeProblems,
} from '#ci-flake-quarantine-entry-cli.js';
import type { Workspace } from '#ci-flake-quarantine-entry-cli.js';
import {
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

/**
 * Every removal branch still in play: one whose pull request is open, or that has none yet. A branch whose pull
 * request was merged or closed holds nothing. Each lists the entries it removes, read from the commit it was built on
 * and its own: entries added to `main` since are not removals.
 */
export const readPendingRemovals = async (github: Client): Promise<PendingRemoval[]> => {
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
      const commit = await github.get<BranchCommit>(`${repo}/commits/${reference.object.sha}`);
      const parent = commit.parents?.[0]?.sha;
      const removed: Array<{ path: string; entry: unknown }> = [];
      for (const file of commit.files ?? []) {
        if (!isQuarantineFile(file.filename) || file.status !== 'modified' || parent === undefined) {
          continue;
        }
        const read = async (ref: string): Promise<string> =>
          github.getText(`${repo}/contents/${encodePath(file.filename)}?ref=${ref}`, 'application/vnd.github.raw+json');
        // oxlint-disable-next-line no-await-in-loop -- a file or two per branch
        const [before, after] = await Promise.all([read(parent), read(reference.object.sha)]);
        removed.push(...removedEntries(before, after).map((entry) => ({ path: file.filename, entry })));
      }
      pending.push({
        branch,
        kind,
        pull: pulls.find((pull) => pull.state === 'open')?.number,
        message: commit.commit?.message,
        removed,
      });
    }
  }
  return pending;
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
  const timeline = await github.get<TimelineEvent[]>(`${repo}/issues/${issue}/timeline?per_page=100`);
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

/**
 * Open the pull request of every current removal branch that has none, and close the open pull request of every
 * stale one. Auto-merge stays with whoever reviews a pull request this run did not push. Returns one line per branch.
 */
export const reconcileRemovals = async (github: Client, plan: RemovalPlan, base: string): Promise<string[]> => {
  const repo = `/repos/${github.repository}`;
  const outcome: string[] = [];
  for (const pending of plan.current.filter((entry) => entry.pull === undefined)) {
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
        body: `${rest.join('\n').trim()}\n\nOpened by a later run of the flake ledger for a ${pending.kind} branch that had no pull request; its entries are still on \`${base}\` as it found them. Auto-merge is left to the reviewer.\n`,
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
      body: removalBody(kind, removals, { autoMerge, problems: context.problems }),
    });
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.status !== 403 && error.status !== 422)) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    outcome.push(
      `Could not open the pull request (${error instanceof Error ? error.message : String(error)}); the owner issues name the branch to open.`,
    );
  }
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
    }
  }
  const compare = `https://github.com/${github.repository}/compare/${context.base}...${encodePath(branch)}?expand=1`;
  const where = pull
    ? `The removal is #${pull.number}${merging ? ' (squash auto-merge on)' : ''}.`
    : `The removal is on branch \`${branch}\`, but this token may not open pull requests: open it at ${compare} (it touches only quarantine.json files${autoMerge ? ' and validates, so it may auto-merge' : ''}).`;
  for (const removal of removals) {
    const identity = identityHashOf(removal.id);
    const body =
      kind === 'release' ? releaseComment(removal, { identity, where }) : expiryComment(removal, { identity, where });
    try {
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time, in order
      await comment(github, removal.entry.issue, body);
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time, in order
      await github.send('POST', `${repo}/issues/${removal.entry.issue}/labels`, {
        labels: [kind === 'release' ? releasingLabel : operatorLabel],
      });
    } catch (error) {
      // One failed issue must not keep the other owners from the link; the pull request body names every issue.
      outcome.push(
        `Could not update #${removal.entry.issue}: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
  return outcome;
};

/**
 * Close the owner issue of every release that has landed: an issue labelled `flake:releasing` whose entry is no
 * longer on `main` and whose newest removal comment is a release closes as completed, labelled `flake:released`. One
 * whose newest removal is an expiry only loses `flake:releasing`: the test was not fixed.
 */
export const closeReleased = async (
  github: Client,
  context: { readonly tests: readonly QuarantinedTest[]; readonly today: string },
): Promise<string[]> => {
  const { tests, today } = context;
  const repo = `/repos/${github.repository}`;
  const onMain = new Set(tests.map((test) => test.entry.issue));
  const outcome: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- pages are read in order
    const issues = await github.get<LabelledIssue[]>(
      `${repo}/issues?state=all&labels=${encodeURIComponent(releasingLabel)}&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      if (issue.pull_request !== undefined || onMain.has(issue.number)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time
      const comments = await github.get<Array<{ body?: string }>>(
        `${repo}/issues/${issue.number}/comments?per_page=100`,
      );
      const last = lastRemoval(comments.map((entry) => entry.body ?? ''));
      const others = labelNames(issue.labels).filter((name) => name !== releasingLabel);
      if (last?.kind !== 'release') {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await github.send('PATCH', `${repo}/issues/${issue.number}`, { labels: others });
        outcome.push(
          `#${issue.number} left quarantine by an expiry: \`${releasingLabel}\` removed, the issue stays open.`,
        );
        continue;
      }
      const labels = [...new Set([...others, releasedLabel])];
      // The landed release, with its day: a return within 30 days of it re-enters as this entry.
      // oxlint-disable-next-line no-await-in-loop -- one issue at a time
      await comment(
        github,
        issue.number,
        `${removalMarker('released', { ...last.record, released: today })}\nThe release has landed: the entry is no longer on main and the test gates again. A return within 30 days reopens this issue as the same entry, for the operator.`,
      );
      if (issue.state === 'open') {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await github.send('PATCH', `${repo}/issues/${issue.number}`, {
          state: 'closed',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- the REST API's field name
          state_reason: 'completed',
          labels,
        });
        outcome.push(`Closed #${issue.number}: released.`);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- one issue at a time
        await github.send('PATCH', `${repo}/issues/${issue.number}`, { labels });
        outcome.push(`Labelled #${issue.number} \`${releasedLabel}\`; it was already closed.`);
      }
    }
    if (issues.length < 100) {
      break;
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
        base: { type: 'string', default: 'main' },
        today: { type: 'string', default: utcDay() },
        root: { type: 'string', default: '.' },
        out: { type: 'string', default: '' },
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
  const pending = offline ? [] : await readPendingRemovals(github);
  const fixes = offline ? new Map<string, LinkedFix | undefined>() : await readFixes(github, tests, state);
  const plan = planRemovals({ tests, tracks: state.quarantineTracks ?? {}, fixes, pending, today: values.today });

  const removals = [...plan.releases, ...plan.expiries];
  const contents = await readTestFiles(offline ? undefined : github, {
    root,
    paths: trackedPaths(workspace, []),
    ref: baseSha,
  });
  const problemsOf = (kind: readonly PlannedRemoval[]): string[] =>
    treeProblems(workspace, removalFiles(workspace.quarantines, kind), {
      readTracked: (path) => contents.get(path),
      today: values.today,
    });

  // Two branches, an issue comment and a label each, the reconciliation and the closing: stop short of the writes
  // rather than run out half-way, and leave them to the next run.
  const writeBudget = 3 * removals.length + 3 * plan.current.length + 2 * plan.stale.length + 40;
  if (write && github.budget() < writeBudget) {
    write = false;
    notes.push(
      `The request budget (${github.budget()} left) is short of the writes (${writeBudget}): nothing is written.`,
    );
  }
  const outcome: string[] = [...notes];
  if (write) {
    outcome.push(...(await reconcileRemovals(github, plan, values.base)));
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
    outcome.push(...(await closeReleased(github, { tests, today: values.today })));
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
