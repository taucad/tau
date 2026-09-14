import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  ImmutableRevisionTree,
  ResourceQueue,
  mergeRevisionTrees,
  revisionMetadataSchema,
  revisionId,
} from '@taucad/filesystem/revisions';
import { revisionBranchName } from '#revision-authority.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import { refPatternIsHostLocal } from '#remotes.js';
import type { RevisionFileMode, RevisionId, RevisionTreeInput } from '@taucad/filesystem/revisions';
import type { BranchHeadUpdateResult, Revision, RevisionProvenance, RevisionSummary } from '#revision-authority.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import { runGitCommand } from '#git-command.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import type { GitCommandResult } from '#git-command.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import { NativeGitError } from '#native-git.types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package import map resolves this internal source file.
import type {
  BindNativeGitWorkspaceInput,
  CommitNativeGitWorkspaceInput,
  GitObjectId,
  MergeNativeGitRevisionsInput,
  NativeGitAdapter,
  NativeGitAdapterOptions,
  NativeGitCapabilities,
  NativeGitFetchInput,
  NativeGitMergeResult,
  NativeGitPushInput,
  NativeGitRevisionGraph,
  NativeGitWorkspace,
  NativeGitWorkspaceUpdateResult,
  PublishNativeGitBranchInput,
  ReopenNativeGitWorkspaceInput,
  StoredGitRevision,
} from '#native-git.types.js';

type InitializedRepository = Readonly<{
  repositoryPath: string;
  worktreeRoot: string;
  objectFormat: 'sha1' | 'sha256';
  zeroObjectId: string;
}>;

type OwnershipRecord = Readonly<{
  version: number;
  workspaceId: string;
  runId: string;
  baseRevisionId: string;
}>;

type RevisionMetadata = Readonly<{
  version: 1;
  id: string;
  parents: readonly string[];
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

type RefUpdateOutcome =
  | Readonly<{ status: 'updated' }>
  | Readonly<{ status: 'stale'; actual: GitObjectId | undefined }>;

const metadataPrefix = 'Tau-Metadata: ';
const branchRefPrefix = 'refs/heads/tau';
const ownerRefPrefix = 'refs/tau/owners';
const revisionRefPrefix = 'refs/tau/revisions';
const transactionRefPrefix = 'refs/tau/transactions';
const stagingRefPrefix = `${transactionRefPrefix}/import`;
const workspaceRefPrefix = 'refs/tau/workspaces';
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();

const digestIdentifier = (value: string): string => createHash('sha256').update(value).digest('hex');

const isWithin = (parent: string, candidate: string): boolean => {
  const child = relative(parent, candidate);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
};

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
  });

const runIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !hasControlCharacter(value));
const transportValueSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('-') && !hasControlCharacter(value));
/*
 * The host-local ref list moved to `#remotes.js` in W11b: both legs' transports
 * have to refuse the same set, and this module is Node-only.
 */
const externalRefspecSchema = transportValueSchema.refine((refspec) => {
  const normalized = refspec.startsWith('+') || refspec.startsWith('^') ? refspec.slice(1) : refspec;
  const separator = normalized.indexOf(':');
  const source = separator === -1 ? normalized : normalized.slice(0, separator);
  const destination = separator === -1 ? '' : normalized.slice(separator + 1);
  return [source, destination].every((ref) => ref.length === 0 || !refPatternIsHostLocal(ref));
});
const revisionIdentifierSchema = z.string().refine((value) => {
  try {
    revisionId(value);
    return true;
  } catch {
    return false;
  }
});
const revisionSchema = revisionMetadataSchema.safeExtend({
  id: revisionIdentifierSchema,
  parents: z.array(revisionIdentifierSchema).refine((parents) => new Set(parents).size === parents.length),
  tree: z.instanceof(ImmutableRevisionTree),
  provenance: revisionMetadataSchema.shape.provenance.safeExtend({
    createdAt: z
      .number()
      .refine(Number.isSafeInteger)
      .refine((value) => value >= 0),
    actorId: z.string().min(1),
  }),
  summary: revisionMetadataSchema.shape.summary.safeExtend({ generated: z.string().min(1) }),
});
const ownershipRecordSchema = z.object({
  version: z.literal(1),
  workspaceId: z.string(),
  runId: z.string(),
  baseRevisionId: z.string(),
});

const parseRunId = (runId: string): void => {
  if (!runIdSchema.safeParse(runId).success) {
    throw new TypeError('runId must be a non-empty opaque identifier without control characters.');
  }
};

/**
 * Refuse a remote or ref that could be read as a Git option or carry control
 * characters. Shared with the native revision port.
 *
 * @param value - The transport value.
 * @param label - What it names, for the diagnostic.
 */
export const parseTransportValue = (value: string, label: string): void => {
  if (!transportValueSchema.safeParse(value).success) {
    throw new NativeGitError('INVALID_TRANSPORT', `${label} is not a safe Git transport value.`);
  }
};

/**
 * Refuse a refspec that is unsafe or addresses a host-local Tau ref. Shared with
 * the native revision port, so one allow-list governs every transport.
 *
 * @param refspec - The refspec to check.
 */
export const parseExternalRefspec = (refspec: string): void => {
  const result = externalRefspecSchema.safeParse(refspec);
  if (result.success) {
    return;
  }
  if (!transportValueSchema.safeParse(refspec).success) {
    throw new NativeGitError('INVALID_TRANSPORT', 'refspec is not a safe Git transport value.');
  }
  throw new NativeGitError('INVALID_TRANSPORT', 'refspec cannot address Tau-managed refs.');
};

