/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * `RevisionPort` over a `FileSystemProvider`, in Git object format.
 *
 * This is deliberately **not** a Git engine: it is the object encoder plus a
 * content-addressed store, so a revision written in the page has the same
 * identity a native engine would give it, and the same headers. Merges are
 * resolved by the compiled revision algebra when one is supplied, which is the
 * only way the page and the CLI agree byte-for-byte; a conflict is then
 * recorded as a value, never raised as a failed operation (I-CONF).
 */

import { ImmutableRevisionTree, ResourceQueue, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance } from '#revision-authority.js';
import type { FileSystemProvider } from '@taucad/filesystem';
import { decodeCommit, decodeTree, encodeCommit, encodeTreeGraph } from '#git-objects.js';
import type { DecodedCommit, EncodedGitObject, FlatTreeEntry, GitSignature } from '#git-objects.js';
import type { ObjectFormat } from '#object-hash.js';
import { deriveChangeId, parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';
import { RevisionPortError } from '#revision-port.js';
import type {
  ImportRevisionBundleInput,
  InitRevisionStoreInput,
  MaterializeConflictInput,
  RevisionBundleInput,
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
import type { RevisionAlgebra } from '#revision-algebra.js';
import {
  generatedIgnoreContent,
  generatedIgnorePath,
  generatedJjConfigContent,
  generatedJjConfigPath,
} from '#workspace-config.js';

/** Configuration for one provider-backed revision store. @public */
export type BrowserRevisionPortOptions = Readonly<{
  filesystem: FileSystemProvider;
  /** Store location. Defaults to `.tau/revisions`, which the generated ignore excludes. */
  storageDirectory?: string;
  /** Recorded object format for this store. Defaults to `sha1`, matching a Jujutsu Git backend. */
  objectFormat?: ObjectFormat;
  /**
   * The compiled revision algebra. Supplied, a merge computed from parents
   * matches the CLI byte-for-byte and `materialize` is available; absent, the
   * caller supplies every tree itself.
   */
  algebra?: RevisionAlgebra;
}>;

const defaultStorageDirectory = '.tau/revisions';
/** Shared across every store in this document: one ref, one writer at a time. */
const refQueue = new ResourceQueue();
const fileMode = '100644';
const emptyBytes = new Uint8Array(new ArrayBuffer(0));

const frozenChange = (path: string, kind: RevisionDiffEntry['kind']): RevisionDiffEntry =>
  Object.freeze({ path, kind });

const signature = (provenance: RevisionProvenance): GitSignature => ({
  name: provenance.actorId,
  email: `${provenance.source}@tau.invalid`,
  seconds: Math.floor(provenance.createdAt / 1000),
  offsetMinutes: 0,
});

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

/**
 * Create a `RevisionPort` over a filesystem provider, in Git object format.
 *
 * @param options - Provider, store location, recorded object format and algebra.
 * @returns A port whose revision ids are Git commit ids.
 * @public
 * @example <caption>Record a revision in the page</caption>
 * ```typescript
 * import { createMemoryProvider } from '@taucad/filesystem/backend';
 * import { createBrowserRevisionPort } from '@taucad/revisions';
 *
 * const port = createBrowserRevisionPort({ filesystem: await createMemoryProvider() });
 * await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
 * ```
 */
export const createBrowserRevisionPort = (options: BrowserRevisionPortOptions): RevisionPort => {
  const { filesystem } = options;
  const directory = options.storageDirectory ?? defaultStorageDirectory;
  const objectFormat = options.objectFormat ?? 'sha1';
  const objectsDirectory = `${directory}/objects`;
  const referencesDirectory = `${directory}/refs`;
  const objectPath = (id: string): string => `${objectsDirectory}/${id.slice(0, 2)}/${id.slice(2)}`;
  const refPath = (name: string): string => `${referencesDirectory}/${encodeURIComponent(name)}`;
  /* Beside the refs directory, never inside it: `listRefs` reads that directory
   * as branch heads, and this is a name for one of them, not another. */
  const headPath = `${directory}/HEAD`;
  const headPrefix = 'ref: ';

  const putObject = async (object: EncodedGitObject): Promise<void> => {
    const path = objectPath(object.id);
    if (!(await filesystem.exists(path))) {
      await filesystem.writeFile(path, object.framed);
    }
  };

  const getObject = async (id: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    const path = objectPath(id);
    if (!(await filesystem.exists(path))) {
      return undefined;
    }
    const framed = await filesystem.readFile(path);
    const nul = framed.indexOf(0);
    if (nul === -1) {
      throw new RevisionPortError('ENGINE_FAILED', 'A stored object has no loose-object header.');
    }
    return framed.slice(nul + 1);
  };

  const requireObject = async (id: string): Promise<Uint8Array<ArrayBuffer>> => {
    const body = await getObject(id);
    if (body === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', `The object store does not hold ${id}.`);
    }
    return body;
  };

  const commitOf = async (id: RevisionId): Promise<DecodedCommit | undefined> => {
    const body = await getObject(id);
    return body === undefined ? undefined : decodeCommit(body);
  };

  const requireCommit = async (id: RevisionId): Promise<DecodedCommit> => {
    const commit = await commitOf(id);
    if (commit === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'The revision is not in the store.');
    }
    return commit;
  };

  /**
   * Walk one tree object graph into flat root-relative paths.
   *
   * @param treeId - Tree object to walk.
   * @param prefix - Path prefix accumulated so far.
   * @param visit - Called for every non-directory entry.
   */
  const walkTree = async (
    treeId: string,
    prefix: string,
    visit: (path: string, entryId: string) => Promise<void> | void,
  ): Promise<void> => {
    for (const entry of decodeTree(objectFormat, await requireObject(treeId))) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      // oxlint-disable-next-line eslint/no-await-in-loop -- depth-first order keeps peak memory at one subtree.
      await (entry.mode === '40000' ? walkTree(entry.objectId, path, visit) : visit(path, entry.objectId));
    }
  };

  const flatTree = async (treeId: string): Promise<ReadonlyMap<string, string>> => {
    const paths = new Map<string, string>();
    await walkTree(treeId, '', (path, entryId) => {
      paths.set(path, entryId);
    });
    return paths;
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
      engine: 'browser',
      commitId: id,
      changeId: commit.changeId ?? '',
      objectFormat,
      conflicted: commit.conflictedTrees !== undefined,
    });

  const flatEntries = (tree: ImmutableRevisionTree): readonly FlatTreeEntry[] =>
    tree.entries().map((entry) => ({ path: entry.path, mode: fileMode, content: entry.content }));

  /**
   * Nearest common ancestor of two revisions, by breadth-first walk over commit
   * objects only.
   *
   * @param left - First revision.
   * @param right - Second revision.
   * @returns The common ancestor, or `undefined` when the two share none.
   */
  const commonAncestor = async (left: RevisionId, right: RevisionId): Promise<RevisionId | undefined> => {
    const walk = async (start: RevisionId, into: Set<string> | undefined): Promise<RevisionId | undefined> => {
      const queue: RevisionId[] = [start];
      const seen = new Set<string>();
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (seen.has(current)) {
          continue;
        }
        seen.add(current);
        if (into === undefined && ancestors.has(current)) {
          return current;
        }
        into?.add(current);
        // oxlint-disable-next-line eslint/no-await-in-loop -- a breadth-first walk is sequential by definition.
        const commit = await commitOf(current);
        queue.push(...(commit?.parents ?? []).map((parent) => revisionId(parent)));
      }
      return undefined;
    };
    const ancestors = new Set<string>();
    await walk(left, ancestors);
    return walk(right, undefined);
  };

  /**
   * Merge the parents' trees with the compiled algebra. A path that does not
   * resolve becomes materialized conflict-marker content plus the term trees
   * recorded on the revision, so the conflict is a value in the graph.
   *
   * @param parents - The two revisions to merge.
   * @returns The merged entries and the conflict, when there is one.
   */
  const mergeParents = async (
    parents: readonly RevisionId[],
  ): Promise<Readonly<{ entries: readonly FlatTreeEntry[]; conflict: RevisionConflict | undefined }>> => {
    const { algebra } = options;
    if (algebra === undefined) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        'Computing a merge needs the compiled revision algebra; supply one, or pass an explicit tree.',
      );
    }
    if (parents.length !== 2) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'Only a two-parent merge is computed from its parents.');
    }
    const [left, right] = parents as readonly [RevisionId, RevisionId];
    const leftCommit = await requireCommit(left);
    const rightCommit = await requireCommit(right);
    const baseId = await commonAncestor(left, right);
    const baseCommit = baseId === undefined ? undefined : await requireCommit(baseId);
    const trees = [leftCommit.tree, baseCommit?.tree, rightCommit.tree];
    const sides = [
      await flatTree(leftCommit.tree),
      baseCommit === undefined ? undefined : await flatTree(baseCommit.tree),
      await flatTree(rightCommit.tree),
    ];

    const entries: FlatTreeEntry[] = [];
    let conflicted = false;
    for (const path of [...new Set(sides.flatMap((side) => [...(side?.keys() ?? [])]))].sort()) {
      const blobs: Array<Uint8Array<ArrayBuffer>> = [];
      for (const side of sides) {
        const blobId = side?.get(path);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one blob at a time bounds peak memory.
        blobs.push(blobId === undefined ? emptyBytes : await requireObject(blobId));
      }
      const merged = algebra.merge3({ terms: blobs });
      const content = merged.kind === 'resolved' ? merged.content : algebra.materialize({ terms: blobs });
      conflicted ||= merged.kind === 'conflict';
      if (content.length > 0) {
        entries.push({ path, mode: fileMode, content });
      }
    }
    if (!conflicted) {
      return { entries, conflict: undefined };
    }
    // The empty tree stands in for an absent base, exactly as an absent side
    // term does inside a merge.
    const emptyTree = encodeTreeGraph(objectFormat, []).tree;
    await putObject(emptyTree);
    return {
      entries,
      conflict: {
        trees: Object.freeze([trees[0]!, trees[1] ?? emptyTree.id, trees[2]!]),
        labels: Object.freeze([left.slice(0, 12), baseId?.slice(0, 12) ?? 'base', right.slice(0, 12)]),
      },
    };
  };

  const port: RevisionPort = Object.freeze({
    describe: async (): Promise<RevisionEngineDescriptor> => {
      await Promise.resolve();
      return Object.freeze({
        engine: 'browser',
        version: options.algebra === undefined ? 'objects-only' : options.algebra.describe().sourceRevision,
        objectFormat,
        changeIds: true,
        conflictsAsValues: true,
        transports: false,
        bundles: false,
        nWayMerge: false,
      });
    },

    init: async (input: InitRevisionStoreInput): Promise<void> => {
      const ignorePath = generatedIgnorePath;
      const existing = (await filesystem.exists(ignorePath))
        ? await filesystem.readFile(ignorePath, 'utf8')
        : undefined;
      await filesystem.writeFile(ignorePath, generatedIgnoreContent(existing, input.additionalIgnores ?? []));
      await filesystem.writeFile(generatedJjConfigPath, generatedJjConfigContent(input.author));
      // Only now: the store is created after the two files that decide what a
      // snapshot may ever contain already exist.
      await filesystem.mkdir(objectsDirectory, { recursive: true });
      await filesystem.mkdir(referencesDirectory, { recursive: true });
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
      const entries: Array<readonly [string, Uint8Array<ArrayBuffer>]> = [];
      await walkTree(commit.tree, '', async (path, entryId) => {
        entries.push([path, await requireObject(entryId)]);
      });
      return new ImmutableRevisionTree(entries);
    },

    writeRevision: async (input: WriteRevisionInput): Promise<RevisionReceipt> => {
      const computed = input.tree === undefined ? await mergeParents(input.parents) : undefined;
      const graph = encodeTreeGraph(objectFormat, computed?.entries ?? flatEntries(input.tree!));
      for (const object of graph.objects) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- every object must be durable before the commit names it.
        await putObject(object);
      }
      const trailer: RevisionTrailer = {
        parents: [...input.parents],
        provenance: input.provenance,
        summary: input.summary,
      };
      const conflict = input.conflict ?? computed?.conflict;
      const commit = encodeCommit({
        objectFormat,
        tree: graph.tree.id,
        parents: [...input.parents],
        author: signature(input.provenance),
        committer: signature(input.provenance),
        message: revisionCommitMessage(trailer),
        changeId: deriveChangeId(objectFormat, { treeId: graph.tree.id, parents: input.parents, trailer }),
        ...(conflict === undefined
          ? {}
          : { conflictedTrees: [...conflict.trees], conflictLabels: [...conflict.labels] }),
      });
      await putObject(commit);
      return receiptOf(revisionId(commit.id), decodeCommit(commit.body));
    },

    readRef: async (name: string): Promise<RevisionId | undefined> => {
      const path = refPath(name);
      if (!(await filesystem.exists(path))) {
        return undefined;
      }
      const stored = await filesystem.readFile(path, 'utf8');
      const head = stored.trim();
      return head === '' ? undefined : revisionId(head);
    },

    /**
     * The check and the write are one critical section.
     *
     * The engine adapter's linearization point is `git update-ref`'s lockfile;
     * this store's is the shared {@link ResourceQueue}, keyed by store and ref,
     * for the one process a page runs, and a Web Lock of the same name across
     * documents — the DT2 hold fences only an admitted local writer, and a
     * merge, a discard or a candidate publication from a second tab reaches
     * this ref with no other fence (8-review S4). Interleaving the read with
     * the write is what let two awaited publications from one unborn ref both
     * report `updated`.
     *
     * An omitted `head` deletes the ref under the same check.
     */
    updateRef: async (input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult> =>
      withRefLock(`${filesystem.id}:${directory}:${input.name}`, async () => {
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
          if (await filesystem.exists(refPath(input.name))) {
            await filesystem.unlink(refPath(input.name));
          }
          return Object.freeze({ status: 'updated', name: input.name, previousHead: actualHead, head: undefined });
        }
        if ((await getObject(input.head)) === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', 'Cannot publish a revision the store does not hold.');
        }
        await filesystem.writeFile(refPath(input.name), `${input.head}\n`);
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
      if (!(await filesystem.exists(headPath))) {
        return undefined;
      }
      const contents = await filesystem.readFile(headPath, 'utf8');
      const stored = contents.trim();
      const branch = stored.startsWith(headPrefix) ? stored.slice(headPrefix.length) : '';
      return branch === '' ? undefined : Object.freeze({ branch, head: await port.readRef(branch) });
    },

    /* Under the same fence as every other ref write: a head moved from a second
     * tab, or from the host process beside the renderer, would otherwise be a
     * bare write a concurrent `readHead` can observe half of — and an empty
     * head sends the next direct turn back to the trunk (c2-review S2). */
    setHead: async (branch: string): Promise<void> =>
      withRefLock(`${filesystem.id}:${directory}:HEAD`, async () => {
        await filesystem.mkdir(directory, { recursive: true });
        await filesystem.writeFile(headPath, `${headPrefix}${branch}\n`);
      }),

    listRefs: async (prefix?: string): Promise<readonly RevisionRef[]> => {
      if (!(await filesystem.exists(referencesDirectory))) {
        return Object.freeze([]);
      }
      const references: RevisionRef[] = [];
      const files = await filesystem.readdir(referencesDirectory);
      for (const file of files.toSorted()) {
        const name = decodeURIComponent(file);
        if (prefix !== undefined && !name.startsWith(prefix)) {
          continue;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- ref files are small and read deterministically.
        const stored = await filesystem.readFile(`${referencesDirectory}/${file}`, 'utf8');
        references.push(Object.freeze({ name, head: revisionId(stored.trim()) }));
      }
      return Object.freeze(references);
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
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'The browser store has no transport; use the remote port.');
    },

    push: async (_input: RevisionTransportInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'The browser store has no transport; use the remote port.');
    },

    bundle: async (_input: RevisionBundleInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'The browser store does not produce bundles.');
    },

    importBundle: async (_input: ImportRevisionBundleInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'The browser store does not import bundles.');
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

    materialize: async (input: MaterializeConflictInput): Promise<Uint8Array<ArrayBuffer>> => {
      await Promise.resolve();
      const { algebra } = options;
      if (algebra === undefined) {
        throw new RevisionPortError(
          'UNSUPPORTED_OPERATION',
          'Rendering conflict markers needs the compiled revision algebra.',
        );
      }
      return algebra.materialize({
        terms: input.terms,
        ...(input.labels === undefined ? {} : { labels: input.labels }),
      });
    },
  });

  return port;
};
