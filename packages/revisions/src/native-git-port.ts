/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * `RevisionPort` over a native Git repository (S12).
 *
 * The engine is the `git` binary — its object store, its `update-ref`
 * transaction, its linked worktrees — and the commit object is Tau's, exactly
 * as on the browser leg: `encodeCommit` produces the bytes and
 * `git hash-object -t commit -w` stores them, because neither `git commit-tree`
 * nor `isomorphic-git`'s `CommitObject` can carry `change-id`, `jj:trees` or
 * `jj:conflict-labels`. One encoder, two object stores, one identity — which is
 * what the conformance suite's cross-adapter test measures (I4).
 *
 * Trees go in through one `fast-import` rather than a process per blob: it is
 * binary-safe, quotes paths itself, and is the path {@link createNativeGitAdapter}
 * already proved against real repositories.
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ImmutableRevisionTree, ResourceQueue, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance } from '#revision-authority.js';
import { decodeCommit, encodeCommit } from '#git-objects.js';
import type { DecodedCommit, GitSignature } from '#git-objects.js';
import { runGitCommand } from '#git-command.js';
import type { GitCommandResult } from '#git-command.js';
import { parseExternalRefspec, parseTransportValue, quoteFastImportPath } from '#native-git-adapter.js';
import { NativeGitError } from '#native-git.types.js';
import { digestHex } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import { deriveChangeId, parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';
import { RevisionPortError } from '#revision-port.js';
import type {
  AddCheckoutInput,
  Checkout,
  InitRevisionStoreInput,
  RevisionConflict,
  RevisionDiffEntry,
  RevisionDiffInput,
  RevisionEngineDescriptor,
  RevisionHead,
  RevisionLogEntry,
  RevisionLogInput,
  RevisionPort,
  RevisionReceipt,
  RevisionRecord,
  RevisionRef,
  RevisionTransportInput,
  UpdateRevisionRefInput,
  UpdateRevisionRefResult,
  WriteRevisionInput,
} from '#revision-port.js';
import { generatedIgnoreContent, generatedIgnorePath } from '#workspace-config.js';

/** Where linked checkouts live, and which project they belong to. @public */
export type NativeGitCheckoutOptions = Readonly<{
  projectId: string;
  /**
   * Host data directory every linked worktree is created under. Never inside
   * the repository's own worktree: native Git refuses a worktree in a worktree,
   * and `tau serve` treats its cwd as the project (S6).
   */
  directory: string;
}>;

/** Native-Git revision port configuration. @public */
export type NativeGitRevisionPortOptions = Readonly<{
  /** The project directory. `init` creates the repository in it when absent. */
  repositoryPath: string;
  gitExecutable?: string;
  /** Supplied, the port advertises and implements the `checkouts` capability. */
  checkouts?: NativeGitCheckoutOptions;
}>;

const branchRefPrefix = 'refs/heads';
const symbolicRefPrefix = 'ref: ';
const stagingRefPrefix = 'refs/tau/transactions/port';
const initialBranch = 'main';
const liveCheckoutId = 'live';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const frozenChange = (path: string, kind: RevisionDiffEntry['kind']): RevisionDiffEntry =>
  Object.freeze({ path, kind });

const signature = (provenance: RevisionProvenance): GitSignature => ({
  name: provenance.actorId,
  email: `${provenance.source}@tau.invalid`,
  seconds: Math.floor(provenance.createdAt / 1000),
  offsetMinutes: 0,
});

/**
 * `diff-tree --name-status`' letter, as a port change kind.
 *
 * @param status - The status field Git emitted.
 * @returns The kind, or `undefined` for a status this port does not record.
 */
const diffKind = (status: string): RevisionDiffEntry['kind'] | undefined => {
  switch (status.charAt(0)) {
    case 'A': {
      return 'added';
    }
    case 'D': {
      return 'deleted';
    }
    // A type change is a content change as far as a path diff is concerned.
    case 'M':
    case 'T': {
      return 'modified';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Create a `RevisionPort` over a native Git repository.
 *
 * @param options - Project directory, Git executable and checkout directory.
 * @returns A port whose revision ids are Git commit ids.
 * @public
 * @example <caption>Attach a disk host's project</caption>
 * ```typescript
 * import { createNativeGitRevisionPort } from '@taucad/revisions/node';
 *
 * const port = createNativeGitRevisionPort({ repositoryPath: '/srv/tau/project' });
 * await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
 * ```
 */
export const createNativeGitRevisionPort = (options: NativeGitRevisionPortOptions): RevisionPort => {
  if (options.repositoryPath.length === 0) {
    throw new TypeError('repositoryPath is required.');
  }
  const { repositoryPath, checkouts } = options;
  const gitExecutable = options.gitExecutable ?? 'git';
  const refQueue = new ResourceQueue();
  let objectFormat: ObjectFormat | undefined;

  const run = async (
    args: readonly string[],
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>,
    cwd = repositoryPath,
  ): Promise<GitCommandResult> => {
    try {
      return await runGitCommand({ gitExecutable, cwd, args, ...(input === undefined ? {} : { input }) });
    } catch (error) {
      throw new RevisionPortError('ENGINE_UNAVAILABLE', `Native Git could not start ${args[0] ?? 'a command'}.`, {
        cause: error,
      });
    }
  };

  const output = async (
    args: readonly string[],
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>,
    cwd = repositoryPath,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const result = await run(args, input, cwd);
    if (result.exitCode !== 0) {
      throw new RevisionPortError('ENGINE_FAILED', `Native Git failed ${args[0] ?? 'a command'}.`);
    }
    return result.stdout;
  };

  const text = async (args: readonly string[], cwd = repositoryPath): Promise<string> =>
    textDecoder.decode(await output(args, undefined, cwd)).trim();

  const format = async (): Promise<ObjectFormat> => {
    if (objectFormat === undefined) {
      const recorded = await text(['rev-parse', '--show-object-format']);
      if (recorded !== 'sha1' && recorded !== 'sha256') {
        throw new RevisionPortError('INVALID_REPOSITORY', 'The repository uses an unsupported Git object format.');
      }
      objectFormat = recorded;
    }
    return objectFormat;
  };

  const zeroObjectId = async (): Promise<string> => '0'.repeat((await format()) === 'sha1' ? 40 : 64);

  const readCommitObject = async (id: string): Promise<DecodedCommit | undefined> => {
    const result = await run(['cat-file', 'commit', id]);
    return result.exitCode === 0 ? decodeCommit(result.stdout) : undefined;
  };

  const requireCommit = async (id: RevisionId): Promise<DecodedCommit> => {
    const commit = await readCommitObject(id);
    if (commit === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'The revision is not in the store.');
    }
    return commit;
  };

  const entryOf = (id: RevisionId, commit: DecodedCommit): RevisionLogEntry => {
    const trailer = parseRevisionCommitMessage(commit.message);
    const unattributed: RevisionProvenance = { source: 'import', actorId: 'unknown', createdAt: 0 };
    return Object.freeze({
      id,
      changeId: commit.changeId ?? '',
      parents: Object.freeze(commit.parents.map((parent) => revisionId(parent))),
      summary: trailer?.summary ?? { generated: commit.message.split('\n')[0] ?? '' },
      provenance: trailer?.provenance ?? unattributed,
      conflicted: commit.conflictedTrees !== undefined,
    });
  };

  const receiptOf = async (id: RevisionId, commit: DecodedCommit): Promise<RevisionReceipt> =>
    Object.freeze({
      engine: 'native-git',
      commitId: id,
      changeId: commit.changeId ?? '',
      objectFormat: await format(),
      conflicted: commit.conflictedTrees !== undefined,
    });

  /**
   * Write one tree through a single `fast-import`, then drop the staging ref.
   *
   * The commit `fast-import` writes is a throwaway: this port needs the *tree*
   * it produced, and writes Tau's own commit over it.
   *
   * @param tree - The exact tree to store.
   * @returns The root tree's object id.
   */
  const writeTreeObject = async (tree: ImmutableRevisionTree): Promise<string> => {
    const stagingRef = `${stagingRefPrefix}-${randomUUID()}`;
    const chunks: Array<Uint8Array<ArrayBuffer>> = [
      textEncoder.encode(`commit ${stagingRef}\n`),
      textEncoder.encode('author Tau Revision <tau@local.invalid> 0 +0000\n'),
      textEncoder.encode('committer Tau Revision <tau@local.invalid> 0 +0000\n'),
      textEncoder.encode('data 0\n'),
      textEncoder.encode('deleteall\n'),
    ];
    for (const entry of tree.entries()) {
      chunks.push(
        textEncoder.encode(`M 100644 inline ${quoteFastImportPath(entry.path)}\n`),
        textEncoder.encode(`data ${entry.content.byteLength}\n`),
        entry.content,
        textEncoder.encode('\n'),
      );
    }
    chunks.push(textEncoder.encode('done\n'));
    await output(['fast-import', '--quiet', '--date-format=raw'], chunks);
    const treeId = await text(['rev-parse', `${stagingRef}^{tree}`]);
    await run(['update-ref', '-d', stagingRef]);
    return treeId;
  };

  const refOf = (name: string): string => `${branchRefPrefix}/${name}`;

  const resolve = async (ref: string): Promise<string | undefined> => {
    const result = await run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    return textDecoder.decode(result.stdout).trim();
  };

  const listTree = async (commit: string): Promise<ReadonlyMap<string, string>> => {
    const stdout = await output(['ls-tree', '-rz', '--full-tree', commit]);
    const paths = new Map<string, string>();
    for (const record of textDecoder.decode(stdout).split('\0')) {
      if (record === '') {
        continue;
      }
      const tab = record.indexOf('\t');
      const header = record.slice(0, tab).split(' ');
      if (tab === -1 || header[1] !== 'blob' || header[2] === undefined) {
        throw new RevisionPortError('ENGINE_FAILED', 'A revision tree holds a non-file entry.');
      }
      paths.set(record.slice(tab + 1), header[2]);
    }
    return paths;
  };

  const checkoutIdOf = async (branch: string): Promise<string> =>
    digestHex(await format(), textEncoder.encode(`tau-checkout\0${branch}`)).slice(0, 16);

  const requireCheckouts = (): NativeGitCheckoutOptions => {
    if (checkouts === undefined) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        'This port has no checkouts directory; construct it with `checkouts` to use them.',
      );
    }
    return checkouts;
  };

  /**
   * Every worktree this repository has, as Git itself reports them.
   *
   * @returns The live checkout first, then every linked one.
   */
  const listWorktrees = async (): Promise<readonly Checkout[]> => {
    const { projectId } = requireCheckouts();
    const zero = await zeroObjectId();
    const listing = await text(['worktree', 'list', '--porcelain']);
    const blocks = listing.split('\n\n');
    const collected: Checkout[] = [];
    for (const block of blocks) {
      const lines = block.split('\n').filter((line) => line !== '');
      const root = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
      if (root === undefined) {
        continue;
      }
      const head = lines.find((line) => line.startsWith('HEAD '))?.slice('HEAD '.length);
      const branch = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
      const linked = collected.length > 0;
      collected.push(
        Object.freeze({
          /* The id is the directory name this port created, not a slice of the
           * configured prefix: Git reports a resolved path, and on macOS that is
           * `/private/var/…` where the caller said `/var/…`. */
          id: linked ? basename(root) : liveCheckoutId,
          projectId,
          root,
          kind: linked ? 'linked' : 'live',
          branch: branch?.startsWith(`${branchRefPrefix}/`) ? branch.slice(branchRefPrefix.length + 1) : undefined,
          baseRevisionId: head === undefined || head === zero ? undefined : revisionId(head),
        }),
      );
    }
    return Object.freeze(collected);
  };

  const transport = async (verb: 'fetch' | 'push', input: RevisionTransportInput): Promise<void> => {
    try {
      parseTransportValue(input.remote, 'remote');
      if (input.refspecs.length === 0) {
        throw new NativeGitError('INVALID_TRANSPORT', `${verb} requires at least one explicit refspec.`);
      }
      for (const refspec of input.refspecs) {
        parseExternalRefspec(refspec);
      }
    } catch (error) {
      throw new RevisionPortError(
        'INVALID_TRANSPORT',
        error instanceof NativeGitError ? error.message : 'Unsafe Git transport value.',
        { cause: error },
      );
    }
    await output([verb, ...(verb === 'fetch' ? ['--no-tags'] : []), '--', input.remote, ...input.refspecs]);
  };

  const port: RevisionPort = Object.freeze({
    describe: async (): Promise<RevisionEngineDescriptor> => {
      const reported = await text(['--version']);
      return Object.freeze({
        engine: 'native-git',
        version: reported.replace('git version ', ''),
        objectFormat: await format(),
        changeIds: true,
        conflictsAsValues: true,
        transports: true,
        nWayMerge: false,
        checkouts: checkouts !== undefined,
      });
    },

    init: async (input: InitRevisionStoreInput): Promise<void> => {
      const ignorePath = join(repositoryPath, generatedIgnorePath);
      const existing = await readFile(ignorePath, 'utf8').catch(() => undefined);
      await writeFile(ignorePath, generatedIgnoreContent(existing, input.additionalIgnores ?? []));
      // Only now: the repository is created after the file that decides what a
      // snapshot may ever contain already exists.
      const attached = await run(['rev-parse', '--git-dir']);
      if (attached.exitCode !== 0) {
        await output(['init', '--quiet', `--initial-branch=${initialBranch}`]);
      }
    },

    readRevision: async (id: RevisionId): Promise<RevisionRecord | undefined> => {
      const commit = await readCommitObject(id);
      if (commit === undefined) {
        return undefined;
      }
      const entry = entryOf(id, commit);
      return Object.freeze({
        id,
        parents: entry.parents,
        treeId: commit.tree,
        provenance: entry.provenance,
        summary: entry.summary,
        receipt: await receiptOf(id, commit),
      });
    },

    /* One `cat-file` per blob — ponytail: `cat-file --batch` is the upgrade when
     * a tree is big enough for the process count to show up in a profile. */
    readTree: async (id: RevisionId): Promise<ImmutableRevisionTree | undefined> => {
      const commit = await readCommitObject(id);
      if (commit === undefined) {
        return undefined;
      }
      const paths = await listTree(commit.tree);
      const entries = await Promise.all(
        [...paths].map(
          async ([path, oid]): Promise<readonly [string, Uint8Array<ArrayBuffer>]> => [
            path,
            await output(['cat-file', 'blob', oid]),
          ],
        ),
      );
      return new ImmutableRevisionTree(entries);
    },

    writeRevision: async (input: WriteRevisionInput): Promise<RevisionReceipt> => {
      const treeId = await writeTreeObject(input.tree);
      const trailer: RevisionTrailer = {
        parents: [...input.parents],
        provenance: input.provenance,
        summary: input.summary,
      };
      const commit = encodeCommit({
        objectFormat: await format(),
        tree: treeId,
        parents: [...input.parents],
        author: signature(input.provenance),
        committer: signature(input.provenance),
        message: revisionCommitMessage(trailer),
        changeId: deriveChangeId(await format(), { treeId, parents: input.parents, trailer }),
        ...(input.conflict === undefined
          ? {}
          : { conflictedTrees: [...input.conflict.trees], conflictLabels: [...input.conflict.labels] }),
      });
      const written = await run(['hash-object', '-t', 'commit', '-w', '--stdin'], [commit.body]);
      if (written.exitCode !== 0) {
        throw new RevisionPortError('ENGINE_FAILED', 'Native Git refused the revision commit object.');
      }
      return receiptOf(revisionId(textDecoder.decode(written.stdout).trim()), decodeCommit(commit.body));
    },

    readRef: async (name: string): Promise<RevisionId | undefined> => {
      const head = await resolve(refOf(name));
      return head === undefined ? undefined : revisionId(head);
    },

    /**
     * Git's own `update-ref` transaction is the linearization point: the
     * expected-old value is passed to it, so the compare and the write are one
     * operation under the repository's ref lock (I7). The queue below only keeps
     * this process's own concurrent writers off the same name.
     *
     * @param input - The ref, the value it must currently hold, and the new one.
     * @returns The publication, or the conflict that refused it.
     */
    updateRef: async (input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult> =>
      refQueue.queueFor(`${repositoryPath}:${input.name}`, async () => {
        const ref = refOf(input.name);
        const expected = input.expectedHead ?? (await zeroObjectId());
        const conflicted = async (): Promise<UpdateRevisionRefResult> => {
          const actual = await resolve(ref);
          return Object.freeze({
            status: 'conflicted',
            name: input.name,
            expectedHead: input.expectedHead,
            actualHead: actual === undefined ? undefined : revisionId(actual),
            proposedHead: input.head,
          });
        };
        if (input.head === undefined) {
          const actual = await resolve(ref);
          if (actual !== input.expectedHead) {
            return conflicted();
          }
          if (actual !== undefined) {
            await output(['update-ref', '-d', ref, actual]);
          }
          return Object.freeze({
            status: 'updated',
            name: input.name,
            previousHead: input.expectedHead,
            head: undefined,
          });
        }
        if ((await readCommitObject(input.head)) === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', 'Cannot publish a revision the store does not hold.');
        }
        const update = await run(['update-ref', ref, input.head, expected]);
        if (update.exitCode !== 0) {
          return conflicted();
        }
        return Object.freeze({
          status: 'updated',
          name: input.name,
          previousHead: input.expectedHead,
          head: input.head,
        });
      }),

    /* Symbolic, like Git's own HEAD: the file names a *branch*, so a turn
     * recorded onto that branch moves the head with it and nothing is written
     * twice (operator decisions 2026-09-09, question 11). */
    readHead: async (): Promise<RevisionHead | undefined> => {
      const result = await run(['symbolic-ref', '--quiet', 'HEAD']);
      if (result.exitCode !== 0) {
        return undefined;
      }
      const target = textDecoder.decode(result.stdout).trim();
      const symbolic = target.startsWith(symbolicRefPrefix) ? target.slice(symbolicRefPrefix.length).trim() : target;
      const branch = symbolic.startsWith(`${branchRefPrefix}/`) ? symbolic.slice(branchRefPrefix.length + 1) : '';
      return branch === '' ? undefined : Object.freeze({ branch, head: await port.readRef(branch) });
    },

    setHead: async (branch: string): Promise<void> => {
      await refQueue.queueFor(`${repositoryPath}:HEAD`, async () => output(['symbolic-ref', 'HEAD', refOf(branch)]));
    },

    listRefs: async (prefix?: string): Promise<readonly RevisionRef[]> => {
      const records = await text(['for-each-ref', '--format=%(refname)%00%(objectname)', `${branchRefPrefix}/`]);
      return Object.freeze(
        records
          .split('\n')
          .filter((record) => record !== '')
          .map((record) => {
            const [ref, head] = record.split('\0');
            return { name: (ref ?? '').slice(branchRefPrefix.length + 1), head: head ?? '' };
          })
          .filter((reference) => reference.name !== '' && (prefix === undefined || reference.name.startsWith(prefix)))
          .toSorted((left, right) => left.name.localeCompare(right.name))
          .map((reference) => Object.freeze({ name: reference.name, head: revisionId(reference.head) })),
      );
    },

    /* One `cat-file` per commit, which is what keeps the walk tree-free —
     * ponytail: `cat-file --batch` if a long history ever shows up hot. */
    log: async (input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]> => {
      const references = input?.heads === undefined ? await port.listRefs() : undefined;
      const heads = [...(input?.heads ?? (references ?? []).map((reference) => reference.head))];
      if (heads.length === 0) {
        return Object.freeze([]);
      }
      const limit = input?.limit;
      const walked = await text([
        'rev-list',
        '--topo-order',
        ...(limit === undefined ? [] : [`--max-count=${limit}`]),
        ...heads,
      ]);
      const entries = await Promise.all(
        walked
          .split('\n')
          .filter((line) => line !== '')
          .map(async (line) => {
            const id = revisionId(line);
            const commit = await readCommitObject(id);
            return commit === undefined ? undefined : entryOf(id, commit);
          }),
      );
      return Object.freeze(entries.filter((entry) => entry !== undefined));
    },

    diff: async (input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]> => {
      await requireCommit(input.to);
      if (input.from === undefined) {
        const added = await listTree(input.to);
        return Object.freeze([...added.keys()].sort().map((path) => frozenChange(path, 'added')));
      }
      await requireCommit(input.from);
      const records = textDecoder
        .decode(await output(['diff-tree', '-r', '-z', '--no-renames', '--name-status', input.from, input.to]))
        .split('\0')
        .filter((record) => record !== '');
      const changes: RevisionDiffEntry[] = [];
      for (let index = 0; index + 1 < records.length; index += 2) {
        const kind = diffKind(records[index]!);
        if (kind === undefined) {
          throw new RevisionPortError('ENGINE_FAILED', 'Native Git reported an unsupported change kind.');
        }
        changes.push(frozenChange(records[index + 1]!, kind));
      }
      return Object.freeze(changes.toSorted((left, right) => left.path.localeCompare(right.path)));
    },

    fetch: async (input: RevisionTransportInput): Promise<void> => transport('fetch', input),

    push: async (input: RevisionTransportInput): Promise<void> => transport('push', input),

    changeId: async (id: RevisionId): Promise<string | undefined> => {
      const commit = await readCommitObject(id);
      return commit?.changeId;
    },

    conflicts: async (id: RevisionId): Promise<RevisionConflict | undefined> => {
      const commit = await readCommitObject(id);
      return commit?.conflictedTrees === undefined
        ? undefined
        : Object.freeze({
            trees: commit.conflictedTrees,
            labels: commit.conflictLabels ?? Object.freeze([]),
          });
    },

    listCheckouts: async (): Promise<readonly Checkout[]> => listWorktrees(),

    /**
     * One checkout per branch — the rule Git already enforces, refused here with
     * the port's own code so both legs answer the same way.
     *
     * @param input - The branch, and where an unborn one starts.
     * @returns The checkout that now holds that branch.
     */
    addCheckout: async (input: AddCheckoutInput): Promise<Checkout> => {
      const { projectId, directory } = requireCheckouts();
      const existing = await listWorktrees();
      if (existing.some((checkout) => checkout.branch === input.branch)) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', `Branch ${input.branch} already has a checkout.`);
      }
      const head = await port.readRef(input.branch);
      const base = head ?? input.from;
      if (base === undefined) {
        throw new RevisionPortError(
          'UNKNOWN_REVISION',
          `Branch ${input.branch} is unborn; a checkout of it needs an explicit base revision.`,
        );
      }
      const id = await checkoutIdOf(input.branch);
      const root = join(directory, id);
      await output([
        'worktree',
        'add',
        ...(head === undefined ? ['-b', input.branch] : []),
        root,
        head === undefined ? base : input.branch,
      ]);
      return Object.freeze({ id, projectId, root, kind: 'linked', branch: input.branch, baseRevisionId: base });
    },

    removeCheckout: async (id: string): Promise<void> => {
      requireCheckouts();
      if (id === liveCheckoutId) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', 'The live checkout is the project; it cannot be removed.');
      }
      const worktrees = await listWorktrees();
      const existing = worktrees.find((checkout) => checkout.id === id);
      if (existing === undefined) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', `No checkout is registered as ${id}.`);
      }
      await output(['worktree', 'remove', '--force', existing.root]);
    },
  });

  return port;
};
