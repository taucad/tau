/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * `RevisionPort` over a `FileSystemProvider`, backed by `isomorphic-git`.
 *
 * The store is a real Git repository whose control plane lives at
 * `.tau/revisions` and whose worktree is the project root, so objects, packs,
 * refs and — once S24 lands its transport — smart HTTP are the library's, not
 * Tau's. Only the commit object is still written by Tau: every revision carries
 * a `change-id`, and a conflicted one carries `jj:trees` and
 * `jj:conflict-labels`, none of which `isomorphic-git`'s `CommitObject` can
 * express, so the bytes come from `#git-objects.js` and go in through
 * `writeObject({ format: 'content' })`. The identity is therefore the same on
 * this leg and on a disk host, because both write the same bytes.
 *
 * A conflict is a value, never a failed operation (I-CONF): the caller merges
 * with `mergeRevisionTrees` and hands the terms to `writeRevision`.
 */

import {
  deleteRef,
  init,
  listRefs,
  readBlob,
  readObject,
  readTree,
  resolveRef,
  version,
  writeBlob,
  writeObject,
  writeRef,
  writeTree,
} from 'isomorphic-git';
import type { TreeEntry } from 'isomorphic-git';
import { ImmutableRevisionTree, ResourceQueue, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { RevisionProvenance } from '#revision-authority.js';
import { decodeCommit, encodeCommit } from '#git-objects.js';
import type { DecodedCommit, GitSignature } from '#git-objects.js';
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

/**
 * Where one linked checkout's files are, and which project they belong to.
 *
 * `root` is supplied rather than derived because the adapter never joins a path
 * above the project: the browser leg routes `/checkouts/<id>` to its own
 * provider (S4) and hands that provider back here.
 *
 * @public
 */
export type IsomorphicGitCheckoutOptions = Readonly<{
  projectId: string;
  /** The provider one checkout's tree is materialized into. */
  root: (id: string) => FileSystemProvider | Promise<FileSystemProvider>;
}>;

/** Configuration for one provider-backed Git repository. @public */
export type IsomorphicGitRevisionPortOptions = Readonly<{
  filesystem: FileSystemProvider;
  /** Control plane location. Defaults to `.tau/revisions`, which the generated ignore excludes. */
  gitDirectory?: string;
  /** Recorded object format. `isomorphic-git` writes SHA-1 only. */
  objectFormat?: ObjectFormat;
  /** Supplied, the port advertises and implements the `checkouts` capability. */
  checkouts?: IsomorphicGitCheckoutOptions;
}>;

const defaultGitDirectory = '.tau/revisions';
const defaultBranch = 'main';
const branchRefPrefix = 'refs/heads';
const symbolicRefPrefix = 'ref: ';
const fileMode = '100644';
const directoryMode = '040000';
const liveCheckoutId = 'live';
/** Shared across every store in this document: one ref, one writer at a time. */
const refQueue = new ResourceQueue();

const frozenChange = (path: string, kind: RevisionDiffEntry['kind']): RevisionDiffEntry =>
  Object.freeze({ path, kind });

const signature = (provenance: RevisionProvenance): GitSignature => ({
  name: provenance.actorId,
  email: `${provenance.source}@tau.invalid`,
  seconds: Math.floor(provenance.createdAt / 1000),
  offsetMinutes: 0,
});

/**
 * Whether `isomorphic-git` answered "no such ref or object"; nothing else uses
 * this code.
 *
 * @param error - The rejection to classify.
 * @returns `true` when the subject is simply absent.
 */
const isNotFound = (error: unknown): boolean =>
  error instanceof Error && (error as Error & { code?: string }).code === 'NotFoundError';

/**
 * One critical section per ref: the in-process queue always, and the same
 * name as a Web Lock when the page has one, so two documents serialize too.
 *
 * @param name - The ref's queue and lock name.
 * @param operation - The check-and-write.
 * @returns The operation's result.
 */
const withRefLock = async <T>(name: string, operation: () => Promise<T>): Promise<T> =>
  refQueue.queueFor(name, async () => {
    const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
    if (locks === undefined) {
      return operation();
    }
    return locks.request(`tau:revision-ref:${name}`, { mode: 'exclusive' }, async () => operation());
  });

type TreeDraft = Readonly<{
  files: Map<string, Uint8Array<ArrayBuffer>>;
  directories: Map<string, TreeDraft>;
}>;

const treeDraft = (): TreeDraft => ({ files: new Map(), directories: new Map() });

const draftOf = (tree: ImmutableRevisionTree): TreeDraft => {
  const root = treeDraft();
  for (const entry of tree.entries()) {
    const segments = entry.path.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let child = node.directories.get(segment);
      if (child === undefined) {
        child = treeDraft();
        node.directories.set(segment, child);
      }
      node = child;
    }
    node.files.set(segments.at(-1)!, entry.content);
  }
  return root;
};

