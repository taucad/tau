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
  fetch as fetchFromRemote,
  getConfigAll,
  init,
  listRefs,
  listRemotes,
  listServerRefs,
  push as pushToRemote,
  readBlob,
  readObject,
  readTree,
  resolveRef,
  setConfig,
  version,
  writeBlob,
  writeObject,
  writeRef,
  writeTree,
} from 'isomorphic-git';
import type { TreeEntry } from 'isomorphic-git';
import { ResourceQueue } from '@taucad/filesystem';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { FileMode, FileSystemProvider } from '@taucad/filesystem';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import type { RevisionProvenance } from '#revision-authority.js';
import { decodeCommit, decodeTag, encodeCommit, encodeTag } from '#git-objects.js';
import type { DecodedCommit } from '#git-objects.js';
import { digestHex } from '#object-hash.js';
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
import { RevisionPortError } from '#revision-port.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';
import { cleanLargeObjects, lfsObjectPath, readLfsPointer } from '#lfs.js';
import { createLfsClient, LfsQuotaError, withQuotaPaths } from '#lfs-client.js';
import {
  isHostLocalRef,
  lfsRemoteUnsupportedMessage,
  remoteCarriesLargeObjects,
  remoteOf,
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
  RevisionEngineDescriptor,
  RevisionHead,
  RevisionLogEntry,
  RevisionLogInput,
  RevisionPort,
  RevisionReceipt,
  RevisionRecord,
  RemoteRef,
  RevisionFetchInput,
  RevisionFetchResult,
  RevisionPushInput,
  RevisionPushRef,
  RevisionPushRefResult,
  RevisionPushResult,
  SetRevisionRemoteInput,
  RevisionRef,
  RevisionTag,
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
  filesystem: FileSystemProvider;
  /** Control plane location. Defaults to `.git`, the one repository name on every host (D29). */
  gitDirectory?: string;
  /** Recorded object format. `isomorphic-git` writes SHA-1 only. */
  objectFormat?: ObjectFormat;
  /** Supplied, the port advertises and implements the `checkouts` capability. */
  checkouts?: IsomorphicGitCheckoutOptions;
  /**
   * Supplied, the port has a transport and an LFS client (S24, S49).
   *
   * The Tau client, not the library's: it is the one place `keepalive`, the
   * open-pull `signal` and the `Authorization` header are set (I8).
   */
  http?: RevisionHttpClient;
}>;

const defaultGitDirectory = '.git';
const defaultBranch = 'main';
const branchRefPrefix = 'refs/heads';
const tagRefPrefix = 'refs/tags';
const symbolicRefPrefix = 'ref: ';
const directoryMode = '040000';
const liveCheckoutId = 'live';
/** Shared across every store in this document: one ref, one writer at a time. */
const refQueue = new ResourceQueue();

const frozenChange = (path: string, kind: RevisionDiffEntry['kind']): RevisionDiffEntry =>
  Object.freeze({ path, kind });

/**
 * Why the remote — or the library's own pre-flight — refused one ref.
 *
 * Never the URL and never a header: a refusal reaches a toast and a log (I8).
 *
 * @param error - What `push` threw.
 * @returns A safe one-line reason.
 */
const pushReason = (error: unknown): string | undefined => {
  const { data } = error as { data?: { result?: { refs?: Record<string, { ok: boolean; error: string }> } } };
  const refused = Object.values(data?.result?.refs ?? {}).find((status) => !status.ok);
  return refused?.error;
};

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
  files: Map<string, Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }>>;
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
    node.files.set(segments.at(-1)!, { content: entry.content, mode: entry.mode });
  }
  return root;
};

/**
 * Empty one checkout route.
 *
 * A removed checkout must leave nothing behind: its id is a pure function of
 * its branch, so files kept past the record union two revisions' trees the next
 * time that branch is checked out (review 4 R3). Native Git's
 * `worktree remove --force` already does exactly this.
 *
 * @param provider - The route's provider.
 * @param path - The directory being emptied; the root by default.
 */
