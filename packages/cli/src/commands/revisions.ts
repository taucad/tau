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
 *
 * `log --provenance` is the diagnostic (B5): under each row, the ids the entry
 * is stored under and what its trailer recorded — identity, capture and leg —
 * read from the log entry, never from the row, and never with an address.
 */

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { authApiOrigin, inspectSession, resolveAuthToken } from '#auth.js';
import { createProjectRevisionPort, openProjectRevisions, readProjectId, requireRevisionToolchain } from '@taucad/host';
import type { ProjectRevisionVerbs } from '@taucad/host';
import { defineCommand } from 'citty';

import { cliError, emit, exitCodes, writeStdout } from '#output.js';

/** The Tau account a revision records, in the host's own shape. */
type RevisionUserActor = NonNullable<Parameters<typeof openProjectRevisions>[0]['actor']>;

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
 * a stock clone resolves them. The CLI takes what is installed and says which
 * one is not (OQ-B8). The desktop app is meant to carry its own `git` with
 * `git-lfs` inside its exec path (OQ3); until that payload is packaged and
 * verified, every host here answers from `PATH`.
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
 * @param session - The Tau Cloud API and session token a push travels with, when this verb pushes.
 * @returns The verbs, and the resolved project directory.
 * @throws CliError When no revision history exists there.
 */
const open = async (
  project: string | undefined,
  session: Readonly<{ apiBaseUrl?: string; apiToken?: string; actor?: RevisionUserActor }> = {},
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
  const revisions = await openProjectRevisions({ workspaceRoot, ...session });
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
 * The who column: the id Tau recorded, or a commit's git author; empty when it names none (B2).
 *
 * @param who - The row's typed who.
 * @returns The printable field.
 */
const whoField = (who: RevisionRow['who']): string =>
  who.kind === 'recorded' ? who.identity.id : (who.authorName ?? '');

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
      whoField(row.who),
      `${row.tags.length === 0 ? '' : `[${row.tags.join(', ')}] `}${row.conflicted ? `${row.summary} (needs resolution)` : row.summary}${row.capture === 'idle' || row.capture === 'hidden' || row.capture === 'close' ? ' (autosave)' : ''}`,
    ].filter((field) => field !== ''),
  ].join('  ');

/** The store a project's entries are read from, as the host opens it. */
type ProjectPort = ReturnType<typeof createProjectRevisionPort>;

/** What one entry's trailer records about itself (blueprint B1). */
type RecordedProvenance = NonNullable<Awaited<ReturnType<ProjectPort['readRevision']>>>['provenance'];

/** A recorded person, without the address an older build may have written beside the id (I3). */
type ProvenancePerson = Readonly<{ kind: 'user'; id: string; name?: string; anonymous?: true }>;

/** One entry's recorded provenance, as `--provenance` prints it and `--json` carries it (B5). */
type EntryProvenance = Readonly<{
  revisionId: string;
  treeId: string;
  parents: readonly string[];
  source: RecordedProvenance['source'];
  /** `undefined` for a commit Tau did not write: nothing stands in for the identity it lacks. */
  identity:
    | ProvenancePerson
    | Readonly<{ kind: 'agent'; id: string; runId: string; onBehalfOf: ProvenancePerson }>
    | undefined;
  capture: RecordedProvenance['capture'];
  via: RecordedProvenance['via'];
  turnCut: RecordedProvenance['turnCut'];
}>;

/**
 * A recorded person as the diagnostics print one: id, name and the anonymity
 * mark. Never an address: I3 keeps addresses out of commits, and a diagnostic
 * that echoed one an older build wrote would hand it on.
 *
 * @param person - The person a trailer names.
 * @returns The person, without an address.
 */
const personOf = (person: Readonly<{ id: string; name?: string; anonymous?: boolean }>): ProvenancePerson => ({
  kind: 'user',
  id: person.id,
  ...(person.name === undefined || person.anonymous === true ? {} : { name: person.name }),
  ...(person.anonymous === true ? { anonymous: true } : {}),
});

/**
 * The identity a trailer records, in the diagnostics' shape.
 *
 * @param actor - The recorded identity, or `undefined` for a commit Tau did not write.
 * @returns The identity without an address.
 */
const identityOf = (actor: RecordedProvenance['actor']): EntryProvenance['identity'] => {
  if (actor === undefined) {
    return undefined;
  }
  if (actor.kind === 'user') {
    return personOf(actor);
  }
  return { kind: 'agent', id: actor.id, runId: actor.runId, onBehalfOf: personOf(actor.onBehalfOf) };
};

/**
 * Read every listed entry's recorded provenance from the store (B5).
 *
 * A row is what a person reads; the trailer's identity and leg are diagnostics
 * no row carries, so they come from the log entry itself. One walk from the
 * newest row answers most of them; an entry that walk did not reach (a limit
 * that stopped on a merged side) is read on its own.
 *
 * @param workspaceRoot - The project directory, already opened.
 * @param rows - The rows being printed, newest first.
 * @returns Each row's provenance, by revision id.
 */