const parseRevision = (revision: Revision): Revision => {
  const result = revisionSchema.safeParse({ ...revision, version: 1 });
  if (!result.success) {
    throw new TypeError('Revision is invalid.');
  }
  return Object.freeze({
    id: revisionId(result.data.id),
    parents: Object.freeze(result.data.parents.map((parent) => revisionId(parent))),
    tree: result.data.tree,
    provenance: Object.freeze({ ...result.data.provenance }),
    summary: Object.freeze({ ...result.data.summary }),
  });
};

const validateTreePaths = (tree: ImmutableRevisionTree): void => {
  const files = new Set<string>();
  const directories = new Set<string>();
  for (const entry of tree.entries()) {
    const segments = entry.path.split('/');
    if (segments.some((segment) => segment.toLowerCase() === '.git')) {
      throw new NativeGitError('UNSUPPORTED_TREE', 'Revision trees cannot contain a .git path component.');
    }
    const parentDirectories = segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
    for (const directory of parentDirectories) {
      if (files.has(directory)) {
        throw new NativeGitError('UNSUPPORTED_TREE', 'A revision path cannot be both a file and a directory.');
      }
      directories.add(directory);
    }
    if (directories.has(entry.path)) {
      throw new NativeGitError('UNSUPPORTED_TREE', 'A revision path cannot be both a file and a directory.');
    }
    files.add(entry.path);
  }
};

const encodeMetadata = (revision: Revision): string => {
  const metadata: RevisionMetadata = {
    version: 1,
    id: revision.id,
    parents: [...revision.parents],
    provenance: {
      source: revision.provenance.source,
      actorId: revision.provenance.actorId,
      ...(revision.provenance.runId === undefined ? {} : { runId: revision.provenance.runId }),
      createdAt: revision.provenance.createdAt,
    },
    summary: {
      generated: revision.summary.generated,
      ...(revision.summary.edited === undefined ? {} : { edited: revision.summary.edited }),
    },
  };
  return Buffer.from(JSON.stringify(metadata)).toString('base64url');
};

const commitMessage = (revision: Revision): Uint8Array<ArrayBuffer> => {
  const title = (revision.summary.edited ?? revision.summary.generated).replaceAll(/[\r\n]+/gu, ' ').trim();
  return textEncoder.encode(`${title || 'Tau revision'}\n\n${metadataPrefix}${encodeMetadata(revision)}\n`);
};

/**
 * Quote one path the way `fast-import` requires, byte by byte.
 *
 * Not on a barrel: the native revision port writes its trees through the same
 * `fast-import` stream and must quote them identically.
 *
 * @param path - Root-relative path.
 * @returns The quoted path.
 */
export const quoteFastImportPath = (path: string): string => {
  let quoted = '"';
  for (const byte of Buffer.from(path)) {
    quoted +=
      byte >= 0x20 && byte <= 0x7e && byte !== 0x22 && byte !== 0x5c
        ? String.fromCodePoint(byte)
        : `\\${byte.toString(8).padStart(3, '0')}`;
  }
  return `${quoted}"`;
};

const revisionFromMetadata = (metadata: RevisionMetadata, tree: ImmutableRevisionTree): Revision => {
  const id = revisionId(metadata.id);
  const parents = Object.freeze(metadata.parents.map((parent) => revisionId(parent)));
  const revision: Revision = Object.freeze({
    id,
    parents,
    tree,
    provenance: Object.freeze({ ...metadata.provenance }),
    summary: Object.freeze({ ...metadata.summary }),
  });
  return parseRevision(revision);
};

const parseRevisionMetadata = (message: string): RevisionMetadata => {
  const line = message.split('\n').findLast((candidate) => candidate.startsWith(metadataPrefix));
  if (line === undefined) {
    throw new NativeGitError('UNMANAGED_REVISION', 'Git commit is not a Tau revision commit.');
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(line.slice(metadataPrefix.length), 'base64url').toString('utf8'));
    const result = revisionMetadataSchema.safeParse(parsed);
    if (!result.success) {
      throw new TypeError('Invalid revision metadata.');
    }
    const { version, id, parents, provenance, summary } = result.data;
    return { version, id, parents, provenance, summary };
  } catch {
    throw new NativeGitError('UNMANAGED_REVISION', 'Git commit has malformed Tau revision metadata.');
  }
};

const decodePath = (bytes: Uint8Array<ArrayBuffer>): string => {
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new NativeGitError('UNSUPPORTED_TREE', 'Git tree contains a path that is not valid UTF-8.');
  }
};

const sameOwnership = (left: OwnershipRecord, right: OwnershipRecord): boolean =>
  left.version === right.version &&
  left.workspaceId === right.workspaceId &&
  left.runId === right.runId &&
  left.baseRevisionId === right.baseRevisionId;

const parseOwnership = (content: Uint8Array<ArrayBuffer>): OwnershipRecord => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(content).toString('utf8'));
    return ownershipRecordSchema.parse(parsed);
  } catch {
    throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace ownership metadata is malformed.');
  }
};

const freezeMergedRevision = (input: MergeNativeGitRevisionsInput, tree: ImmutableRevisionTree): Revision =>
  Object.freeze({
    id: input.id,
    parents: Object.freeze([input.ours.id, input.theirs.id]),
    tree,
    provenance: Object.freeze({ ...input.provenance }),
    summary: Object.freeze({ ...input.summary }),
  });

