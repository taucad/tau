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
import {
  createEntryObserver,
  readBoundedDescriptor,
  readPublishedDescriptor,
} from '#backend/node/entry-observation.js';
import type { EntryObserver } from '#backend/node/entry-observation.js';
import type { FileHandle } from 'node:fs/promises';
import type { BigIntStats, Dirent, Stats } from 'node:fs';
import { constants, realpathSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CheckedFileWrite, CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { applyEntryWithPrimitives, mapRolling, runBatch } from '#backend/batch.js';
import type { BatchEntry, BatchOptions, BatchReceipt, LargeObjectWriteSource } from '#changeset.js';
import { isLargeObjectSource, isRefusal } from '#changeset.js';
import { mapConcurrent, statConcurrency } from '#concurrency.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import { headSniffByteLength, seemsBinary } from '#content-metadata.js';
import { heldDescriptorPath } from '#backend/node/import-source.js';
import { importLimits } from '#importer/limits.js';
import type {
  ContentFacts,
  DirectoryEntry,
  FileMode,
  FileReadStreamOptions,
  FileStat,
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

/**
 * Files one `hashFiles` call digests at once. Each holds a descriptor and at
 * most one bounded chunk, and the call is not nested in a tree walk, so this
 * stays far inside a default 256-descriptor limit.
 */
const hashConcurrency = 32;

/** The name `_atomicWrite` gives its temp file: `.<target>.<pid>.<uuid>.tmp`. */
const inFlightTemporaryName = /^\..+\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u;

/** The writer's pid in a temp sibling's name. */
const temporaryWriterPid = /\.(\d+)\.[\da-f-]{36}\.tmp$/u;
/** A temp sibling whose writer is gone is swept once it has been idle this long. */
const orphanedTemporaryMilliseconds = 60_000;
/** A temp sibling idle this long is swept whoever wrote it: no write stalls for a day. */
const abandonedTemporaryMilliseconds = 24 * 60 * 60 * 1000;
/** Directories one provider remembers having swept before it forgets them all and sweeps again. */
const sweptDirectoryLimit = 1024;
/** Writes one batch stages at once: each holds one descriptor while its temp sibling fills and syncs. */
const batchWriteConcurrency = 16;

/** A write's bytes: in hand, or streamed a chunk at a time. */
type WriteSource =
  | { readonly data: Uint8Array<ArrayBuffer>; readonly source?: undefined }
  | { readonly data?: undefined; readonly source: ReadableStream<Uint8Array<ArrayBuffer>> };

/** One temp+rename write between its phases, so a batch can share one directory fsync per directory (D16). */
type StagedWrite = {
  readonly rootedPath: string;
  readonly targetPath: string;
  readonly realBase: string;
  readonly admittedDirectory: string;
  readonly admittedTarget: string;
  readonly temporaryPath: string;
  /** The permission bits the file takes, or `undefined` for a new file's default. */
  readonly permissions: number | undefined;
  data?: Uint8Array<ArrayBuffer>;
  streamed?: Readonly<{ size: number; sha256: string }>;
  /** A clone of a stored large object, hashed through its own handle before the rename: that handle's identity, which the published entry is checked against instead of a second read. */
  cloned?: Readonly<{ dev: bigint; ino: bigint }>;
  retainedHandle?: FileHandle;
  written?: BigIntStats;
  /** Set once the rename is attempted: a rename that throws may still have published (rename-then-throw). */
  renaming?: boolean;
  replaced: boolean;
};

type BatchWrite = Extract<BatchEntry, { op: 'write' }>;

/** Fill one write's temp sibling some other way than from bytes: what it returns joins the write's receipt. */
type BatchWriteFill = (staged: StagedWrite) => Promise<Readonly<Record<string, unknown>> | undefined>;

/**
 * One file a host-side import copies into this root (W7.4). `open` opens the
 * source the host resolved from a person's grant and proved inside it, when
 * the copy's turn comes, so a batch holds one source descriptor per write in
 * flight; no client ever names it (I6).
 *
 * @public
 */
export type ImportFileCopy = Readonly<{ path: string; size: number; open: () => Promise<FileHandle> }>;

/**
 * The facts of one copied file, measured from the one read of what landed (EQ6, I2).
 *
 * @public
 */
export type ImportCopyFacts = ContentFacts & Readonly<{ blobOid: string; sha256: string }>;

/**
 * One copy's receipt: a batch receipt, and the facts of the bytes it landed when it applied.
 *
 * @public
 */
export type ImportCopyReceipt = BatchReceipt & Readonly<{ facts?: ImportCopyFacts }>;

const noBytes = new Uint8Array(0);

/* A copy streamed from a held descriptor into a new file: where no path reopens the descriptor's inode. */
const copyFromDescriptor = async (source: FileHandle, target: string, size: number): Promise<void> => {
  const out = await fs.open(target, 'wx', 0o600);
  try {
    const chunk = new Uint8Array(streamChunkSize);
    for (let position = 0; position <= size; ) {
      // oxlint-disable-next-line no-await-in-loop -- a file is copied one chunk after another.
      const { bytesRead } = await source.read(chunk, 0, chunk.byteLength, position);
      if (bytesRead === 0) {
        break;
      }
      for (let written = 0; written < bytesRead; ) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        const { bytesWritten } = await out.write(chunk, written, bytesRead - written, position + written);
        written += bytesWritten;
      }
      position += bytesRead;
    }
  } finally {
    await out.close();
  }
};

/*
 * The facts of a landed file, read once in bounded chunks: the git blob id and
 * SHA-256 hashed as it is read, the content kind sniffed from its head as
 * `getFileContentMetadata` sniffs it, and its lines counted the same way.
 * `undefined` when it does not hold exactly `size` bytes.
 */
const measureLanded = async (handle: FileHandle, size: number): Promise<ImportCopyFacts | undefined> => {
  const blob = createHash('sha1').update(`blob ${String(size)}\0`);
  const digest = createHash('sha256');
  const chunk = new Uint8Array(streamChunkSize);
  const head = new Uint8Array(Math.min(headSniffByteLength, size));
  let lines = 1;
  let position = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a file is read one chunk after another.
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, position);
    if (bytesRead === 0) {
      break;
    }
    const part = chunk.subarray(0, bytesRead);
    if (position + bytesRead > size) {
      return undefined;
    }
    if (position < head.byteLength) {
      head.set(part.subarray(0, head.byteLength - position), position);
    }
    blob.update(part);
    digest.update(part);
    for (let at = part.indexOf(0x0a); at !== -1; at = part.indexOf(0x0a, at + 1)) {
      lines += 1;
    }
    position += bytesRead;
  }
  if (position !== size) {
    return undefined;
  }
  const kind: ContentFacts = seemsBinary(head) ? { contentKind: 'binary' } : { contentKind: 'text', lineCount: lines };
  return { ...kind, blobOid: blob.digest('hex'), sha256: digest.digest('hex') };
};

