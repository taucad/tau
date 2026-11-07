/**
 * `RevisionPort` over a `FileSystemProvider`, backed by `isomorphic-git`.
 *
 * The store is a real Git repository whose control plane lives at `.git` and
 * whose worktree is the project root — one layout on every host (D29), in the
 * one filesystem the project already has — so objects, packs, refs and — once
 * S24 lands its transport — smart HTTP are the library's, not Tau's. Only the
 * commit object is still written by Tau: every revision carries
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
  addRemote,
  deleteRef,
  deleteRemote,
  getConfigAll,
  getRemoteInfo2,
  init,
  listRefs,
  listRemotes,
  listServerRefs,
  resolveRef,
  setConfig,
  version,
  writeRef,
} from 'isomorphic-git';
import { ResourceQueue, workerTimings } from '@taucad/filesystem';
import { randomUuid } from '@taucad/utils/id';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { FileMode, FileSystemProvider, PrivateStore } from '@taucad/filesystem';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import type { RevisionProvenance } from '#revision-authority.js';
import { decodeCommit, decodeTag, encodeCommit, encodeTag } from '#git-objects.js';
import type { DecodedCommit } from '#git-objects.js';
import { encodeGitIndex } from '#git-index.js';
import { checkoutIdOfBranch } from '#checkout-id.js';
import { concatBytes } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import {
  deriveChangeId,
  parseRevisionCommitMessage,
  parseRevisionTagMessage,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  taggerSignature,
} from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';
import { walkRevisionLog } from '#revision-log-order.js';
import {
  pktEncoder,
  pktLine,
  postService,
  readUploadPackPack,
  receivePack,
} from '#adapter-transport/adapter-transport.js';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { settleBounded } from '#chat-projection-pool.js';
import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { createObjectStore, gitFilesOf, isMissing, PackCeilingError } from '#object-store/object-store.js';
import { coldOpenFromCatalogue, importReachableFromCatalogue } from '#object-store/cold-open.js';
import type { CatalogueFamily, ColdOpenOptions, ColdOpenReport } from '#object-store/cold-open.js';
import type { GitFiles, ObjectStore } from '#object-store/object-store.js';
import { readTreeEntries, writeTreeObject } from '#object-store/tree-codec.js';
import type { TreeCodecEntry } from '#object-store/tree-codec.js';
import { RevisionPortError } from '#revision-port.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';
import { cleanLargeObjects, lfsObjectPath, readLfsPointer } from '#lfs.js';
import type { LfsPointer } from '#lfs.js';
import { createTreeIdMemo } from '#tree-id-memo.js';
import type { TreeObject } from '#tree-id-memo.js';
import { createLfsClient, LfsQuotaError, withQuotaPaths } from '#lfs-client.js';
import type { LfsTransport } from '#lfs-client.js';
import {
  isHostLocalRef,
  lfsRemoteUnsupportedMessage,
  remoteCarriesLargeObjects,
  remoteOf,
  refMoved,
  remoteRefusalSaid,
  remoteTrackingRef,
  remoteTransportError,
} from '#remotes.js';
import type { Remote } from '#remotes.js';
import type { RevisionHttpClient } from '#http-client.js';
import type {
  AddCheckoutInput,
  Checkout,
  CreateRevisionTagInput,
  InitRevisionStoreInput,
  RevisionConflict,
  RevisionDiffEntry,
  RevisionDiffInput,
  RevisionDivergence,
  RevisionDivergenceInput,
  RevisionEngineDescriptor,
  RevisionHead,
  RevisionLogEntry,
  RevisionLogInput,
  ReadTreeOptions,
  RevisionPort,
  RevisionReceipt,
  RevisionRecord,
  RemoteRef,
  RevisionRemoteAddress,
  RevisionFetchInput,
  RevisionFetchResult,
  RevisionPushInput,
  RevisionPushRef,
  RevisionPushRefResult,
  RevisionPushResult,
  RevisionPushSession,
  SetRevisionRemoteInput,
  RevisionRef,
  RevisionTag,
  RevisionTreeListing,
  UpdateRevisionRefInput,
  UpdateRevisionRefResult,
  WriteRevisionInput,
} from '#revision-port.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
} from '#workspace-config.js';

/*
 * `isomorphic-git` reads the Node `Buffer` *global*, and a browser has none.
 *
 * Not a style choice of the library's: `GitTree.toObject`, `GitIndex` and its
 * `BufferCursor` all call `Buffer.from`/`alloc`/`concat` directly
 * (`isomorphic-git@1.38.5/index.js` :422, :663, :2577), so the first object a
 * browser host *writes* throws `Buffer is not defined` — which is what a fresh
 * project's first turn hit, as a failed base cut it could not report (W19-b).
 * Reading never touched it, which is why the port looked healthy until a mint.
 *
 * Here rather than in a host: this module is the only thing in Tau that calls
 * `isomorphic-git`, so one assignment covers every browser host of the package
 * instead of one per host that forgets. `node:`-less on purpose — Node resolves
 * the bare specifier to its own builtin and `??=` then keeps it, while a
 * bundler resolves the `buffer` package, which is the whole point.
 */
// oxlint-disable-next-line node-js/prefer-global/buffer, unicorn/prefer-node-protocol -- The global is exactly what is missing, and `node:buffer` has no browser build.
import { Buffer as BufferPolyfill } from 'buffer';

/* `@types/node` types the global as always present; in a browser it is not,
 * which is the whole reason for the line below. */
const hostGlobals: { Buffer?: typeof BufferPolyfill } = globalThis;
hostGlobals.Buffer ??= BufferPolyfill;

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
  /**
   * The project's files. A rooted view's `privateStore` carries every byte of
   * the `.git` store — objects, packs, refs, records — outside the mutation
   * pipeline (I6); a bare provider is used as it is.
   */
  filesystem: FileSystemProvider & { readonly privateStore?: PrivateStore };
  /** Control plane location. Defaults to `.git`, the one repository name on every host (D29). */
  gitDirectory?: string;
  /** Recorded object format. `isomorphic-git` writes SHA-1 only. */
  objectFormat?: ObjectFormat;
  /** Supplied, the port advertises and implements the `checkouts` capability. */
  checkouts?: IsomorphicGitCheckoutOptions;
  /**
   * The object store's CPU work — inflate, deflate, SHA-1, pack indexing. A
   * host with a compute worker passes its connection; by default the work runs
   * in this realm.
   */
  compute?: ComputeWorker;
  /**
   * Told about the object store this port opened, for gates that count what
   * its reads cost.
   */
  onObjectStore?: (store: ObjectStore) => void;
  /**
   * Supplied, the port has a transport and an LFS client (S24, S49).
   *
   * The Tau client, not the library's: it is the one place `keepalive`, the
   * open-pull `signal` and the `Authorization` header are set (I8).
   */
  http?: RevisionHttpClient;
  /**
   * Told what a tree read's large objects cost, whenever one had to fetch any
   * from the remote: the open's hydrate, made visible to the host's telemetry.
   */
  onLfsFetch?: (report: LfsFetchReport) => void;
  /**
   * The hosted store's catalogue (charter D8). Supplied, a fetch into a store
   * that holds no refs yet, for refs all in the catalogue's families, reads
   * the heads by Range through each pack's stored index instead of
   * `upload-pack`; and a fetch whose `upload-pack` answer passes the pack
   * ceiling takes its objects that way instead. Without a catalogue (a 404, an
   * incomplete one) the fetch goes over smart HTTP as before.
   */
  catalogue?: CatalogueAccess;
}>;

/**
 * How a port reaches a hosted store's catalogue.
 *
 * @public
 */
export type CatalogueAccess = Readonly<{
  /** The catalogue's URL for a remote's URL, or `undefined` where that remote has none. */
  url: (remoteUrl: string) => string | undefined;
  /** The API's fetch, which carries the session; the platform's by default. */
  fetch?: typeof globalThis.fetch;
  /** The files host's fetch, which carries no credential; {@link CatalogueAccess.fetch} by default. */
  filesFetch?: typeof globalThis.fetch;
  /** Told what each cold open cost. */
  onColdOpen?: (report: ColdOpenReport) => void;
}>;

/**
 * What one tree read's large-object phase did, for the host's telemetry.
 *
 * Counts and bytes only: no oid, path or project, so the host can report it
 * with bounded cardinality.
 *
 * @public
 */
export type LfsFetchReport = Readonly<{
  /** Wall time of the phase: local reads, batch calls and transfers. Milliseconds. */
  durationMilliseconds: number;
  /** Objects fetched from the remote, and their bytes. */
  networkObjects: number;
  networkBytes: number;
  /** Objects already in this store's LFS cache, and their bytes. */
  localObjects: number;
  localBytes: number;
  /**
   * The kind of host that served most of this read's fetched objects, from
   * their actions' hosts (`tau.lfs.transport`); absent when no transfer of
   * this read's own landed.
   */
  transport?: LfsTransport;
}>;

/**
 * The transport that served the most objects, as a report field; none when nothing was fetched.
 *
 * @param counts - Objects per transport.
 * @returns `{transport}`, or an empty object.
 */
const dominantTransport = (counts: ReadonlyMap<LfsTransport, number>): Readonly<{ transport?: LfsTransport }> => {
  let best: [LfsTransport, number] | undefined;
  for (const entry of counts) {
    if (best === undefined || entry[1] > best[1]) {
      best = entry;
    }
  }
  return best === undefined ? {} : { transport: best[0] };
};

const defaultGitDirectory = '.git';

const defaultBranch = 'main';
const branchRefPrefix = 'refs/heads';
const tagRefPrefix = 'refs/tags';
const symbolicRefPrefix = 'ref: ';
const liveCheckoutId = 'live';
/** Shared across every store in this document: one ref, one writer at a time. */
const refQueue = new ResourceQueue();

const frozenChange = (path: string, kind: RevisionDiffEntry['kind']): RevisionDiffEntry =>
  Object.freeze({ path, kind });

/** One ref this push sends: its local name, the remote's name, old and new. */
type PushCommand = Readonly<{ name: string; remoteName: string; old: string | undefined; head: string }>;

const refused = (name: string, reason: string): RevisionPushRefResult =>
  Object.freeze({ name, status: 'rejected', head: undefined, reason });

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

/**
 * Empty one checkout route.
 *
 * A removed checkout must leave nothing behind: its id is a pure function of
 * its branch, so files kept past the record union two revisions' trees the next
 * time that branch is checked out (review 4 R3). Native Git's
 * `worktree remove --force` already does exactly this. One entry at a time, so
 * the first refusal stops the walk with nothing still deleting behind it and a
 * retry resumes from what is left.
 *
 * @param provider - The route's provider.
 * @param path - The directory being emptied; the root by default.
 */
const clearProvider = async (provider: FileSystemProvider, path = ''): Promise<void> => {
  const names = await provider.readdir(path).catch((): readonly string[] => []);
  for (const name of names) {
    const child = path === '' ? name : `${path}/${name}`;
    // oxlint-disable-next-line no-await-in-loop -- sequential traversal: nothing deletes after a refusal.
    const stat = await provider.stat(child);
    if (stat.type === 'dir') {
      // oxlint-disable-next-line no-await-in-loop -- the children go before their directory.
      await clearProvider(provider, child);
      // oxlint-disable-next-line no-await-in-loop -- the directory goes once it is empty.
      await provider.rmdir(child);
    } else {
      // oxlint-disable-next-line no-await-in-loop -- one deletion at a time.
      await provider.unlink(child);
    }
  }
};

/**
 * The `fs` shim `isomorphic-git` binds for refs, config and `init`, over the
 * store's {@link GitFiles}. No object is read or written through it: the
 * object store does that.
 *
 * The library needs all ten of its commands present and errors that carry an
 * `errno` code; providers already throw those. `readlink` and `symlink` are the
 * two Tau has no provider for, and nothing in this adapter's call graph reaches
 * them — no library index or working-tree command (Tau encodes the index
 * itself, `#git-index.js`) — so they refuse rather than lie.
 *
 * @param provider - The store's files.
 * @returns A promise-shaped `FsClient`.
 */