const readProvenance = async (
  workspaceRoot: string,
  rows: readonly RevisionRow[],
): Promise<ReadonlyMap<string, EntryProvenance>> => {
  const [newest] = rows;
  /* Opening the project established its identity; reading it back creates nothing. */
  const projectId = await readProjectId({
    stat: async (path) => stat(join(workspaceRoot, path)),
    readFile: async (path) => new Uint8Array(await readFile(join(workspaceRoot, path))),
  });
  if (newest === undefined || projectId === undefined) {
    return new Map();
  }
  type Id = Parameters<ProjectPort['readRevision']>[0];
  const port = createProjectRevisionPort({ workspaceRoot, projectId });
  const records = new Map<
    string,
    Readonly<{ treeId: string; parents: readonly string[]; provenance: RecordedProvenance }>
  >();
  for (const entry of await port.log({ heads: [newest.revisionId as Id], limit: rows.length })) {
    records.set(entry.id, entry);
  }
  const missed = rows.filter((row) => !records.has(row.revisionId));
  for (const record of await Promise.all(missed.map(async (row) => port.readRevision(row.revisionId as Id)))) {
    if (record !== undefined) {
      records.set(record.id, record);
    }
  }
  const provenance = new Map<string, EntryProvenance>();
  for (const row of rows) {
    const record = records.get(row.revisionId);
    if (record !== undefined) {
      provenance.set(row.revisionId, {
        revisionId: row.revisionId,
        treeId: record.treeId,
        parents: record.parents,
        source: record.provenance.source,
        identity: identityOf(record.provenance.actor),
        capture: record.provenance.capture,
        via: record.provenance.via,
        turnCut: record.provenance.turnCut,
      });
    }
  }
  return provenance;
};

/**
 * A person as one diagnostics line names them: `user usr_ada "Ada"`, `user anon:3fa9c1d2 (anonymous)`.
 *
 * @param person - The recorded person.
 * @returns The printable words.
 */
const personWords = (person: ProvenancePerson): string =>
  [
    `user ${person.id}`,
    ...(person.name === undefined ? [] : [JSON.stringify(person.name)]),
    ...(person.anonymous === true ? ['(anonymous)'] : []),
  ].join(' ');

const notRecorded = 'not recorded';

/**
 * The indented lines `--provenance` prints under a row: its ids, then what its trailer records.
 *
 * @param provenance - The entry's provenance, or `undefined` when the store did not answer for it.
 * @returns The lines, each indented under the row.
 */