/**
 * Create a Node.js adapter over an existing native Git repository.
 *
 * The adapter writes standard objects and refs only. Tau workspace ownership is
 * atomically bound through an expected-absent Git ref, worktrees remain detached,
 * and every moving head uses Git's expected-old `update-ref` transaction.
 *
 * @param options - Explicit repository and managed-worktree host locators.
 * @returns A lazy adapter; repository compatibility is checked by `inspect` or the first operation.
 * @internal
 */
export const createNativeGitAdapter = (options: NativeGitAdapterOptions): NativeGitAdapter => {
  if (options.repositoryPath.length === 0 || options.worktreeRoot.length === 0) {
    throw new TypeError('repositoryPath and worktreeRoot are required.');
  }
  const gitExecutable = options.gitExecutable ?? 'git';
  if (gitExecutable.length === 0) {
    throw new TypeError('gitExecutable cannot be empty.');
  }
  const requestedRepositoryPath = resolve(options.repositoryPath);
  const requestedWorktreeRoot = resolve(options.worktreeRoot);
  const resourceQueue = new ResourceQueue();
  let initialization: Promise<InitializedRepository> | undefined;

  const commandAt = async (
    cwd: string,
    args: readonly string[],
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>,
  ): Promise<GitCommandResult> => {
    try {
      return await runGitCommand({ gitExecutable, cwd, args, input });
    } catch {
      throw new NativeGitError(
        'GIT_COMMAND_FAILED',
        `Native Git could not start the ${args[0] ?? 'requested'} operation.`,
      );
    }
  };

  const requireSuccess = async (
    cwd: string,
    args: readonly string[],
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const result = await commandAt(cwd, args, input);
    if (result.exitCode !== 0) {
      throw new NativeGitError('GIT_COMMAND_FAILED', `Native Git failed the ${args[0] ?? 'requested'} operation.`);
    }
    return result.stdout;
  };

  const initialize = async (): Promise<InitializedRepository> => {
    if (initialization !== undefined) {
      return initialization;
    }
    initialization = (async () => {
      let repositoryPath: string;
      try {
        repositoryPath = await realpath(requestedRepositoryPath);
      } catch {
        throw new NativeGitError('INVALID_REPOSITORY', 'The native Git repository path does not exist.');
      }
      const formatResult = await commandAt(repositoryPath, ['rev-parse', '--show-object-format']);
      if (formatResult.exitCode !== 0) {
        throw new NativeGitError('INVALID_REPOSITORY', 'The native Git repository path is not a Git repository.');
      }
      const objectFormat = Buffer.from(formatResult.stdout).toString('utf8').trim();
      if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
        throw new NativeGitError('INVALID_REPOSITORY', 'The repository uses an unsupported Git object format.');
      }
      await mkdir(requestedWorktreeRoot, { recursive: true });
      const worktreeRoot = await realpath(requestedWorktreeRoot);
      const topLevelResult = await commandAt(repositoryPath, ['rev-parse', '--show-toplevel']);
      if (topLevelResult.exitCode === 0) {
        const topLevel = await realpath(Buffer.from(topLevelResult.stdout).toString('utf8').trim());
        if (isWithin(topLevel, worktreeRoot) || isWithin(worktreeRoot, topLevel)) {
          throw new NativeGitError(
            'INVALID_REPOSITORY',
            'Managed worktrees must be disjoint from the repository worktree.',
          );
        }
      } else if (isWithin(worktreeRoot, repositoryPath)) {
        throw new NativeGitError('INVALID_REPOSITORY', 'Managed worktrees cannot contain the repository.');
      }
      return {
        repositoryPath,
        worktreeRoot,
        objectFormat,
        zeroObjectId: '0'.repeat(objectFormat === 'sha1' ? 40 : 64),
      };
    })();
    return initialization;
  };

  const asObjectId = async (value: string): Promise<GitObjectId> => {
    const repository = await initialize();
    const length = repository.objectFormat === 'sha1' ? 40 : 64;
    if (value.length !== length || !/^[0-9a-f]+$/u.test(value)) {
      throw new NativeGitError('WORKSPACE_CORRUPT', 'Git returned an invalid object identity.');
    }
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- Git output is validated against the repository object format.
    return value as GitObjectId;
  };

  const validateRef = async (ref: string): Promise<void> => {
    parseTransportValue(ref, 'ref');
    const repository = await initialize();
    const result = await commandAt(repository.repositoryPath, ['check-ref-format', ref]);
    if (result.exitCode !== 0) {
      throw new NativeGitError('INVALID_TRANSPORT', 'ref is not a valid full Git ref name.');
    }
  };

  const resolveRef = async (ref: string): Promise<GitObjectId | undefined> => {
    await validateRef(ref);
    const repository = await initialize();
    const result = await commandAt(repository.repositoryPath, ['rev-parse', '--verify', '--quiet', ref]);
    if (result.exitCode === 1) {
      return undefined;
    }
    if (result.exitCode !== 0) {
      throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git failed the rev-parse operation.');
    }
    return asObjectId(Buffer.from(result.stdout).toString('utf8').trim());
  };

  const compareAndUpdateRef = async (options: {
    ref: string;
    next: GitObjectId;
    expected: GitObjectId | undefined;
  }): Promise<RefUpdateOutcome> => {
    const repository = await initialize();
    await validateRef(options.ref);
    const result = await commandAt(repository.repositoryPath, [
      'update-ref',
      options.ref,
      options.next,
      options.expected ?? repository.zeroObjectId,
    ]);
    if (result.exitCode === 0) {
      return { status: 'updated' };
    }
    const actual = await resolveRef(options.ref);
    if (actual !== options.expected) {
      return { status: 'stale', actual };
    }
    throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git failed the update-ref operation.');
  };

  const deleteRef = async (ref: string, expected: GitObjectId): Promise<void> => {
    const repository = await initialize();
    const result = await commandAt(repository.repositoryPath, ['update-ref', '-d', ref, expected]);
    if (result.exitCode !== 0 && (await resolveRef(ref)) !== undefined) {
      throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git failed the update-ref cleanup operation.');
    }
  };

  const revisionRef = (id: RevisionId): string => `${revisionRefPrefix}/${digestIdentifier(id)}`;
  const workspaceRef = (workspaceId: string): string => `${workspaceRefPrefix}/${digestIdentifier(workspaceId)}`;
  const ownerRef = (workspaceId: string): string => `${ownerRefPrefix}/${digestIdentifier(workspaceId)}`;
  const workspacePath = async (workspaceId: string): Promise<string> => {
    const repository = await initialize();
    return join(repository.worktreeRoot, digestIdentifier(workspaceId));
  };

  const readObject = async (objectId: GitObjectId, type: 'blob' | 'commit'): Promise<Uint8Array<ArrayBuffer>> => {
    const repository = await initialize();
    return requireSuccess(repository.repositoryPath, ['cat-file', type, objectId]);
  };

  const revisionIdAtCommit = async (commit: GitObjectId): Promise<RevisionId> => {
    const commitBytes = await readObject(commit, 'commit');
    const metadata = parseRevisionMetadata(Buffer.from(commitBytes).toString('utf8'));
    return revisionId(metadata.id);
  };

  const resolveRevisionCommit = async (id: RevisionId): Promise<GitObjectId> => {
    const commit = await resolveRef(revisionRef(id));
    if (commit === undefined || (await revisionIdAtCommit(commit)) !== id) {
      throw new NativeGitError('UNMANAGED_REVISION', `Revision is not stored by this repository: ${id}`);
    }
    return commit;
  };

  const importRevisionCommit = async (
    revision: Revision,
    parentCommits: readonly GitObjectId[],
    stagingRef: string,
  ): Promise<GitObjectId> => {
    const repository = await initialize();
    validateTreePaths(revision.tree);
    const message = commitMessage(revision);
    const timestamp = Math.floor(revision.provenance.createdAt / 1000);
    const chunks: Array<Uint8Array<ArrayBuffer>> = [
      textEncoder.encode(`commit ${stagingRef}\n`),
      textEncoder.encode(`author Tau Revision <tau@local.invalid> ${timestamp} +0000\n`),
      textEncoder.encode(`committer Tau Revision <tau@local.invalid> ${timestamp} +0000\n`),
      textEncoder.encode(`data ${message.byteLength}\n`),
      message,
      textEncoder.encode('\n'),
    ];
    if (parentCommits[0] !== undefined) {
      chunks.push(textEncoder.encode(`from ${parentCommits[0]}\n`));
      for (const parent of parentCommits.slice(1)) {
        chunks.push(textEncoder.encode(`merge ${parent}\n`));
      }
    }
    chunks.push(textEncoder.encode('deleteall\n'));
    for (const entry of revision.tree.entries()) {
      chunks.push(textEncoder.encode(`M ${entry.mode} inline ${quoteFastImportPath(entry.path)}\n`));
      chunks.push(textEncoder.encode(`data ${entry.content.byteLength}\n`));
      chunks.push(entry.content);
      chunks.push(textEncoder.encode('\n'));
    }
    chunks.push(textEncoder.encode('done\n'));
    await requireSuccess(repository.repositoryPath, ['fast-import', '--quiet', '--date-format=raw'], chunks);
    const commit = await resolveRef(stagingRef);
    if (commit === undefined) {
      throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git did not publish the imported revision object.');
    }
    return commit;
  };

  const storeRevision = async (revision: Revision): Promise<StoredGitRevision> => {
    const parsedRevision = parseRevision(revision);
    return resourceQueue.queueFor(`git-revision:${parsedRevision.id}`, async () => {
      const parentCommits = await Promise.all(parsedRevision.parents.map(resolveRevisionCommit));
      const stagingRef = `${stagingRefPrefix}-${randomUUID()}`;
      let importedCommit: GitObjectId | undefined;
      let canonicalCommitted = false;
      let failed = false;
      let primaryError: unknown;
      let stored: StoredGitRevision | undefined;
      try {
        importedCommit = await importRevisionCommit(parsedRevision, parentCommits, stagingRef);
        const update = await compareAndUpdateRef({
          ref: revisionRef(parsedRevision.id),
          next: importedCommit,
          expected: undefined,
        });
        if (update.status === 'stale' && update.actual !== importedCommit) {
          throw new NativeGitError(
            'UNMANAGED_REVISION',
            `Revision identity already maps to different content: ${parsedRevision.id}`,
          );
        }
        canonicalCommitted = true;
        stored = Object.freeze({ revision: parsedRevision, commit: importedCommit });
      } catch (error) {
        failed = true;
        primaryError = error;
      }
      try {
        const stagedCommit = importedCommit ?? (await resolveRef(stagingRef));
        if (stagedCommit !== undefined) {
          await deleteRef(stagingRef, stagedCommit);
        }
      } catch (cleanupError) {
        if (!canonicalCommitted && !failed) {
          failed = true;
          primaryError = cleanupError;
        }
      }
      if (failed) {
        throw primaryError;
      }
      if (stored === undefined) {
        throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git did not store the imported revision.');
      }
      return stored;
    });
  };

  const readTree = async (commit: GitObjectId): Promise<ImmutableRevisionTree> => {
    const repository = await initialize();
    const output = await requireSuccess(repository.repositoryPath, ['ls-tree', '-rz', '--full-tree', commit]);
    const rawRecords = Buffer.from(output.subarray(0, -1)).toString('binary').split('\0').filter(Boolean);
    const entries = await Promise.all(
      rawRecords.map(async (rawRecord): Promise<RevisionTreeInput> => {
        const record = Buffer.from(rawRecord, 'binary');
        const tab = record.indexOf(0x09);
        const header = record.subarray(0, tab).toString('ascii').split(' ');
        if (
          tab === -1 ||
          (header[0] !== '100644' && header[0] !== '100755') ||
          header[1] !== 'blob' ||
          header[2] === undefined
        ) {
          throw new NativeGitError('UNSUPPORTED_TREE', 'Git revision contains a non-file or unsupported file mode.');
        }
        const objectId = await asObjectId(header[2]);
        const path = decodePath(new Uint8Array(record.subarray(tab + 1)));
        return [path, new Uint8Array(await readObject(objectId, 'blob')), header[0] as RevisionFileMode];
      }),
    );
    return new ImmutableRevisionTree(entries);
  };

  const readRevisionAtCommit = async (commit: GitObjectId): Promise<Revision> => {
    const repository = await initialize();
    const commitBytes = await readObject(commit, 'commit');
    const message = Buffer.from(commitBytes).toString('utf8');
    const metadata = parseRevisionMetadata(message);
    const parentsOutput = await requireSuccess(repository.repositoryPath, ['rev-list', '--parents', '-n', '1', commit]);
    const parentsLine = Buffer.from(parentsOutput).toString('utf8').trim().split(' ').slice(1);
    if (parentsLine.length !== metadata.parents.length) {
      throw new NativeGitError('UNMANAGED_REVISION', 'Tau revision parent metadata does not match its Git commit.');
    }
    const parentIds = await Promise.all(
      parentsLine.map(async (parent) => revisionIdAtCommit(await asObjectId(parent))),
    );
    if (parentIds.some((parent, index) => parent !== metadata.parents[index])) {
      throw new NativeGitError('UNMANAGED_REVISION', 'Tau revision parent metadata does not match its Git commit.');
    }
    return revisionFromMetadata(metadata, await readTree(commit));
  };

  const readRevision = async (id: RevisionId): Promise<Revision | undefined> => {
    const commit = await resolveRef(revisionRef(id));
    if (commit === undefined) {
      return undefined;
    }
    const revision = await readRevisionAtCommit(commit);
    if (revision.id !== id) {
      throw new NativeGitError('UNMANAGED_REVISION', 'Tau revision ref points to the wrong revision identity.');
    }
    return revision;
  };

  const listReferences = async (
    prefix: string,
  ): Promise<ReadonlyArray<Readonly<{ ref: string; commit: GitObjectId }>>> => {
    const repository = await initialize();
    const output = await requireSuccess(repository.repositoryPath, [
      'for-each-ref',
      '--format=%(refname)%00%(objectname)',
      prefix,
    ]);
    let records: string;
    try {
      records = textDecoder.decode(output).trimEnd();
    } catch {
      throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed Git refs are not valid UTF-8.');
    }
    if (records.length === 0) {
      return [];
    }
    return Promise.all(
      records.split('\n').map(async (record) => {
        const separator = record.indexOf('\0');
        if (separator < 1 || separator === record.length - 1) {
          throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed Git ref output is malformed.');
        }
        return Object.freeze({
          ref: record.slice(0, separator),
          commit: await asObjectId(record.slice(separator + 1)),
        });
      }),
    );
  };

  const recoverStagingReferences = async (): Promise<void> => {
    const transactionReferences = await listReferences(`${transactionRefPrefix}/`);
    const staleReferences = transactionReferences.filter(({ ref }) => ref.startsWith(`${stagingRefPrefix}-`));
    for (const { ref, commit } of staleReferences) {
      // oxlint-disable-next-line no-await-in-loop -- expected-old deletion preserves each independently recoverable ref.
      await deleteRef(ref, commit);
    }
  };

  const readRevisionGraph = async (): Promise<NativeGitRevisionGraph> => {
    await recoverStagingReferences();
    let incoherence = 'Tau revision graph is not closed over its managed refs.';
    for (let attempt = 0; attempt < 3; attempt++) {
      // Moving heads are sampled before the append-only revision namespace.
      // oxlint-disable-next-line no-await-in-loop -- an incoherent publication boundary retries the complete snapshot.
      const branchReferences = await listReferences(`${branchRefPrefix}/`);
      const branchPrefix = `${branchRefPrefix}/`;
      // oxlint-disable-next-line no-await-in-loop -- branch identities must be fixed before revision refs are sampled.
      const branchRecords = await Promise.all(
        branchReferences.map(async ({ ref, commit }) => {
          if (!ref.startsWith(branchPrefix)) {
            throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed branch ref has an invalid namespace.');
          }
          return Object.freeze({
            branch: revisionBranchName(ref.slice(branchPrefix.length)),
            head: await revisionIdAtCommit(commit),
            commit,
          });
        }),
      );
      // oxlint-disable-next-line no-await-in-loop -- append-only refs intentionally follow the branch snapshot.
      const revisionReferences = await listReferences(revisionRefPrefix);
      // oxlint-disable-next-line no-await-in-loop -- a failed closure check retries all decoded revisions.
      const revisions = await Promise.all(
        revisionReferences.map(async ({ ref, commit }) => {
          const revision = await readRevisionAtCommit(commit);
          if (ref !== revisionRef(revision.id)) {
            throw new NativeGitError('UNMANAGED_REVISION', 'Tau revision ref points to the wrong revision identity.');
          }
          return Object.freeze({ revision, commit });
        }),
      );
      const revisionCommits = new Map(revisions.map(({ revision, commit }) => [revision.id, commit]));
      const missingParent = revisions
        .flatMap(({ revision }) => revision.parents)
        .find((parent) => !revisionCommits.has(parent));
      if (missingParent !== undefined) {
        incoherence = `Tau revision parent is missing its managed ref: ${missingParent}`;
        continue;
      }
      const missingBranchHead = branchRecords.find(({ head, commit }) => revisionCommits.get(head) !== commit);
      if (missingBranchHead !== undefined) {
        incoherence = `Tau branch is missing its managed revision ref: ${missingBranchHead.head}`;
        continue;
      }
      const branchHeads = branchRecords.map(({ branch, head }) => Object.freeze({ branch, head }));
      return Object.freeze({ revisions: Object.freeze(revisions), branchHeads: Object.freeze(branchHeads) });
    }
    throw new NativeGitError('UNMANAGED_REVISION', incoherence);
  };

  const readOwnership = async (
    workspaceId: string,
  ): Promise<
    | {
        objectId: GitObjectId;
        record: OwnershipRecord;
      }
    | undefined
  > => {
    const objectId = await resolveRef(ownerRef(workspaceId));
    if (objectId === undefined) {
      return undefined;
    }
    const record = parseOwnership(await readObject(objectId, 'blob'));
    if (record.workspaceId !== workspaceId) {
      throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace owner ref points to another workspace.');
    }
    return { objectId, record };
  };

  const assertOwnership = async (
    workspace: Pick<NativeGitWorkspace, 'workspaceId' | 'runId'>,
  ): Promise<{
    objectId: GitObjectId;
    record: OwnershipRecord;
  }> => {
    const ownership = await readOwnership(workspace.workspaceId);
    if (ownership === undefined) {
      throw new NativeGitError('WORKSPACE_NOT_FOUND', 'Managed workspace ownership does not exist.');
    }
    if (ownership.record.runId !== workspace.runId) {
      throw new NativeGitError('WORKSPACE_OWNED', 'Managed workspace is owned by another Tau run.');
    }
    return ownership;
  };

  const ensureWorktree = async (options: {
    readonly path: string;
    readonly commit: GitObjectId;
    readonly preserveChanges: boolean;
  }): Promise<void> => {
    const repository = await initialize();
    const { path, commit } = options;
    let exists = true;
    try {
      await stat(path);
    } catch {
      exists = false;
    }
    if (!exists) {
      await requireSuccess(repository.repositoryPath, ['worktree', 'prune', '--expire', 'now']);
      const add = await commandAt(repository.repositoryPath, ['worktree', 'add', '--detach', path, commit]);
      if (add.exitCode !== 0) {
        try {
          await stat(path);
        } catch {
          throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git failed the worktree operation.');
        }
      }
    }
    const inside = await commandAt(path, ['rev-parse', '--is-inside-work-tree']);
    if (inside.exitCode !== 0 || Buffer.from(inside.stdout).toString('utf8').trim() !== 'true') {
      throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace path is not a linked Git worktree.');
    }
    const actualCommonOutput = await requireSuccess(path, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const expectedCommonOutput = await requireSuccess(repository.repositoryPath, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    const actualCommon = await realpath(Buffer.from(actualCommonOutput).toString('utf8').trim());
    const expectedCommon = await realpath(Buffer.from(expectedCommonOutput).toString('utf8').trim());
    if (actualCommon !== expectedCommon) {
      throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace belongs to another Git repository.');
    }
    if (!options.preserveChanges) {
      await requireSuccess(path, ['reset', '--hard', commit]);
      await requireSuccess(path, ['clean', '-ffdx']);
      return;
    }
    const headOutput = await requireSuccess(path, ['rev-parse', '--verify', 'HEAD']);
    const head = await asObjectId(Buffer.from(headOutput).toString('utf8').trim());
    if (head !== commit) {
      // The workspace ref can advance immediately before a host crash. Move
      // detached HEAD/index to that authoritative commit without changing any
      // tracked, deleted, ignored, or untracked working-tree bytes.
      await requireSuccess(path, ['reset', '--mixed', commit]);
    }
  };

  const workspaceSnapshot = async (options: {
    workspaceId: BindNativeGitWorkspaceInput['workspaceId'];
    runId: string;
    baseRevisionId: RevisionId;
    headCommit: GitObjectId;
    preserveChanges?: boolean;
  }): Promise<NativeGitWorkspace> => {
    const headRevisionId = await revisionIdAtCommit(options.headCommit);
    const rootPath = await workspacePath(options.workspaceId);
    await ensureWorktree({
      path: rootPath,
      commit: options.headCommit,
      preserveChanges: options.preserveChanges === true,
    });
    return Object.freeze({
      workspaceId: options.workspaceId,
      runId: options.runId,
      rootPath,
      baseRevisionId: options.baseRevisionId,
      headRevisionId,
      headCommit: options.headCommit,
    });
  };

  const bindWorkspace = async (input: BindNativeGitWorkspaceInput): Promise<NativeGitWorkspace> => {
    parseRunId(input.runId);
    const base = await storeRevision(input.baseRevision);
    return resourceQueue.queueFor(`git-workspace:${input.workspaceId}`, async () => {
      const expectedRecord: OwnershipRecord = {
        version: 1,
        workspaceId: input.workspaceId,
        runId: input.runId,
        baseRevisionId: input.baseRevision.id,
      };
      const repository = await initialize();
      const ownerOutput = await requireSuccess(
        repository.repositoryPath,
        ['hash-object', '-w', '--stdin'],
        [textEncoder.encode(JSON.stringify(expectedRecord))],
      );
      const ownerBlob = await asObjectId(Buffer.from(ownerOutput).toString('utf8').trim());
      const ownerUpdate = await compareAndUpdateRef({
        ref: ownerRef(input.workspaceId),
        next: ownerBlob,
        expected: undefined,
      });
      const createdOwner = ownerUpdate.status === 'updated';
      if (!createdOwner) {
        const ownership = await readOwnership(input.workspaceId);
        if (ownership === undefined || !sameOwnership(ownership.record, expectedRecord)) {
          throw new NativeGitError('WORKSPACE_OWNED', 'Managed workspace is already owned by another Tau run.');
        }
      }

      const ref = workspaceRef(input.workspaceId);
      const workspaceUpdate = await compareAndUpdateRef({ ref, next: base.commit, expected: undefined });
      const headCommit = workspaceUpdate.status === 'updated' ? base.commit : workspaceUpdate.actual;
      if (headCommit === undefined) {
        throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace head disappeared during binding.');
      }
      if (createdOwner && headCommit !== base.commit) {
        await deleteRef(ownerRef(input.workspaceId), ownerBlob);
        throw new NativeGitError(
          'WORKSPACE_CORRUPT',
          'A new workspace owner cannot adopt a different retained workspace head.',
        );
      }
      return workspaceSnapshot({
        workspaceId: input.workspaceId,
        runId: input.runId,
        baseRevisionId: input.baseRevision.id,
        headCommit,
        preserveChanges: !createdOwner,
      });
    });
  };

  const reopenWorkspace = async (input: ReopenNativeGitWorkspaceInput): Promise<NativeGitWorkspace> => {
    parseRunId(input.runId);
    return resourceQueue.queueFor(`git-workspace:${input.workspaceId}`, async () => {
      const ownership = await assertOwnership(input);
      const headCommit = await resolveRef(workspaceRef(input.workspaceId));
      if (headCommit === undefined) {
        throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace head does not exist.');
      }
      return workspaceSnapshot({
        workspaceId: input.workspaceId,
        runId: input.runId,
        baseRevisionId: revisionId(ownership.record.baseRevisionId),
        headCommit,
        preserveChanges: true,
      });
    });
  };

  const commitWorkspace = async (input: CommitNativeGitWorkspaceInput): Promise<NativeGitWorkspaceUpdateResult> => {
    if (input.revision.parents[0] !== input.expectedHead) {
      throw new TypeError('A workspace revision must name expectedHead as its first parent.');
    }
    const stored = await storeRevision(input.revision);
    const expectedCommit = await resolveRevisionCommit(input.expectedHead);
    return resourceQueue.queueFor(`git-workspace:${input.workspace.workspaceId}`, async () => {
      await assertOwnership(input.workspace);
      const update = await compareAndUpdateRef({
        ref: workspaceRef(input.workspace.workspaceId),
        next: stored.commit,
        expected: expectedCommit,
      });
      if (update.status === 'stale') {
        if (update.actual === undefined) {
          throw new NativeGitError('WORKSPACE_CORRUPT', 'Managed workspace head disappeared during publication.');
        }
        return {
          status: 'conflicted',
          expectedHead: input.expectedHead,
          actualHead: await revisionIdAtCommit(update.actual),
          proposedHead: input.revision.id,
        };
      }
      const workspace = await workspaceSnapshot({
        workspaceId: input.workspace.workspaceId,
        runId: input.workspace.runId,
        baseRevisionId: input.workspace.baseRevisionId,
        headCommit: stored.commit,
      });
      return { status: 'updated', previousHead: input.expectedHead, workspace };
    });
  };

  const cleanupWorkspace = async (workspace: NativeGitWorkspace): Promise<boolean> =>
    resourceQueue.queueFor(`git-workspace:${workspace.workspaceId}`, async () => {
      const ownership = await readOwnership(workspace.workspaceId);
      if (ownership === undefined) {
        return false;
      }
      if (ownership.record.runId !== workspace.runId) {
        throw new NativeGitError('WORKSPACE_OWNED', 'Managed workspace is owned by another Tau run.');
      }
      const expectedPath = await workspacePath(workspace.workspaceId);
      if (resolve(workspace.rootPath) !== expectedPath) {
        throw new NativeGitError('WORKSPACE_CORRUPT', 'Workspace locator does not match its managed path.');
      }
      const repository = await initialize();
      const remove = await commandAt(repository.repositoryPath, ['worktree', 'remove', '--force', expectedPath]);
      if (remove.exitCode !== 0) {
        try {
          await stat(expectedPath);
          throw new NativeGitError('GIT_COMMAND_FAILED', 'Native Git failed the worktree cleanup operation.');
        } catch (error) {
          if (error instanceof NativeGitError) {
            throw error;
          }
          await requireSuccess(repository.repositoryPath, ['worktree', 'prune', '--expire', 'now']);
        }
      }
      const headCommit = await resolveRef(workspaceRef(workspace.workspaceId));
      if (headCommit !== undefined) {
        await deleteRef(workspaceRef(workspace.workspaceId), headCommit);
      }
      await deleteRef(ownerRef(workspace.workspaceId), ownership.objectId);
      return true;
    });

  const mergeRevisions = async (input: MergeNativeGitRevisionsInput): Promise<NativeGitMergeResult> => {
    const merged = mergeRevisionTrees(input.base.tree, input.ours.tree, input.theirs.tree);
    if (merged.status === 'conflicted') {
      return merged;
    }
    const revision = freezeMergedRevision(input, merged.tree);
    return { status: 'merged', stored: await storeRevision(revision) };
  };

  const updateBranchHead = async (input: PublishNativeGitBranchInput): Promise<BranchHeadUpdateResult> => {
    const nextCommit = await resolveRevisionCommit(input.head);
    const expectedCommit =
      input.expectedHead === undefined ? undefined : await resolveRevisionCommit(input.expectedHead);
    const ref = `${branchRefPrefix}/${input.branch}`;
    const update = await compareAndUpdateRef({ ref, next: nextCommit, expected: expectedCommit });
    if (update.status === 'updated') {
      return { status: 'updated', branch: input.branch, previousHead: input.expectedHead, head: input.head };
    }
    const actualHead = update.actual === undefined ? undefined : await revisionIdAtCommit(update.actual);
    return {
      status: 'conflicted',
      conflict: {
        type: 'stale-head',
        branch: input.branch,
        expectedHead: input.expectedHead,
        actualHead,
        proposedHead: input.head,
      },
    };
  };

  /**
   * Remove one branch ref under the same expected-old check `updateBranchHead`
   * runs. A branch is a name for a head; the commits it reached stay.
   *
   * @param input - The branch and the head it must currently name.
   * @returns The publication, or the stale-head conflict that refused it.
   */
  const deleteBranchHead = async (
    input: Omit<PublishNativeGitBranchInput, 'head'>,
  ): Promise<BranchHeadUpdateResult> => {
    const expectedCommit =
      input.expectedHead === undefined ? undefined : await resolveRevisionCommit(input.expectedHead);
    const ref = `${branchRefPrefix}/${input.branch}`;
    await validateRef(ref);
    const actual = await resolveRef(ref);
    if (actual !== expectedCommit) {
      return {
        status: 'conflicted',
        conflict: {
          type: 'stale-head',
          branch: input.branch,
          expectedHead: input.expectedHead,
          actualHead: actual === undefined ? undefined : await revisionIdAtCommit(actual),
          proposedHead: undefined,
        },
      };
    }
    if (expectedCommit !== undefined) {
      await deleteRef(ref, expectedCommit);
    }
    return { status: 'updated', branch: input.branch, previousHead: input.expectedHead, head: undefined };
  };

  const verifyConnectivity = async (): Promise<void> => {
    const repository = await initialize();
    await requireSuccess(repository.repositoryPath, ['fsck', '--connectivity-only', '--no-dangling']);
  };

  const fetch = async (input: NativeGitFetchInput): Promise<void> => {
    parseTransportValue(input.remote, 'remote');
    if (input.refspecs.length === 0) {
      throw new NativeGitError('INVALID_TRANSPORT', 'fetch requires at least one explicit refspec.');
    }
    for (const refspec of input.refspecs) {
      parseExternalRefspec(refspec);
    }
    const repository = await initialize();
    await requireSuccess(repository.repositoryPath, [
      'fetch',
      '--no-tags',
      ...(input.prune === true ? ['--prune'] : []),
      '--',
      input.remote,
      ...input.refspecs,
    ]);
    await verifyConnectivity();
  };

  const push = async (input: NativeGitPushInput): Promise<void> => {
    parseTransportValue(input.remote, 'remote');
    if (input.refspecs.length === 0) {
      throw new NativeGitError('INVALID_TRANSPORT', 'push requires at least one explicit refspec.');
    }
    for (const refspec of input.refspecs) {
      parseExternalRefspec(refspec);
    }
    const repository = await initialize();
    await verifyConnectivity();
    await requireSuccess(repository.repositoryPath, [
      'push',
      ...(input.atomic === true ? ['--atomic'] : []),
      '--',
      input.remote,
      ...input.refspecs,
    ]);
  };

  const inspect = async (): Promise<NativeGitCapabilities> => {
    const repository = await initialize();
    return Object.freeze({
      engine: 'native-git',
      objectFormat: repository.objectFormat,
      expectedOldRefs: true,
      linkedWorktrees: true,
    });
  };

  return Object.freeze({
    inspect,
    storeRevision,
    readRevision,
    readRevisionGraph,
    bindWorkspace,
    reopenWorkspace,
    commitWorkspace,
    cleanupWorkspace,
    mergeRevisions,
    updateBranchHead,
    deleteBranchHead,
    resolveRef,
    fetch,
    push,
  });
};