const fileSystemShim = (provider: GitFiles) => {
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
    /* No `mode`: nothing this adapter calls reads one — no library index or
     * working-tree command — and a provider has no file mode to report. */
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

/** The families a set of refs falls in, or `undefined` when one is outside them all (ops, a remote's own). */
const catalogueFamiliesOf = (references: readonly string[]): CatalogueFamily[] | undefined => {
  const families = new Set<CatalogueFamily>(['heads', 'tags']);
  for (const ref of references) {
    if (ref.startsWith('refs/tau/chats/')) {
      families.add('chats');
    } else if (!ref.startsWith('refs/heads/') && !ref.startsWith('refs/tags/')) {
      return undefined;
    }
  }
  return [...families];
};

/** The largest `upload-pack` answer a fetch reads: the pack ceiling and its framing. Bytes. */
const uploadPackCeilingBytes = 64 * 1024 * 1024 + 64 * 1024;

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
  /* Every byte under the store's directory, off the mutation pipeline (I6). */
  const gitFiles = gitFilesOf(filesystem, gitdir);
  const fs = fileSystemShim(gitFiles);
  const compute = options.compute ?? createInlineCompute();
  const objects = createObjectStore({
    files: gitFiles,
    gitdir,
    compute,
    fenceName: `${filesystem.id}:${gitdir}`,
  });
  options.onObjectStore?.(objects);
  const checkoutsDirectory = `${gitdir}/checkouts`;
  /* A branch name is spelled short and everything else is spelled in full: the
   * record set the design pushes lives outside `refs/heads` (`refs/tau/chats/*`,
   * W17), so a port that could only name branches could not address half of what
   * its own `push` moves. */
  const refOf = (name: string): string => (name.startsWith('refs/') ? name : `${branchRefPrefix}/${name}`);
  const checkoutIdOf = (branch: string): string => checkoutIdOfBranch(objectFormat, branch);

  const readRaw = async (
    oid: string,
    expected: 'commit' | 'tag' = 'commit',
  ): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    /* Raw bodies: the typed readers would drop Tau's `change-id` and `jj:*` headers. */
    const object = await objects.read(oid);
    return object?.type === expected ? object.data : undefined;
  };

  /**
   * One tree object's entries, read through the object store.
   *
   * @param oid - The tree's id.
   * @returns Its entries.
   * @throws RevisionPortError when the store does not hold it.
   */
  const treeEntries = async (oid: string): Promise<readonly TreeCodecEntry[]> => {
    const entries = await readTreeEntries(objects, oid);
    if (entries === undefined) {
      throw new RevisionPortError('ENGINE_FAILED', `The store does not hold the tree ${oid}.`);
    }
    return entries;
  };

  /**
   * One blob's bytes, read through the object store.
   *
   * @param oid - The blob's id.
   * @returns Its bytes.
   * @throws RevisionPortError when the store does not hold it.
   */
  const blobOf = async (oid: string): Promise<Uint8Array<ArrayBuffer>> => {
    const object = await objects.read(oid);
    if (object?.type !== 'blob') {
      throw new RevisionPortError('ENGINE_FAILED', `The store does not hold the blob ${oid}.`);
    }
    return object.data;
  };

  const commitOf = async (id: RevisionId): Promise<DecodedCommit | undefined> => {
    const body = await readRaw(id);
    if (body === undefined) {
      return undefined;
    }
    return decodeCommit(body);
  };

  /*
   * The parents a history walk follows: none for a commit on the shallow
   * boundary, as git walks it, since the store lacks them. Only the walkers
   * (log, divergence, ancestry, a push's object set) ask this, each with the
   * boundary it read when it started; a revision read keeps its real parents.
   */
  const historyParents = (shallow: ReadonlySet<string>, id: string, commit: DecodedCommit): readonly string[] =>
    shallow.has(id) ? [] : commit.parents;

  const requireCommit = async (id: RevisionId): Promise<DecodedCommit> => {
    const commit = await commitOf(id);
    if (commit === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'The revision is not in the store.');
    }
    return commit;
  };

  const entryOf = (id: RevisionId, commit: DecodedCommit): RevisionLogEntry => {
    const trailer = parseRevisionCommitMessage(commit.message);
    /* A project Tau did not write carries no trailer, and its date is still the
     * one git shows: the commit's own author time. */
    const unattributed: RevisionProvenance = {
      source: 'import',
      actorId: 'unknown',
      createdAt: commit.author.seconds * 1000,
    };
    return Object.freeze({
      id,
      changeId: commit.changeId ?? '',
      parents: Object.freeze(commit.parents.map((parent) => revisionId(parent))),
      treeId: commit.tree,
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
  const walkTree = async (
    oid: string,
    prefix: string,
    into: Map<string, Readonly<{ oid: string; mode: string }>>,
  ): Promise<void> => {
    const tree = await treeEntries(oid);
    await Promise.all(
      tree.map(async (entry) => {
        const path = prefix === '' ? entry.path : `${prefix}/${entry.path}`;
        if (entry.type === 'tree') {
          return walkTree(entry.oid, path, into);
        }
        into.set(path, { oid: entry.oid, mode: entry.mode });
        return undefined;
      }),
    );
  };

  const flatTree = async (oid: string): Promise<ReadonlyMap<string, Readonly<{ oid: string; mode: string }>>> => {
    const paths = new Map<string, Readonly<{ oid: string; mode: string }>>();
    await walkTree(oid, '', paths);
    return paths;
  };

  /**
   * The named file entries of one tree, read one directory per path segment.
   *
   * What a reader that wants only a few files (a manifest) pays instead of
   * {@link flatTree}'s walk of every directory. A path that is missing, or that
   * names a directory, is left out, as {@link flatTree} would leave it.
   *
   * @param oid - Root tree object.
   * @param paths - Project-relative paths to look up.
   * @returns Each found path's blob id and mode.
   */
  const selectedTree = async (
    oid: string,
    paths: readonly string[],
  ): Promise<ReadonlyMap<string, Readonly<{ oid: string; mode: string }>>> => {
    const entryAt = async (path: string): Promise<Readonly<{ oid: string; mode: string }> | undefined> => {
      const segments = path.split('/');
      let tree = oid;
      for (const [index, segment] of segments.entries()) {
        // oxlint-disable-next-line no-await-in-loop -- each directory names the next one to read.
        const entries = await treeEntries(tree);
        const entry = entries.find((candidate) => candidate.path === segment);
        if (entry === undefined) {
          return undefined;
        }
        if (index === segments.length - 1) {
          return entry.type === 'tree' ? undefined : { oid: entry.oid, mode: entry.mode };
        }
        if (entry.type !== 'tree') {
          return undefined;
        }
        tree = entry.oid;
      }
      return undefined;
    };
    const found = await Promise.all([...new Set(paths)].map(async (path) => [path, await entryAt(path)] as const));
    return new Map(found.flatMap(([path, entry]) => (entry === undefined ? [] : [[path, entry] as const])));
  };

  /**
   * Point the index at the tree `HEAD`'s branch names (R14).
   *
   * Tau never reads the index; stock Git does, on a folder a person opened from
   * disk, and without this `git status` there shows every Tau revision
   * reversed. The disk leg runs `git read-tree`; `isomorphic-git` has none, so
   * the whole file is encoded once and swapped in the way Git swaps its own:
   * `index.lock`, then a rename. A lock already there is the person's own Git
   * mid-operation, and it wins.
   *
   * One lock so the last refresh reads the last head, and every failure is
   * swallowed: the ref has already moved. Linked checkouts are plain provider
   * roots on this leg, with no index of their own.
   *
   * @param moved - The fully-qualified branch that moved, or `undefined` for
   *   whatever `HEAD` names (a switch, or an open that found no index).
   * @returns Once the index names the new tree, or once the refresh was skipped.
   */
  const syncLiveIndex = async (moved?: string): Promise<void> => {
    try {
      await withRefLock(`${filesystem.id}:${gitdir}:index`, async () => {
        const target = await resolveRef({ fs, gitdir, ref: 'HEAD', depth: 1 });
        if (!target.startsWith(symbolicRefPrefix)) {
          return;
        }
        const named = target.slice(symbolicRefPrefix.length).trim();
        if (moved !== undefined && named !== moved) {
          return;
        }
        const head = await port.readRef(named);
        const commit = head === undefined ? undefined : await requireCommit(head);
        const paths = commit === undefined ? [] : [...(await flatTree(commit.tree))];
        const lock = `${gitdir}/index.lock`;
        if (await gitFiles.exists(lock)) {
          return;
        }
        await gitFiles.writeFile(lock, encodeGitIndex(paths.map(([path, entry]) => ({ path, ...entry }))));
        await gitFiles.rename(lock, `${gitdir}/index`);
      });
    } catch {
      // Advisory: the ref this follows has already moved (see above).
    }
  };

  /* Ids of the trees this store writes, kept across mints (E3). */
  const treeIds = createTreeIdMemo();
  /* Each blob's size, and the large object a pointer names, as a cold open's head listings said: `listTree` reads no blob for them (D10). */
  const listedSizes = new Map<string, Pick<RevisionTreeListing, 'size' | 'largeObject'>>();
  /* Whether the store already holds an object, packed or loose. */
  const holds = async (oid: string): Promise<boolean> => objects.has(oid);
  /*
   * The store's shallow boundary, in git's own `shallow` file: commits held
   * without their parents, which every walk here reads as having none — so
   * the store never claims a history it does not hold, and a fetch tells the
   * remote where its history stops.
   */
  const shallowFile = `${gitdir}/shallow`;
  /* The next boundary, whole before the file it replaces is removed (git's own `shallow.lock`). */
  const shallowNext = `${shallowFile}.lock`;
  /*
   * The boundary as it is on disk now: read afresh by every walk and fetch,
   * never kept, so another tab's settle is seen and a failed read is only that
   * walk's. Between a writer's removal and its rename, the next file is the
   * boundary.
   */
  const readShallow = async (): Promise<Set<string>> => {
    for (const path of [shallowFile, shallowNext]) {
      // oxlint-disable-next-line no-await-in-loop -- the next file is read only when the boundary file is not there.
      if (await gitFiles.exists(path)) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        const text = await gitFiles.readFile(path, 'utf8');
        return new Set(text.split('\n').filter((line) => line !== ''));
      }
    }
    return new Set();
  };
  /*
   * Add `commits` to the boundary, and drop every boundary commit whose
   * parents the store now all holds (git's rule: a commit whose history
   * arrived is no longer shallow). Under the store's own lock, with the file
   * read again inside it, so two tabs never write over each other's boundary.
   */
  const settleShallow = async (commits: readonly string[]): Promise<void> => {
    await withRefLock(`${filesystem.id}:${gitdir}:shallow`, async () => {
      const boundary = await readShallow();
      if (boundary.size === 0 && commits.length === 0) {
        return;
      }
      for (const commit of commits) {
        boundary.add(commit);
      }
      const complete = await Promise.all(
        [...boundary].map(async (oid) => {
          const commit = await commitOf(revisionId(oid));
          if (commit === undefined || commit.parents.length === 0) {
            return false;
          }
          const held = await Promise.all(commit.parents.map(async (parent) => holds(parent)));
          return held.every(Boolean);
        }),
      );
      const next = [...boundary].filter((_oid, at) => complete[at] !== true);
      /*
       * Never written in place, where a reader could find half of it: the next
       * boundary is written whole beside it, the old one removed, and the next
       * renamed into its place. A reader between the two reads the next file.
       */
      if (next.length > 0) {
        await gitFiles.writeFile(shallowNext, `${next.toSorted().join('\n')}\n`);
      }
      if (await gitFiles.exists(shallowFile)) {
        await gitFiles.unlink(shallowFile);
      }
      if (next.length > 0) {
        await gitFiles.rename(shallowNext, shallowFile);
      } else if (await gitFiles.exists(shallowNext)) {
        await gitFiles.unlink(shallowNext);
      }
    });
  };

  /* How this port reaches the catalogue for a remote's URL, or `undefined` where it has none. */
  const catalogueFor = (
    request: Readonly<{
      url: string;
      families: readonly CatalogueFamily[] | undefined;
      signal: AbortSignal | undefined;
    }>,
  ): (ColdOpenOptions & Readonly<{ access: CatalogueAccess }>) | undefined => {
    const access = options.catalogue;
    const catalogueUrl = access?.url(request.url);
    if (access === undefined || catalogueUrl === undefined) {
      return undefined;
    }
    return {
      access,
      catalogueUrl,
      families: request.families ?? ['heads', 'tags'],
      fetch: access.fetch ?? globalThis.fetch.bind(globalThis),
      ...(access.filesFetch === undefined ? {} : { filesFetch: access.filesFetch }),
      store: objects,
      compute,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    };
  };

  /*
   * Fill an empty store from the hosted catalogue: the refs it brought, with
   * their commits recorded as the shallow boundary, or `undefined` to go over
   * smart HTTP.
   */
  const openFromCatalogue = async (
    request: Readonly<{
      url: string;
      families: readonly CatalogueFamily[] | undefined;
      signal: AbortSignal | undefined;
    }>,
  ): Promise<Map<string, string> | undefined> => {
    const reach = catalogueFor(request);
    const opened = reach === undefined ? undefined : await coldOpenFromCatalogue(reach);
    if (opened === undefined) {
      return undefined;
    }
    for (const { entries } of opened.listings) {
      for (const { oid, size, lfs } of entries) {
        if (size !== undefined) {
          listedSizes.set(oid, { size, ...(lfs === undefined ? {} : { largeObject: lfs }) });
        }
      }
    }
    await settleShallow(opened.shallow);
    reach?.access.onColdOpen?.(opened.report);
    return new Map(opened.refs);
  };

  /*
   * Take `wants` from the catalogue object by object, with the history down
   * to what the store holds: whether the store then holds every one of them.
   */
  const importFromCatalogue = async (
    request: Readonly<{
      url: string;
      families: readonly CatalogueFamily[] | undefined;
      signal: AbortSignal | undefined;
      wants: readonly string[];
    }>,
  ): Promise<boolean> => {
    const reach = catalogueFor(request);
    const report =
      reach === undefined ? undefined : await importReachableFromCatalogue({ ...reach, wants: request.wants });
    if (report === undefined) {
      return false;
    }
    reach?.access.onColdOpen?.(report);
    const held = await Promise.all(request.wants.map(async (oid) => holds(oid)));
    return held.every(Boolean);
  };

  /*
   * Store one tree object and whatever under it the store lacks, children
   * first (B1). A tree is written only after everything it names, so a tree the
   * store holds proves its whole subtree is held: a mint after a one-file edit
   * writes that blob and the trees on its path, not the project.
   */
  const writeTreeGraph = async (node: TreeObject): Promise<string> => {
    if (await holds(node.oid)) {
      return node.oid;
    }
    /* The memo already hashed every object it names: written under those ids, never hashed again (I2). */
    await Promise.all(
      node.entries.map(async (entry) => {
        if (entry.type === 'tree') {
          await writeTreeGraph(entry.tree);
        } else if (!(await holds(entry.oid))) {
          await objects.writeLoose([{ type: 'blob', data: entry.content, oid: entry.oid }]);
        }
      }),
    );
    return writeTreeObject(objects, node);
  };

  const readCheckoutRecord = async (id: string): Promise<Checkout | undefined> => {
    const path = `${checkoutsDirectory}/${id}.json`;
    if (checkouts === undefined || !(await gitFiles.exists(path))) {
      return undefined;
    }
    const stored: unknown = JSON.parse(await gitFiles.readFile(path, 'utf8'));
    const record = stored as Readonly<{ id: string; branch: string }>;
    return Object.freeze({
      id: record.id,
      projectId: checkouts.projectId,
      root: `/checkouts/${record.id}`,
      kind: 'linked',
      branch: record.branch,
      /* The branch's head, read now — as a native worktree's `HEAD` follows
       * its branch. A base kept from `addCheckout` went stale the moment a
       * merge moved the branch, and hid the conflict it moved it onto (S7). */
      baseRevisionId: await port.readRef(record.branch),
    });
  };

  const listCheckoutRecords = async (): Promise<readonly Checkout[]> => {
    const stored = (await gitFiles.exists(checkoutsDirectory)) ? await gitFiles.readdir(checkoutsDirectory) : [];
    const ids = stored.filter((name) => name.endsWith('.json'));
    const linked = await Promise.all(ids.toSorted().map(async (name) => readCheckoutRecord(name.slice(0, -5))));
    return Object.freeze(linked.filter((checkout) => checkout !== undefined));
  };

  /**
   * Where one large object lives in this store's own LFS layout.
   *
   * git-lfs's own path under the git directory, exactly as the disk leg writes
   * it, so a store either host produced is a store either host reads.
   *
   * @param oid - The pointer's object id.
   * @returns The provider path the object's bytes are at.
   */
  const lfsObjectFile = (oid: string): string => `${gitdir}/${lfsObjectPath(oid)}`;

  /**
   * One large object's bytes from this store, when they are here whole.
   *
   * @param pointer - The pointer naming the object.
   * @returns Its bytes, or `undefined` when it is absent or not the size the pointer names.
   */
  const readLocalLfsObject = async (pointer: LfsPointer): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    const file = lfsObjectFile(pointer.oid);
    if ((await lfsObjectSize(file)) !== pointer.size) {
      return undefined;
    }
    const content = await gitFiles.readFile(file);
    return content.byteLength === pointer.size ? content : undefined;
  };

  /**
   * The size of the file at one large object's name, or `undefined` when there is none.
   *
   * @param file - The object's path in the store.
   * @returns Its size in bytes.
   */
  const lfsObjectSize = async (file: string): Promise<number | undefined> => {
    try {
      const stat = await gitFiles.stat(file);
      return stat.size;
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw error;
    }
  };

  /**
   * Put one large object in this store. Content-addressed, so a repeat writes nothing.
   *
   * Off the project's mutation claims, so a download never waits behind a
   * checkout write. Written beside its name and renamed into place, so a write
   * a close or a crash cut short never leaves a truncated object under the oid.
   * A file already there at the content's size is kept; one at another size (a
   * write cut short) is replaced, after a second look just before its removal,
   * so a whole copy another tab stored meanwhile is left alone, and a writer
   * that loses the rename to another keeps the other's whole copy.
   *
   * @param oid - The pointer's object id.
   * @param content - The object's real bytes.
   * @param readBack - A download's bytes, verified by hashing what landed before it is renamed into place.
   * @returns Once the object is in the store.
   */
  const storeLfsObject = async (oid: string, content: Uint8Array<ArrayBuffer>, readBack?: boolean): Promise<void> =>
    workerTimings.span('lfs.store', async () => storeLfsObjectBytes(oid, content, readBack));
  const storeLfsObjectBytes = async (
    oid: string,
    content: Uint8Array<ArrayBuffer>,
    readBack = false,
  ): Promise<void> => {
    const file = lfsObjectFile(oid);
    const size = content.byteLength;
    /* Another writer's whole copy is kept, unless these bytes are a download still to be verified:
     * those are delivered after this returns, so they are read back first whatever is already here. */
    if (!readBack && (await lfsObjectSize(file)) === size) {
      return;
    }
    await gitFiles.mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    const partial = `${file}.${randomUuid()}.partial`;
    let landed = false;
    try {
      await gitFiles.writeFile(partial, content);
      /* A download is verified by the one read-back of what landed (D9, D11): the bytes on
       * disk, not the bytes in hand, must hash to the oid. Transferred, as they are dropped after. */
      if (readBack && (await compute.sha256(await gitFiles.readFile(partial), true)) !== oid) {
        throw new Error(`Large object ${oid} did not hash to its own id.`);
      }
      /* Looked at again just before anything is removed: another tab may have stored it whole meanwhile. */
      const here = await lfsObjectSize(file);
      if (here === size) {
        return;
      }
      if (here !== undefined) {
        /* A copy cut short; not every provider's rename replaces. */
        await gitFiles.unlink(file).catch(() => undefined);
      }
      try {
        await gitFiles.rename(partial, file);
        landed = true;
      } catch (error) {
        if ((await lfsObjectSize(file)) !== size) {
          throw error;
        }
      }
    } finally {
      /* Whatever threw — the write, the read-back, the hash or the rename — leaves no partial behind. */
      if (!landed) {
        await gitFiles.unlink(partial).catch(() => undefined);
      }
    }
  };

  /**
   * The LFS client for whichever remote this project has, or `undefined`.
   *
   * A large object is fetched lazily: a `fetch` brings pointers, and the bytes
   * behind one arrive the first time somebody reads it.
   *
   * @returns The client, or `undefined` when there is no remote or no transport.
   */
  const lfsClient = async (selected?: Remote): Promise<ReturnType<typeof createLfsClient> | undefined> => {
    if (options.http === undefined) {
      return undefined;
    }
    const candidates = selected === undefined ? await port.listRemotes() : [selected];
    const [remote] = candidates;
    return remote === undefined
      ? undefined
      : createLfsClient({
          url: remote.url,
          http: options.http,
          remote: remote.name,
          ...(remote.kind === 'tau'
            ? { fetch: globalThis.fetch.bind(globalThis), maximumUploadBytes: 100 * 1024 * 1024 }
            : {}),
        });
  };

  /** Large-object downloads in flight, by oid; see {@link hydrate}. */
  const downloads = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  /** Every reader's progress listener, by oid, whichever reader's transfer brings the bytes. */
  const progressListeners = new Map<string, Set<() => void>>();
  const progressed = (oid: string): void => {
    for (const listener of progressListeners.get(oid) ?? []) {
      listener();
    }
  };

  /**
   * The real bytes behind every pointer a tree read found.
   *
   * The ones already in this store are read from it, one at a time; the rest
   * are fetched together (load-path audit, fix 1): one batch call per hundred
   * objects and several transfers at once, where one per object one after
   * another made a 295-object open take minutes. Each object is stored as it
   * arrives, so a reload part-way through fetches only what is still missing.
   *
   * @param pointers - The pointers, in tree order; repeats are resolved once.
   * @param hydrateOptions - `onLargeObject` is told about each object this read fetched, as it lands; `signal` stops
   *   this read's transfers (a concurrent reader waiting on one fetches it itself); `firstLargeObjects` names oids to
   *   fetch before the rest, asked again before each transfer; `onTransferProgress` hears bytes arrive for any of
   *   these objects, a transfer this read joined included.
   * @returns The bytes by oid, and what the phase cost.
   */
  const hydrate = async (
    pointers: readonly LfsPointer[],
    hydrateOptions?: Readonly<{
      onLargeObject?: ReadTreeOptions['onLargeObject'];
      signal?: AbortSignal;
      firstLargeObjects?: ReadTreeOptions['firstLargeObjects'];
      onTransferProgress?: ReadTreeOptions['onTransferProgress'];
    }>,
  ): Promise<Readonly<{ contents: ReadonlyMap<string, Uint8Array<ArrayBuffer>>; report: LfsFetchReport }>> => {
    const { onTransferProgress } = hydrateOptions ?? {};
    if (onTransferProgress === undefined) {
      return hydrateObjects(pointers, hydrateOptions);
    }
    const listening = new Map(
      pointers.map(
        ({ oid }) =>
          [
            oid,
            () => {
              onTransferProgress(oid);
            },
          ] as const,
      ),
    );
    for (const [oid, listener] of listening) {
      const listeners = progressListeners.get(oid) ?? new Set();
      listeners.add(listener);
      progressListeners.set(oid, listeners);
    }
    try {
      return await hydrateObjects(pointers, hydrateOptions);
    } finally {
      for (const [oid, listener] of listening) {
        const listeners = progressListeners.get(oid);
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          progressListeners.delete(oid);
        }
      }
    }
  };

  /* See {@link hydrate}. */
  const hydrateObjects = async (
    pointers: readonly LfsPointer[],
    hydrateOptions?: Readonly<{
      onLargeObject?: ReadTreeOptions['onLargeObject'];
      signal?: AbortSignal;
      firstLargeObjects?: ReadTreeOptions['firstLargeObjects'];
    }>,
  ): Promise<Readonly<{ contents: ReadonlyMap<string, Uint8Array<ArrayBuffer>>; report: LfsFetchReport }>> => {
    const { onLargeObject: delivered, signal, firstLargeObjects: first } = hydrateOptions ?? {};
    const startedAt = Date.now();
    const contents = new Map<string, Uint8Array<ArrayBuffer>>();
    const shared = new Map<string, Readonly<{ pointer: LfsPointer; inFlight: Promise<Uint8Array<ArrayBuffer>> }>>();
    const missing = new Map<string, LfsPointer>();
    /* Registered the moment an object is found missing, so a concurrent reader
     * scanning meanwhile waits on this transfer instead of starting its own. */
    const pending = new Map<string, PromiseWithResolvers<Uint8Array<ArrayBuffer>>>();
    const registered = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
    let localObjects = 0;
    let localBytes = 0;
    let networkBytes = 0;
    const transports = new Map<LfsTransport, number>();
    const fetchMissing = async (wanted: ReadonlyMap<string, LfsPointer>): Promise<void> => {
      const client = await lfsClient();
      if (client === undefined) {
        /* Fail closed: no pointer ever reaches a tree or a working copy. The
         * revision is perfectly well known — its bytes are not here, and there is
         * no remote to ask (D16). */
        throw new RevisionPortError(
          'MISSING_LARGE_OBJECT',
          'A large object this revision references is not in this store yet.',
        );
      }
      await client.downloadMany({
        pointers: [...wanted.values()],
        ...(signal === undefined ? {} : { signal }),
        ...(first === undefined ? {} : { first }),
        progress: progressed,
        received: async (pointer, content, { transport }) => {
          transports.set(transport, (transports.get(transport) ?? 0) + 1);
          await storeLfsObject(pointer.oid, content, true);
          contents.set(pointer.oid, content);
          networkBytes += content.byteLength;
          pending.get(pointer.oid)?.resolve(content);
          pending.delete(pointer.oid);
          delivered?.(pointer.oid, content);
        },
      });
    };
    try {
      for (const pointer of pointers) {
        if (contents.has(pointer.oid) || shared.has(pointer.oid) || missing.has(pointer.oid)) {
          continue;
        }
        /* One download per object across concurrent tree readers: a second reader waits on the first one's transfer. */
        const inFlight = downloads.get(pointer.oid);
        if (inFlight !== undefined) {
          shared.set(pointer.oid, { pointer, inFlight });
          if (delivered !== undefined) {
            // async-iife: bootstrap -- the first reader's transfer, told to this one as it lands; a failure is collected below.
            void (async (): Promise<void> => {
              try {
                delivered(pointer.oid, await inFlight);
              } catch {
                /* Collected below, where this reader fetches what the other did not deliver. */
              }
            })();
          }
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- local reads stay one at a time; the returned tree already retains every object.
        const content = await readLocalLfsObject(pointer);
        if (content === undefined) {
          missing.set(pointer.oid, pointer);
          const settled = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
          /* Only a concurrent reader awaits this; with none, a failure is reported by `downloadMany` below. */
          // oxlint-disable-next-line promise/prefer-await-to-then -- marks the rejection handled without awaiting it.
          settled.promise.catch(() => undefined);
          downloads.set(pointer.oid, settled.promise);
          registered.set(pointer.oid, settled.promise);
          pending.set(pointer.oid, settled);
        } else {
          contents.set(pointer.oid, content);
          localObjects += 1;
          localBytes += content.byteLength;
        }
      }
      if (missing.size > 0) {
        await fetchMissing(missing);
      }
    } catch (error) {
      for (const settled of pending.values()) {
        settled.reject(error);
      }
      throw error;
    } finally {
      for (const [oid, promise] of registered) {
        if (downloads.get(oid) === promise) {
          downloads.delete(oid);
        }
      }
    }
    /* Another reader's transfers, already running together. One that failed
     * may have failed on an object this tree does not hold, so whatever it
     * did not deliver is fetched here rather than failing on its error. */
    const orphaned = new Map<string, LfsPointer>();
    for (const [oid, { pointer, inFlight }] of shared) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- the transfers run together; this only collects them.
        contents.set(oid, await inFlight);
      } catch {
        orphaned.set(oid, pointer);
      }
    }
    if (orphaned.size > 0) {
      await fetchMissing(orphaned);
    }
    return Object.freeze({
      contents,
      report: Object.freeze({
        durationMilliseconds: Math.max(0, Date.now() - startedAt),
        networkObjects: missing.size + orphaned.size,
        networkBytes,
        localObjects,
        localBytes,
        ...dominantTransport(transports),
      }),
    });
  };

  /**
   * One large object's bytes for an upload the remote asked for.
   *
   * Only an object this device authored is sure to be here: one that arrived
   * with a fetch stays a pointer until somebody reads it. The remote asks for
   * one only when it is not where it came from (a changed backup, say).
   *
   * @param oid - The pointer's object id.
   * @param path - Where the object is in the pushed history, for the refusal.
   * @returns The object's bytes.
   */
  const localLfsObject = async (oid: string, path: string | undefined): Promise<Uint8Array<ArrayBuffer>> => {
    const file = lfsObjectFile(oid);
    if (!(await gitFiles.exists(file))) {
      throw new RevisionPortError(
        'MISSING_LARGE_OBJECT',
        `${path ?? 'A large file'} is not on this device, and the remote does not have it either.`,
      );
    }
    return gitFiles.readFile(file);
  };

  /**
   * Which path each large object in these refs' trees is at.
   *
   * The whole offered history is walked because a fresh remote needs old LFS
   * objects as well as the current tree. Unrelated refs are deliberately absent:
   * a quota refusal on generated evidence must not block authored history.
   *
   * @param offered - The refs the push was offering.
   * @returns Project path by object id.
   */
  /**
   * One ref's value, or `undefined` when it is unborn.
   *
   * @param ref - Fully-qualified ref name.
   * @returns The object id, or `undefined`.
   */
  /**
   * One named version, or `undefined` when the ref is gone or not annotated.
   *
   * A lightweight tag is a valid git tag this store did not write; it is still
   * a name for a revision, so it is reported with an empty note and no actor
   * rather than hidden.
   *
   * @param name - The tag name, without `refs/tags/`.
   * @returns The named version.
   */
  const readTagRef = async (name: string): Promise<RevisionTag | undefined> => {
    const oid = await tryResolve(`${tagRefPrefix}/${name}`);
    if (oid === undefined) {
      return undefined;
    }
    const raw = await readRaw(oid, 'tag');
    if (raw === undefined) {
      /* Lightweight: the ref points straight at the commit, which is a valid
       * git tag this store did not write. Still a name for a revision. */
      return Object.freeze({
        name,
        revisionId: revisionId(oid),
        note: undefined,
        actor: undefined,
        createdAt: 0,
      });
    }
    const decoded = decodeTag(raw);
    const trailer = parseRevisionTagMessage(decoded.message);
    return Object.freeze({
      name,
      revisionId: revisionId(decoded.object),
      note: trailer.note,
      actor: trailer.actor,
      createdAt: decoded.tagger.seconds * 1000,
    });
  };

  const tryResolve = async (ref: string): Promise<string | undefined> => {
    try {
      return await resolveRef({ fs, gitdir, ref });
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  };

  /*
   * Which path each large object among the blobs a push sends is at (D11): the
   * blobs the diff of the commits being sent names, so an unchanged blob is
   * never read and the batch lists only what is new to the remote. A remote
   * with no history at all is sent every commit, and so every old pointer.
   */
  const pointersAmong = async (
    blobs: ReadonlyMap<string, string>,
  ): Promise<ReadonlyMap<string, Readonly<{ path: string; size: number }>>> => {
    const paths = new Map<string, Readonly<{ path: string; size: number }>>();
    const settled = await settleBounded([...blobs], 16, async ([oid, path]) => {
      /* A pointer is at most 1 KiB, so deflated, framed or deltified it takes under 2 KiB: a larger blob is never inflated. */
      if (((await objects.storedSize(oid)) ?? 0) > 2048) {
        return;
      }
      const pointer = readLfsPointer(await blobOf(oid));
      if (pointer !== undefined) {
        paths.set(pointer.oid, { path, size: pointer.size });
      }
    });
    for (const result of settled) {
      if (result.status === 'rejected') {
        throw result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      }
    }
    return paths;
  };

  /**
   * Whether `ancestor` is reachable from `head` through commit parents.
   *
   * Breadth-first over the store's commits, each read once.
   *
   * @param head - The newer commit.
   * @param ancestor - The commit it must descend from.
   * @returns `true` when it does.
   */
  const descendsFrom = async (head: string, ancestor: string): Promise<boolean> => {
    const shallow = await readShallow();
    const seen = new Set<string>([head]);
    let frontier = [head];
    while (frontier.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- one generation of parents at a time.
      const lineages = await Promise.all(
        frontier.map(async (oid) => historyParents(shallow, oid, await requireCommit(revisionId(oid)))),
      );
      frontier = [];
      for (const parents of lineages) {
        for (const parent of parents) {
          if (parent === ancestor) {
            return true;
          }
          if (!seen.has(parent)) {
            seen.add(parent);
            frontier.push(parent);
          }
        }
      }
    }
    return false;
  };

  /**
   * Why one offered ref is refused before anything is sent, if it is.
   *
   * The lease (A32, D14) is checked against the advertisement this push already
   * read: a ref that moved since this host last looked is refused here and never
   * offered, so nothing on the remote is touched; the command still carries the
   * advertised value as its old oid, so the server's own compare-and-set
   * refuses it again if it moves in between. Without a lease the remote's value
   * must stay reachable and a tag never moves: `git push` refuses both before
   * sending, and a third-party remote may not refuse them itself.
   *
   * @param ref - The offered ref.
   * @param old - What the remote advertises for it.
   * @param head - What this store holds for it.
   * @returns The refusal's reason, or `undefined` to send it.
   */
  const refusalBeforeSending = async (
    ref: RevisionPushRef,
    old: string | undefined,
    head: string,
  ): Promise<string | undefined> => {
    if ('expected' in ref) {
      return old === ref.expected ? undefined : 'leaseLost';
    }
    if (old === undefined) {
      return undefined;
    }
    if ((ref.remoteName ?? ref.name).startsWith(`${tagRefPrefix}/`)) {
      return '[rejected] (already exists)';
    }
    const forward = await descendsFrom(head, old).catch(() => false);
    return forward ? undefined : '[rejected] (non-fast-forward)';
  };

  /**
   * Which offered refs are sent, and the answer for every one that is not.
   *
   * A ref already where the remote has it is up to date; one refused before
   * sending is answered here; under `atomic` one such refusal refuses the rest
   * unsent, as `git push --atomic` does.
   *
   * @param ordered - The offered refs, branch last.
   * @param advertised - The remote's refs, by name.
   * @param atomic - Whether the set lands together or not at all.
   * @returns The answered refs and the commands to send.
   */
  const planPush = async (
    ordered: readonly RevisionPushRef[],
    advertised: ReadonlyMap<string, string>,
    atomic: boolean,
  ): Promise<{ results: Map<string, RevisionPushRefResult>; commands: PushCommand[] }> => {
    const results = new Map<string, RevisionPushRefResult>();
    const commands: PushCommand[] = [];
    for (const ref of ordered) {
      const remoteName = ref.remoteName ?? ref.name;
      // eslint-disable-next-line no-await-in-loop -- one resolution per offered ref.
      const head = await tryResolve(ref.name);
      if (head === undefined) {
        throw new RevisionPortError('ENGINE_FAILED', `${ref.name} names nothing in this store.`);
      }
      const old = advertised.get(remoteName);
      // eslint-disable-next-line no-await-in-loop -- one ancestry check per offered ref.
      const refusal = old === head ? undefined : await refusalBeforeSending(ref, old, head);
      if (old === head) {
        results.set(ref.name, Object.freeze({ name: ref.name, status: 'upToDate', head: revisionId(head) }));
      } else if (refusal === undefined) {
        commands.push(Object.freeze({ name: ref.name, remoteName, old, head }));
      } else {
        results.set(ref.name, refused(ref.name, refusal));
      }
    }
    if (atomic && [...results.values()].some((result) => result.status === 'rejected')) {
      for (const command of commands.splice(0)) {
        results.set(command.name, refused(command.name, '[rejected] (atomic push failed)'));
      }
    }
    return { results, commands };
  };

  /**
   * Every object a remote holding `haves` lacks for `tips`.
   *
   * Commits are walked from the tips down to the first commit the remote
   * advertised; each commit's tree is diffed against its first parent's, so
   * only the paths that changed are read. An unchanged entry is reachable from
   * that parent, which is either the remote's already or in this same pack —
   * the same "the remote has it" rule the library's own push used, applied to
   * every offered ref at once.
   *
   * @param tips - The objects the offered refs name.
   * @param haves - Every object id the remote advertised.
   * @returns The ids to pack.
   */
  const missingObjects = async (
    tips: readonly string[],
    haves: ReadonlySet<string>,
  ): Promise<Readonly<{ oids: readonly string[]; blobs: ReadonlyMap<string, string> }>> => {
    const shallow = await readShallow();
    const send = new Set<string>();
    const blobs = new Map<string, string>();
    const entriesOf = async (oid: string): Promise<ReadonlyMap<string, TreeCodecEntry>> => {
      const entries = await treeEntries(oid);
      return new Map(entries.map((entry) => [entry.path, entry]));
    };
    const treeObjects = async (oid: string, base: string | undefined, prefix = ''): Promise<void> => {
      if (oid === base || send.has(oid)) {
        return;
      }
      send.add(oid);
      const [entries, previous] = await Promise.all([entriesOf(oid), base === undefined ? undefined : entriesOf(base)]);
      await Promise.all(
        [...entries.values()].map(async (entry) => {
          const was = previous?.get(entry.path);
          if (was?.oid === entry.oid) {
            return;
          }
          if (entry.type === 'tree') {
            await treeObjects(entry.oid, was?.type === 'tree' ? was.oid : undefined, `${prefix}${entry.path}/`);
          } else if (entry.type === 'blob' && !send.has(entry.oid)) {
            send.add(entry.oid);
            blobs.set(entry.oid, prefix + entry.path);
          }
        }),
      );
    };
    const visit = async (oid: string): Promise<void> => {
      if (haves.has(oid) || send.has(oid)) {
        return;
      }
      const tag = await readRaw(oid, 'tag');
      if (tag !== undefined) {
        send.add(oid);
        await visit(decodeTag(tag).object);
        return;
      }
      const commit = await requireCommit(revisionId(oid));
      send.add(oid);
      const lineage = historyParents(shallow, oid, commit);
      const parent = lineage[0] === undefined ? undefined : await commitOf(revisionId(lineage[0]));
      await treeObjects(commit.tree, parent?.tree);
      for (const next of lineage) {
        // eslint-disable-next-line no-await-in-loop -- depth-first, so a shared ancestor is read once.
        await visit(next);
      }
    };
    for (const tip of tips) {
      // eslint-disable-next-line no-await-in-loop -- tips share history; one walk at a time dedupes it.
      await visit(tip);
    }
    return { oids: [...send], blobs };
  };

  /*
   * R6: the `upload-pack` advertisement behind each listing this port answered,
   * keyed by the listing itself. A fetch handed that listing back reuses it, so
   * a caller that lists and then fetches what it listed pays one `info/refs`.
   * Keyed by identity, never by URL or time: only the caller knows whether the
   * listing is still the one it means to act on.
   */
  const listedAdvertisements = new WeakMap<
    readonly RemoteRef[],
    Readonly<{ url: string; advertisement: Awaited<ReturnType<typeof getRemoteInfo2>> }>
  >();

  /**
   * What the remote advertises, read through the client the caller gives.
   *
   * The same protocol-v1 `upload-pack` advertisement a fetch reads, so the
   * fetch that follows a listing may reuse it (R6) and still carries its own
   * deadline (P36).
   *
   * @param remote - The remote's name in git's config, or an address not recorded yet (R2).
   * @returns Every advertised ref, `HEAD` and peeled tags dropped.
   */
  const advertisedReferences = async (
    remote: string | RevisionRemoteAddress,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<readonly RemoteRef[]> => {
    options?.signal?.throwIfAborted();
    const url = typeof remote === 'string' ? await remoteUrl(remote) : remote.url;
    const name = typeof remote === 'string' ? remote : remote.name;
    const http = boundBy(requireHttp(), options?.signal);
    /* Seam 1 of 3 (N1). The advertisement is the *first* thing every remote
     * verb does, so it is where a 401, a `403 GIT_SYNC_NOT_ENTITLED` and a 404
     * arrive — and until this catch existed the library's own
     * `HTTP Error: 403 Forbidden` escaped verbatim into a `role='alert'`. */
    const advertisement = await getRemoteInfo2({ http, url, forPush: false, protocolVersion: 1 }).catch(
      (error: unknown) => {
        throw http.refused(error, name);
      },
    );
    /* A server that answers protocol v2 whatever it is asked sends capabilities
     * and no refs: an empty list here would read as an empty repository. Ask
     * it with `ls-refs` instead, and keep nothing for a fetch to reuse. */
    const references =
      advertisement.protocolVersion === 1
        ? (advertisement.refs ?? [])
        : await listServerRefs({ http, url }).catch((error: unknown) => {
            throw http.refused(error, name);
          });
    const listed = Object.freeze(
      references
        /* `git ls-remote --refs`, as the native leg reads it: no `HEAD`, no peeled tags. */
        .filter((reference) => reference.ref.startsWith('refs/') && !reference.ref.endsWith('^{}'))
        .map((reference) => Object.freeze({ name: reference.ref, head: revisionId(reference.oid) })),
    );
    if (advertisement.protocolVersion === 1) {
      listedAdvertisements.set(listed, { url, advertisement });
    }
    return listed;
  };

  /**
   * One operation's client: bounded by its signal, and keeping a 429's
   * `Retry-After`, which the library's own `HttpError` drops, for the
   * classifier (W13d).
   */
  const boundBy = (
    client: RevisionHttpClient,
    signal?: AbortSignal,
    maximumTransferBytes?: number,
  ): RevisionHttpClient & Readonly<{ refused: (error: unknown, remote: string) => RevisionPortError }> => {
    let retryAfter: string | undefined;
    let remaining = maximumTransferBytes;
    let limitExceeded = false;
    const exceeded = (): RevisionPortError => {
      limitExceeded = true;
      return new RevisionPortError('FETCH_LIMIT_EXCEEDED', 'The Git fetch exceeded its transfer byte limit.');
    };
    return {
      request: async (request) => {
        const response = await client.request(signal === undefined ? request : { ...request, signal });
        if (response.statusCode === 429) {
          retryAfter = response.headers['retry-after'];
        }
        const { 'content-length': declared } = response.headers;
        if (
          remaining !== undefined &&
          declared !== undefined &&
          Number.isFinite(Number(declared)) &&
          Number(declared) > remaining
        ) {
          const limitError = exceeded();
          await response.body.return?.().catch(() => undefined);
          throw limitError;
        }
        if (remaining === undefined) {
          return response;
        }
        const { body } = response;
        const bounded: typeof body = {
          next: async () => {
            const chunk = await body.next();
            if (chunk.done) {
              return chunk;
            }
            if (chunk.value.byteLength > remaining!) {
              const limitError = exceeded();
              await body.return?.().catch(() => undefined);
              throw limitError;
            }
            remaining! -= chunk.value.byteLength;
            return chunk;
          },
          return: async () => body.return?.() ?? { done: true, value: undefined },
          [Symbol.asyncIterator]: () => bounded,
        };
        return { ...response, body: bounded };
      },
      refused: (error, remote) =>
        limitExceeded
          ? exceeded()
          : remoteTransportError(error, { remote, ...(retryAfter === undefined ? {} : { retryAfter }) }),
    };
  };

  /*
   * One receive-pack advertisement per sync attempt (F5). A push takes its
   * session's copy, by URL, and hands it back only when every offered ref was
   * accepted, with each accepted command applied, so the next push's old values
   * and haves are what the remote now holds. A refusal or a failure keeps it
   * taken: whatever made the remote say no may have moved refs this copy cannot
   * see, so the next push reads a fresh one.
   */
  type PushAdvertisement = Readonly<{
    capabilities: Awaited<ReturnType<typeof getRemoteInfo2>>['capabilities'];
    advertised: Map<string, string>;
    /** Read by an earlier push of the session, so another writer may have moved a ref since. */
    reused?: boolean;
  }>;
  const sessionAdvertisements = new WeakMap<RevisionPushSession, Map<string, PushAdvertisement>>();
  const takeAdvertisement = async (
    http: ReturnType<typeof boundBy>,
    url: string,
    input: RevisionPushInput,
  ): Promise<PushAdvertisement> => {
    const kept = input.session === undefined ? undefined : sessionAdvertisements.get(input.session);
    const taken = kept?.get(url);
    if (taken !== undefined) {
      kept?.delete(url);
      return { ...taken, reused: true };
    }
    /* `receive-pack`'s own, which carries the capabilities the request may use
     * as well as the refs. Seam 1 of 3 (N1), exactly as in `advertisedReferences`. */
    const read = await getRemoteInfo2({ http, url, forPush: true, protocolVersion: 1 }).catch((error: unknown) => {
      throw http.refused(error, input.remote);
    });
    return {
      capabilities: read.capabilities,
      advertised: new Map((read.refs ?? []).map((reference) => [reference.ref, reference.oid])),
    };
  };
  const keepAdvertisement = (session: RevisionPushSession | undefined, url: string, kept: PushAdvertisement): void => {
    if (session !== undefined) {
      const byUrl = sessionAdvertisements.get(session) ?? new Map<string, PushAdvertisement>();
      byUrl.set(url, { capabilities: kept.capabilities, advertised: kept.advertised });
      sessionAdvertisements.set(session, byUrl);
    }
  };
  const requireHttp = (): RevisionHttpClient => {
    if (options.http === undefined) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        'This store has no transport; construct it with `http` to reach a remote.',
      );
    }
    return options.http;
  };

  const guardRef = (ref: string, label: string): void => {
    if (isHostLocalRef(ref)) {
      throw new RevisionPortError('INVALID_TRANSPORT', `${label} names a ref that never leaves this host.`);
    }
  };

  const remoteUrl = async (name: string): Promise<string> => {
    const remotes = await port.listRemotes();
    const remote = remotes.find((candidate) => candidate.name === name);
    if (remote === undefined) {
      throw new RevisionPortError('INVALID_TRANSPORT', `This project has no remote named ${name}.`);
    }
    return remote.url;
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
        transports: options.http !== undefined,
        nWayMerge: false,
        checkouts: checkouts !== undefined,
        /* The same host-neutral decision the disk leg makes (`lfs.ts`), so one
         * tree of the same bytes has one id on both legs (I4, S49). */
        largeObjects: true,
      });
    },

    /*
     * Also the open seam: `revision-effects.ensureStore` calls this once per
     * authority, before the first question is asked of the store, and
     * `isomorphic-git`'s own `init` returns early when the config is already
     * there. So a project created by an older build reaches this with a stale
     * generated block, and the merge below is its migration (G0-9) — written only
     * when the merged bytes differ, so a current project's working copy is not
     * touched on every open and a rewrite cannot repeat.
     */
    init: async (input: InitRevisionStoreInput): Promise<void> => {
      if (input.createSetupFiles !== false) {
        const ignorePath = generatedIgnorePath;
        const existing = (await filesystem.exists(ignorePath))
          ? await filesystem.readFile(ignorePath, 'utf8')
          : undefined;
        const ignore = generatedIgnoreContent(existing, input.additionalIgnores ?? []);
        if (ignore !== existing) {
          await filesystem.writeFile(ignorePath, ignore);
        }
        /*
         * Beside the ignore file and versioned like it (D24), exactly as the disk
         * leg writes it (`native-git-port.ts`).
         *
         * Both generated files are in the recorded tree, so a leg that wrote only
         * one of them named a different tree — and therefore a different revision
         * — for the same edits, which is I4's whole claim (W22 DEF-W22-1). The
         * bytes come from the one pure `#workspace-config.js` block both legs
         * already share; only the writer is per-adapter, which is what that
         * module's own contract says. And `lfs.ts` appends a tracked path to this
         * file at cut time (P15), so a browser-created project had nowhere for
         * that line to land and a stock clone of it had no attributes to resolve
         * its pointers with (S49).
         */
        const attributesPath = generatedGitattributesPath;
        const attributes = (await filesystem.exists(attributesPath))
          ? await filesystem.readFile(attributesPath, 'utf8')
          : undefined;
        const merged = generatedGitattributesContent(attributes);
        if (merged !== attributes) {
          await filesystem.writeFile(attributesPath, merged);
        }
      }
      // Only now: the repository is created after the file that decides what a
      // snapshot may ever contain already exists.
      await init({ fs, dir: '', gitdir, defaultBranch });
      /* Every project an older build recorded has no index at all, so this open
       * heals it. An existing index is left alone: in a repository Tau adopted
       * it may hold the person's own staged work. */
      if (!(await gitFiles.exists(`${gitdir}/index`))) {
        await syncLiveIndex();
      }
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

    readLargeObject: async (pointer) => readLocalLfsObject(pointer),
    storeLargeObject: async (pointer, content) => storeLfsObject(pointer.oid, content),
    fetchLargeObjects: async (pointers, fetchOptions) => {
      const { contents, report } = await hydrate(pointers, fetchOptions);
      if (report.networkObjects > 0) {
        options.onLfsFetch?.(report);
      }
      return contents;
    },

    readTree: async (id: RevisionId, readOptions?: ReadTreeOptions): Promise<ImmutableRevisionTree | undefined> => {
      const commit = await commitOf(id);
      if (commit === undefined) {
        return undefined;
      }
      const paths =
        readOptions?.paths === undefined
          ? await flatTree(commit.tree)
          : await selectedTree(commit.tree, readOptions.paths);
      /* Pointers first, then their bytes together: the files keep tree order,
       * and only the large objects' transfers run side by side, under the LFS
       * client's own count and byte bounds. */
      const read: Array<
        Readonly<{ path: string; content: Uint8Array<ArrayBuffer>; mode: FileMode; pointer: LfsPointer | undefined }>
      > = [];
      for (const [path, { oid, mode }] of paths) {
        // oxlint-disable-next-line no-await-in-loop -- resolve one file before reading the next; a pointer is a few bytes.
        const content = await blobOf(oid);
        read.push({ path, content, mode: mode as FileMode, pointer: readLfsPointer(content) });
      }
      const pointers = read.flatMap(({ pointer }) => (pointer === undefined ? [] : [pointer]));
      if (readOptions?.largeObjects === 'local') {
        /* No transfer: what is here already is read, and the rest stay pointers for the caller to track. */
        const local = new Map<string, Uint8Array<ArrayBuffer>>();
        for (const pointer of pointers) {
          // oxlint-disable-next-line no-await-in-loop -- one local read at a time, as the hydrate's own scan does.
          const content = local.has(pointer.oid) ? undefined : await readLocalLfsObject(pointer);
          if (content !== undefined) {
            local.set(pointer.oid, content);
          }
        }
        return new ImmutableRevisionTree(
          read.map(({ path, content, mode, pointer }) => [
            path,
            (pointer === undefined ? undefined : local.get(pointer.oid)) ?? content,
            mode,
          ]),
        );
      }
      const hydrated = pointers.length === 0 ? undefined : await hydrate(pointers, readOptions);
      if (hydrated !== undefined && hydrated.report.networkObjects > 0) {
        options.onLfsFetch?.(hydrated.report);
      }
      const entries: RevisionTreeInput[] = read.map(({ path, content, mode, pointer }) => [
        path,
        pointer === undefined ? content : hydrated!.contents.get(pointer.oid)!,
        mode,
      ]);
      return new ImmutableRevisionTree(entries);
    },

    writeRevision: async (input: WriteRevisionInput): Promise<RevisionReceipt> => {
      /* The pointer decision is Tau's and host-neutral, and the cut's `treeId`
       * was computed from exactly this (`revision-effects.recordedTree`). */
      const recorded =
        input.largeObjects === false
          ? { tree: input.tree, objects: new Map<string, Uint8Array<ArrayBuffer>>() }
          : cleanLargeObjects(input.tree);
      await Promise.all([...recorded.objects].map(async ([oid, content]) => storeLfsObject(oid, content)));
      const treeId = await writeTreeGraph(treeIds.treeObject(recorded.tree, objectFormat));
      const trailer: RevisionTrailer = {
        parents: [...input.parents],
        provenance: input.provenance,
        summary: input.summary,
      };
      const commit = encodeCommit({
        objectFormat,
        tree: treeId,
        parents: [...input.parents],
        /* A26: the person wrote it, Tau recorded it — git's own split. */
        author: revisionAuthorSignature(input.provenance),
        committer: revisionCommitterSignature(input.provenance),
        message: revisionCommitMessage(trailer),
        changeId: deriveChangeId(objectFormat, { treeId, parents: input.parents, trailer }),
        ...(input.conflict === undefined
          ? {}
          : { conflictedTrees: [...input.conflict.trees], conflictLabels: [...input.conflict.labels] }),
      });
      /* Raw bytes from Tau's own codec: `change-id`, `jj:trees` and `jj:conflict-labels` have no library field. */
      const [oid] = await objects.writeLoose([{ type: 'commit', data: commit.body, oid: commit.id }]);
      await objects.repackIfDue();
      return receiptOf(revisionId(oid!), decodeCommit(commit.body));
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
    updateRef: async (input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult> => {
      const result = await withRefLock(`${filesystem.id}:${gitdir}:${input.name}`, async () => {
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
      });
      if (result.status === 'updated' && refOf(input.name).startsWith(`${branchRefPrefix}/`)) {
        await syncLiveIndex(refOf(input.name));
      }
      return result;
    },

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
    setHead: async (branch: string): Promise<void> => {
      await withRefLock(`${filesystem.id}:${gitdir}:HEAD`, async () => {
        await writeRef({ fs, gitdir, ref: 'HEAD', value: refOf(branch), force: true, symbolic: true });
      });
      await syncLiveIndex();
    },

    listRefs: async (prefix?: string): Promise<readonly RevisionRef[]> => {
      /* Answered in the vocabulary it was asked in: a `refs/`-qualified prefix
       * names a namespace and gets full names back, a bare one filters branch
       * names as it always has. */
      /* The *prefix* decides the vocabulary, not the namespace it resolves to:
       * keying off the namespace made `listRefs('refs/heads')` answer in short
       * branch names and then filter every one of them away, so the two legs
       * disagreed on the one call a scheduler makes to find its history set
       * (I4; W13 found it against `git http-backend`). The native leg already
       * reads `qualified`; this is the same rule. */
      const qualified = prefix?.startsWith('refs/') === true;
      const namespace = qualified ? prefix.replace(/\/+$/u, '') : branchRefPrefix;
      const listed = await listRefs({ fs, gitdir, filepath: namespace });
      const names = listed.map((name) => (qualified ? `${namespace}/${name}` : name));
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

    /*
     * S31: an annotated tag object, written the same way the commit is.
     *
     * `isomorphic-git`'s own `annotatedTag` would do it, but it writes the
     * tagger from a config identity and cannot carry the object format this
     * store was created with; the tag object is Tau's bytes for the same
     * reason the commit is.
     */
    tag: async (input: CreateRevisionTagInput): Promise<RevisionTag> => {
      const named = await commitOf(input.revisionId);
      if (named === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', 'The revision this name would point at is not in the store.');
      }
      const createdAt = input.createdAt ?? Date.now();
      const object = encodeTag({
        objectFormat,
        object: input.revisionId,
        tag: input.name,
        tagger: taggerSignature(input.actor, createdAt),
        message: revisionTagMessage({
          name: input.name,
          note: input.note,
          actor: input.actor,
        }),
      });
      /* The bytes `encodeTag` hashed, stored as they are: one encoder for both legs. */
      const [oid = object.id] = await objects.writeLoose([{ type: 'tag', data: object.body, oid: object.id }]);
      await withRefLock(`${filesystem.id}:${gitdir}:${tagRefPrefix}/${input.name}`, async () =>
        writeRef({ fs, gitdir, ref: `${tagRefPrefix}/${input.name}`, value: oid, force: true }),
      );
      return Object.freeze({
        name: input.name,
        revisionId: input.revisionId,
        note: input.note,
        actor: input.actor,
        createdAt,
      });
    },

    listTags: async (): Promise<readonly RevisionTag[]> => {
      const names = await listRefs({ fs, gitdir, filepath: tagRefPrefix });
      const tags = await Promise.all(names.toSorted().map(async (name) => readTagRef(name)));
      return Object.freeze(tags.filter((entry) => entry !== undefined));
    },

    deleteTag: async (name: string): Promise<void> => {
      await withRefLock(`${filesystem.id}:${gitdir}:${tagRefPrefix}/${name}`, async () => {
        try {
          await deleteRef({ fs, gitdir, ref: `${tagRefPrefix}/${name}` });
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      });
    },

    log: async (input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]> => {
      const references = input?.heads === undefined ? await port.listRefs() : undefined;
      const heads = [...(input?.heads ?? (references ?? []).map((reference) => reference.head))];
      const shallow = await readShallow();
      // One object read per revision the order needs, and no tree is touched.
      return Object.freeze(
        await walkRevisionLog(
          heads,
          async (id) => {
            const commit = await commitOf(id);
            const lineage = commit === undefined ? [] : historyParents(shallow, id, commit);
            return commit === undefined
              ? undefined
              : {
                  parents: lineage.map((parent) => revisionId(parent)),
                  seconds: commit.committer.seconds,
                  entry: entryOf(id, commit),
                };
          },
          input?.limit,
        ),
      );
    },

    /*
     * Paint both heads down in committer-time order, each revision marked with
     * the heads that reach it, until nothing still queued could change a count: every queued revision
     * is reachable from both, and none is as new as a one-sided revision it
     * might yet reach. Below that line the two histories are the same, so
     * neither log is ever walked (git's merge-base walk, and its assumption of
     * a non-decreasing committer time from parent to child, as `log`'s bounded
     * walk makes).
     *
     * ponytail: the queue and the one-sided minimum are rescanned per step,
     * quadratic in the diverged region only; a heap if two lines ever diverge
     * by thousands of revisions.
     */
    divergence: async (input: RevisionDivergenceInput): Promise<RevisionDivergence> => {
      const shallow = await readShallow();
      /* Which head reaches each revision read so far. */
      const sides = new Map<string, 'head' | 'base' | 'both'>();
      const nodes = new Map<string, Readonly<{ parents: readonly string[]; seconds: number }>>();
      const queue = new Set<string>();
      const paint = async (id: string, side: 'head' | 'base' | 'both'): Promise<void> => {
        const held = sides.get(id);
        const joined = held === undefined || held === side ? side : 'both';
        if (joined === held) {
          return;
        }
        if (!nodes.has(id)) {
          const commit = await requireCommit(revisionId(id));
          nodes.set(id, { parents: historyParents(shallow, id, commit), seconds: commit.committer.seconds });
        }
        sides.set(id, joined);
        queue.add(id);
      };
      const secondsOf = (id: string): number => nodes.get(id)?.seconds ?? 0;
      const unsettled = (): boolean => {
        let oldestOneSided = Number.POSITIVE_INFINITY;
        for (const [id, side] of sides) {
          if (side !== 'both') {
            oldestOneSided = Math.min(oldestOneSided, secondsOf(id));
          }
        }
        return [...queue].some((id) => sides.get(id) !== 'both' || secondsOf(id) >= oldestOneSided);
      };
      await paint(input.head, 'head');
      await paint(input.base, 'base');
      while (unsettled()) {
        let newest: string | undefined;
        for (const id of queue) {
          if (newest === undefined || secondsOf(id) > secondsOf(newest)) {
            newest = id;
          }
        }
        queue.delete(newest!);
        for (const parent of nodes.get(newest!)?.parents ?? []) {
          // oxlint-disable-next-line no-await-in-loop -- the walk is the order: each read decides what is read next.
          await paint(parent, sides.get(newest!)!);
        }
      }
      const sided = [...sides.values()];
      return Object.freeze({
        ahead: sided.filter((side) => side === 'head').length,
        behind: sided.filter((side) => side === 'base').length,
      });
    },

    listTree: async (id: RevisionId): Promise<readonly RevisionTreeListing[] | undefined> => {
      const commit = await commitOf(id);
      if (commit === undefined) {
        return undefined;
      }
      const files = [...(await flatTree(commit.tree))].flatMap(([path, { oid, mode }]) =>
        mode === '100644' || mode === '100755' ? [Object.freeze({ path, oid, mode, ...listedSizes.get(oid) })] : [],
      );
      return Object.freeze(files.toSorted((left, right) => (left.path < right.path ? -1 : 1)));
    },

    diff: async (input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]> => {
      const toCommit = await requireCommit(input.to);
      const fromCommit = input.from === undefined ? undefined : await requireCommit(input.from);
      const before =
        fromCommit === undefined
          ? new Map<string, Readonly<{ oid: string; mode: string }>>()
          : await flatTree(fromCommit.tree);
      const after = await flatTree(toCommit.tree);
      return Object.freeze(
        [...new Set([...before.keys(), ...after.keys()])]
          .sort()
          .map((path) => {
            const left = before.get(path);
            const right = after.get(path);
            // Object ids are compared, never contents: an unchanged subtree
            // costs nothing and no blob is ever read.
            return left?.oid === right?.oid && left?.mode === right?.mode
              ? undefined
              : frozenChange(path, left === undefined ? 'added' : right === undefined ? 'deleted' : 'modified');
          })
          .filter((entry) => entry !== undefined),
      );
    },

    listRemoteRefs: async (
      remote: string | RevisionRemoteAddress,
      options?: Readonly<{ signal?: AbortSignal }>,
    ): Promise<readonly RemoteRef[]> => advertisedReferences(remote, options),

    /**
     * Bring the remote's refs into `refs/remotes/<remote>/…`.
     *
     * The destinations come from the fetch refspecs {@link setRemote} wrote, so
     * the layout is the same one the disk leg produces and `remoteTrackingRef`
     * predicts for both. Clean named versions are also materialized under
     * `refs/tags/*`; a locally moved name remains untouched for its leased push.
     *
     * @param input - The remote, and optionally the refs to take.
     * @returns The remote-tracking refs this store now holds.
     */
    fetch: async (input: RevisionFetchInput): Promise<RevisionFetchResult> => {
      if (
        input.maximumTransferBytes !== undefined &&
        (!Number.isSafeInteger(input.maximumTransferBytes) || input.maximumTransferBytes <= 0)
      ) {
        throw new RangeError('maximumTransferBytes must be a positive safe integer.');
      }
      /* Every request this fetch makes carries the caller's deadline, so the
       * abort ends the socket and not only the caller's wait (P36). */
      const http = boundBy(requireHttp(), input.signal, input.maximumTransferBytes);
      const url = await remoteUrl(input.remote);
      /* Seam 2 of 3 (N1): every negotiation this fetch makes answers in the
       * refusal vocabulary, so a pull that the remote refused never reads as a
       * pull the remote did not answer. */
      const refused = (error: unknown): never => {
        throw http.refused(error, input.remote);
      };
      /* The one advertisement: `upload-pack`'s own, which carries the
       * capabilities the request below may use as well as the refs — the
       * listing's, when the caller hands back one this port answered for the
       * same address (R6). */
      const listed = input.advertised === undefined ? undefined : listedAdvertisements.get(input.advertised);
      const advertise = async (): Promise<Awaited<ReturnType<typeof getRemoteInfo2>>> => {
        if (listed?.url === url && listed.advertisement.protocolVersion === 1) {
          return listed.advertisement;
        }
        try {
          return await getRemoteInfo2({ http, url, forPush: false, protocolVersion: 1 });
        } catch (error) {
          return refused(error);
        }
      };
      /* A store with no refs yet opens from the catalogue, when every asked-for ref is in its families (D8). */
      const coldFamilies = input.refs === undefined ? undefined : catalogueFamiliesOf(input.refs);
      const heldReferences = coldFamilies === undefined ? [] : await listRefs({ fs, gitdir, filepath: 'refs' });
      const cold =
        coldFamilies !== undefined && heldReferences.length === 0
          ? await openFromCatalogue({ url, families: coldFamilies, signal: input.signal })
          : undefined;
      let advertisement = cold === undefined ? await advertise() : undefined;
      const advertised =
        cold ?? new Map((advertisement?.refs ?? []).map((reference) => [reference.ref, reference.oid]));
      const wanted = (input.refs ?? [...advertised.keys()].filter((ref) => ref.startsWith('refs/'))).filter((ref) => {
        if (input.refs !== undefined) {
          guardRef(ref, 'ref');
        }
        return !isHostLocalRef(ref);
      });
      if (wanted.length === 0) {
        return Object.freeze({ refs: Object.freeze([]) });
      }
      const tagReferences = wanted.filter((ref) => ref.startsWith(`${tagRefPrefix}/`));
      const previousTags = await Promise.all(
        tagReferences.map(async (ref) => {
          const local = ref;
          const tracked = remoteTrackingRef(input.remote, ref);
          return { local, tracked, localHead: await tryResolve(local), remoteHead: await tryResolve(tracked) };
        }),
      );
      /*
       * Every wanted ref in one `upload-pack` (W13d): the library's own fetch
       * keeps only `refs/heads/*`, so it cost a negotiation per record ref.
       * What this store's refs already name is a `have`, and a tip it already
       * holds is not wanted, so a fetch with nothing new sends no pack request.
       */
      const localTips = await listRefs({ fs, gitdir, filepath: 'refs' });
      const localHeads = await Promise.all(localTips.map(async (name) => tryResolve(`refs/${name}`)));
      const haves = new Set(localHeads.filter((oid) => oid !== undefined));
      const fetchedHeads = wanted.flatMap((ref) => {
        const oid = advertised.get(ref);
        return oid === undefined ? [] : [[ref, oid] as const];
      });
      const missing = await Promise.all(
        fetchedHeads.map(async ([, oid]) => (haves.has(oid) || (await holds(oid)) ? undefined : oid)),
      );
      const wants = [...new Set(missing.filter((oid) => oid !== undefined))];
      if (wants.length > 0) {
        advertisement ??= await advertise();
        const { capabilities: offered } = advertisement;
        const capabilities = ['side-band-64k', 'ofs-delta'].filter((capability) => capability in offered);
        /* A shallow store says where its history stops, so the remote sends what lies past it rather than assume it. */
        const shallow = 'shallow' in offered ? await readShallow() : new Set<string>();
        const body = concatBytes(
          ...wants.map((oid, index) => pktLine(`want ${oid}${index === 0 ? ` ${capabilities.join(' ')}` : ''}\n`)),
          ...[...shallow].map((oid) => pktLine(`shallow ${oid}\n`)),
          pktEncoder.encode('0000'),
          ...[...haves].map((oid) => pktLine(`have ${oid}\n`)),
          pktLine('done\n'),
        );
        /*
         * Where a catalogue serves this remote, the answer is read as it
         * streams and stopped at the ceiling, and past it the objects come one
         * by one from the catalogue. Anywhere else it is read whole, as before.
         */
        const ceiling = options.catalogue?.url(url) === undefined ? undefined : uploadPackCeilingBytes;
        const answered = await postService(http, {
          url,
          service: 'git-upload-pack',
          body,
          ...(ceiling === undefined ? {} : { maximumBytes: ceiling }),
        }).catch(async (error: unknown) => {
          if (!(error instanceof PackCeilingError)) {
            return refused(error);
          }
          if (await importFromCatalogue({ url, families: coldFamilies, signal: input.signal, wants })) {
            return undefined;
          }
          /* A catalogue that does not answer (not deployed, a lapsed link) costs one more request, never the fetch. */
          return postService(http, { url, service: 'git-upload-pack', body }).catch(refused);
        });
        const pack = (() => {
          try {
            return answered === undefined
              ? undefined
              : readUploadPackPack(answered, capabilities.includes('side-band-64k'));
          } catch (error) {
            return refused(error);
          }
        })();
        /* A pack with no objects has nothing to index. */
        if (
          pack !== undefined &&
          pack.byteLength > 32 &&
          new DataView(pack.buffer, pack.byteOffset + 8, 4).getUint32(0) > 0
        ) {
          await objects.addPack(pack);
          await objects.repackIfDue();
        }
        /* What arrived may complete a boundary commit's history. */
        await settleShallow([]);
      }
      /* Refs after objects: a tracking ref never names what this store lacks. */
      await Promise.all(
        fetchedHeads.map(async ([ref, oid]) =>
          writeRef({ fs, gitdir, ref: remoteTrackingRef(input.remote, ref), value: oid, force: true }),
        ),
      );
      await Promise.all(
        previousTags.map(async ({ local, tracked, localHead, remoteHead }) => {
          const fetchedHead = await tryResolve(tracked);
          if (fetchedHead === undefined || (localHead !== undefined && localHead !== remoteHead)) {
            return;
          }
          await withRefLock(`${filesystem.id}:${gitdir}:${local}`, async () => {
            if ((await tryResolve(local)) === localHead) {
              await writeRef({ fs, gitdir, ref: local, value: fetchedHead, force: true });
            }
          });
        }),
      );
      const tracked = await Promise.all(
        wanted.map(async (ref) => {
          const name = remoteTrackingRef(input.remote, ref);
          try {
            return Object.freeze({ name, head: revisionId(await resolveRef({ fs, gitdir, ref: name })) });
          } catch (error) {
            if (isNotFound(error)) {
              return undefined;
            }
            throw error;
          }
        }),
      );
      return Object.freeze({ refs: Object.freeze(tracked.filter((reference) => reference !== undefined)) });
    },

    /**
     * Offer refs to the remote in one `receive-pack`, with `main` last.
     *
     * One advertisement and one request whatever the ref count (E4, EQ8): the
     * lease, the fast-forward rule and "up to date" are all read from that one
     * advertisement, and the server's `report-status` is still per ref, so a
     * refused record ref is a result, not an exception (D14). `atomic` asks
     * for git's own `atomic` capability when the remote advertises it, and a
     * refusal decided here refuses the whole atomic set unsent, as
     * `git push --atomic` does; without it the branch is the last command, the
     * browser half of A39.
     *
     * @param input - The remote and the refs to offer.
     * @returns One result per offered ref, in the order offered.
     */
    push: async (input: RevisionPushInput): Promise<RevisionPushResult> => {
      input.signal?.throwIfAborted();
      const http = boundBy(requireHttp(), input.signal);
      if (input.refs.length === 0) {
        throw new RevisionPortError('INVALID_TRANSPORT', 'push requires at least one ref.');
      }
      for (const ref of input.refs) {
        guardRef(ref.name, 'ref');
        if (ref.remoteName !== undefined) {
          guardRef(ref.remoteName, 'remote ref');
        }
      }
      const configuredRemotes = await port.listRemotes();
      const configuredRemote = configuredRemotes.find((remote) => remote.name === input.remote);
      const url = configuredRemote?.url ?? (await remoteUrl(input.remote));
      if (input.repositoryUrl !== undefined && url !== input.repositoryUrl) {
        throw new RevisionPortError(
          'INVALID_TRANSPORT',
          'The repository destination changed. Review it before pushing.',
        );
      }
      /* The one advertisement (E4), shared by the pushes of this attempt's session (F5). */
      let advertisement = await takeAdvertisement(http, url, input);
      const ordered = [...input.refs].toSorted(
        (left, right) => Number(left.name === refOf(defaultBranch)) - Number(right.name === refOf(defaultBranch)),
      );
      const atomic = input.atomic === true;
      let { results, commands } = await planPush(ordered, advertisement.advertised, atomic);
      /* A reused copy that says a ref is already there may only mean another writer moved it
       * since: nothing would be sent to find out, so `upToDate` is read again before it is reported. */
      if (advertisement.reused === true && [...results.values()].some((result) => result.status === 'upToDate')) {
        advertisement = await takeAdvertisement(http, url, { ...input, session: undefined });
        ({ results, commands } = await planPush(ordered, advertisement.advertised, atomic));
      }
      /* Uploads can take minutes, so an advertisement read before them is not kept for the session's next push. */
      let uploaded = false;
      const { advertised } = advertisement;
      if (commands.length > 0) {
        const capabilities = ['report-status', 'side-band-64k', ...(atomic ? ['atomic'] : [])].filter(
          (capability) => capability in advertisement.capabilities,
        );
        const lines = commands.map((command, index) =>
          pktLine(
            `${command.old ?? '0'.repeat(command.head.length)} ${command.head} ${command.remoteName}${
              index === 0 ? `\0${capabilities.join(' ')}` : ''
            }\n`,
          ),
        );
        const sent = await missingObjects(
          commands.map((command) => command.head),
          new Set(advertised.values()),
        );
        const pointers = await pointersAmong(sent.blobs);
        /*
         * P20: a remote that cannot hold large objects is refused by name, with
         * the files, rather than by the proxy with a `400` nobody can read. It
         * is decided on what this pack would send, after the one advertisement
         * and before any object or ref is offered: tracking refs outlive a
         * re-pointed remote, so they cannot say what it holds. The disk leg
         * refuses before any request, on the large files in each offered ref's
         * tip tree (`git lfs ls-files`), so it also refuses one the remote
         * already has (A15, W12 review R3).
         */
        const destination = configuredRemote ?? remoteOf(input.remote, url);
        if (!remoteCarriesLargeObjects(destination) && pointers.size > 0) {
          throw new RevisionPortError(
            'LFS_REMOTE_UNSUPPORTED',
            lfsRemoteUnsupportedMessage([...pointers.values()].map((entry) => entry.path)),
          );
        }
        /* Objects before the refs that name them (A39): a pointer whose object
         * never arrived is a file nobody can open. Only the pointers among the
         * blobs this pack sends are offered (D11), the batch call skips what the
         * remote already holds, so this is one upload per new object (V13) —
         * and only those are read, because an object fetched from this remote
         * is still a pointer here until somebody opens it. */
        const client = await lfsClient(destination);
        if (client !== undefined) {
          try {
            const uploads = await client.upload({
              signal: input.signal,
              pointers: [...pointers].map(([oid, { size }]) => ({ oid, size })),
              read: async (oid) => localLfsObject(oid, pointers.get(oid)?.path),
            });
            uploaded = uploads.length > 0;
          } catch (error) {
            /* The server counts in object ids; the person reads paths (D16). */
            if (error instanceof LfsQuotaError) {
              throw new LfsQuotaError(
                withQuotaPaths(error.refusal, new Map([...pointers].map(([oid, { path }]) => [oid, path]))),
              );
            }
            throw error;
          }
          input.signal?.throwIfAborted();
        }
        const packfile = await objects.packObjects(sent.oids);
        const body = concatBytes(...lines, pktEncoder.encode('0000'), packfile);
        /* Seam 3 of 3 (N1): the remote answering with a status — 401, `403
         * GIT_SYNC_NOT_ENTITLED`, 404, 413 — is the classifier's question, and
         * only a failure with no status at all is the offline window. */
        const report = await receivePack(http, { url, body, sideband: capabilities.includes('side-band-64k') }).catch(
          (error: unknown) => {
            throw http.refused(error, input.remote);
          },
        );
        /* Whether the server's compare-and-set refused any command of this push. */
        const movedAny = commands.some((command) => {
          const answer = report.refs.get(command.remoteName);
          return answer?.ok === false && refMoved(command.remoteName, answer.reason, report.said);
        });
        for (const command of commands) {
          const answer = report.refs.get(command.remoteName);
          if (answer?.ok !== true) {
            /* An old value the server's compare-and-set refused means another
             * writer moved the ref after the advertisement this push planned
             * from, a kept one or this push's own: the remote moved, which is a
             * lost lease (D39), not raw git text. An atomic push's other
             * commands fall with it. */
            const moved =
              answer !== undefined &&
              (refMoved(command.remoteName, answer.reason, report.said) ||
                (movedAny && /atomic transaction failed/iu.test(answer.reason)));
            results.set(
              command.name,
              refused(
                command.name,
                moved
                  ? 'leaseLost'
                  : answer === undefined
                    ? 'The remote did not report this ref.'
                    : remoteRefusalSaid(answer.reason, report.said),
              ),
            );
            continue;
          }
          /* The kept advertisement now says what the remote holds, for the session's next push. */
          advertised.set(command.remoteName, command.head);
          /* Where `fetch` would have put it, which is where `git push` puts it. */
          // eslint-disable-next-line no-await-in-loop -- one tracking ref per accepted ref.
          await writeRef({
            fs,
            gitdir,
            ref: remoteTrackingRef(input.remote, command.remoteName),
            value: command.head,
            force: true,
          });
          results.set(
            command.name,
            Object.freeze({ name: command.name, status: 'updated', head: revisionId(command.head) }),
          );
        }
      }
      const pushed = Object.freeze({ refs: Object.freeze(input.refs.map((ref) => results.get(ref.name)!)) });
      if (!uploaded && pushed.refs.every((entry) => entry.status !== 'rejected')) {
        keepAdvertisement(input.session, url, advertisement);
      }
      return pushed;
    },

    listRemotes: async (): Promise<readonly Remote[]> => {
      const remotes = await listRemotes({ fs, gitdir });
      const readConfig = async (path: string): Promise<string | undefined> => {
        const values: unknown = await getConfigAll({ fs, gitdir, path });
        return Array.isArray(values) && typeof values[0] === 'string' ? values[0] : undefined;
      };
      const records = await Promise.all(
        remotes.map(async (remote) => {
          const [provider, repositoryId, fetchOnly] = await Promise.all([
            readConfig(`remote.${remote.remote}.tauProvider`),
            readConfig(`remote.${remote.remote}.tauRepositoryId`),
            readConfig(`remote.${remote.remote}.tauFetchOnly`),
          ]);
          return remoteOf(remote.remote, remote.url, {
            ...(provider === 'github' ? { provider } : {}),
            ...(repositoryId !== undefined && /^\d+$/u.test(repositoryId) ? { repositoryId } : {}),
            ...(fetchOnly === 'true' ? { fetchOnly: true } : {}),
          });
        }),
      );
      return Object.freeze(records.toSorted((left, right) => left.name.localeCompare(right.name)));
    },

    /**
     * Create or re-point one remote, with the fetch refspecs both legs agree on.
     *
     * `addRemote` writes only `+refs/heads/*`, and the record set lives outside
     * it (`refs/tau/{chats,evidence,artifacts}`), so the other two rules are
     * written here — otherwise a fetched chat ref would have nowhere to land.
     *
     * @param input - The remote's name and URL.
     */
    setRemote: async (input: SetRevisionRemoteInput): Promise<void> => {
      let githubRepositoryId: string | undefined;
      if (input.provider === 'github') {
        if (input.repositoryId !== undefined && /^\d+$/u.test(input.repositoryId)) {
          githubRepositoryId = input.repositoryId;
        } else {
          throw new TypeError('A GitHub remote requires a decimal repository id.');
        }
      }
      await addRemote({ fs, gitdir, remote: input.name, url: input.url, force: true });
      if (githubRepositoryId === undefined) {
        await setConfig({ fs, gitdir, path: `remote.${input.name}.tauProvider`, value: '' });
        await setConfig({ fs, gitdir, path: `remote.${input.name}.tauRepositoryId`, value: '' });
      } else {
        await setConfig({ fs, gitdir, path: `remote.${input.name}.tauProvider`, value: 'github' });
        await setConfig({ fs, gitdir, path: `remote.${input.name}.tauRepositoryId`, value: githubRepositoryId });
      }
      await setConfig({
        fs,
        gitdir,
        path: `remote.${input.name}.tauFetchOnly`,
        value: input.fetchOnly === true ? 'true' : '',
      });
      const configured = await getConfigAll({ fs, gitdir, path: `remote.${input.name}.fetch` });
      for (const rule of [
        `+refs/tags/*:refs/remotes/${input.name}/tags/*`,
        `+refs/tau/*:refs/remotes/${input.name}/tau/*`,
      ]) {
        if (!configured.includes(rule)) {
          // eslint-disable-next-line no-await-in-loop -- two config lines, written in order.
          await setConfig({ fs, gitdir, path: `remote.${input.name}.fetch`, value: rule, append: true });
        }
      }
    },

    removeRemote: async (name: string): Promise<void> => {
      await deleteRemote({ fs, gitdir, remote: name });
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
        /* The page's route for the live project, as the architecture's L3 row
         * spells it (architecture:448) — the same kind of value the linked
         * checkouts report, so one consumer opens either by its root. */
        root: `/projects/${projectId}`,
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
      const tree = await port.readTree(base);
      if (tree === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for revision ${base}.`);
      }
      assertMaterializableRevisionTree(tree);
      if (head === undefined) {
        const created = await port.updateRef({ name: input.branch, expectedHead: undefined, head: base });
        if (created.status !== 'updated') {
          throw new RevisionPortError('CHECKOUT_CONFLICT', `Branch ${input.branch} was created elsewhere.`);
        }
      }
      const provider = await root(id);
      await Promise.all(tree.entries().map(async (entry) => provider.writeFile(entry.path, entry.content)));
      /* The registry is the store's own record: written off the pipeline, like every byte of `.git` (I6). */
      await gitFiles.mkdir(checkoutsDirectory, { recursive: true });
      await gitFiles.writeFile(
        `${checkoutsDirectory}/${id}.json`,
        `${JSON.stringify({ version: 1, id, branch: input.branch })}\n`,
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
      const { root } = requireCheckouts();
      if (id === liveCheckoutId) {
        /* Policy Rule 1: *live checkout* is an engineering term and this
         * sentence is rendered verbatim by the pane and printed by the CLI. */
        throw new RevisionPortError(
          'CHECKOUT_CONFLICT',
          'The project itself cannot be removed. Switch to another branch first.',
        );
      }
      const record = await readCheckoutRecord(id);
      if (record === undefined) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', `No checkout is registered as ${id}.`);
      }
      // The files go before the record: a crash between the two leaves a route
      // that is empty, never one that is unregistered and still full.
      await clearProvider(await root(id));
      await gitFiles.unlink(`${checkoutsDirectory}/${id}.json`);
    },
  });

  return port;
};