/** One native event a watch callback admitted, or a whole-subscription reset, in arrival order. */
type ObservedEvent = Readonly<{ rootedPath: string; absolute: string; deleted: boolean }> | 'reset';

/* The directories a recursive `mkdir` made, deepest first, each removed only while it is empty. */
const removeCreatedParents = async ({ first, last }: Readonly<{ first: string; last: string }>): Promise<void> => {
  for (let directory: string | undefined = last; directory !== undefined; ) {
    // oxlint-disable-next-line no-await-in-loop -- a parent is removed after its child.
    const removed: boolean = await fs.rmdir(directory).then(
      () => true,
      () => false,
    );
    directory = removed && directory !== first ? path.dirname(directory) : undefined;
  }
};

/* Whether a process with this pid exists: `EPERM` means it does, under another user. */
const isProcessAlive = (pid: number): boolean => {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

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

/**
 * Does `target` still hold the very entry a rename put there?
 *
 * A different entry — or none — means another writer replaced the path after our
 * rename landed, so there is nothing of ours left at it to verify.
 *
 * A volume that supplies no physical file identity reports `ino` as `0n` — the
 * same absence `acquireWindowsAuthorityWriter` refuses an authority root for.
 * Two entries cannot be told apart there, so this answers that the path is still
 * ours and the write stays answerable for it: a verification refusal is kept
 * rather than suppressed on a platform that cannot prove it was superseded.
 */
const isEntryStillAt = async (target: string, written: BigIntStats): Promise<boolean> => {
  if (written.ino <= 0n) {
    return true;
  }
  const current = await fs.lstat(target, { bigint: true }).catch(() => undefined);
  return current !== undefined && current.dev === written.dev && current.ino === written.ino;
};

/* Every chunk of a stream written at the handle's position, and the size and SHA-256 of what was written. */
const writeStreamTo = async (
  handle: FileHandle,
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Readonly<{ size: number; sha256: string }>> => {
  const digest = createHash('sha256');
  let size = 0;
  const reader = source.getReader();
  try {
    // oxlint-disable-next-line no-await-in-loop -- a stream is written one chunk after another.
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      for (let written = 0; written < read.value.byteLength; ) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        const { bytesWritten } = await handle.write(
          read.value,
          written,
          read.value.byteLength - written,
          size + written,
        );
        written += bytesWritten;
      }
      digest.update(read.value);
      size += read.value.byteLength;
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }
  return { size, sha256: digest.digest('hex') };
};

/* Whether the published file is exactly `size` bytes hashing to `sha256`, read one chunk at a time. */
const publishedDigestEquals = async (
  handle: FileHandle,
  expected: Readonly<{ size: number; sha256: string }>,
): Promise<boolean> => {
  const digest = createHash('sha256');
  const chunk = Buffer.alloc(streamChunkSize);
  let size = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a file is read one chunk after another.
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, size);
    if (bytesRead === 0) {
      break;
    }
    digest.update(chunk.subarray(0, bytesRead));
    size += bytesRead;
    if (size > expected.size) {
      return false;
    }
  }
  return size === expected.size && digest.digest('hex') === expected.sha256;
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
/*
 * @parcel/watcher keeps one native backend per process and tears it down, on a libuv pool thread, when its last
 * subscription closes. A `subscribe` sent while that close is still queued or running takes the same backend, binds to
 * it after the close dropped it, and resolves: a watch admitted on a destroyed backend, never told of anything again.
 * So each native subscribe and unsubscribe of this isolate starts only once the one before it settled.
 * ponytail: the order is per isolate, so a watch opened from another worker thread of the process is not covered.
 */
let nativeLifecycle: Promise<void> = Promise.resolve();
const serializeNative = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previous = nativeLifecycle;
  const settled = Promise.withResolvers<void>();
  nativeLifecycle = settled.promise;
  try {
    await previous;
    return await operation();
  } finally {
    settled.resolve();
  }
};
const serializedWatcher = (watcher: NativeWatcher): NativeWatcher => ({
  subscribe: async (directory, handler, options) => {
    const subscription = await serializeNative(async () => watcher.subscribe(directory, handler, options));
    return { unsubscribe: async () => serializeNative(async () => subscription.unsubscribe()) };
  },
});
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
/* Head metadata from one stat: kind, size and time, never content (I3). */
const headStat = (stats: Stats): FileStat =>
  stats.isDirectory()
    ? { type: 'dir', size: stats.size, mtimeMs: stats.mtimeMs }
    : { type: 'file', size: stats.size, mtimeMs: stats.mtimeMs };