const provenanceLines = (provenance: EntryProvenance | undefined): readonly string[] => {
  if (provenance === undefined) {
    return [`  ${notRecorded}`];
  }
  const { identity } = provenance;
  const fields: ReadonlyArray<readonly [string, string]> = [
    ['id', provenance.revisionId],
    ['tree', provenance.treeId],
    ['parent', provenance.parents[0] ?? 'none'],
    ...(provenance.parents.length > 1 ? ([['merged', provenance.parents.slice(1).join(' ')]] as const) : []),
    ['source', provenance.source],
    [
      'identity',
      identity === undefined
        ? notRecorded
        : identity.kind === 'user'
          ? personWords(identity)
          : `agent ${identity.id} run ${identity.runId} for ${personWords(identity.onBehalfOf)}`,
    ],
    ['capture', provenance.capture ?? notRecorded],
    ['via', provenance.via ?? notRecorded],
    ...(provenance.turnCut === undefined ? [] : ([['turn cut', provenance.turnCut]] as const)),
  ];
  return fields.map(([label, value]) => `  ${label.padEnd(9)} ${value}`);
};

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
        await (args.json
          ? emit({ kind: 'revision-tag', ok: true, deleted: args.name })
          : writeStdout(`Removed version name ${args.name}.\n`));
        return;
      }
      let revisionId = args.revision;
      if (revisionId === undefined) {
        ({ revisionId } = await revisions.describe());
      }
      if (revisionId === undefined) {
        throw cliError('NO_REVISION', 'There is no revision to name yet.', exitCodes.refused);
      }
      const tag = await revisions.tag({
        name: args.name,
        revisionId,
        ...(args.note === undefined ? {} : { note: args.note }),
      });
      await (args.json
        ? emit({ kind: 'revision-tag', ok: true, tag })
        : writeStdout(`${tag.name} names ${revisionId}.\n`));
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
    provenance: {
      type: 'boolean',
      description:
        'Also print what each entry recorded about itself: its id, tree and parent, and the identity, capture and leg its trailer names (never an address)',
      required: false,
    },
  },
  async run({ args }) {
    const limit = args.limit === undefined || args.limit === '' ? undefined : Number(args.limit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
      throw cliError('INVALID_LIMIT', '--limit must be a positive integer', exitCodes.usage);
    }
    const { revisions, workspaceRoot } = await open(args.project);
    try {
      const place = await revisions.describe();
      const branch = args.branch ?? place.branch;
      const rows = await revisions.log({
        ...(args.branch === undefined ? {} : { branch: args.branch }),
        ...(limit === undefined ? {} : { limit }),
      });
      const provenance = args.provenance === true ? await readProvenance(workspaceRoot, rows) : undefined;
      if (args.json) {
        await emit({
          kind: 'revisions',
          ok: true,
          branch,
          revisions:
            provenance === undefined
              ? rows
              : rows.map((row) => ({ ...row, provenance: provenance.get(row.revisionId) ?? null })),
        });
        return;
      }
      if (rows.length === 0) {
        await writeStdout('No revisions yet.\n');
        return;
      }
      const lines = rows.map((row) =>
        [
          rowLine(row, branch),
          ...(provenance === undefined ? [] : provenanceLines(provenance.get(row.revisionId))),
        ].join('\n'),
      );
      await writeStdout(`${lines.join('\n')}\n`);
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
  },
  async run({ args }) {
    const { revisions } = await open(args.project);
    try {
      /* Unsaved changes are saved on the branch being left first, so nothing asks (I11). */
      const outcome = await revisions.switchTo(args.branch);
      if (args.json) {
        await emit({ kind: 'revision-switch', ok: outcome.status === 'switched', ...outcome });
      }
      if (outcome.status === 'switched') {
        if (!args.json) {
          await writeStdout(`${outcome.line}\n`);
        }
        return;
      }
      throw cliError('SWITCH_REFUSED', outcome.reason, exitCodes.refused);
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

/**
 * The Tau account a session token belongs to, as a revision records it (A1).
 *
 * The account id only: never the account's email, the OS login name or an
 * environment address. A token the API does not accept, or an API that cannot
 * be reached, names no account, and the host then records this device's
 * pseudonym rather than guessing.
 *
 * @param apiBaseUrl - The API origin the token belongs to.
 * @param apiToken - The session token.
 * @returns The account, or `undefined` when the API does not confirm one.
 */
export const tokenRevisionActor = async (
  apiBaseUrl: string,
  apiToken: string,
): Promise<RevisionUserActor | undefined> => {
  try {
    const session = await inspectSession(apiBaseUrl, apiToken);
    return session === undefined ? undefined : { kind: 'user', id: session.user.id };
  } catch {
    return undefined;
  }
};

/**
 * The session a save backs up to Tau Cloud with, and records its author as, when this terminal was given one.
 *
 * The same two values `tau publish` and `tau clone` are told (P40), but optional:
 * a save is recorded either way, and without them only a Git remote, or none,
 * is backed up to, under this device's pseudonym (A1).
 *
 * @returns The API origin, token and its account, or nothing when no token is set.
 */
const optionalSession = async (): Promise<
  Readonly<{ apiBaseUrl?: string; apiToken?: string; actor?: RevisionUserActor }>
> => {
  const apiBaseUrl = authApiOrigin();
  const apiToken = await resolveAuthToken(apiBaseUrl);
  if (!apiToken) {
    return {};
  }
  const actor = await tokenRevisionActor(apiBaseUrl, apiToken);
  return { apiBaseUrl, apiToken, ...(actor === undefined ? {} : { actor }) };
};

/** How a save's backup reads, after `Saved main · Rev 3.` */
const backupSentences = {
  backedUp: ' Backed up.',
  noRemote: ' Saved on this device.',
} as const;

const saveCommand = defineCommand({
  meta: {
    name: 'save',
    description:
      'Record this project’s files as a revision and back it up (set TAU_API_URL and TAU_AUTH_TOKEN to back up to Tau Cloud)',
  },
  args: projectArguments,
  async run({ args }) {
    const { revisions } = await open(args.project, await optionalSession());
    try {
      const outcome = await revisions.save();
      if (args.json) {
        await emit({
          kind: 'revision-save',
          ok: outcome.status === 'saved' || outcome.status === 'unchanged',
          ...outcome,
        });
      }
      if (outcome.status === 'refused') {
        throw cliError('SAVE_REFUSED', outcome.reason, exitCodes.refused);
      }
      if (args.json) {
        return;
      }
      /* A revision that is saved and not yet backed up is still saved: D28's
       * queue carries the push, so this exits 0 and says what is owed. */
      await writeStdout(
        outcome.status === 'unchanged'
          ? `Nothing new to save. ${outcome.line}\n`
          : `Saved ${outcome.line}.${
              outcome.backup === 'backedUp' || outcome.backup === 'noRemote'
                ? backupSentences[outcome.backup]
                : ` Not backed up: ${outcome.reason ?? 'the backup did not finish.'}`
            }\n`,
      );
    } finally {
      await revisions.close();
    }
  },
});

/** `tau revisions` command family. */
export const revisionsCommand = defineCommand({
  meta: {
    name: 'revisions',
    description: 'Record, read and move between a project’s revisions',
  },
  subCommands: {
    save: saveCommand,
    log: logCommand,
    describe: describeCommand,
    diff: diffCommand,
    tag: tagCommand,
    switch: switchCommand,
    discard: discardCommand,
  },
});
