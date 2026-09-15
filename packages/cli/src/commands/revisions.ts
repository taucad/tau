/**
 * `tau revisions` — the revision graph from a terminal (S13, A10).
 *
 * Headless parity is the point: every verb here calls the same functions and the
 * same machines the app does (`openProjectRevisions` in `@taucad/host`), so a
 * scripted switch and a click in the Revisions pane cannot drift. No verb has
 * semantics of its own.
 *
 * The words are the operator's (A18, I12): branches, revisions and projects.
 * Nothing prints "checkout", "worktree", "lease", "ref" or "HEAD".
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { openProjectRevisions, requireRevisionToolchain } from '@taucad/host';
import type { ProjectRevisionVerbs } from '@taucad/host';
import { defineCommand } from 'citty';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { cliError, emit, exitCodes, writeStdout } from '#output.js';

/** Arguments every verb takes. */
const projectArguments = {
  project: {
    type: 'string',
    description: 'Project directory (defaults to the current directory)',
    required: false,
  },
  json: {
    type: 'boolean',
    description: 'Write one versioned JSON result record to stdout instead of plain lines',
    required: false,
  },
} as const;

/**
 * Refuse the run when the binaries a disk host records with are missing.
 *
 * `git` is the engine and `git-lfs` is how large objects reach a remote and how
 * a stock clone resolves them; the desktop app ships both, and the CLI takes
 * what is installed and says which one is not (OQ-B8).
 *
 * @throws CliError Naming exactly what is missing.
 */
export const requireGitToolchain = async (): Promise<void> => {
  try {
    await requireRevisionToolchain();
  } catch (error) {
    throw cliError(
      'GIT_NOT_AVAILABLE',
      error instanceof Error ? error.message : 'Tau records revisions with git and git-lfs.',
      exitCodes.refused,
    );
  }
};

/**
 * Open the project's revisions, refusing a directory that has none.
 *
 * @param project - The `--project` argument, if any.
 * @returns The verbs, and the resolved project directory.
 * @throws CliError When no revision history exists there.
 */
const open = async (
  project: string | undefined,
): Promise<Readonly<{ revisions: ProjectRevisionVerbs; workspaceRoot: string }>> => {
  const workspaceRoot = resolve(project ?? process.cwd());
  /* The binaries first, so "git-lfs is not installed" never reaches a person as
   * "this project has no revision history" (OQ-B8). */
  await requireGitToolchain();
  /* And a path that is not there is not a project without a history, which is
   * what the refusal below would otherwise call it (a1 review R14). */
  if (!existsSync(workspaceRoot)) {
    throw cliError('NO_PROJECT', `${workspaceRoot} does not exist.`, exitCodes.refused);
  }
  const revisions = openProjectRevisions({ workspaceRoot });
  try {
    await revisions.describeEngine();
  } catch {
    await revisions.close();
    throw cliError(
      'NO_REVISION_HISTORY',
      `${workspaceRoot} has no revision history. Open it in Tau, or run \`tau serve --workspace ${workspaceRoot}\` once, to start one.`,
      exitCodes.refused,
    );
  }
  return { revisions, workspaceRoot };
};

/** One row of the history, as the verbs answer it. */
type RevisionRow = Awaited<ReturnType<ProjectRevisionVerbs['log']>>[number];

/**
 * `Rev 12  main  ada  Added the bracket` — the pane's own row, one line wide.
 *
 * @param row - One revision as the verbs answer it.
 * @param branch - The branch being listed, or `undefined` in a project with none.
 * @returns The printable line.
 */
const rowLine = (row: RevisionRow, branch: string | undefined): string =>
  [
    /* Wide enough for `Rev 9999`; a merged-in revision has no number and keeps
     * the column, so the branch names line up either way (a1 review R14). */
    (row.revisionNumber === undefined ? '' : `Rev ${String(row.revisionNumber)}`).padEnd(8),
    ...[
      branch ?? '',
      row.actor,
      `${row.tags.length === 0 ? '' : `[${row.tags.join(', ')}] `}${row.conflicted ? `${row.summary} (needs resolution)` : row.summary}${row.trigger === 'idle' || row.trigger === 'hidden' || row.trigger === 'close' ? ' (autosave)' : ''}`,
    ].filter((field) => field !== ''),
  ].join('  ');

const tagCommand = defineCommand({
  meta: { name: 'tag', description: 'Name a revision, or remove a revision name' },
  args: {
    ...projectArguments,
    name: { type: 'positional', description: 'Version name', required: true },
    revision: { type: 'positional', description: 'Revision id (defaults to the current revision)', required: false },
    note: { type: 'string', description: 'Note stored with the name', required: false },
    delete: { type: 'boolean', description: 'Remove this version name', required: false },
  },
  async run({ args }) {
    const { revisions } = await open(args.project);
    try {
      if (args.delete === true) {
        await revisions.deleteTag(args.name);
        if (args.json) await emit({ kind: 'revision-tag', ok: true, deleted: args.name });
        else await writeStdout(`Removed version name ${args.name}.\n`);
        return;
      }
      const revisionId = args.revision || (await revisions.describe()).revisionId;
      if (revisionId === undefined) {
        throw cliError('NO_REVISION', 'There is no revision to name yet.', exitCodes.refused);
      }
      const tag = await revisions.tag({
        name: args.name,
        revisionId,
        ...(args.note === undefined ? {} : { note: args.note }),
      });
      if (args.json) await emit({ kind: 'revision-tag', ok: true, tag });
      else await writeStdout(`${tag.name} names ${revisionId}.\n`);
    } finally {
      await revisions.close();
    }
  },
});