/**
 * The `fs` shim `isomorphic-git` binds, over one {@link FileSystemProvider}.
 *
 * The library needs all ten of its commands present and errors that carry an
 * `errno` code; providers already throw those. `readlink` and `symlink` are the
 * two Tau has no provider for, and nothing in this adapter's call graph reaches
 * them — no index, no working-tree checkout — so they refuse rather than lie.
 *
 * @param provider - The backing provider.
 * @returns A promise-shaped `FsClient`.
 */
const fileSystemShim = (provider: FileSystemProvider) => {
  /* Providers take canonical root-relative paths; the library composes its own
   * with `join`, which can leave a `.` or a doubled separator behind. */
  const at = (path: string): string =>
    path
      .split('/')
      .filter((segment) => segment !== '' && segment !== '.')
      .join('/');
  const errno = (code: string, path: string): NodeJS.ErrnoException => {
    const error: NodeJS.ErrnoException = new Error(`${code}: ${path}`);
    error.code = code;
    return error;
  };
  const stats = async (path: string): Promise<Record<string, unknown>> => {
    const stat = await provider.stat(at(path));
    const directory = stat.type === 'dir';
    /* No `mode`: nothing this adapter calls reads one — there is no index and no
     * working-tree checkout — and a provider has no file mode to report. */
    return {
      type: stat.type,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      isFile: () => !directory,
      isDirectory: () => directory,
      isSymbolicLink: () => false,
    };
  };
  return {
    promises: {
      readFile: async (
        path: string,
        options?: string | { encoding?: string },
      ): Promise<Uint8Array<ArrayBuffer> | string> => {
        const encoding = typeof options === 'string' ? options : options?.encoding;
        return encoding === 'utf8' ? provider.readFile(at(path), 'utf8') : provider.readFile(at(path));
      },
      writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> =>
        provider.writeFile(at(path), typeof data === 'string' ? data : new Uint8Array(data)),
      unlink: async (path: string): Promise<void> => provider.unlink(at(path)),
      readdir: async (path: string): Promise<string[]> => provider.readdir(at(path)),
      mkdir: async (path: string): Promise<void> => provider.mkdir(at(path), { recursive: true }),
      rmdir: async (path: string): Promise<void> => provider.rmdir(at(path)),
      stat: stats,
      lstat: stats,
      readlink: async (path: string): Promise<never> => {
        throw errno('ENOENT', at(path));
      },
      symlink: async (_target: string, path: string): Promise<never> => {
        throw errno('EPERM', at(path));
      },
    },
  };
};

/**
 * Create a `RevisionPort` over a filesystem provider, backed by `isomorphic-git`.
 *
 * @param options - Provider, control-plane location, object format and checkouts.
 * @returns A port whose revision ids are Git commit ids.
 * @public
 * @example <caption>Record a revision in the page</caption>
 * ```typescript
 * import { createMemoryProvider } from '@taucad/filesystem/backend';
 * import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
 *
 * const port = createIsomorphicGitRevisionPort({ filesystem: await createMemoryProvider() });
 * await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
 * ```
 */
