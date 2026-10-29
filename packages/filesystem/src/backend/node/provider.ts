/**
 * Host-side node filesystem provider. Owns `node:fs`, the bytes, and the
 * watchers; runs in the Electron services utility (or any plain Node peer).
 *
 * Never reachable from the browser barrel — it is published only through the
 * `@taucad/filesystem/backend/node` subpath, so `node:fs` cannot follow the
 * client half into the file-manager worker bundle.
 *
 * Adapted from `packages/runtime/src/transport/_internal/from-node-fs-handle.ts`
 * (containment `:100-113`, atomic temp + fsync + rename write `:129-206`,
 * symlink refusal, `stat`-classified watching `:249-432` — macOS reports plain
 * content writes as `rename`, so `eventType` is never trusted). Adapted rather
 * than reused for two reasons: the runtime handle is not a `FileSystemProvider`,
 * and it waives the `mkdir -p` parent contract every provider in this library
 * guarantees (`provider-tree-conformance.test.ts:75-136`).
 */

import fs from 'node:fs/promises';
import { createEntryObserver, readBoundedDescriptor } from '#backend/node/entry-observation.js';
import type { EntryObserver } from '#backend/node/entry-observation.js';
import type { FileHandle } from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import { constants, realpathSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CheckedFileWrite, CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { mapConcurrent, statConcurrency } from '#concurrency.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import { headSniffByteLength, seemsBinary, countLineBytes } from '#content-metadata.js';
import type {
  DirectoryEntry,
  FileMode,
  FileReadStreamOptions,
  FileStatOptions,
  FileStat,
  HeadFileStat,
  PathAgentAccess,
  PathPolicy,
  ProviderCapabilities,
  WatchRequest,
} from '#types.js';
import type { NodeFsWatchEvent } from '#backend/node/protocol.js';
import { streamChunkSize, validateFileReadStreamOptions } from '#backend/stream-utils.js';

/**
 * Why one path is being resolved. A `mutate` resolution additionally refuses a
 * spelling whose real row grants less authority than the spelling itself (O4).
 */
type ResolveIntent = 'read' | 'mutate';

/** How much authority each classification grants, so a real row can be compared with a spelled one (O4). */
const pathAuthorityRank: Readonly<Record<PathAgentAccess, number>> = Object.freeze({
  hidden: 0,
  'read-only': 1,
  'read-write': 2,
});

/** The name `_atomicWrite` gives its temp file: `.<target>.<pid>.<uuid>.tmp`. */
/**
 * Files one `hashFiles` call digests at once. Each holds a descriptor and at
 * most one bounded chunk, and the call is not nested in a tree walk, so this
 * stays far inside a default 256-descriptor limit.
 */
const hashConcurrency = 32;

const inFlightTemporaryName = /^\..+\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u;

/**
 * The POSIX `open` hardening flag `flag`, or `0` where the platform omits it.
 *
 * Windows leaves `O_NOFOLLOW` and `O_NONBLOCK` undefined, so summing them into a
 * flag word there yields `NaN`, which `fs.open` refuses with `ERR_OUT_OF_RANGE`
 * before any durability or verification decision is reached. The refusals those
 * bits would carry do not depend on them: every open below is preceded by an
 * `lstat` symbolic-link refusal and a `realpath` containment check on its
 * admitted parent, and the bounded reads never block on a regular file.
 */
const optionalOpenFlag = (flag: number | undefined): number => flag ?? 0;

/** Bounded read of an already-admitted path. */
const boundedReadFlags = constants.O_RDONLY + optionalOpenFlag(constants.O_NONBLOCK);

/** Post-rename verification read, which must not traverse a symbolic link where the platform can refuse one. */
const verificationReadFlags = boundedReadFlags + optionalOpenFlag(constants.O_NOFOLLOW);

const isContained = (base: string, target: string): boolean => {
  const relative = path.relative(base, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength &&
  Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(
    Buffer.from(right.buffer, right.byteOffset, right.byteLength),
  );

type AuthorityCheckedWrite = (
  input: Omit<CheckedFileWrite, 'signal'>,
  assertCurrent: () => Promise<void>,
) => Promise<CheckedFileWriteResult>;

const authorityCheckedWrites = new WeakMap<NodeFsProvider, AuthorityCheckedWrite>();
type AuthorityCheckedDelete = (
  input: { path: string; preconditions: readonly FileWritePrecondition[] },
  assertCurrent: () => Promise<void>,
) => Promise<CheckedFileWriteResult>;
const authorityCheckedDeletes = new WeakMap<NodeFsProvider, AuthorityCheckedDelete>();
const entryObservers = new WeakMap<NodeFsProvider, EntryObserver>();
const checkedByteLimit = 64 * 1024 * 1024;
const boundedReads = new WeakMap<
  NodeFsProvider,
  (path: string, maximumBytes: number) => Promise<Uint8Array<ArrayBuffer>>
>();
const boundedListings = new WeakMap<
  NodeFsProvider,
  (path: string, limits: { maximumEntries: number; maximumBytes: number }) => Promise<DirectoryEntry[]>
>();
const entryKinds = new WeakMap<
  NodeFsProvider,
  (path: string) => Promise<'absent' | 'file' | 'directory' | 'symlink'>
>();
const spendCheckedBytes = (budget: { bytes: number }, amount: number): void => {
  if (amount > budget.bytes) {
    throw Object.assign(new Error('Checked operation exceeds its bounded byte allowance.'), {
      code: 'EFBIG',
      applicationState: 'known-not-applied',
    });
  }
  budget.bytes -= amount;
};
const byteLength = (value: Uint8Array<ArrayBuffer> | string): number =>
  typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;

type NativeSubscription = { unsubscribe(): Promise<void> };
type NativeWatcher = {
  subscribe(
    directory: string,
    handler: (error: unknown, events: Array<{ path: string; type: string }>) => void,
    options?: { ignore?: string[] },
  ): Promise<NativeSubscription>;
};
type WatchClosures = { pending: Set<Promise<void>>; admissions: Set<Promise<void>>; failures: unknown[] };
const watchClosures = new WeakMap<NodeFsProvider, WatchClosures>();

const trackWatchClosure = (provider: NodeFsProvider, closure: Promise<void>): void => {
  const state = watchClosures.get(provider)!;
  const tracking = { promise: Promise.resolve() };
  tracking.promise = (async (): Promise<void> => {
    try {
      await closure;
    } catch (error) {
      state.failures.push(error);
    } finally {
      state.pending.delete(tracking.promise);
    }
  })();
  state.pending.add(tracking.promise);
};

const trackWatchAdmission = (provider: NodeFsProvider, admission: Promise<void>): void => {
  const state = watchClosures.get(provider)!;
  const tracking = { promise: Promise.resolve() };
  tracking.promise = (async (): Promise<void> => {
    try {
      await admission;
    } catch {
      // The initiating watch or rearm owner handles the admission failure.
    } finally {
      state.admissions.delete(tracking.promise);
    }
  })();
  state.admissions.add(tracking.promise);
};

/**
 * Await the native watcher subscriptions and closures a provider started.
 *
 * `NodeFsProvider.dispose()` is synchronous, but native subscribe and
 * unsubscribe settle later on the owning event loop. Await this before that
 * isolate exits, because a worker terminated mid-settlement aborts the process.
 *
 * @param provider - The provider whose watcher work must settle.
 * @returns Resolves once every pending admission and closure has settled.
 * @throws AggregateError When more than one native closure failed; a single failure is rethrown as is.
 * @public
 */
export const drainNodeFsProviderWatchClosures = async (provider: NodeFsProvider): Promise<void> => {
  const state = watchClosures.get(provider);
  if (!state) {
    return;
  }
  while (state.pending.size > 0 || state.admissions.size > 0) {
    // oxlint-disable-next-line no-await-in-loop -- Late admission can add another physical closure before the next pass.
    await Promise.all([...state.pending, ...state.admissions]);
  }
  const failures = state.failures.splice(0);
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Native watcher closures failed.');
  }
};

// oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
/** ponytail: prefix-only exclude matching, mirroring the runtime adapter's kernel contract. */
const isExcluded = (rootedPath: string, excludes: readonly string[]): boolean =>
  excludes.some((pattern) => {
    if (!pattern.endsWith('/**')) {
      return pattern === rootedPath;
    }
    const prefix = pattern.slice(0, -3);
    return rootedPath === prefix || rootedPath.startsWith(`${prefix}/`);
  });

const joinRooted = (base: string, child: string): string => (base === '' ? child : `${base}/${child}`);

/**
 * Absolute directories under one watched directory that `excludes` drop whole.
 *
 * Only a `prefix/**` pattern names a subtree; it becomes a native ignore when the prefix lies strictly inside the
 * watched path. Matching stays authoritative in {@link isExcluded}: this only keeps the OS from reporting them.
 *
 * @param rootedPath - Rooted path of the watched directory.
 * @param directory - Its absolute host path.
 * @param excludes - The request's exclude patterns.
 * @returns Absolute paths for the native watcher's `ignore`.
 */
const nativeIgnores = (rootedPath: string, directory: string, excludes: readonly string[]): string[] =>
  excludes.flatMap((pattern) => {
    if (!pattern.endsWith('/**')) {
      return [];
    }
    const prefix = pattern.slice(0, -3);
    const inside =
      rootedPath === '' ? prefix : prefix.startsWith(`${rootedPath}/`) ? prefix.slice(rootedPath.length + 1) : '';
    return inside === '' ? [] : [path.join(directory, ...inside.split('/'))];
  });

/**
 * Disk-backed provider rooted at one absolute host directory.
 *
 * @public
 */
export class NodeFsProvider extends AbstractFileSystemProvider {
  /** @returns `true` for the supported head listing mode. */
  public get supportsHeadListing(): true {
    return true;
  }
  public readonly capabilities: ProviderCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: false,
    durability: 'transactional-rewrite',
  };

  private readonly _base: string;
  private readonly _policy: PathPolicy | undefined;
  private _realBaseCache: Promise<string> | undefined;

  private readonly _openSubscriptions = new Set<() => void>();

  /**
   * @param basePath - Host directory mapped to this provider's root. It must
   * already exist; the caller (the host) creates it.
   * @param options - The reserved layout an ordinary name may not resolve into
   * (D6, G0-6). This backend is the only one that can hold a symlink and the
   * only layer that knows where one points, so it refuses a laundered spelling
   * for every consumer above it; the policy is injected because the core never
   * imports the registry.
   */
  public constructor(basePath: string, options?: { readonly policy?: PathPolicy }) {
    super();
    this._base = path.resolve(basePath);
    this._policy = options?.policy;
    entryObservers.set(this, createEntryObserver({ root: this._base, policy: this._policy }));
    boundedReads.set(this, async (rooted, maximumBytes) => this._readBounded(rooted, maximumBytes));
    boundedListings.set(this, async (rooted, limits) => this._listBounded(rooted, limits));
    entryKinds.set(this, async (rooted) => {
      const stats = await this._lstatOrUndefined(await this._resolve(rooted));
      if (stats === undefined) {
        return 'absent';
      }
      if (stats.isSymbolicLink()) {
        return 'symlink';
      }
      if (stats.isDirectory()) {
        return 'directory';
      }
      if (stats.isFile()) {
        return 'file';
      }
      throw this._errno('EOPNOTSUPP', 'special entry is not a regular file', rooted);
    });
    authorityCheckedWrites.set(this, async (input, assertCurrent) => this.#writeFileChecked(input, assertCurrent));
    authorityCheckedDeletes.set(this, async (input, assertCurrent) => this.#deleteFileChecked(input, assertCurrent));
    watchClosures.set(this, { pending: new Set(), admissions: new Set(), failures: [] });
  }

  /**
   * Backend identifier carrying the physical root.
   * @returns `node:<absolute host path>`.
   */
  public get id(): string {
    return `node:${this._base}`;
  }

  /** Absolute host directory this provider is rooted at. @returns The root path. */
  public get root(): string {
    return this._base;
  }

  /**
   * Canonical root, resolved once and only when an operation needs it — an
   * eager `realpath` in the constructor becomes an unhandled rejection when a
   * provider outlives its directory without ever being used.
   */
  private get _realBase(): Promise<string> {
    this._realBaseCache ??= fs.realpath(this._base);
    return this._realBaseCache;
  }

  public async writeFile(path_: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._assertRootedPath(path_);
    if (path_ === '') {
      throw this._eisdir(path_);
    }
    const target = await this._resolve(path_, 'mutate');
    const existingEntry = await this._lstatOrUndefined(target);
    if (existingEntry?.isDirectory() === true) {
      throw this._eisdir(path_);
    }
    // Every other provider creates missing parents on write; `fromNodeFs` waives it.
    await fs.mkdir(path.dirname(target), { recursive: true });
    await this._atomicWrite(path_, target, {
      data: typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data),
    });
  }

  /** Direct providers do not own the cross-client authority needed for checked replacement. */
  public async writeFileChecked(_input: CheckedFileWrite): Promise<CheckedFileWriteResult> {
    throw Object.assign(new Error('Checked writes require a node filesystem authority owner.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
    });
  }

  /** Direct providers do not own the cross-client authority needed for checked deletion. */
  public async deleteFileChecked(_input: {
    path: string;
    preconditions: readonly FileWritePrecondition[];
  }): Promise<CheckedFileWriteResult> {
    throw Object.assign(new Error('Checked deletes require a node filesystem authority owner.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
    });
  }

  public async readdir(path_: string): Promise<string[]> {
    const entries = await this._admittedDirectoryEntries(path_);
    return entries.map(({ name }) => name);
  }

  /**
   * List child kinds directly from native directory entries. Only symlinks and
   * entries whose native kind is unknown require a confined target stat.
   *
   * @param path_ - Root-relative directory path.
   * @returns Admitted children with file or directory kinds.
   */
  public async readdirEntries(path_: string): Promise<DirectoryEntry[]> {
    const entries = await this._admittedDirectoryEntries(path_);
    return mapConcurrent(entries, statConcurrency, async (entry): Promise<DirectoryEntry> => {
      if (entry.isDirectory()) {
        return { name: entry.name, kind: 'dir' };
      }
      if (entry.isFile()) {
        return { name: entry.name, kind: 'file' };
      }
      const target = await this._resolve(joinRooted(path_, entry.name));
      const stats = await fs.stat(target);
      return { name: entry.name, kind: stats.isDirectory() ? 'dir' : 'file' };
    });
  }

  /**
   * Batched readdir + stat, so a cold index build pays one call per directory
   * instead of one per file — the whole saving on the port client, where each of
   * those was a round trip.
   *
   * Composed from this provider's own two primitives on purpose: the listing
   * keeps its temp-file and laundered-link refusals, each row keeps the stat
   * `_resolve` and the content sniff would have given it, and the answer is
   * `readdir` + `stat` by construction rather than by a second implementation.
   *
   * @param path_ - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public readdirWithStats(path_: string): Promise<Array<{ name: string } & FileStat>>;
  public readdirWithStats(
    path_: string,
    options: { readonly content: 'head' },
  ): Promise<Array<{ name: string } & HeadFileStat>>;
  public async readdirWithStats(
    path_: string,
    options?: { readonly content: 'head' },
  ): Promise<Array<{ name: string } & (FileStat | HeadFileStat)>> {
    const names = await this.readdir(path_);
    return mapConcurrent(names, statConcurrency, async (name) => ({
      name,
      ...(options?.content === 'head'
        ? await this._headStat(joinRooted(path_, name))
        : await this.stat(joinRooted(path_, name))),
    }));
  }

  public async stat(path_: string): Promise<FileStat>;
  public async stat(path_: string, options: FileStatOptions): Promise<FileStat | HeadFileStat>;
  public async stat(path_: string, options?: FileStatOptions): Promise<FileStat | HeadFileStat> {
    if (options?.content === 'head') {
      return this._headStat(path_);
    }
    this._assertRootedPath(path_);
    const target = await this._resolve(path_);
    const stats = await fs.stat(target);
    if (stats.isDirectory()) {
      return { type: 'dir', size: stats.size, mtimeMs: stats.mtimeMs };
    }
    return {
      type: 'file',
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ...(await this._contentMetadata(target, stats.size)),
    };
  }

  public async getFileMode(path_: string): Promise<FileMode> {
    this._assertRootedPath(path_);
    const stats = await fs.stat(await this._resolve(path_));
    if (!stats.isFile()) {
      throw this._einval(path_);
    }
    const permissions = stats.mode % 0o1000;
    const executable =
      Math.floor(permissions / 0o100) % 2 === 1 || Math.floor(permissions / 0o10) % 2 === 1 || permissions % 2 === 1;
    return executable ? '100755' : '100644';
  }

  public async setFileMode(path_: string, mode: FileMode): Promise<void> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_, 'mutate');
    const stats = await fs.stat(target);
    if (!stats.isFile()) {
      throw this._einval(path_);
    }
    await fs.chmod(target, mode === '100755' ? 0o755 : 0o644);
  }

  public async unlink(path_: string): Promise<void> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_, 'mutate');
    // MacOS answers `unlink` on a directory with EPERM; the library contract is EISDIR.
    const entry = await this._lstatOrUndefined(target);
    if (entry?.isDirectory() === true) {
      throw this._eisdir(path_);
    }
    await fs.unlink(target);
  }

  public async rmdir(path_: string): Promise<void> {
    this._assertRootedPath(path_);
    if (path_ === '') {
      // `fs.rmdir` would happily remove an empty root out from under this
      // provider. POSIX answers EINVAL for removing `.`; so does `rename` here.
      throw this._einval(path_);
    }
    await fs.rmdir(await this._resolve(path_, 'mutate'));
  }

  public async rename(from: string, to: string): Promise<void> {
    this._assertRootedPath(from);
    this._assertRootedPath(to);
    if (from === '' || to === '') {
      throw this._einval(from === '' ? from : to);
    }
    if (from === to) {
      return;
    }
    if (to.startsWith(`${from}/`)) {
      throw this._einval(to);
    }
    const [resolvedFrom, resolvedTo] = await Promise.all([this._resolve(from, 'mutate'), this._resolve(to, 'mutate')]);
    await fs.rename(resolvedFrom, resolvedTo);
  }

  /**
   * Subscribe to disk changes under this root.
   *
   * A requested path that is a directory reports its entries (its whole subtree
   * when `recursive`); a requested path that is a file — or does not exist yet —
   * reports that path. Classification is always by `stat`, never by the OS
   * `eventType`. Watcher loss and an unnameable change both emit `reset`.
   *
   * @param request - Root-relative paths and options to watch.
   * @param handler - Receives every event until the returned unsubscribe runs.
   * @returns Unsubscribe function after native observation is admitted.
   */
  public async watch(request: WatchRequest, handler: (event: NodeFsWatchEvent) => void): Promise<() => void> {
    const excludes = request.excludes ?? [];
    const paths = request.paths.map((requestedPath) => assertRootedPath(requestedPath));
    let native: NativeWatcher;
    const watchBase = realpathSync(this._base);
    const subscriptions = new Set<NativeSubscription>();
    let unsubscribed = false;
    let admitting = true;
    let admissionFailure: Error | undefined;
    type Entry = {
      rootedPath: string;
      target: string;
      directory: string;
      targetIsDirectory: boolean;
      native?: NativeSubscription;
      rearming?: Promise<void>;
    };
    const entries: Entry[] = [];

    const ignored = (rootedPath: string): boolean =>
      isExcluded(rootedPath, excludes) || inFlightTemporaryName.test(path.basename(rootedPath));
    const emit = (event: NodeFsWatchEvent): void => {
      if (unsubscribed) {
        return;
      }
      if (event.type !== 'reset' && ignored(event.path)) {
        return;
      }
      handler(event);
    };
    /* Filtered before the `stat`: a bulk change under an excluded tree must cost no syscall per event. */
    const classify = (rootedPath: string, absolute: string): void => {
      if (ignored(rootedPath)) {
        return;
      }
      try {
        emit({ type: 'change', path: rootedPath, kind: statSync(absolute).isDirectory() ? 'dir' : 'file' });
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          emit({ type: 'delete', path: rootedPath });
        }
      }
    };
    const desiredDirectory = (entry: Entry): { directory: string; targetIsDirectory: boolean } => {
      const targetIsDirectory = this._isDirectorySync(entry.target);
      let directory = targetIsDirectory ? entry.target : path.dirname(entry.target);
      while (!this._isDirectorySync(directory) && path.dirname(directory) !== directory) {
        directory = path.dirname(directory);
      }
      return { directory, targetIsDirectory };
    };
    const close = (subscription: NativeSubscription): void => {
      subscriptions.delete(subscription);
      trackWatchClosure(this, subscription.unsubscribe());
    };
    const open = async (entry: Entry): Promise<void> => {
      const { directory, targetIsDirectory } = desiredDirectory(entry);
      if (entry.native && entry.directory === directory && entry.targetIsDirectory === targetIsDirectory) {
        return;
      }
      /* Excluded subtrees of a watched directory are never watched natively, so a bulk change under one (a cache
       * rebuild, an install) neither spends inotify watches nor reaches this process at all. */
      const ignore = targetIsDirectory ? nativeIgnores(entry.rootedPath, directory, excludes) : [];
      const subscription = await native.subscribe(
        directory,
        (error, events) => {
          if (unsubscribed) {
            return;
          }
          if (error) {
            if (admitting) {
              admissionFailure =
                error instanceof Error ? error : new Error('Native watch admission failed.', { cause: error });
              return;
            }
            emit({ type: 'reset' });
            return;
          }
          const current = desiredDirectory(entry);
          if (current.directory !== entry.directory || current.targetIsDirectory !== entry.targetIsDirectory) {
            entry.rearming ??= open(entry)
              .then(
                () => {
                  emit({ type: 'reset' });
                },
                () => {
                  emit({ type: 'reset' });
                },
              )
              .finally(() => {
                entry.rearming = undefined;
              });
            trackWatchAdmission(this, entry.rearming);
          }
          for (const event of events) {
            if (!isContained(watchBase, event.path)) {
              emit({ type: 'reset' });
              continue;
            }
            if (entry.targetIsDirectory) {
              const relative = path.relative(entry.target, event.path);
              if (relative === '' || !isContained(entry.target, event.path)) {
                continue;
              }
              if (!request.recursive && relative.includes(path.sep)) {
                continue;
              }
              classify(joinRooted(entry.rootedPath, relative.split(path.sep).join('/')), event.path);
            } else if (event.path === entry.target) {
              classify(entry.rootedPath, entry.target);
            }
          }
        },
        ignore.length === 0 ? undefined : { ignore },
      );
      if (unsubscribed) {
        close(subscription);
        return;
      }
      subscriptions.add(subscription);
      const previous = entry.native;
      entry.native = subscription;
      entry.directory = directory;
      entry.targetIsDirectory = targetIsDirectory;
      if (previous) {
        close(previous);
      }
      const current = desiredDirectory(entry);
      if (current.directory !== directory || current.targetIsDirectory !== targetIsDirectory) {
        // A parent may appear while native subscribe is still starting. Keep
        // this admitted stream until its replacement is ready, then reconcile.
        await open(entry);
        emit({ type: 'reset' });
      } else if (previous && !entry.targetIsDirectory) {
        // The ancestor stream may miss leaf events before this directory is
        // observed. Reconcile the exact target once its replacement is ready.
        classify(entry.rootedPath, entry.target);
      }
    };
    const unsubscribe = (): void => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      this._openSubscriptions.delete(unsubscribe);
      for (const subscription of subscriptions) {
        close(subscription);
      }
    };
    for (const rootedPath of paths) {
      if (isExcluded(rootedPath, excludes)) {
        continue;
      }
      const target = path.resolve(watchBase, rootedPath);
      if (!isContained(watchBase, target)) {
        throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
      }
      entries.push({ rootedPath, target, directory: '', targetIsDirectory: false });
    }
    this._openSubscriptions.add(unsubscribe);
    try {
      const module = await import('@parcel/watcher');
      native = module.default;
    } catch (error) {
      unsubscribe();
      throw new Error('Node filesystem observation requires @parcel/watcher. Install it in the Node host.', {
        cause: error,
      });
    }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() may invoke unsubscribe while the module import is pending.
    if (unsubscribed) {
      throw new Error('Node filesystem observation was cancelled during admission.');
    }
    const opening = entries.map(async (entry) => open(entry));
    for (const admission of opening) {
      trackWatchAdmission(this, admission);
    }
    const admissions = await Promise.allSettled(opening);
    admitting = false;
    const failure = admissions.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure !== undefined || admissionFailure !== undefined) {
      unsubscribe();
      await drainNodeFsProviderWatchClosures(this);
      if (admissionFailure) {
        throw admissionFailure;
      }
      if (!failure) {
        throw new Error('Native watch admission failed.');
      }
      if (failure.reason instanceof Error) {
        throw failure.reason;
      }
      throw new Error('Native watch admission failed.', { cause: failure.reason });
    }
    if (!this._openSubscriptions.has(unsubscribe)) {
      throw new Error('Node filesystem observation was cancelled during admission.');
    }
    return unsubscribe;
  }

  /**
   * Digest each file here, streaming it through SHA-256 in bounded chunks, so
   * neither a body nor a whole large asset is held or shipped.
   *
   * @param paths - Root-relative file paths.
   * @returns Each path's lowercase hexadecimal SHA-256, or `'missing'` when absent.
   */
  public async hashFiles(paths: readonly string[]): Promise<Record<string, string>> {
    for (const path_ of paths) {
      this._assertRootedPath(path_);
    }
    const digestOne = async (path_: string): Promise<string> => {
      let handle: Awaited<ReturnType<typeof fs.open>>;
      try {
        handle = await fs.open(await this._resolve(path_), 'r');
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          return 'missing';
        }
        throw error;
      }
      try {
        const hash = createHash('sha256');
        const { size } = await handle.stat();
        if (size <= streamChunkSize) {
          return hash.update(await handle.readFile()).digest('hex');
        }
        const chunk = new Uint8Array(streamChunkSize);
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- one bounded chunk at a time is the point.
          const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
          if (bytesRead === 0) {
            return hash.digest('hex');
          }
          hash.update(chunk.subarray(0, bytesRead));
        }
      } finally {
        await handle.close();
      }
    };
    /* A rolling window, not chunks: one slow file must not stall the files behind it. */
    const digests: string[] = [];
    let next = 0;
    const lane = async (): Promise<void> => {
      while (next < paths.length) {
        const index = next++;
        // oxlint-disable-next-line no-await-in-loop -- each lane digests one file at a time.
        digests[index] = await digestOne(paths[index]!);
      }
    };
    await Promise.all(Array.from({ length: Math.min(hashConcurrency, paths.length) }, lane));
    return Object.fromEntries(paths.map((path_, index) => [path_, digests[index]!]));
  }

  /** Close every watcher this provider opened. */
  public override dispose(): void {
    for (const unsubscribe of this._openSubscriptions) {
      unsubscribe();
    }
  }

  /** Open and read the file only as the consumer requests bounded chunks. */
  public readFileStream(path_: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> {
    this._assertRootedPath(path_);
    validateFileReadStreamOptions(options);
    const position = options?.position ?? 0;
    const length = options?.length;
    if (length !== undefined && position > Number.MAX_SAFE_INTEGER - length) {
      throw new RangeError('position plus length must not exceed the safe integer range.');
    }
    let offset = position;
    const end = length === undefined ? Number.MAX_SAFE_INTEGER : position + length;
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let opening: Promise<Awaited<ReturnType<typeof fs.open>>> | undefined;
    let closing: Promise<void> | undefined;
    let closed = false;
    const isClosed = (): boolean => closed;
    const isAborted = (): boolean => options?.signal?.aborted === true;
    const close = async (): Promise<void> => {
      closed = true;
      options?.signal?.removeEventListener('abort', abort);
      closing ??= (async () => {
        const opened = handle ?? (await opening);
        await opened?.close();
        handle = undefined;
      })();
      await closing;
    };
    const closeAfterAbort = async (): Promise<void> => {
      try {
        await close();
        controller?.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch (error) {
        controller?.error(error);
      }
    };
    const closeAfterFailure = async (): Promise<void> => {
      try {
        await close();
      } catch {
        // Preserve the acquisition or read failure that required cleanup.
      }
    };
    let controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;
    const abort = (): void => {
      void closeAfterAbort();
    };
    return new ReadableStream(
      {
        start(controller_) {
          controller = controller_;
          options?.signal?.addEventListener('abort', abort, { once: true });
          if (options?.signal?.aborted) {
            abort();
          }
        },
        pull: async (controller) => {
          if (closed) {
            return;
          }
          if (offset >= end) {
            await close();
            controller.close();
            return;
          }
          try {
            opening ??= (async () => fs.open(await this._resolve(path_), 'r'))();
            handle ??= await opening;
            if (isClosed()) {
              return;
            }
            const requested = Math.min(streamChunkSize, end - offset);
            const chunk = new Uint8Array(requested);
            const { bytesRead } = await handle.read(chunk, 0, requested, offset);
            if (isClosed() || isAborted()) {
              return;
            }
            if (bytesRead === 0) {
              await close();
              controller.close();
              return;
            }
            offset += bytesRead;
            controller.enqueue(chunk.subarray(0, bytesRead));
          } catch (error) {
            await closeAfterFailure();
            controller.error(error);
          }
        },
        cancel: close,
      },
      { highWaterMark: 0 },
    );
  }

  protected async readFileRaw(path_: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await fs.readFile(await this._resolve(path_)));
  }

  protected async mkdirSingle(path_: string): Promise<void> {
    await fs.mkdir(await this._resolve(path_, 'mutate'));
  }

  private _isDirectorySync(absolute: string): boolean {
    try {
      return statSync(absolute).isDirectory();
    } catch {
      return false;
    }
  }

  private async _lstatOrUndefined(absolute: string): Promise<Stats | undefined> {
    try {
      return await fs.lstat(absolute);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return undefined;
      }
      throw error;
    }
  }

  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
  private async _readFileOrAbsent(path_: string, maximumBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
    try {
      return await this._readBounded(path_, maximumBytes);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return null;
      }
      throw error;
    }
  }

  private async _readBounded(rooted: string, maximumBytes: number): Promise<Uint8Array<ArrayBuffer>> {
    const handle = await fs.open(await this._resolve(rooted), boundedReadFlags);
    try {
      return await readBoundedDescriptor(handle, maximumBytes, () => undefined);
    } finally {
      await handle.close();
    }
  }

  private async _listBounded(
    rooted: string,
    limits: { maximumEntries: number; maximumBytes: number },
  ): Promise<DirectoryEntry[]> {
    const absolute = await this._resolve(rooted);
    const directory = await fs.opendir(absolute, { bufferSize: 1 });
    const entries: DirectoryEntry[] = [];
    let remaining = limits.maximumBytes;
    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        const entry = await directory.read();
        if (entry === null) {
          return entries;
        }
        if (entries.length >= limits.maximumEntries) {
          throw this._errno('EOVERFLOW', 'directory exceeds entry allowance', rooted);
        }
        remaining -= Buffer.byteLength(entry.name);
        if (remaining < 0) {
          throw this._errno('EFBIG', 'directory names exceed byte allowance', rooted);
        }
        // A link is never traversed during checked membership; its own entry must be observed explicitly.
        entries.push({ name: entry.name, kind: entry.isDirectory() ? 'dir' : 'file' });
      }
    } finally {
      await directory.close();
    }
  }

  /** Sniff the head only; read in full solely to count lines of a text file. */
  private async _contentMetadata(
    absolute: string,
    size: number,
  ): Promise<{ contentKind: 'binary' } | { contentKind: 'text'; lineCount: number }> {
    if (size === 0) {
      return { contentKind: 'text', lineCount: 1 };
    }
    const handle = await fs.open(absolute, 'r');
    try {
      const head = new Uint8Array(Math.min(size, headSniffByteLength));
      const { bytesRead } = await handle.read(head, 0, head.byteLength, 0);
      const sniffed = head.subarray(0, bytesRead);
      if (seemsBinary(sniffed)) {
        return { contentKind: 'binary' };
      }
      const bytes = size <= headSniffByteLength ? sniffed : new Uint8Array(await fs.readFile(absolute));
      return { contentKind: 'text', lineCount: countLineBytes(bytes) };
    } finally {
      await handle.close();
    }
  }

  private async _headStat(path_: string): Promise<HeadFileStat> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_);
    const stats = await fs.stat(target);
    if (stats.isDirectory()) {
      return { type: 'dir', size: stats.size, mtimeMs: stats.mtimeMs };
    }
    return {
      type: 'file',
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      contentKind: await this._headContentKind(target, stats.size),
    };
  }

  private async _headContentKind(absolute: string, size: number): Promise<'text' | 'binary'> {
    if (size === 0) {
      return 'text';
    }
    const handle = await fs.open(absolute, 'r');
    try {
      const head = new Uint8Array(Math.min(size, headSniffByteLength));
      const { bytesRead } = await handle.read(head, 0, head.byteLength, 0);
      return seemsBinary(head.subarray(0, bytesRead)) ? 'binary' : 'text';
    } finally {
      await handle.close();
    }
  }

  /** Nearest existing ancestor, so containment can be checked by `realpath`. */
  private async _nearestExistingPath(target: string): Promise<string> {
    let candidate = target;
    for (;;) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Ancestors are walked in order until one exists.
        await fs.lstat(candidate);
        return candidate;
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
        const parent = path.dirname(candidate);
        if (parent === candidate) {
          throw error;
        }
        candidate = parent;
      }
    }
  }

  /**
   * Preserve the same temporary-file and symlink admission for every listing.
   *
   * @param rootedPath - Root-relative directory path.
   * @returns Native entries that every listing may expose.
   */
  private async _admittedDirectoryEntries(rootedPath: string): Promise<Dirent[]> {
    this._assertRootedPath(rootedPath);
    const canonical = assertRootedPath(rootedPath);
    const entries = await fs.readdir(await this._resolve(rootedPath), { withFileTypes: true });
    // Atomic-write staging files may disappear before a caller can inspect them.
    const rows = entries.filter((entry) => !inFlightTemporaryName.test(entry.name));
    // Refused links must not poison the rest of the listing. Bound the probes
    // because dependency trees can contain thousands of symlinks.
    const refused = await mapConcurrent(rows, statConcurrency, async (entry) =>
      entry.isSymbolicLink() ? this._refusesLaunderedLink(canonical, entry.name) : false,
    );
    return rows.filter((_, index) => refused[index] !== true);
  }

  /**
   * Whether this directory row resolves somewhere {@link _resolve} will not serve.
   *
   * Any refusal drops the row, not only the laundered-mask one: a broken link
   * answers `ENOENT` and one pointing out of the root `PATH_OUTSIDE_ROOT`, and a
   * row a walker cannot `stat` costs it the whole listing either way (G0b-4).
   */
  private async _refusesLaunderedLink(directory: string, name: string): Promise<boolean> {
    try {
      await this._resolve(joinRooted(directory, name));
      return false;
    } catch {
      return true;
    }
  }

  private async _resolve(rootedPath: string, intent: ResolveIntent = 'read'): Promise<string> {
    const canonical = assertRootedPath(rootedPath);
    const target = path.resolve(this._base, canonical);
    if (!isContained(this._base, target)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
    }
    const [realBase, existing] = await Promise.all([this._realBase, this._nearestExistingPath(target)]);
    const real = await fs.realpath(existing);
    if (!isContained(realBase, real)) {
      throw this._enoent(rootedPath);
    }
    /*
     * A link that stays inside the root but lands on a hidden path launders the
     * mask: every layer above classifies `notes/config`, which no row can see,
     * while the bytes are `.git/config`'s. Both spellings have to answer, and
     * the real one is only knowable here. Free: the `realpath` above is the one
     * the containment check already paid for, and its nearest-existing ancestor
     * decides the whole subtree (PP2).
     *
     * Asymmetric on purpose. Only a *visible* name resolving into a hidden path
     * is refused for a read, so a consumer that reaches the control plane by its
     * own name — the revisions engine over `'working-copy'` — is untouched.
     *
     * A mutation is held to the stronger rule (Q11/3h O4): the row the bytes
     * actually land in may never grant *less* than the spelling the caller was
     * classified on. `docs/chats` is read-write, but once the backing `docs`
     * becomes a link to `.tau`, the write lands in the read-only row
     * `.tau/chats`; a hidden real path is only the extreme case of the same
     * laundering. An external, non-Tau writer is the only one who can re-point
     * the backing tree under a held claim, so this closes a TOCTOU, and it
     * closes it the way every other refusal here does: before anything moves.
     */
    if (this._policy !== undefined) {
      const spelled = this._policy.classify(canonical).agentAccess;
      if (spelled !== 'hidden') {
        const realRelative = path.relative(realBase, real).split(path.sep).join('/');
        const landed = this._policy.classify(realRelative).agentAccess;
        if (landed === 'hidden') {
          throw this._errno('ELOOP', 'refusing to follow a symbolic link into a hidden path', rootedPath);
        }
        if (intent === 'mutate' && pathAuthorityRank[landed] < pathAuthorityRank[spelled]) {
          throw this._errno(
            'ELOOP',
            'refusing to change a path whose real row grants less than its spelling',
            rootedPath,
          );
        }
      }
    }
    return target;
  }

  /** Temp file + fsync + rename, refusing to replace a symlink or a swapped parent. */
  private async _atomicWrite(
    rootedPath: string,
    targetPath: string,
    options: { data: Uint8Array<ArrayBuffer>; beforeReplace?: () => Promise<void> },
  ): Promise<void> {
    const { data, beforeReplace } = options;
    const realBase = await this._realBase;
    const admittedDirectory = await fs.realpath(path.dirname(targetPath));
    if (!isContained(realBase, admittedDirectory)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
    }
    const admittedTarget = path.join(admittedDirectory, path.basename(targetPath));
    const temporaryPath = path.join(
      admittedDirectory,
      `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const bytes = data;
    const existing = await this._lstatOrUndefined(admittedTarget);
    if (existing?.isSymbolicLink() === true) {
      throw this._errno('ELOOP', 'refusing to replace symbolic link', rootedPath);
    }
    const existingMode = existing === undefined ? undefined : existing.mode % 0o1000;

    let replaced = false;
    let failure: unknown;
    let retainedHandle: FileHandle | undefined;
    try {
      const handle = await fs.open(temporaryPath, 'wx', existingMode ?? 0o666);
      if (process.platform === 'win32') {
        retainedHandle = handle;
      }
      try {
        await handle.writeFile(bytes);
        if (existingMode !== undefined) {
          await handle.chmod(existingMode);
        }
        await handle.sync();
      } finally {
        if (retainedHandle === undefined) {
          await handle.close();
        }
      }

      const currentDirectory = await fs.realpath(path.dirname(targetPath));
      if (currentDirectory !== admittedDirectory || !isContained(realBase, currentDirectory)) {
        throw this._errno('ELOOP', 'refusing to replace a file through a changed parent', rootedPath);
      }
      const currentTarget = await this._lstatOrUndefined(admittedTarget);
      if (currentTarget?.isSymbolicLink() === true) {
        throw this._errno('ELOOP', 'refusing to replace symbolic link', rootedPath);
      }

      await beforeReplace?.();
      await fs.rename(temporaryPath, admittedTarget);
      replaced = true;
      if (retainedHandle === undefined) {
        const directoryHandle = await fs.open(admittedDirectory, 'r');
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } else {
        // Windows FlushFileBuffers commits file metadata as well as content.
        // Keep the writable handle through rename to flush the same file object,
        // without reopening a replaced path or trying to sync a read-only directory.
        // https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching
        await retainedHandle.sync();
      }

      const verification = await fs.open(admittedTarget, verificationReadFlags);
      let committed: Uint8Array<ArrayBuffer>;
      try {
        committed = await readBoundedDescriptor(verification, bytes.byteLength, () => undefined);
      } finally {
        await verification.close();
      }
      if (!bytesEqual(committed, bytes)) {
        throw this._errno('WRITE_VERIFICATION_FAILED', 'committed bytes could not be verified', rootedPath);
      }
    } catch (error) {
      failure = error;
    } finally {
      try {
        await retainedHandle?.close();
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      await fs.unlink(temporaryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && failure === undefined) {
        failure = error;
      }
    }
    if (failure !== undefined) {
      if (
        replaced &&
        !['CHECKED_WRITE_POTENTIALLY_APPLIED', 'WRITE_VERIFICATION_FAILED'].includes(
          (failure as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        throw Object.assign(new Error('Checked write may have been applied.', { cause: failure }), {
          code: 'CHECKED_WRITE_POTENTIALLY_APPLIED',
        });
      }
      throw failure instanceof Error ? failure : new Error('Filesystem write failed with a non-Error rejection.');
    }
  }

  /** Compare all expected bytes and replace one file inside the module-owned authority integration. */
  readonly #writeFileChecked: AuthorityCheckedWrite = async (input, assertCurrent) => {
    try {
      const budget = { bytes: checkedByteLimit };
      if (input.preconditions.length > 4096) {
        throw Object.assign(new Error('Checked operation exceeds its entry allowance.'), {
          code: 'EOVERFLOW',
          applicationState: 'known-not-applied',
        });
      }
      this._assertRootedPath(input.path);
      // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
      const expectedByPath = new Map<string, Uint8Array<ArrayBuffer> | null>();
      for (const precondition of input.preconditions) {
        this._assertRootedPath(precondition.path);
        spendCheckedBytes(budget, precondition.expected === null ? 0 : byteLength(precondition.expected));
        const expected =
          precondition.expected === null
            ? null
            : typeof precondition.expected === 'string'
              ? new TextEncoder().encode(precondition.expected)
              : new Uint8Array(precondition.expected);
        const previous = expectedByPath.get(precondition.path);
        if (
          expectedByPath.has(precondition.path) &&
          (previous === null ? expected !== null : expected === null || !bytesEqual(previous!, expected))
        ) {
          throw new TypeError(`Checked write aliases disagree for '${precondition.path}'.`);
        }
        expectedByPath.set(precondition.path, expected);
      }
      if (!expectedByPath.has(input.path)) {
        throw new TypeError('Checked writes require a destination precondition.');
      }
      await assertCurrent();
      spendCheckedBytes(budget, byteLength(input.data));
      const bytes = typeof input.data === 'string' ? new TextEncoder().encode(input.data) : new Uint8Array(input.data);
      const conflicts: Array<Extract<CheckedFileWriteResult, { status: 'conflict' }>['conflicts'][number]> = [];
      let unchanged = false;
      for (const [candidatePath, expected] of expectedByPath) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        const actual = await this._readFileOrAbsent(candidatePath, budget.bytes);
        spendCheckedBytes(budget, actual?.byteLength ?? 0);
        if (actual === null ? expected !== null : expected === null || !bytesEqual(actual, expected)) {
          conflicts.push({ path: candidatePath, actual });
        }
        if (candidatePath === input.path && actual !== null) {
          unchanged = bytesEqual(actual, bytes);
        }
      }
      if (conflicts.length > 0) {
        return { status: 'conflict', conflicts };
      }
      if (unchanged) {
        return { status: 'unchanged', content: bytes };
      }
      // Verification allocates at most the replacement size after publication.
      spendCheckedBytes(budget, bytes.byteLength);
      const target = await this._resolve(input.path, 'mutate');
      const existingEntry = await this._lstatOrUndefined(target);
      if (existingEntry?.isDirectory() === true) {
        throw this._eisdir(input.path);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await this._atomicWrite(input.path, target, { data: bytes, beforeReplace: assertCurrent });
      return { status: 'applied', content: bytes };
    } catch (error) {
      if ((error as { applicationState?: unknown }).applicationState !== undefined) {
        throw error;
      }
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        applicationState: ['CHECKED_WRITE_POTENTIALLY_APPLIED', 'WRITE_VERIFICATION_FAILED'].includes(
          (error as NodeJS.ErrnoException | undefined)?.code ?? '',
        )
          ? 'potentially-applied'
          : 'known-not-applied',
      });
    }
  };

  readonly #deleteFileChecked: AuthorityCheckedDelete = async (input, assertCurrent) => {
    let unlinkStarted = false;
    try {
      const budget = { bytes: checkedByteLimit };
      if (input.preconditions.length > 4096) {
        throw Object.assign(new Error('Checked operation exceeds its entry allowance.'), {
          code: 'EOVERFLOW',
          applicationState: 'known-not-applied',
        });
      }
      this._assertRootedPath(input.path);
      // oxlint-disable-next-line typescript/no-restricted-types -- absence is the checked-write sentinel.
      const expectedByPath = new Map<string, Uint8Array<ArrayBuffer> | null>();
      for (const precondition of input.preconditions) {
        this._assertRootedPath(precondition.path);
        spendCheckedBytes(budget, precondition.expected === null ? 0 : byteLength(precondition.expected));
        const expected =
          precondition.expected === null
            ? null
            : typeof precondition.expected === 'string'
              ? new TextEncoder().encode(precondition.expected)
              : new Uint8Array(precondition.expected);
        const previous = expectedByPath.get(precondition.path);
        if (
          expectedByPath.has(precondition.path) &&
          (previous === null ? expected !== null : expected === null || !bytesEqual(previous!, expected))
        ) {
          throw new TypeError(`Checked delete aliases disagree for '${precondition.path}'.`);
        }
        expectedByPath.set(precondition.path, expected);
      }
      if (!expectedByPath.has(input.path)) {
        throw new TypeError('Checked deletes require a destination precondition.');
      }
      await assertCurrent();
      const conflicts: Array<Extract<CheckedFileWriteResult, { status: 'conflict' }>['conflicts'][number]> = [];
      for (const [candidatePath, expected] of expectedByPath) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        const actual = await this._readFileOrAbsent(candidatePath, budget.bytes);
        spendCheckedBytes(budget, actual?.byteLength ?? 0);
        if (actual === null ? expected !== null : expected === null || !bytesEqual(actual, expected)) {
          conflicts.push({ path: candidatePath, actual });
        }
      }
      if (conflicts.length > 0) {
        return { status: 'conflict', conflicts };
      }
      if (expectedByPath.get(input.path) === null) {
        return { status: 'unchanged', content: new Uint8Array() };
      }
      await assertCurrent();
      unlinkStarted = true;
      await this.unlink(input.path);
      return { status: 'applied', content: new Uint8Array() };
    } catch (error) {
      if ((error as { applicationState?: unknown }).applicationState !== undefined) {
        throw error;
      }
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        applicationState: unlinkStarted ? 'potentially-applied' : 'known-not-applied',
      });
    }
  };
}

/** Execute checked replacement through the package-private Node authority integration. @internal */
export const writeNodeFileCheckedWithAuthority = async (
  provider: NodeFsProvider,
  input: Omit<CheckedFileWrite, 'signal'>,
  writer: NodeAuthorityWriter,
): Promise<CheckedFileWriteResult> => {
  const writeChecked = authorityCheckedWrites.get(provider);
  if (writeChecked === undefined) {
    throw Object.assign(new Error('Node filesystem provider has no checked-write implementation.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
    });
  }
  return writeChecked(input, async () => writer.assertCurrent());
};

/** Execute checked deletion through the package-private Node authority integration. @internal */
export const deleteNodeFileCheckedWithAuthority = async (
  provider: NodeFsProvider,
  input: { path: string; preconditions: readonly FileWritePrecondition[] },
  writer: NodeAuthorityWriter,
): Promise<CheckedFileWriteResult> => {
  const deleteChecked = authorityCheckedDeletes.get(provider);
  if (deleteChecked === undefined) {
    throw Object.assign(new Error('Node filesystem provider has no checked-delete implementation.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
    });
  }
  return deleteChecked(input, async () => writer.assertCurrent());
};

/** The provider-owned private entry primitive, never exported from the package entrypoint. @internal */
export const nodeEntryObserver = (provider: NodeFsProvider): EntryObserver => entryObservers.get(provider)!;

/** Bounded checked-operation read; ordinary provider reads retain their existing contract. @internal */
export const readNodeFileBounded = async (
  provider: NodeFsProvider,
  rooted: string,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => boundedReads.get(provider)!(rooted, maximumBytes);
/** Incremental checked-operation listing with a hard native entry bound. @internal */
export const listNodeEntriesBounded = async (
  provider: NodeFsProvider,
  rooted: string,
  limits: { maximumEntries: number; maximumBytes: number },
): Promise<DirectoryEntry[]> => boundedListings.get(provider)!(rooted, limits);
/** No-follow final kind for existing portable checked operations. @internal */
export const nodeEntryKind = async (
  provider: NodeFsProvider,
  rooted: string,
): Promise<'absent' | 'file' | 'directory' | 'symlink'> => entryKinds.get(provider)!(rooted);