const logCommand = defineCommand({
  meta: { name: 'log', description: 'List a branch’s revisions, newest first' },
  args: {
    ...projectArguments,
    branch: {
      type: 'string',
      description: 'Branch to list (defaults to the one this project is on)',
      required: false,
    },
    limit: {
      type: 'string',
      description: 'Most recent revisions to list',
      required: false,
    },
  },
  async run({ args }) {
    const limit = args.limit === undefined || args.limit === '' ? undefined : Number(args.limit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
      throw cliError('INVALID_LIMIT', '--limit must be a positive integer', exitCodes.usage);
    }
    const { revisions } = await open(args.project);
    try {
      const place = await revisions.describe();
      const branch = args.branch ?? place.branch;
      const rows = await revisions.log({
        ...(args.branch === undefined ? {} : { branch: args.branch }),
        ...(limit === undefined ? {} : { limit }),
      });
      if (args.json) {
        await emit({ kind: 'revisions', ok: true, branch, revisions: rows });
        return;
      }
      if (rows.length === 0) {
        await writeStdout('No revisions yet.\n');
        return;
      }
      await writeStdout(`${rows.map((row) => rowLine(row, branch)).join('\n')}\n`);
    } finally {
      await revisions.close();
    }
  },
});

const diffCommand = defineCommand({
  meta: { name: 'diff', description: 'List the files that changed between two revisions' },
  args: {
    ...projectArguments,
    from: { type: 'positional', description: 'Older revision', required: true },
    to: { type: 'positional', description: 'Newer revision', required: true },
  },
  async run({ args }) {
    const { revisions } = await open(args.project);
    try {
      const changes = await revisions.diff(args.from, args.to);
      if (args.json) {
        await emit({ kind: 'revision-diff', ok: true, from: args.from, to: args.to, changes });
        return;
      }
      if (changes.length === 0) {
        await writeStdout('No files changed.\n');
        return;
      }
      await writeStdout(`${changes.map((change) => `${change.kind.padEnd(8)}  ${change.path}`).join('\n')}\n`);
    } finally {
      await revisions.close();
    }
  },
});

const describeCommand = defineCommand({
  meta: { name: 'describe', description: 'Say which branch this project is on and what else it holds' },
  args: projectArguments,
  async run({ args }) {
    const { revisions } = await open(args.project);
    try {
      const place = await revisions.describe();
      if (args.json) {
        await emit({ kind: 'revision-place', ok: true, ...place });
        return;
      }
      await writeStdout(
        `${place.line}\n${place.branches.map((branch) => `  ${branch.name}  Rev ${String(branch.revisionNumber)}`).join('\n')}\n`,
      );
    } finally {
      await revisions.close();
    }
  },
});

const switchCommand = defineCommand({
  meta: {
    name: 'switch',
    description:
      'Put this project’s files on another branch (a project Tau has not opened before is adopted: `.gitignore`, `.gitattributes` and `git lfs install --local`)',
  },
  args: {
    ...projectArguments,
    branch: { type: 'positional', description: 'Branch to move to', required: true },
    force: {
      type: 'boolean',
      description: 'Switch even though the project has changes that are not in a revision yet',
      required: false,
    },
  },
  async run({ args }) {
    const { revisions } = await open(args.project);
    try {
      const outcome = await revisions.switchTo(args.branch, { confirm: args.force === true });
      if (args.json) {
        await emit({ kind: 'revision-switch', ok: outcome.status === 'switched', ...outcome });
      }
      if (outcome.status === 'switched') {
        if (!args.json) {
          await writeStdout(`${outcome.line}\n`);
        }
        return;
      }
      throw cliError(
        outcome.status === 'needs-confirmation' ? 'SWITCH_NEEDS_CONFIRMATION' : 'SWITCH_REFUSED',
        outcome.status === 'needs-confirmation'
          ? `${outcome.reason} Save a revision first, or pass --force.`
          : outcome.reason,
        exitCodes.refused,
      );
    } finally {
      await revisions.close();
    }
  },
});

const discardCommand = defineCommand({
  meta: {
    name: 'discard',
    description:
      'Remove a branch’s files from this machine, keeping its revisions (a project Tau has not opened before is adopted: `.gitignore`, `.gitattributes` and `git lfs install --local`)',
  },
  args: {
    ...projectArguments,
    branch: { type: 'positional', description: 'Branch whose files to remove', required: true },
  },
  async run({ args }) {
    const { revisions } = await open(args.project);
    try {
      const outcome = await revisions.discard(args.branch);
      if (args.json) {
        await emit({ kind: 'revision-discard', ok: outcome.status === 'discarded', ...outcome });
      }
      if (outcome.status === 'discarded') {
        if (!args.json) {
          await writeStdout(`Removed the files of ${args.branch}. Its revisions are still here.\n`);
        }
        return;
      }
      throw cliError('DISCARD_REFUSED', outcome.reason, exitCodes.refused);
    } finally {
      await revisions.close();
    }
  },
});

/** `tau revisions` command family. */
export const revisionsCommand = defineCommand({
  meta: {
    name: 'revisions',
    description: 'Read and move between a project’s revisions',
  },
  subCommands: {
    log: logCommand,
    describe: describeCommand,
    diff: diffCommand,
    tag: tagCommand,
    switch: switchCommand,
    discard: discardCommand,
  },
});