/* What a watched path holds now, by one asynchronous `stat`; `undefined` when it cannot be told. */
const entryKindAt = async (absolute: string): Promise<'file' | 'dir' | 'absent' | undefined> => {
  try {
    const stats = await fs.stat(absolute);
    return stats.isDirectory() ? 'dir' : 'file';
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'absent' : undefined;
  }
};

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
  public readonly capabilities: ProviderCapabilities;

  private readonly _base: string;
  private readonly _policy: PathPolicy | undefined;
  private readonly _largeObjectStore: (() => string | undefined) | undefined;
  private _realBaseCache: Promise<string> | undefined;

  private readonly _openSubscriptions = new Set<() => void>();
  /** Directories whose crashed temp siblings this provider has swept. */
  private readonly _sweptDirectories = new Set<string>();

  /**
   * @param basePath - Host directory mapped to this provider's root. It must
   * already exist; the caller (the host) creates it.
   * @param options - The reserved layout an ordinary name may not resolve into
   * (D6, G0-6). This backend is the only one that can hold a symlink and the
   * only layer that knows where one points, so it refuses a laundered spelling
   * for every consumer above it; the policy is injected because the core never
   * imports the registry. `largeObjectStore` is the repository's LFS object
   * directory this root's large objects come from (EQ13): given, a write may
   * name an object by its id and it is cloned from there. A function is asked
   * per write, so an authority that admits and releases roots answers for now.
   */
  public constructor(
    basePath: string,
    options?: {
      readonly policy?: PathPolicy;
      readonly largeObjectStore?: string | (() => string | undefined);
    },
  ) {
    super();
    this._base = path.resolve(basePath);
    this._policy = options?.policy;
    const store = options?.largeObjectStore;
    this._largeObjectStore = typeof store === 'string' ? () => store : store;
    this.capabilities = {
      persistent: true,
      writable: true,
      quotaBased: false,
      durability: 'transactional-rewrite',
      trustworthyMtime: true,
      externallyEdited: true,
      streamsWrites: true,
      movesInPlace: true,
      ...(store === undefined ? {} : { largeObjectSources: true }),
    };
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

  /**
   * Write `path` from a stream (W6.3): each chunk goes to the same temp
   * sibling `writeFile` uses, which is synced and renamed over the path only
   * once the stream ends, and the published entry is verified by its SHA-256
   * read back in chunks. Never more than a chunk is held.
   *
   * @param path_ - Rooted file path to write.
   * @param source - The file's bytes, in order.
   */
  public override async writeFileStream(path_: string, source: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<void> {
    let created: Readonly<{ first: string; last: string }> | undefined;
    try {
      this._assertRootedPath(path_);
      if (path_ === '') {
        throw this._eisdir(path_);
      }
      const target = await this._resolve(path_, 'mutate');
      const existingEntry = await this._lstatOrUndefined(target);
      if (existingEntry?.isDirectory() === true) {
        throw this._eisdir(path_);
      }
      const first = await fs.mkdir(path.dirname(target), { recursive: true });
      created = first === undefined ? undefined : { first, last: path.dirname(target) };
      await this._atomicWrite(path_, target, { source });
    } catch (error) {
      /* Harmless once the stream was read or cancelled: a locked or closed stream refuses. */
      await source.cancel(error).catch(() => undefined);
      if (created !== undefined) {
        await removeCreatedParents(created);
      }
      throw error;
    }
  }

  /**
   * Apply one changeset phase on disk (D16). Every write is staged to its temp
   * sibling and fsynced, a rolling window at a time; the synced siblings are
   * renamed over their targets; and each directory the renames landed in is
   * fsynced once, so a phase costs at most one fsync per file plus one per
   * directory rather than two per file. Each write is then read back once (I2),
   * and only then reported `applied`: no receipt claims an entry that is not
   * durable (I1). Other entries run through the primitives beside the writes;
   * the pipeline admitted that no two entries touch one path.
   *
   * @param entries - One phase's entries, in provider paths.
   * @param options - The changeset's abort signal: no entry starts after it aborts.
   * @returns One receipt per entry, in entry order.
   */
  public override async applyBatch(entries: readonly BatchEntry[], options?: BatchOptions): Promise<BatchReceipt[]> {
    const receipts = Array.from<BatchReceipt>({ length: entries.length });
    const writes: Array<Readonly<{ index: number; entry: BatchWrite }>> = [];
    const others: number[] = [];
    for (const [index, entry] of entries.entries()) {
      if (entry.op === 'write') {
        writes.push({ index, entry });
      } else {
        others.push(index);
      }
    }
    const otherEntries = others.map((index) => entries[index]!);
    await Promise.all([
      this._applyBatchWrites(writes, receipts, options?.signal),
      runBatch(otherEntries, async (entry) => applyEntryWithPrimitives(this, entry), options).then((settled) => {
        for (const [position, receipt] of settled.entries()) {
          receipts[others[position]!] = receipt;
        }
      }),
    ]);
    return receipts;
  }

  /**
   * Copy files a person chose on this host into the root, host-side (W7.4,
   * D12): each lands as a batch write does — a temp sibling filled, synced,
   * renamed, one fsync per directory — but filled by `copyFile` with
   * `COPYFILE_FICLONE` from its source instead of from bytes that crossed a
   * port, so the file shares its source's extents where the file system can
   * clone and is copied once where it cannot. The sibling is then read once,
   * before its rename, for the git blob id, SHA-256 and content kind the
   * receipt carries (EQ6, I2): a source that is not a regular file, or whose
   * size is not the one it was listed at, fails with its target untouched (I1).
   * Modes are not carried: a browser folder import has none, and the import
   * is the same tree either way.
   *
   * @param copies - The files, each with the source the host resolved for it.
   * @param options - Stops copies that have not started.
   * @returns One receipt per copy, in order, with the landed bytes' facts when applied.
   */
  public async copyImportFiles(
    copies: readonly ImportFileCopy[],
    options?: BatchOptions,
  ): Promise<ImportCopyReceipt[]> {
    const receipts = Array.from<ImportCopyReceipt>({ length: copies.length });
    await this._applyBatchWrites(
      copies.map((copy, index) => ({
        index,
        entry: { op: 'write', path: copy.path, data: noBytes },
        fill: async (staged) => ({ facts: await this._copyTemporary(staged, copy) }),
      })),
      receipts,
      options?.signal,
    );
    return receipts;
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
   * The answer is `readdir` + `stat`: the listing keeps its temp-file and
   * laundered-link refusals, and a row that is a link, or whose kind the
   * directory did not report, is stat'ed through `_resolve` exactly as `stat`
   * would. Every other row costs one `lstat` (D16): when the directory's real
   * path is its spelled one, a regular child's real path is its spelled one
   * too, so the containment and mask checks `_resolve` would repeat per row are
   * already answered by the directory's. This listing is what the Project
   * Index's head compare walks, so its per-row cost is that compare's cost.
   *
   * @param path_ - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path_: string): Promise<Array<{ name: string } & FileStat>> {
    const entries = await this._admittedDirectoryEntries(path_);
    const canonical = assertRootedPath(path_);
    const directory = path.resolve(this._base, canonical);
    const [realBase, realDirectory] = await Promise.all([this._realBase, fs.realpath(directory)]);
    const direct = realDirectory === path.resolve(realBase, canonical);
    return mapConcurrent(entries, statConcurrency, async (entry) => {
      const rooted = joinRooted(canonical, entry.name);
      if (direct && (entry.isFile() || entry.isDirectory())) {
        const stats = await fs.lstat(path.join(directory, entry.name));
        if (!stats.isSymbolicLink()) {
          return { name: entry.name, ...headStat(stats) };
        }
      }
      return { name: entry.name, ...(await this.stat(rooted)) };
    });
  }

  /** Head metadata from `fs.stat` alone; no content is opened (I3). */
  public async stat(path_: string): Promise<FileStat> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_);
    return headStat(await fs.stat(target));
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
    let classifying: Promise<void> = Promise.resolve();
    /*
     * A handler that throws loses its event, never the stream (D16). What it
     * lost leaves the consumer stale, so a reset is owed: retried once, in
     * order, after what is already queued, and, if that throws too, delivered
     * ahead of the next event, until one lands.
     */
    let owedReset = false;
    let retryingReset = false;
    const deliver = (event: NodeFsWatchEvent): boolean => {
      try {
        handler(event);
        return true;
      } catch (error) {
        console.error('[filesystem] A watch handler threw; a reset follows so its consumer resyncs.', error);
        return false;
      }
    };
    const emit = (event: NodeFsWatchEvent): void => {
      if (unsubscribed) {
        return;
      }
      if (event.type !== 'reset' && ignored(event.path)) {
        return;
      }
      if (owedReset && event.type !== 'reset') {
        owedReset = !deliver({ type: 'reset' });
      }
      if (deliver(event)) {
        if (event.type === 'reset') {
          owedReset = false;
        }
        return;
      }
      owedReset = true;
      if (retryingReset) {
        return;
      }
      retryingReset = true;
      const previous = classifying;
      classifying = (async (): Promise<void> => {
        await previous;
        retryingReset = false;
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- an event delivered meanwhile may have paid it.
        if (owedReset) {
          retryingReset = true;
          emit({ type: 'reset' });
          retryingReset = false;
        }
      })();
      trackWatchAdmission(this, classifying);
    };
    /*
     * Classified off the event loop (D16): a native callback's events are
     * filtered first, so a bulk change under an excluded tree costs no syscall;
     * a native `delete` is trusted as it stands, since the watcher reports a
     * path's final state for the callback; and each create or update learns its
     * kind from one asynchronous `stat`, never a synchronous one per event.
     * Callbacks emit in the order they arrived, each as one run of events.
     */
    const classify = (batch: readonly ObservedEvent[]): void => {
      const admitted = batch.filter((event) => event === 'reset' || !ignored(event.rootedPath));
      if (admitted.length === 0) {
        return;
      }
      const kinds = mapConcurrent(admitted, statConcurrency, async (event) =>
        event === 'reset' ? 'reset' : event.deleted ? 'absent' : entryKindAt(event.absolute),
      );
      const previous = classifying;
      classifying = (async (): Promise<void> => {
        await previous;
        /* `entryKindAt` answers every failure as a kind and `emit` keeps a handler's throw, so no run rejects. */
        const resolved = await kinds;
        for (const [index, event] of admitted.entries()) {
          const kind = resolved[index];
          if (event === 'reset') {
            emit({ type: 'reset' });
            continue;
          }
          const { rootedPath } = event;
          if (kind === 'absent') {
            emit({ type: 'delete', path: rootedPath });
          } else if (kind === 'file' || kind === 'dir') {
            emit({ type: 'change', path: rootedPath, kind });
          } else {
            /* A change whose kind a failed `stat` cannot tell is unnameable: the consumer resyncs. */
            emit({ type: 'reset' });
          }
        }
      })();
      trackWatchAdmission(this, classifying);
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
            /* After any reconciliation the rearm classified, in order. */
            entry.rearming ??= open(entry)
              .then(
                () => {
                  classify(['reset']);
                },
                () => {
                  classify(['reset']);
                },
              )
              .finally(() => {
                entry.rearming = undefined;
              });
            trackWatchAdmission(this, entry.rearming);
          }
          const batch: ObservedEvent[] = [];
          for (const event of events) {
            if (!isContained(watchBase, event.path)) {
              batch.push('reset');
              continue;
            }
            const deleted = event.type === 'delete';
            if (entry.targetIsDirectory) {
              const relative = path.relative(entry.target, event.path);
              if (relative === '' || !isContained(entry.target, event.path)) {
                continue;
              }
              if (!request.recursive && relative.includes(path.sep)) {
                continue;
              }
              batch.push({
                rootedPath: joinRooted(entry.rootedPath, relative.split(path.sep).join('/')),
                absolute: event.path,
                deleted,
              });
            } else if (event.path === entry.target) {
              batch.push({ rootedPath: entry.rootedPath, absolute: entry.target, deleted });
            }
          }
          classify(batch);
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
        classify(['reset']);
      } else if (previous && !entry.targetIsDirectory) {
        // The ancestor stream may miss leaf events before this directory is
        // observed. Reconcile the exact target once its replacement is ready.
        classify([{ rootedPath: entry.rootedPath, absolute: entry.target, deleted: false }]);
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
      native = serializedWatcher(module.default);
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
    /* What admission reconciled is delivered before the watch is acknowledged; no run rejects (`emit` keeps a throw). */
    await classifying;
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

  /**
   * Remove the temp siblings a crashed write left in one directory, the first
   * time this provider writes there (W6.3). A sibling goes when its writer's
   * process is gone and it has not been written for a minute, or when it has
   * not been written for a day whoever wrote it; one still being written is
   * touched by every chunk, so it stays. Failures are ignored: the next
   * provider to write there tries again.
   *
   * @param directory - The admitted real directory a write is about to use.
   */
  private async _sweepTemporarySiblings(directory: string): Promise<void> {
    if (this._sweptDirectories.has(directory)) {
      return;
    }
    if (this._sweptDirectories.size >= sweptDirectoryLimit) {
      this._sweptDirectories.clear();
    }
    this._sweptDirectories.add(directory);
    const names = await fs.readdir(directory).catch((): string[] => []);
    const now = Date.now();
    await Promise.all(
      names
        .filter((name) => inFlightTemporaryName.test(name))
        .map(async (name) => {
          const entry = path.join(directory, name);
          const stats = await fs.lstat(entry).catch(() => undefined);
          if (stats?.isFile() !== true) {
            return;
          }
          const idle = now - stats.mtimeMs;
          const pid = Number(temporaryWriterPid.exec(name)?.[1]);
          if (
            idle > abandonedTemporaryMilliseconds ||
            (idle > orphanedTemporaryMilliseconds && pid !== process.pid && !isProcessAlive(pid))
          ) {
            await fs.unlink(entry).catch(() => undefined);
          }
        }),
    );
  }

  /**
   * The write half of {@link applyBatch}: stage, rename, one fsync per
   * directory, read back. A refusal is `failed`, and so is a write that fails
   * before its rename is attempted (its target is untouched) unless it had
   * already made a parent directory; any other failure is `uncertain`.
   *
   * @param writes - The batch's writes with their entry indexes.
   * @param receipts - Filled in at each write's index.
   * @param signal - Stops writes that have not started staging.
   */
  private async _applyBatchWrites(
    writes: ReadonlyArray<Readonly<{ index: number; entry: BatchWrite; fill?: BatchWriteFill }>>,
    receipts: BatchReceipt[],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    type Pending = {
      index: number;
      entry: BatchWrite;
      staged: StagedWrite;
      madeParent: boolean;
      failure?: unknown;
      extra?: Readonly<Record<string, unknown>>;
    };
    /* The primitive batch's rule (`batch.ts`): a refusal is `failed`, and so is any failure before anything moved;
     * once a parent was made or a rename attempted, anything else is `uncertain`. */
    const refuse = (index: number, error: unknown, moved: boolean): void => {
      receipts[index] = { outcome: moved && !isRefusal(error) ? 'uncertain' : 'failed', error };
    };
    const staged = await mapRolling(writes, batchWriteConcurrency, async ({ index, entry, fill }) => {
      if (signal?.aborted === true) {
        refuse(index, signal.reason, false);
        return undefined;
      }
      let madeParent = false;
      let prepared: StagedWrite | undefined;
      try {
        this._assertRootedPath(entry.path);
        if (entry.path === '') {
          throw this._eisdir(entry.path);
        }
        const target = await this._resolve(entry.path, 'mutate');
        const existing = await this._lstatOrUndefined(target);
        if (existing?.isDirectory() === true) {
          throw this._eisdir(entry.path);
        }
        if (entry.create === true && existing !== undefined) {
          throw this._errno('EEXIST', 'file already exists', entry.path);
        }
        madeParent = (await fs.mkdir(path.dirname(target), { recursive: true })) !== undefined;
        prepared = await this._prepareWrite(entry.path, target, entry.mode);
        let extra: Readonly<Record<string, unknown>> | undefined;
        if (fill !== undefined) {
          extra = await fill(prepared);
        } else if (isLargeObjectSource(entry.data)) {
          await this._cloneTemporary(prepared, entry.data);
        } else {
          await this._fillTemporary(
            prepared,
            entry.data instanceof Uint8Array ? { data: entry.data } : { source: entry.data.stream() },
          );
        }
        const write: Pending = {
          index,
          entry,
          staged: prepared,
          madeParent,
          ...(extra === undefined ? {} : { extra }),
        };
        return write;
      } catch (error) {
        let failure = error;
        if (prepared !== undefined) {
          try {
            await this._settleWrite(prepared, error);
          } catch (settleError) {
            failure = settleError;
          }
        }
        refuse(index, failure, madeParent);
        return undefined;
      }
    });
    const pending = staged.filter((write): write is Pending => write !== undefined);
    await mapRolling(pending, batchWriteConcurrency, async (write) => {
      try {
        await this._publishTemporary(write.staged);
      } catch (error) {
        write.failure = error;
      }
    });
    /* One fsync per directory the renames landed in, whatever number of files each holds. */
    const byDirectory = new Map<string, Pending[]>();
    for (const write of pending) {
      if (write.failure === undefined) {
        const group = byDirectory.get(write.staged.admittedDirectory) ?? [];
        group.push(write);
        byDirectory.set(write.staged.admittedDirectory, group);
      }
    }
    await mapRolling([...byDirectory], batchWriteConcurrency, async ([directory, group]) => {
      try {
        await this._syncPublished(
          directory,
          group.map(({ staged: published }) => published),
        );
      } catch (error) {
        for (const write of group) {
          write.failure = error;
        }
      }
    });
    await mapRolling(pending, batchWriteConcurrency, async (write) => {
      if (write.failure === undefined) {
        try {
          await this._verifyPublished(write.staged);
        } catch (error) {
          write.failure = error;
        }
      }
      try {
        await this._settleWrite(write.staged, write.failure);
        receipts[write.index] = {
          outcome: 'applied',
          kind: 'file',
          ...(write.entry.create === true ? { created: true } : {}),
          /* Verified by the one hash of the sibling before its rename (I2). */
          ...(isLargeObjectSource(write.entry.data)
            ? { largeObject: { largeObject: write.entry.data.largeObject, size: write.entry.data.size } }
            : {}),
          ...write.extra,
        };
      } catch (error) {
        refuse(write.index, error, write.madeParent || write.staged.renaming === true);
      }
    });
  }

  /** Temp file + fsync + rename, refusing to replace a symlink or a swapped parent. */
  private async _atomicWrite(
    rootedPath: string,
    targetPath: string,
    options: WriteSource & { beforeReplace?: () => Promise<void> },
  ): Promise<void> {
    const staged = await this._prepareWrite(rootedPath, targetPath, undefined);
    let failure: unknown;
    try {
      await this._fillTemporary(staged, options);
      await this._publishTemporary(staged, options.beforeReplace);
      await this._syncPublished(staged.admittedDirectory, [staged]);
      await this._verifyPublished(staged);
    } catch (error) {
      failure = error;
    }
    await this._settleWrite(staged, failure);
  }

  /**
   * Admit one write's directory and name its temp sibling; nothing is created yet.
   *
   * @param rootedPath - The rooted path being written, for errors.
   * @param targetPath - Its resolved absolute path, whose parent exists.
   * @param mode - The mode the file takes, or `undefined` to keep the existing file's.
   * @returns The staged write, with no file opened.
   */
  private async _prepareWrite(
    rootedPath: string,
    targetPath: string,
    mode: FileMode | undefined,
  ): Promise<StagedWrite> {
    const realBase = await this._realBase;
    const admittedDirectory = await fs.realpath(path.dirname(targetPath));
    if (!isContained(realBase, admittedDirectory)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
    }
    await this._sweepTemporarySiblings(admittedDirectory);
    const admittedTarget = path.join(admittedDirectory, path.basename(targetPath));
    const temporaryPath = path.join(
      admittedDirectory,
      `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const existing = await this._lstatOrUndefined(admittedTarget);
    if (existing?.isSymbolicLink() === true) {
      throw this._errno('ELOOP', 'refusing to replace symbolic link', rootedPath);
    }
    const permissions =
      mode === undefined
        ? existing === undefined
          ? undefined
          : existing.mode % 0o1000
        : mode === '100755'
          ? 0o755
          : 0o644;
    return {
      rootedPath,
      targetPath,
      realBase,
      admittedDirectory,
      admittedTarget,
      temporaryPath,
      permissions,
      replaced: false,
    };
  }

  /**
   * Write the temp sibling and fsync it: the one file fsync a write pays.
   *
   * @param staged - The prepared write.
   * @param source - Its bytes, in hand or streamed.
   */
  private async _fillTemporary(staged: StagedWrite, source: WriteSource): Promise<void> {
    const { permissions } = staged;
    const handle = await fs.open(staged.temporaryPath, 'wx', permissions ?? 0o666);
    if (process.platform === 'win32') {
      staged.retainedHandle = handle;
    }
    try {
      if (source.data === undefined) {
        staged.streamed = await writeStreamTo(handle, source.source);
      } else {
        staged.data = source.data;
        await handle.writeFile(source.data);
      }
      if (permissions !== undefined) {
        await handle.chmod(permissions);
      }
      await handle.sync();
    } finally {
      if (staged.retainedHandle === undefined) {
        await handle.close();
      }
    }
  }

  /**
   * Fill the temp sibling from the repository's large-object store (EQ13):
   * `copyFile` with `COPYFILE_FICLONE`, so the file shares the object's extents
   * where the file system can clone (APFS, btrfs, XFS) and is copied where it
   * cannot, then the sibling's mode, one fsync, and one hash through the
   * sibling's own handle before anything is renamed (I2): a corrupt object
   * fails the write as a refusal, its sibling removed and the target as it
   * was. The store is the authority's, resolved here by the object's id: no
   * `.git` path is ever named by the caller (I6).
   *
   * @param staged - The prepared write.
   * @param source - The object's id and size.
   */
  private async _cloneTemporary(staged: StagedWrite, source: LargeObjectWriteSource): Promise<void> {
    const store = this._largeObjectStore?.();
    if (store === undefined) {
      throw this._errno('EINVAL', 'this root has no large-object store', staged.rootedPath);
    }
    if (!/^[\da-f]{64}$/u.test(source.largeObject) || !Number.isSafeInteger(source.size) || source.size < 0) {
      throw this._errno('EINVAL', 'not a large-object id and size', staged.rootedPath);
    }
    const object = path.join(store, source.largeObject.slice(0, 2), source.largeObject.slice(2, 4), source.largeObject);
    const stored = await fs.stat(object).catch((error: unknown) => {
      throw (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? this._errno('ENOENT', 'the large object is not in the store', staged.rootedPath)
        : error;
    });
    if (!stored.isFile() || stored.size !== source.size) {
      throw this._errno('EINVAL', 'the stored large object is not the size its pointer names', staged.rootedPath);
    }
    /* A copy takes the object's mode, which Git LFS stores read-only: the file
     * takes its own, or the mode a new file gets under the process's umask,
     * read from the sibling's own name created as `_fillTemporary` creates a
     * file (Node offers no race-free way to read the umask itself). */
    const permissions = staged.permissions ?? (await this._newFileMode(staged.temporaryPath));
    /* EXCL: the sibling is this write's own name. FICLONE: share extents where the file system can, else copy. */
    // oxlint-disable-next-line eslint/no-bitwise -- copy flags are a bit set.
    await fs.copyFile(object, staged.temporaryPath, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    /* Before it is opened for writing: a read-only copy could not be. */
    await fs.chmod(staged.temporaryPath, permissions);
    const handle = await fs.open(staged.temporaryPath, 'r+');
    if (process.platform === 'win32') {
      staged.retainedHandle = handle;
    }
    try {
      await handle.sync();
      if (!(await publishedDigestEquals(handle, { size: source.size, sha256: source.largeObject }))) {
        throw this._errno('EINVAL', 'the stored large object does not hash to its id', staged.rootedPath);
      }
      const { dev, ino } = await handle.stat({ bigint: true });
      staged.cloned = { dev, ino };
    } finally {
      if (staged.retainedHandle === undefined) {
        await handle.close();
      }
    }
  }

  /**
   * Fill the temp sibling from an import's source (W7.4), only ever through
   * the descriptor the host opened and proved inside the person's grant
   * (`copy.open`): on Linux `copyFile` from `/proc/self/fd/<n>` with
   * `COPYFILE_FICLONE`, which reopens that very inode and clones where the
   * file system can; elsewhere a copy streamed from the descriptor. The source
   * must be a regular file of the listed size within the import file limit,
   * checked on the descriptor itself, and its size, mtime and ctime must be
   * unchanged once the copy is done, so a file written to meanwhile is refused
   * rather than landed torn. The sibling then takes the new-file mode, is
   * synced, and is read once in bounded chunks for the facts (I2).
   *
   * @param staged - The prepared write.
   * @param copy - How to open the source, and the size it was listed at.
   * @returns The facts of the bytes that landed.
   */
  private async _copyTemporary(staged: StagedWrite, copy: ImportFileCopy): Promise<ImportCopyFacts> {
    const changed = (): Error =>
      this._errno('ESTALE', 'the import source changed since it was listed', staged.rootedPath);
    /* The host holds its own limit: a size a client names is never trusted to bound a copy. */
    if (!Number.isSafeInteger(copy.size) || copy.size < 0 || copy.size > importLimits.maximumFileBytes) {
      throw this._errno('EFBIG', 'the import source is larger than an import file may be', staged.rootedPath);
    }
    const source = await copy.open();
    try {
      const before = await source.stat({ bigint: true });
      if (!before.isFile()) {
        throw this._errno('EOPNOTSUPP', 'the import source is not a regular file', staged.rootedPath);
      }
      if (before.size !== BigInt(copy.size)) {
        throw changed();
      }
      const permissions = staged.permissions ?? (await this._newFileMode(staged.temporaryPath));
      const through = heldDescriptorPath(source.fd);
      /* EXCL: the sibling is this write's own name. FICLONE: share extents where the file system can, else copy. */
      await (through === undefined
        ? copyFromDescriptor(source, staged.temporaryPath, copy.size)
        : // oxlint-disable-next-line eslint/no-bitwise -- copy flags are a bit set.
          fs.copyFile(through, staged.temporaryPath, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE));
      const after = await source.stat({ bigint: true });
      if (
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs
      ) {
        throw changed();
      }
      await fs.chmod(staged.temporaryPath, permissions);
    } finally {
      await source.close();
    }
    const handle = await fs.open(staged.temporaryPath, 'r+');
    if (process.platform === 'win32') {
      staged.retainedHandle = handle;
    }
    try {
      await handle.sync();
      const facts = await measureLanded(handle, copy.size);
      if (facts === undefined) {
        throw changed();
      }
      const { dev, ino } = await handle.stat({ bigint: true });
      staged.cloned = { dev, ino };
      return facts;
    } finally {
      if (staged.retainedHandle === undefined) {
        await handle.close();
      }
    }
  }

  /**
   * The permission bits a new file gets here: created exclusively at `name`
   * with `0o666`, so the kernel applies the umask, read back, and removed.
   *
   * @param name - A name this write owns and nothing else uses yet.
   * @returns The new file's permission bits.
   */
  private async _newFileMode(name: string): Promise<number> {
    const probe = await fs.open(name, 'wx', 0o666);
    try {
      const { mode } = await probe.stat();
      return mode % 0o1000;
    } finally {
      await probe.close();
      await fs.unlink(name);
    }
  }

  /**
   * Rename the synced temp sibling over its target, refusing a swapped parent or a symlink target.
   *
   * @param staged - A filled write.
   * @param beforeReplace - Runs after the checks, immediately before the rename.
   */
  private async _publishTemporary(staged: StagedWrite, beforeReplace?: () => Promise<void>): Promise<void> {
    const { rootedPath, targetPath, realBase, admittedDirectory, admittedTarget, temporaryPath } = staged;
    const currentDirectory = await fs.realpath(path.dirname(targetPath));
    if (currentDirectory !== admittedDirectory || !isContained(realBase, currentDirectory)) {
      throw this._errno('ELOOP', 'refusing to replace a file through a changed parent', rootedPath);
    }
    const currentTarget = await this._lstatOrUndefined(admittedTarget);
    if (currentTarget?.isSymbolicLink() === true) {
      throw this._errno('ELOOP', 'refusing to replace symbolic link', rootedPath);
    }
    await beforeReplace?.();
    /* Rename keeps the inode, so this identifies the entry the rename is about
     * to publish — and tells a later writer's entry apart from ours below. */
    staged.written = await fs.lstat(temporaryPath, { bigint: true });
    staged.renaming = true;
    await fs.rename(temporaryPath, admittedTarget);
    staged.replaced = true;
  }

  /**
   * Make the renames into one directory durable: one directory fsync, however
   * many of `published` it holds (D16). Windows syncs each file's own handle
   * instead, since a directory there cannot be synced.
   *
   * @param directory - The admitted directory every one of `published` was renamed into.
   * @param published - The writes renamed into it.
   */
  private async _syncPublished(directory: string, published: readonly StagedWrite[]): Promise<void> {
    if (published.every(({ retainedHandle }) => retainedHandle === undefined)) {
      const directoryHandle = await fs.open(directory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
      return;
    }
    // Windows FlushFileBuffers commits file metadata as well as content.
    // Keep the writable handle through rename to flush the same file object,
    // without reopening a replaced path or trying to sync a read-only directory.
    // https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching
    await Promise.all(published.map(async ({ retainedHandle }) => retainedHandle?.sync()));
  }

  /**
   * Read the published entry back once and compare it with what was written (I2).
   *
   * @param staged - A published write.
   */
  private async _verifyPublished(staged: StagedWrite): Promise<void> {
    const { rootedPath, admittedTarget, data, streamed, written } = staged;
    if (staged.cloned !== undefined) {
      /* Its bytes were hashed through the sibling's handle before the rename,
       * and a rename keeps the inode: the entry at the path is verified when
       * it is that very file (the hashed handle's device and inode), and is
       * never read again. Any other entry there is not known to be these
       * bytes, so the write is uncertain rather than applied. */
      const published = await fs.lstat(admittedTarget, { bigint: true }).catch(() => undefined);
      const known = staged.cloned.ino > 0n;
      if (known && (published?.dev !== staged.cloned.dev || published.ino !== staged.cloned.ino)) {
        throw this._errno('WRITE_VERIFICATION_FAILED', 'committed bytes could not be verified', rootedPath);
      }
      return;
    }
    const verification = await fs.open(admittedTarget, verificationReadFlags);
    try {
      const verified =
        data === undefined
          ? streamed !== undefined && (await publishedDigestEquals(verification, streamed))
          : bytesEqual(await readPublishedDescriptor(verification, data.byteLength), data);
      if (!verified) {
        throw this._errno('WRITE_VERIFICATION_FAILED', 'committed bytes could not be verified', rootedPath);
      }
    } catch (error) {
      /*
       * `writeFile` has never held the path exclusively: two writes of the same
       * path settle last-writer-wins, so a concurrent writer may replace the
       * entry this rename published. `readPublishedDescriptor` already covers a
       * replacement part way through the read, by holding the descriptor to its
       * inode's identity but not to the status-change time an unlink moves. It
       * cannot cover a replacement that lands before this descriptor is opened:
       * the open then resolves to the other writer's entry, whose bytes are
       * reported as unverifiable — or, when they outgrow this write's own
       * allowance, as `EFBIG`. Our rename did apply; a later write superseded
       * it, and that entry says nothing about ours. Only a path that still holds
       * this write's own entry can fail its verification.
       */
      if (written === undefined || (await isEntryStillAt(admittedTarget, written))) {
        throw error;
      }
    } finally {
      await verification.close();
    }
  }

  /**
   * Close and remove what a write left behind, then raise its failure, if any,
   * as a published write that may have applied when the rename had happened.
   *
   * @param staged - The write.
   * @param failure - What a phase raised, or `undefined`.
   */
  private async _settleWrite(staged: StagedWrite, failure: unknown): Promise<void> {
    let settled = failure;
    try {
      await staged.retainedHandle?.close();
    } catch (error) {
      settled ??= error;
    }
    try {
      await fs.unlink(staged.temporaryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && settled === undefined) {
        settled = error;
      }
    }
    if (settled === undefined) {
      return;
    }
    if (
      staged.replaced &&
      !['CHECKED_WRITE_POTENTIALLY_APPLIED', 'WRITE_VERIFICATION_FAILED'].includes(
        (settled as NodeJS.ErrnoException).code ?? '',
      )
    ) {
      throw Object.assign(new Error('Checked write may have been applied.', { cause: settled }), {
        code: 'CHECKED_WRITE_POTENTIALLY_APPLIED',
      });
    }
    throw settled instanceof Error ? settled : new Error('Filesystem write failed with a non-Error rejection.');
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