export const createIsomorphicGitRevisionPort = (options: IsomorphicGitRevisionPortOptions): RevisionPort => {
  const { filesystem, checkouts } = options;
  const gitdir = options.gitDirectory ?? defaultGitDirectory;
  const objectFormat = options.objectFormat ?? 'sha1';
  if (objectFormat !== 'sha1') {
    throw new RevisionPortError('UNSUPPORTED_OPERATION', 'isomorphic-git writes SHA-1 objects only.');
  }
  const fs = fileSystemShim(filesystem);
  const checkoutsDirectory = `${gitdir}/checkouts`;
  const refOf = (name: string): string => `${branchRefPrefix}/${name}`;
  const checkoutIdOf = (branch: string): string =>
    digestHex(objectFormat, new TextEncoder().encode(`tau-checkout\0${branch}`)).slice(0, 16);

  const readRaw = async (oid: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-deprecated -- the typed
       * readers drop Tau's `change-id` and `jj:*` headers; raw content is the
       * only shape that carries them. */
      const object = await readObject({ fs, gitdir, oid, format: 'content' });
      return object.format === 'content' && object.type === 'commit' ? new Uint8Array(object.object) : undefined;
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  };

  const commitOf = async (id: RevisionId): Promise<DecodedCommit | undefined> => {
    const body = await readRaw(id);
    return body === undefined ? undefined : decodeCommit(body);
  };

  const requireCommit = async (id: RevisionId): Promise<DecodedCommit> => {
    const commit = await commitOf(id);
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

  const receiptOf = (id: RevisionId, commit: DecodedCommit): RevisionReceipt =>
    Object.freeze({
      engine: 'isomorphic-git',
      commitId: id,
      changeId: commit.changeId ?? '',
      objectFormat,
      conflicted: commit.conflictedTrees !== undefined,
    });

  /**
   * Walk one tree object graph into flat root-relative paths.
   *
   * Object ids only: a caller that wants bytes asks for them afterwards, so a
   * diff never reads a blob.
   *
   * @param oid - Tree object to walk.
   * @param prefix - Path prefix accumulated so far.
   * @param into - Collected path to blob id.
   */
  const walkTree = async (oid: string, prefix: string, into: Map<string, string>): Promise<void> => {
    const { tree } = await readTree({ fs, gitdir, oid });
    await Promise.all(
      tree.map(async (entry) => {
        const path = prefix === '' ? entry.path : `${prefix}/${entry.path}`;
        if (entry.type === 'tree') {
          return walkTree(entry.oid, path, into);
        }
        into.set(path, entry.oid);
        return undefined;
      }),
    );
  };

  const flatTree = async (oid: string): Promise<ReadonlyMap<string, string>> => {
    const paths = new Map<string, string>();
    await walkTree(oid, '', paths);
    return paths;
  };

  const writeTreeGraph = async (node: TreeDraft): Promise<string> => {
    const entries: TreeEntry[] = await Promise.all([
      ...[...node.files].map(
        async ([path, content]): Promise<TreeEntry> => ({
          mode: fileMode,
          path,
          oid: await writeBlob({ fs, gitdir, blob: content }),
          type: 'blob',
        }),
      ),
      ...[...node.directories].map(
        async ([path, child]): Promise<TreeEntry> => ({
          mode: directoryMode,
          path,
          oid: await writeTreeGraph(child),
          type: 'tree',
        }),
      ),
    ]);
    return writeTree({ fs, gitdir, tree: entries });
  };

  const readCheckoutRecord = async (id: string): Promise<Checkout | undefined> => {
    const path = `${checkoutsDirectory}/${id}.json`;
    if (checkouts === undefined || !(await filesystem.exists(path))) {
      return undefined;
    }
    const stored: unknown = JSON.parse(await filesystem.readFile(path, 'utf8'));
    const record = stored as Readonly<{ id: string; branch: string; baseRevisionId: string }>;
    return Object.freeze({
      id: record.id,
      projectId: checkouts.projectId,
      root: `/checkouts/${record.id}`,
      kind: 'linked',
      branch: record.branch,
      baseRevisionId: revisionId(record.baseRevisionId),
    });
  };

  const listCheckoutRecords = async (): Promise<readonly Checkout[]> => {
    const stored = (await filesystem.exists(checkoutsDirectory)) ? await filesystem.readdir(checkoutsDirectory) : [];
    const ids = stored.filter((name) => name.endsWith('.json'));
    const linked = await Promise.all(ids.toSorted().map(async (name) => readCheckoutRecord(name.slice(0, -5))));
    return Object.freeze(linked.filter((checkout) => checkout !== undefined));
  };

  const requireCheckouts = (): IsomorphicGitCheckoutOptions => {
    if (checkouts === undefined) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        'This store has no checkout routes; construct it with `checkouts` to use them.',
      );
    }
    return checkouts;
  };

  const port: RevisionPort = Object.freeze({
    describe: async (): Promise<RevisionEngineDescriptor> => {
      await Promise.resolve();
      return Object.freeze({
        engine: 'isomorphic-git',
        version: version(),
        objectFormat,
        changeIds: true,
        conflictsAsValues: true,
        transports: false,
        nWayMerge: false,
        checkouts: checkouts !== undefined,
      });
    },

    init: async (input: InitRevisionStoreInput): Promise<void> => {
      const ignorePath = generatedIgnorePath;
      const existing = (await filesystem.exists(ignorePath))
        ? await filesystem.readFile(ignorePath, 'utf8')
        : undefined;
      await filesystem.writeFile(ignorePath, generatedIgnoreContent(existing, input.additionalIgnores ?? []));
      // Only now: the repository is created after the file that decides what a
      // snapshot may ever contain already exists.
      await init({ fs, dir: '', gitdir, defaultBranch });
    },

    readRevision: async (id: RevisionId): Promise<RevisionRecord | undefined> => {
      const commit = await commitOf(id);
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
        receipt: receiptOf(id, commit),
      });
    },

    readTree: async (id: RevisionId): Promise<ImmutableRevisionTree | undefined> => {
      const commit = await commitOf(id);
      if (commit === undefined) {
        return undefined;
      }
      const paths = await flatTree(commit.tree);
      const entries = await Promise.all(
        [...paths].map(async ([path, oid]): Promise<readonly [string, Uint8Array<ArrayBuffer>]> => {
          const { blob } = await readBlob({ fs, gitdir, oid });
          return [path, new Uint8Array(blob)];
        }),
      );
      return new ImmutableRevisionTree(entries);
    },

    writeRevision: async (input: WriteRevisionInput): Promise<RevisionReceipt> => {
      const treeId = await writeTreeGraph(draftOf(input.tree));
      const trailer: RevisionTrailer = {
        parents: [...input.parents],
        provenance: input.provenance,
        summary: input.summary,
      };
      const commit = encodeCommit({
        objectFormat,
        tree: treeId,
        parents: [...input.parents],
        author: signature(input.provenance),
        committer: signature(input.provenance),
        message: revisionCommitMessage(trailer),
        changeId: deriveChangeId(objectFormat, { treeId, parents: input.parents, trailer }),
        ...(input.conflict === undefined
          ? {}
          : { conflictedTrees: [...input.conflict.trees], conflictLabels: [...input.conflict.labels] }),
      });
      /* eslint-disable-next-line @typescript-eslint/no-deprecated -- `writeCommit`
       * takes a `CommitObject`, which has no field for `change-id`, `jj:trees` or
       * `jj:conflict-labels`; the raw object is the only way to store them. */
      const oid = await writeObject({ fs, gitdir, type: 'commit', format: 'content', object: commit.body });
      return receiptOf(revisionId(oid), decodeCommit(commit.body));
    },

    readRef: async (name: string): Promise<RevisionId | undefined> => {
      try {
        return revisionId(await resolveRef({ fs, gitdir, ref: refOf(name) }));
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },

    /**
     * The check and the write are one critical section.
     *
     * `isomorphic-git`'s `writeRef` has no expected-old value of its own, so the
     * compare and the write are fenced here (I7): the shared {@link ResourceQueue}
     * for the one process a page runs, and a Web Lock of the same name across
     * documents — a merge, a discard or a candidate publication from a second tab
     * reaches this ref with no other fence (8-review S4).
     *
     * An omitted `head` deletes the ref under the same check.
     *
     * @param input - The ref, the value it must currently hold, and the new one.
     * @returns The publication, or the conflict that refused it.
     */
    updateRef: async (input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult> =>
      withRefLock(`${filesystem.id}:${gitdir}:${input.name}`, async () => {
        const actualHead = await port.readRef(input.name);
        if (actualHead !== input.expectedHead) {
          return Object.freeze({
            status: 'conflicted',
            name: input.name,
            expectedHead: input.expectedHead,
            actualHead,
            proposedHead: input.head,
          });
        }
        if (input.head === undefined) {
          if (actualHead !== undefined) {
            await deleteRef({ fs, gitdir, ref: refOf(input.name) });
          }
          return Object.freeze({ status: 'updated', name: input.name, previousHead: actualHead, head: undefined });
        }
        if ((await readRaw(input.head)) === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', 'Cannot publish a revision the store does not hold.');
        }
        await writeRef({ fs, gitdir, ref: refOf(input.name), value: input.head, force: true });
        return Object.freeze({
          status: 'updated',
          name: input.name,
          previousHead: actualHead,
          head: input.head,
        });
      }),

    /* Symbolic, like Git's own HEAD: the file names a *branch*, so a turn
     * recorded onto that branch moves the head with it and nothing is written
     * twice (operator decisions 2026-09-09, question 11). */
    readHead: async (): Promise<RevisionHead | undefined> => {
      let target: string;
      try {
        /* One level only: the answer is the *name* HEAD points at, born or not,
         * and `isomorphic-git` hands it back with its `ref: ` prefix intact. */
        target = await resolveRef({ fs, gitdir, ref: 'HEAD', depth: 1 });
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        throw error;
      }
      const symbolic = target.startsWith(symbolicRefPrefix) ? target.slice(symbolicRefPrefix.length).trim() : target;
      const branch = symbolic.startsWith(`${branchRefPrefix}/`) ? symbolic.slice(branchRefPrefix.length + 1) : '';
      return branch === '' ? undefined : Object.freeze({ branch, head: await port.readRef(branch) });
    },

    /* Under the same fence as every other ref write: a head moved from a second
     * tab, or from the host process beside the renderer, would otherwise be a
     * bare write a concurrent `readHead` can observe half of — and an empty
     * head sends the next direct turn back to the trunk (c2-review S2). */
    setHead: async (branch: string): Promise<void> =>
      withRefLock(`${filesystem.id}:${gitdir}:HEAD`, async () => {
        await writeRef({ fs, gitdir, ref: 'HEAD', value: refOf(branch), force: true, symbolic: true });
      }),

    listRefs: async (prefix?: string): Promise<readonly RevisionRef[]> => {
      const names = await listRefs({ fs, gitdir, filepath: branchRefPrefix });
      const selected = names.filter((name) => prefix === undefined || name.startsWith(prefix)).toSorted();
      const references = await Promise.all(selected.map(async (name) => ({ name, head: await port.readRef(name) })));
      return Object.freeze(
        references
          .map((reference) =>
            reference.head === undefined ? undefined : Object.freeze({ name: reference.name, head: reference.head }),
          )
          .filter((reference) => reference !== undefined),
      );
    },

    log: async (input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]> => {
      const references = input?.heads === undefined ? await port.listRefs() : undefined;
      const queue = [...(input?.heads ?? (references ?? []).map((reference) => reference.head))];
      const limit = input?.limit ?? Number.POSITIVE_INFINITY;
      const seen = new Set<string>();
      const entries: RevisionLogEntry[] = [];
      while (queue.length > 0 && entries.length < limit) {
        const current = queue.shift()!;
        if (seen.has(current)) {
          continue;
        }
        seen.add(current);
        // oxlint-disable-next-line eslint/no-await-in-loop -- the walk reads commit objects only; no tree is materialized.
        const commit = await commitOf(current);
        if (commit === undefined) {
          continue;
        }
        entries.push(entryOf(current, commit));
        queue.push(...commit.parents.map((parent) => revisionId(parent)));
      }
      return Object.freeze(entries);
    },

    diff: async (input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]> => {
      const toCommit = await requireCommit(input.to);
      const fromCommit = input.from === undefined ? undefined : await requireCommit(input.from);
      const before = fromCommit === undefined ? new Map<string, string>() : await flatTree(fromCommit.tree);
      const after = await flatTree(toCommit.tree);
      return Object.freeze(
        [...new Set([...before.keys(), ...after.keys()])]
          .sort()
          .map((path) => {
            const left = before.get(path);
            const right = after.get(path);
            // Object ids are compared, never contents: an unchanged subtree
            // costs nothing and no blob is ever read.
            return left === right
              ? undefined
              : frozenChange(path, left === undefined ? 'added' : right === undefined ? 'deleted' : 'modified');
          })
          .filter((entry) => entry !== undefined),
      );
    },

    fetch: async (_input: RevisionTransportInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'The browser leg has no transport yet; S24 wires it.');
    },

    push: async (_input: RevisionTransportInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'The browser leg has no transport yet; S24 wires it.');
    },

    changeId: async (id: RevisionId): Promise<string | undefined> => {
      const commit = await commitOf(id);
      return commit?.changeId;
    },

    conflicts: async (id: RevisionId): Promise<RevisionConflict | undefined> => {
      const commit = await commitOf(id);
      return commit?.conflictedTrees === undefined
        ? undefined
        : Object.freeze({
            trees: commit.conflictedTrees,
            labels: commit.conflictLabels ?? Object.freeze([]),
          });
    },

    listCheckouts: async (): Promise<readonly Checkout[]> => {
      const { projectId } = requireCheckouts();
      const head = await port.readHead();
      const live: Checkout = Object.freeze({
        id: liveCheckoutId,
        projectId,
        root: '',
        kind: 'live',
        branch: head?.branch,
        baseRevisionId: head?.head,
      });
      return Object.freeze([live, ...(await listCheckoutRecords())]);
    },

    /**
     * One checkout per branch, and the tree is materialized through the route
     * the host gave this port — never a path joined above the project.
     *
     * @param input - The branch, and where an unborn one starts.
     * @returns The checkout that now holds that branch.
     */
    addCheckout: async (input: AddCheckoutInput): Promise<Checkout> => {
      const { projectId, root } = requireCheckouts();
      const live = await port.readHead();
      const records = await listCheckoutRecords();
      const existing = [live?.branch, ...records.map((one) => one.branch)];
      if (existing.includes(input.branch)) {
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
      const id = checkoutIdOf(input.branch);
      if (head === undefined) {
        await port.updateRef({ name: input.branch, expectedHead: undefined, head: base });
      }
      const tree = await port.readTree(base);
      if (tree === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for revision ${base}.`);
      }
      const provider = await root(id);
      await Promise.all(tree.entries().map(async (entry) => provider.writeFile(entry.path, entry.content)));
      await filesystem.writeFile(
        `${checkoutsDirectory}/${id}.json`,
        `${JSON.stringify({ version: 1, id, branch: input.branch, baseRevisionId: base })}\n`,
      );
      return Object.freeze({
        id,
        projectId,
        root: `/checkouts/${id}`,
        kind: 'linked',
        branch: input.branch,
        baseRevisionId: base,
      });
    },

    removeCheckout: async (id: string): Promise<void> => {
      requireCheckouts();
      if (id === liveCheckoutId) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', 'The live checkout is the project; it cannot be removed.');
      }
      const record = await readCheckoutRecord(id);
      if (record === undefined) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', `No checkout is registered as ${id}.`);
      }
      await filesystem.unlink(`${checkoutsDirectory}/${id}.json`);
    },
  });

  return port;
};