const clearProvider = async (provider: FileSystemProvider, path = ''): Promise<void> => {
  const names = await provider.readdir(path).catch((): readonly string[] => []);
  await Promise.all(
    names.map(async (name) => {
      const child = path === '' ? name : `${path}/${name}`;
      const stat = await provider.stat(child);
      if (stat.type !== 'dir') {
        return provider.unlink(child);
      }
      await clearProvider(provider, child);
      return provider.rmdir(child);
    }),
  );
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
  /* A branch name is spelled short and everything else is spelled in full: the
   * record set the design pushes lives outside `refs/heads` (`refs/tau/chats/*`,
   * W17), so a port that could only name branches could not address half of what
   * its own `push` moves. */
  const refOf = (name: string): string => (name.startsWith('refs/') ? name : `${branchRefPrefix}/${name}`);
  const checkoutIdOf = (branch: string): string =>
    digestHex(objectFormat, new TextEncoder().encode(`tau-checkout\0${branch}`)).slice(0, 16);

  const readRaw = async (
    oid: string,
    expected: 'commit' | 'tag' = 'commit',
  ): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-deprecated -- the typed
       * readers drop Tau's `change-id` and `jj:*` headers; raw content is the
       * only shape that carries them. */
      const object = await readObject({ fs, gitdir, oid, format: 'content' });
      return object.format === 'content' && object.type === expected ? new Uint8Array(object.object) : undefined;
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
    const { tree } = await readTree({ fs, gitdir, oid });
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

  const writeTreeGraph = async (node: TreeDraft): Promise<string> => {
    const entries: TreeEntry[] = await Promise.all([
      ...[...node.files].map(
        async ([path, file]): Promise<TreeEntry> => ({
          mode: file.mode,
          path,
          oid: await writeBlob({ fs, gitdir, blob: file.content }),
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
    /* D58: the head is the branch's, as a native worktree's HEAD is. The
     * record's own value is only where the checkout started; reported as the
     * head it froze every linked checkout here at its first revision, so a
     * conflict that moved on kept its card bound to one no branch names. */
    const head = await port.readRef(record.branch);
    return Object.freeze({
      id: record.id,
      projectId: checkouts.projectId,
      root: `/checkouts/${record.id}`,
      kind: 'linked',
      branch: record.branch,
      baseRevisionId: head ?? revisionId(record.baseRevisionId),
    });
  };

  const listCheckoutRecords = async (): Promise<readonly Checkout[]> => {
    const stored = (await filesystem.exists(checkoutsDirectory)) ? await filesystem.readdir(checkoutsDirectory) : [];
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
   * Put one large object in this store. Content-addressed, so a repeat writes nothing.
   *
   * @param oid - The pointer's object id.
   * @param content - The object's real bytes.
   */
  const storeLfsObject = async (oid: string, content: Uint8Array<ArrayBuffer>): Promise<void> => {
    const file = lfsObjectFile(oid);
    if (await filesystem.exists(file)) {
      return;
    }
    await filesystem.mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    await filesystem.writeFile(file, content);
  };

  /**
   * The LFS client for whichever remote this project has, or `undefined`.
   *
   * A large object is fetched lazily: a `fetch` brings pointers, and the bytes
   * behind one arrive the first time somebody reads it.
   *
   * @returns The client, or `undefined` when there is no remote or no transport.
   */
  const lfsClient = async (): Promise<ReturnType<typeof createLfsClient> | undefined> => {
    if (options.http === undefined) {
      return undefined;
    }
    const [remote] = await port.listRemotes();
    return remote === undefined
      ? undefined
      : createLfsClient({
          url: remote.url,
          http: options.http,
          remote: remote.name,
          ...(remote.kind === 'tau' ? { fetch: globalThis.fetch.bind(globalThis) } : {}),
        });
  };

  /** Large-object downloads in flight, by oid; see {@link smudged}. */
  const downloads = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

  /**
   * One blob as a caller reads it: a pointer resolved back to its content.
   *
   * @param content - Bytes as the object store holds them.
   * @returns The real bytes.
   */
  const smudged = async (content: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
    const pointer = readLfsPointer(content);
    if (pointer === undefined) {
      return content;
    }
    const file = lfsObjectFile(pointer.oid);
    if (await filesystem.exists(file)) {
      return filesystem.readFile(file);
    }
    /* One download per object, not per path: `readTree` smudges every entry in
     * parallel, and a tree that uses the same object twice would otherwise pull
     * it twice. The map holds the in-flight promise, so the second caller waits
     * on the first request rather than starting its own. */
    const inFlight = downloads.get(pointer.oid);
    if (inFlight !== undefined) {
      return inFlight;
    }
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
    const download = (async (): Promise<Uint8Array<ArrayBuffer>> => {
      const downloaded = await client.download(pointer);
      await storeLfsObject(pointer.oid, downloaded);
      return downloaded;
    })();
    downloads.set(pointer.oid, download);
    try {
      return await download;
    } finally {
      downloads.delete(pointer.oid);
    }
  };

  /**
   * Large objects reachable from the refs this push offers, by oid.
   *
   * @returns The objects, by oid.
   */
  const localLfsObjects = async (oids: Iterable<string>): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
    const objects = new Map<string, Uint8Array<ArrayBuffer>>();
    await Promise.all(
      [...oids].map(async (oid) => {
        objects.set(oid, await filesystem.readFile(lfsObjectFile(oid)));
      }),
    );
    return objects;
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

  const pointerPaths = async (offered: readonly RevisionPushRef[]): Promise<ReadonlyMap<string, string>> => {
    const paths = new Map<string, string>();
    const heads = [] as RevisionId[];
    for (const ref of offered) {
      // eslint-disable-next-line no-await-in-loop -- one ref resolution per offered name.
      const head = await tryResolve(ref.name);
      if (head !== undefined) {
        heads.push(revisionId(head));
      }
    }
    const revisions = await port.log({ heads });
    for (const revision of revisions) {
      // eslint-disable-next-line no-await-in-loop -- each reachable tree is inspected once before transfer.
      const commit = await commitOf(revision.id);
      if (commit === undefined) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- see above.
      const entries = await flatTree(commit.tree);
      // eslint-disable-next-line no-await-in-loop -- see above.
      await Promise.all(
        [...entries].map(async ([path, { oid }]) => {
          const { blob } = await readBlob({ fs, gitdir, oid });
          const pointer = readLfsPointer(new Uint8Array(blob));
          if (pointer !== undefined) {
            paths.set(pointer.oid, path);
          }
        }),
      );
    }
    return paths;
  };

  /**
   * What the remote advertises, read through the client the caller gives.
   *
   * The client is a parameter because a fetch's advertisement has to carry the
   * fetch's own deadline: the negotiation is the request most likely to be the
   * one that hangs (P36).
   *
   * @param remote - The remote's name in git's config.
   * @param http - The client this read goes through.
   * @returns Every advertised ref, peeled tags dropped.
   */
  const advertisedReferences = async (remote: string, http: RevisionHttpClient): Promise<readonly RemoteRef[]> => {
    const url = await remoteUrl(remote);
    /* Seam 1 of 3 (N1). The advertisement is the *first* thing every remote
     * verb does, so it is where a 401, a `403 GIT_SYNC_NOT_ENTITLED` and a 404
     * arrive — and until this catch existed the library's own
     * `HTTP Error: 403 Forbidden` escaped verbatim into a `role='alert'`. */
    const advertised = await listServerRefs({ http, url }).catch((error: unknown) => {
      throw remoteTransportError(error, { remote });
    });
    return Object.freeze(
      advertised
        .filter((reference) => !reference.ref.endsWith('^{}'))
        .map((reference) => Object.freeze({ name: reference.ref, head: revisionId(reference.oid) })),
    );
  };

  /** One client, bounded by one operation's signal. */
  const boundBy = (client: RevisionHttpClient, signal: AbortSignal | undefined): RevisionHttpClient =>
    signal === undefined ? client : { request: async (request) => client.request({ ...request, signal }) };

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
        [...paths].map(async ([path, { oid, mode }]): Promise<RevisionTreeInput> => {
          const { blob } = await readBlob({ fs, gitdir, oid });
          /* Smudged above the engine, never inside it (S49): the tree holds the
           * pointer and every caller — the user, the agent, a restore — sees
           * the bytes. */
          return [path, await smudged(new Uint8Array(blob)), mode as FileMode];
        }),
      );
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
      const treeId = await writeTreeGraph(draftOf(recorded.tree));
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
      /* eslint-disable-next-line @typescript-eslint/no-deprecated -- `writeTag`
       * re-serialises a `TagObject`, so the bytes stored would not be the bytes
       * `encodeTag` hashed; the raw object keeps one encoder for both legs. */
      const oid = await writeObject({ fs, gitdir, type: 'tag', format: 'content', object: object.body });
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
      // One object read per revision the order needs, and no tree is touched.
      return Object.freeze(
        await walkRevisionLog(
          heads,
          async (id) => {
            const commit = await commitOf(id);
            return commit === undefined
              ? undefined
              : {
                  parents: commit.parents.map((parent) => revisionId(parent)),
                  seconds: commit.committer.seconds,
                  entry: entryOf(id, commit),
                };
          },
          input?.limit,
        ),
      );
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

    listRemoteRefs: async (remote: string): Promise<readonly RemoteRef[]> =>
      advertisedReferences(remote, requireHttp()),

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
      /* Every request this fetch makes carries the caller's deadline, so the
       * abort ends the socket and not only the caller's wait (P36). */
      const http = boundBy(requireHttp(), input.signal);
      const url = await remoteUrl(input.remote);
      const advertised = await advertisedReferences(input.remote, http);
      const wanted = (input.refs ?? advertised.map((reference) => reference.name)).filter((ref) => {
        if (input.refs !== undefined) {
          guardRef(ref, 'ref');
        }
        return !isHostLocalRef(ref);
      });
      if (wanted.length === 0) {
        return Object.freeze({ refs: Object.freeze([]) });
      }
      /*
       * The library's own fetch drops every advertised ref outside
       * `refs/heads/*` before it translates the refspecs, so one call brings
       * the history set and the record set arrives one ref at a time.
       *
       * ponytail: one round trip per record ref. A project with many chats pays
       * for it; the upgrade is `listServerRefs` + a single `fetch` over the
       * library's private `_fetch`, or an upstream fix, and neither is worth
       * doing before the count hurts.
       */
      const tagReferences = wanted.filter((ref) => ref.startsWith(`${tagRefPrefix}/`));
      const previousTags = await Promise.all(
        tagReferences.map(async (ref) => {
          const local = ref;
          const tracked = remoteTrackingRef(input.remote, ref);
          return { local, tracked, localHead: await tryResolve(local), remoteHead: await tryResolve(tracked) };
        }),
      );
      /* Seam 2 of 3 (N1): every negotiation this fetch makes answers in the
       * refusal vocabulary, so a pull that the remote refused never reads as a
       * pull the remote did not answer. */
      const refused = (error: unknown): never => {
        throw remoteTransportError(error, { remote: input.remote });
      };
      const heads = wanted.filter((ref) => ref.startsWith('refs/heads/'));
      if (heads.length > 0) {
        await fetchFromRemote({ fs, http, gitdir, url, remote: input.remote, singleBranch: false, tags: false }).catch(
          refused,
        );
      }
      for (const ref of wanted.filter((candidate) => !heads.includes(candidate))) {
        // eslint-disable-next-line no-await-in-loop -- one negotiation per non-branch ref, see above.
        await fetchFromRemote({
          fs,
          http,
          gitdir,
          url,
          remote: input.remote,
          singleBranch: true,
          remoteRef: ref,
          tags: false,
        }).catch(refused);
      }
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
     * Offer refs to the remote, one at a time, with `main` last.
     *
     * `isomorphic-git` pushes a single ref per call and has no `--atomic`, so
     * the history set is ordered instead: everything else goes first and the
     * branch that names them lands last, which is the browser half of A39. The
     * loop never stops on a refusal — a refused record ref is a result, not an
     * exception (D14).
     *
     * @param input - The remote and the refs to offer.
     * @returns One result per offered ref, in the order offered.
     */
    push: async (input: RevisionPushInput): Promise<RevisionPushResult> => {
      const http = requireHttp();
      if (input.refs.length === 0) {
        throw new RevisionPortError('INVALID_TRANSPORT', 'push requires at least one ref.');
      }
      for (const ref of input.refs) {
        guardRef(ref.name, 'ref');
        if (ref.remoteName !== undefined) {
          guardRef(ref.remoteName, 'remote ref');
        }
      }
      /*
       * P20, before the network: a remote that cannot hold large objects is
       * refused by name, with the files, rather than by the proxy with a `400`
       * nobody can read. The disk leg refuses the same push for the same reason
       * and also without a request, so the two legs agree about what a push
       * means (A15, W12 review R3).
       */
      const configuredRemotes = await port.listRemotes();
      const configuredRemote = configuredRemotes.find((remote) => remote.name === input.remote);
      if (!remoteCarriesLargeObjects(configuredRemote ?? input.remote)) {
        const large = await pointerPaths(input.refs);
        if (large.size > 0) {
          throw new RevisionPortError('LFS_REMOTE_UNSUPPORTED', lfsRemoteUnsupportedMessage([...large.values()]));
        }
      }
      const url = await remoteUrl(input.remote);
      const remoteReferences = await port.listRemoteRefs(input.remote);
      const advertised = new Map(remoteReferences.map((reference) => [reference.name, reference.head]));
      const ordered = [...input.refs].toSorted(
        (left, right) => Number(left.name === refOf(defaultBranch)) - Number(right.name === refOf(defaultBranch)),
      );
      /* Objects before the refs that name them (A39): a pointer whose object
       * never arrived is a file nobody can open. The batch call skips what the
       * remote already holds, so this is one upload per object (V13). */
      const client = await lfsClient();
      if (client !== undefined) {
        const pointers = await pointerPaths(ordered);
        const objects = await localLfsObjects(pointers.keys());
        try {
          await client.upload(objects);
        } catch (error) {
          /* The server counts in object ids; the person reads paths (D16). */
          if (error instanceof LfsQuotaError) {
            throw new LfsQuotaError(withQuotaPaths(error.refusal, await pointerPaths(ordered)));
          }
          throw error;
        }
      }
      const results: RevisionPushRefResult[] = [];
      for (const ref of ordered) {
        const remoteName = ref.remoteName ?? ref.name;
        // eslint-disable-next-line no-await-in-loop -- one ref at a time is the contract (F4).
        const head = await tryResolve(ref.name);
        if (head !== undefined && advertised.get(remoteName) === head) {
          results.push(Object.freeze({ name: ref.name, status: 'upToDate', head: revisionId(head) }));
          continue;
        }
        /* The lease (A32, D14), checked against the advertisement this push
         * already read: a ref that moved since this host last looked is refused
         * here and never offered, so nothing on the remote is touched. The wire
         * carries the advertised value as the old oid, so the server's own
         * compare-and-set refuses it a second time if it moves in between. */
        const leased = 'expected' in ref;
        if (leased && advertised.get(remoteName) !== ref.expected) {
          results.push(Object.freeze({ name: ref.name, status: 'rejected', head: undefined, reason: 'leaseLost' }));
          continue;
        }
        /* The server's sideband, which is where a `pre-receive` refusal says
         * *why*: the per-ref report only carries git's `hook declined` (N4). */
        const said: string[] = [];
        try {
          // eslint-disable-next-line no-await-in-loop -- one ref at a time is the contract (F4).
          await pushToRemote({
            fs,
            http,
            gitdir,
            url,
            remote: input.remote,
            ref: ref.name,
            remoteRef: remoteName,
            onMessage: (message: string) => {
              const line = message.trim();
              if (line !== '') {
                said.push(line);
              }
            },
            /* A held lease is what allows the non-fast-forward; without one the
             * remote's own rule decides, exactly as on the native leg. */
            ...(leased ? { force: true } : {}),
          });
          results.push(
            Object.freeze({
              name: ref.name,
              status: 'updated',
              head: head === undefined ? undefined : revisionId(head),
            }),
          );
        } catch (error) {
          const reason = pushReason(error);
          /*
           * Seam 3 of 3 (N1). No per-ref report means the *remote* never got as
           * far as reporting on refs, so this is not "the remote refused this
           * ref" and reporting it as one would tell W13's scheduler to retry
           * one record ref while history is just as un-pushed.
           *
           * What it is instead is the classifier's question: an HTTP status
           * means the remote answered and said no — 401, `403
           * GIT_SYNC_NOT_ENTITLED`, 404, 413 — and only a failure carrying no
           * status at all is the offline window this used to report for all ten
           * classes at once.
           */
          if (reason === undefined) {
            throw remoteTransportError(error, { remote: input.remote });
          }
          results.push(
            Object.freeze({
              name: ref.name,
              status: 'rejected',
              head: undefined,
              reason: remoteRefusalSaid(reason, said),
            }),
          );
        }
      }
      return Object.freeze({
        refs: Object.freeze(input.refs.map((ref) => results.find((result) => result.name === ref.name)!)),
      });
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
      await filesystem.unlink(`${checkoutsDirectory}/${id}.json`);
    },
  });

  return port;
};
