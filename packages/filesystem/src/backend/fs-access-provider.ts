/**
 * File System Access API filesystem provider.
 *
 * Wraps a user-selected `FileSystemDirectoryHandle` (from `showDirectoryPicker()`)
 * to provide direct read/write access to a local directory. Also serves as the
 * base for OPFSProvider since OPFS exposes the same handle API.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
 */

import type {
  DirectoryEntry,
  ExternalChangeFact,
  FileReadStreamOptions,
  FileStat,
  ProviderCapabilities,
} from '#types.js';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import type { BatchEntry, BatchOptions, BatchReceipt } from '#changeset.js';
import { isRefusal } from '#changeset.js';
import { applyEntryWithPrimitives, refuseLargeObjectSources, runBatch } from '#backend/batch.js';
import type { BytesBatchEntry } from '#backend/batch.js';
import { mapConcurrent, statConcurrency } from '#concurrency.js';
import { workerTimings } from '#worker-timings.js';
import {
  createIndexedDbUncommittedStore,
  deleteUncommittedRecord,
  holdRealmOwner,
  liveRealmOwners,
  realmOwnerId,
  uncommittedModifiedSlackMilliseconds,
} from '#backend/uncommitted-changesets.js';
import type {
  UncommittedChangesetStore,
  UncommittedEntry,
  UncommittedRecord,
} from '#backend/uncommitted-changesets.js';
import { withCrossTabLocks } from '#cross-tab-coordinator.js';
import type { LockClaim } from '#cross-tab-coordinator.js';
import { randomUuid } from '@taucad/utils/id';
import { validateFileReadStreamOptions } from '#backend/stream-utils.js';

const handleCacheMaxEntries = 10_000;

type BatchWrite = Extract<BytesBatchEntry, { op: 'write' }>;

/** A batch write's file handle, opened before its bytes; `createdFile` when the batch made it. */
type OpenedFile = Readonly<{
  fileHandle: FileSystemFileHandle;
  directory: FileSystemDirectoryHandle;
  name: string;
  createdFile: boolean;
}>;

/** Where a create's file goes: its directory and name. */
type CreateDestination = Readonly<{ directory: FileSystemDirectoryHandle; name: string }>;

/** What a batch's pre-check found for one create, once the put covering it settled. */
type CreateCheck =
  | Readonly<{ receipt: BatchReceipt }>
  | Readonly<{ destination: CreateDestination; unrecorded?: Readonly<{ error: unknown }> }>;

/** Creates one put covers at most, so a batch makes about N/8 puts (I1, C8). */
const createsPerPut = 8;
/** The first groups are smaller, so a batch's first writes start one by one instead of eight at once. */
const leadingGroupSizes = [1, 2, 4] as const;

/**
 * Split a batch's creates into the groups the pre-check records together.
 *
 * @param creates - The batch's creates, in entry order.
 * @returns The groups, in order.
 */
const createGroups = <Entry>(creates: readonly Entry[]): Entry[][] => {
  const groups: Entry[][] = [];
  let start = 0;
  for (let index = 0; start < creates.length; index += 1) {
    const size = leadingGroupSizes[index] ?? createsPerPut;
    groups.push(creates.slice(start, start + size));
    start += size;
  }
  return groups;
};

/** How a {@link FileSystemAccessProvider} keeps its unsettled creates (I1, C8). @public */
export type FileSystemAccessProviderOptions = Readonly<{
  /**
   * Record creates under this storage-root key until they settle, so the next
   * {@link FileSystemAccessProvider.recoverUncommitted} can undo a crashed one.
   * `store` defaults to IndexedDB; `false` keeps no record.
   */
  uncommitted?: Readonly<{ root: string; store?: UncommittedChangesetStore | false }>;
  /** Told the provider paths a recovery removed, for the authority to publish. */
  onRecovered?: (paths: readonly string[]) => void;
  /**
   * For a root that keeps no record: write each create to a temporary sibling
   * and move it into place, so no crash leaves an empty file at its path that
   * nothing would remove (I1).
   */
  stageCreates?: boolean;
}>;

type FileSystemDirectoryEntryHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
type IterableFileSystemDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryEntryHandle]>;
};
type ExclusiveWritableFileHandle = FileSystemFileHandle & {
  createWritable(options?: {
    keepExistingData?: boolean;
    mode?: 'exclusive' | 'siloed';
  }): Promise<FileSystemWritableFileStream>;
};

/**
 * Test whether a basename is Chromium's private File System Access swap artifact.
 *
 * @param name - Entry basename.
 * @returns `true` for Chromium-owned `.crswap` entries.
 * @public
 */
export const isChromiumSwapArtifactName = (name: string): boolean => name.endsWith('.crswap');

const directoryEntries = async function* (
  handle: FileSystemDirectoryHandle,
): AsyncGenerator<[string, FileSystemDirectoryEntryHandle]> {
  for await (const entry of (handle as IterableFileSystemDirectoryHandle).entries()) {
    if (!isChromiumSwapArtifactName(entry[0])) {
      yield entry;
    }
  }
};

/** One record the platform's `FileSystemObserver` delivers. */
type FileSystemObserverRecord = {
  readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
  readonly changedHandle?: { readonly kind: FileSystemHandle['kind'] };
  readonly relativePathComponents: readonly string[];
  readonly relativePathMovedFrom?: readonly string[];
};

type FileSystemObserverHandle = {
  observe(handle: FileSystemDirectoryHandle, options: { recursive: boolean }): Promise<void> | void;
  disconnect(): void;
};

type FileSystemObserverConstructor = new (
  callback: (records: readonly FileSystemObserverRecord[]) => void,
) => FileSystemObserverHandle;

/**
 * Translate one platform record into the port's fact vocabulary. An `errored`
 * record is a lost observer, which is exactly a `reset`.
 *
 * @param record - One `FileSystemObserver` record.
 * @returns The equivalent {@link ExternalChangeFact}.
 */
const toExternalChangeFact = (record: FileSystemObserverRecord): ExternalChangeFact => {
  if (record.type === 'errored') {
    return { kind: 'reset' };
  }
  const kind =
    record.type === 'appeared' ? 'created' : record.type === 'disappeared' ? 'deleted' : (record.type as 'modified');
  const entryKind = record.changedHandle?.kind;
  const movedFrom = record.relativePathMovedFrom;
  return {
    kind,
    path: record.relativePathComponents.join('/'),
    ...(entryKind === undefined ? {} : { entry: entryKind === 'directory' ? 'dir' : 'file' }),
    ...(Array.isArray(movedFrom) ? { from: movedFrom.join('/') } : {}),
  };
};

const hasDomName = (error: unknown, name: string): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === name;

/**
 * Filesystem provider backed by the File System Access API.
 *
 * @public
 */
export class FileSystemAccessProvider extends AbstractFileSystemProvider {
  /**
   * Backend identifier; always `'webaccess'`.
   * @returns The literal string `'webaccess'`.
   */
  public get id(): string {
    return 'webaccess';
  }

  public readonly capabilities: ProviderCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: false,
    durability: 'stream-append',
    trustworthyMtime: true,
    externallyEdited: true,
    streamsWrites: true,
  };

  protected _rootHandle: FileSystemDirectoryHandle;
  /**
   * Where this root records a create changeset until it settles, and as which
   * owner realm (I1, C8); unset where nothing would verify the record.
   */
  protected _uncommitted: Readonly<{ store: UncommittedChangesetStore; root: string; owner: string }> | undefined;
  private readonly _handleCache = new Map<string, FileSystemDirectoryHandle>();
  /**
   * File handles a listing or a stat already acquired, so the next `stat` of
   * the same path is one `getFile()` instead of a handle lookup and a
   * `getFile()`. A handle is a locator (its path), never bytes: only `stat`
   * reads one, and nothing this provider moves or hands out comes from here.
   * Fenced like {@link FileSystemAccessProvider._handleCache}: a refresh, a
   * prefix invalidation, or a removal, rename or batch through this provider
   * forgets the paths it names, and a handle that no longer resolves (gone,
   * replaced, now a directory) falls back to the lookup. It assumes a handle
   * locates its entry by path, so a move another context makes without
   * announcing it is seen only through `refresh(prefixes)`.
   */
  private readonly _fileHandleCache = new Map<string, FileSystemFileHandle>();
  private readonly _pendingDirectoryHandles = new Map<string, Promise<FileSystemDirectoryHandle>>();
  private _handleGeneration = 0;
  private readonly _handleCacheMax = handleCacheMaxEntries;
  private _exclusiveWritableSupported: boolean | undefined;
  private readonly _onRecovered: ((paths: readonly string[]) => void) | undefined;
  private readonly _stageCreates: boolean;

  public constructor(rootHandle: FileSystemDirectoryHandle, options?: FileSystemAccessProviderOptions) {
    super();
    this._rootHandle = rootHandle;
    const store =
      options?.uncommitted === undefined ? undefined : (options.uncommitted.store ?? createIndexedDbUncommittedStore());
    this._uncommitted =
      options?.uncommitted === undefined || store === undefined || store === false
        ? undefined
        : { store, root: options.uncommitted.root, owner: realmOwnerId };
    this._onRecovered = options?.onRecovered;
    this._stageCreates = this._uncommitted === undefined && options?.stageCreates === true;
  }

  // ---------------------------------------------------------------------------
  // Public instance methods
  // ---------------------------------------------------------------------------

  /**
   * Persist `data` at `path`, creating the file when missing.
   *
   * @param path - Absolute file path to write.
   * @param data - Bytes or UTF-8 string to store.
   */
  public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._assertReady();
    this._assertRootedPath(path);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const created = await this._createFileHandle(path);
    try {
      await this._writeBytes(created.fileHandle, bytes);
    } catch (error) {
      await this._cleanupFailedFileCreation(path, created);
      throw error;
    }
  }

  /**
   * Write `path` from a stream without holding the file (W6.3). A provider
   * that stages ({@link FileSystemAccessProvider._stageStream}) moves the
   * finished file into place. Otherwise an existing file takes the writable
   * stream's swap file, which replaces it only on close, and an error aborts
   * it (I1). A new file is staged as a temporary sibling and moved into place
   * on a root that keeps no record, or, on a root that does, recorded before
   * it is made: it reads as empty until the stream ends, and a crash leaves
   * that empty file for {@link FileSystemAccessProvider.recoverUncommitted}
   * to remove. A write that fails removes what it made, and the source is
   * cancelled whenever the write stops before reading it to the end.
   *
   * @param path - Absolute file path to write.
   * @param source - The file's bytes, in order.
   */
  public override async writeFileStream(path: string, source: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<void> {
    let createdDirectories: readonly string[] = [];
    try {
      this._assertReady();
      this._assertRootedPath(path);
      const segments = this._splitPath(path);
      const name = segments.pop();
      if (name === undefined) {
        throw this._eisdir(path);
      }
      const opened = await this._openDirectoryForWrite(segments.join('/'));
      createdDirectories = opened.createdDirectories;
      const destination = { directory: opened.directoryHandle, name };
      let existing: FileSystemFileHandle | undefined;
      try {
        existing = await destination.directory.getFileHandle(name);
      } catch (error) {
        if (hasDomName(error, 'TypeMismatchError')) {
          throw this._eisdir(path);
        }
        if (!hasDomName(error, 'NotFoundError')) {
          throw error;
        }
      }
      try {
        if (await this._stageStream(source, destination)) {
          return;
        }
        await (existing === undefined
          ? this._streamCreate(path, source, destination)
          : this._streamInto(existing, source));
      } finally {
        this._forgetFileHandlesUnder(path, 'file');
      }
    } catch (error) {
      /* Harmless once the stream was read or cancelled: a locked or closed stream refuses. */
      await source.cancel(error).catch(() => undefined);
      await this._cleanupCreatedDirectories(createdDirectories);
      throw error;
    }
  }

  /** Append with an exclusive positional writable when the browser proves support. */
  public override async appendFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._assertReady();
    this._assertRootedPath(path);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    return this._enqueueAppend(path, async () => {
      const created = await this._createFileHandle(path);
      try {
        await this._appendBytes(path, created.fileHandle, bytes);
      } catch (error) {
        await this._cleanupFailedFileCreation(path, created);
        throw error;
      }
    });
  }

  /**
   * List immediate child names under `path`.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns The names of files and subdirectories directly inside `path`.
   */
  public async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirEntries(path);
    return entries.map((entry) => entry.name);
  }

  /**
   * List immediate children of `path` with their kinds, so callers can branch
   * on file-vs-directory without a `stat` per child.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its kind.
   */
  public async readdirEntries(path: string): Promise<DirectoryEntry[]> {
    this._assertReady();
    this._assertRootedPath(path);
    const generation = this._handleGeneration;
    const directoryHandle = await this._resolveDirectoryHandle(path);
    const entries: DirectoryEntry[] = [];
    for await (const [name, handle] of directoryEntries(directoryHandle)) {
      entries.push({ name, kind: handle.kind === 'directory' ? 'dir' : 'file' });
      // Enumeration already supplied the same directory capability that a
      // following child read would otherwise acquire in a separate browser call.
      // Keep the existing bounded cache and refresh fencing; never retain bytes.
      if (handle.kind === 'directory' && generation === this._handleGeneration) {
        const childPath = path === '' ? name : `${path}/${name}`;
        if (!this._handleCache.has(childPath)) {
          this._setHandleCache(childPath, handle);
        }
      }
    }
    return entries;
  }

  /**
   * Batched readdir + stat — eliminates the N+1 stat round-trips per directory
   * listing. Child metadata comes from the `File` object alone — size and
   * `lastModified`, no content (I3) — in chunks of {@link statConcurrency}.
   *
   * An entry removed between enumeration and its `getFile()` — a writer's
   * temporary sibling renamed away mid-listing — is left out: the listing
   * answers what is still there instead of rejecting the whole directory.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
    this._assertReady();
    this._assertRootedPath(path);
    const generation = this._handleGeneration;
    const directoryHandle = await this._resolveDirectoryHandle(path);
    const handles: Array<[string, FileSystemDirectoryEntryHandle]> = [];
    for await (const entry of directoryEntries(directoryHandle)) {
      handles.push(entry);
    }
    /* Enumeration supplied every child's handle: keep them, as readdirEntries
     * keeps its directories, so a following stat or descent skips the lookup. */
    if (generation === this._handleGeneration) {
      for (const [name, handle] of handles) {
        const childPath = path === '' ? name : `${path}/${name}`;
        if (handle.kind === 'directory') {
          if (!this._handleCache.has(childPath)) {
            this._setHandleCache(childPath, handle);
          }
        } else {
          this._setFileHandleCache(childPath, handle);
        }
      }
    }

    const listed = await mapConcurrent(handles, statConcurrency, async ([name, handle]) => {
      if (handle.kind === 'directory') {
        return { name, type: 'dir', size: 0, mtimeMs: 0 } satisfies { name: string } & FileStat;
      }
      const statOf = async (fileHandle: FileSystemFileHandle): Promise<{ name: string } & FileStat> => {
        const file = await fileHandle.getFile();
        return { name, type: 'file', size: file.size, mtimeMs: file.lastModified };
      };
      try {
        return await statOf(handle);
      } catch (error) {
        const replacement = await this._listedAgain(directoryHandle, name, error);
        if (replacement === undefined) {
          return undefined;
        }
        /* The name still answers: a writer swapped a new file in under it
         * (backup out, staged in) after enumeration. Stat that file once. */
        try {
          return await statOf(replacement);
        } catch (retryError) {
          if (hasDomName(retryError, 'NotFoundError')) {
            return undefined;
          }
          throw retryError;
        }
      }
    });
    return listed.filter((entry) => entry !== undefined);
  }

  /**
   * Resolve metadata for `path`. Throws `ENOENT` when neither a file nor directory entry matches.
   *
   * @param path - Absolute path to stat.
   * @returns Type/size/mtime for the entry at `path`.
   */
  public async stat(path: string): Promise<FileStat> {
    this._assertReady();
    this._assertRootedPath(path);
    const segments = this._splitPath(path);

    if (segments.length === 0) {
      return { type: 'dir', size: 0, mtimeMs: 0 };
    }

    const known = this._fileHandleCache.get(path);
    if (known !== undefined) {
      try {
        const file = await known.getFile();
        this._touchFileHandleCache(path, known);
        return { type: 'file', size: file.size, mtimeMs: file.lastModified };
      } catch {
        /* Gone, replaced by a directory, or refused since: forget it and look
         * the path up, which reports whatever the path holds now. */
        if (this._fileHandleCache.get(path) === known) {
          this._fileHandleCache.delete(path);
        }
      }
    }

    const generation = this._handleGeneration;
    const parentHandle = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;

    let fileError: unknown;
    try {
      const fileHandle = await parentHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      if (generation === this._handleGeneration) {
        this._setFileHandleCache(path, fileHandle);
      }
      return { type: 'file', size: file.size, mtimeMs: file.lastModified };
    } catch (error) {
      fileError = error;
    }
    if (!hasDomName(fileError, 'NotFoundError') && !hasDomName(fileError, 'TypeMismatchError')) {
      throw fileError;
    }
    try {
      await parentHandle.getDirectoryHandle(name);
      return { type: 'dir', size: 0, mtimeMs: 0 };
    } catch (error) {
      if (hasDomName(error, 'NotFoundError') || hasDomName(error, 'TypeMismatchError')) {
        throw this._enoent(path);
      }
      throw error;
    }
  }

  /**
   * Delete the regular file at `path`.
   *
   * @param path - Absolute file path to remove.
   */
  public async unlink(path: string): Promise<void> {
    this._assertReady();
    this._assertRootedPath(path);
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eisdir(path);
    }

    const parentHandle = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    const kind = await this._entryKind(path);
    if (kind === undefined) {
      throw this._enoent(path);
    }
    if (kind === 'dir') {
      throw this._eisdir(path);
    }
    await parentHandle.removeEntry(name);
    this._fileHandleCache.delete(path);
  }

  /**
   * Whether an entry exists at `path`, answered from the handles alone: unlike
   * `stat`, it never reads the file's bytes to classify them.
   *
   * @param path - Absolute path to test.
   * @returns `true` for a file or directory at `path`.
   */
  public override async exists(path: string): Promise<boolean> {
    this._assertReady();
    this._assertRootedPath(path);
    try {
      return (await this._entryKind(path)) !== undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete the directory at `path` (non-recursive).
   *
   * @param path - Absolute directory path to remove.
   */
  public async rmdir(path: string): Promise<void> {
    this._assertReady();
    this._assertRootedPath(path);
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._enoent(path);
    }

    const parentHandle = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    const kind = await this._entryKind(path);
    if (kind === undefined) {
      throw this._enoent(path);
    }
    if (kind !== 'dir') {
      throw this._enotdir(path);
    }
    try {
      await parentHandle.removeEntry(name, { recursive: false });
    } catch (error) {
      if (hasDomName(error, 'InvalidModificationError')) {
        throw this._enotempty(path);
      }
      throw error;
    }
    this._invalidateHandleCachePrefix(path);
  }

  /**
   * Move the file or directory at `from` to `to`. Files go through
   * {@link FileSystemAccessProvider._moveFile} (copy + unlink here; OPFS uses
   * the native handle move); directories are walked recursively and re-created
   * under the new path. An existing destination is refused with `EEXIST`.
   *
   * @param from - Source absolute path.
   * @param to - Destination absolute path.
   */
  public async rename(from: string, to: string): Promise<void> {
    this._assertReady();
    this._assertRootedPath(from);
    this._assertRootedPath(to);
    const sourceKind = await this._entryKind(from);
    if (sourceKind === undefined) {
      throw this._enoent(from);
    }
    if (from === to) {
      return;
    }
    if (from === '') {
      throw this._einval(from);
    }
    if (sourceKind === 'dir' && to.startsWith(`${from}/`)) {
      throw this._einval(to);
    }
    if ((await this._entryKind(to)) !== undefined) {
      throw this._eexist(to);
    }
    if (sourceKind === 'dir') {
      await this._renameDirectory(from, to);
      return;
    }
    await this._moveFile(from, to);
    this._invalidateHandleCachePrefix(from, 'file');
    this._fileHandleCache.delete(to);
  }

  /**
   * Drop cached directory handles before applying sibling-authority facts.
   *
   * @param prefixes - Absolute paths whose subtrees changed. Omit to drop the whole cache.
   */
  public async refresh(prefixes?: readonly string[]): Promise<void> {
    this._assertReady();
    if (prefixes === undefined) {
      this._handleCache.clear();
      this._fileHandleCache.clear();
      this._pendingDirectoryHandles.clear();
      this._handleGeneration++;
      return;
    }
    for (const prefix of prefixes) {
      this._assertRootedPath(prefix);
      this._invalidateHandleCachePrefix(prefix);
    }
  }

  /**
   * Apply one batch natively (charter D2, I1, Rule 34).
   *
   * Writes share one batch-scoped memo of the directories they land in, so a
   * thousand files under forty directories make forty directory lookups, and
   * eight run at once. Each write commits through a writable stream, which the
   * platform swaps into place atomically on close: a crash leaves the old bytes
   * or the new ones, never a torn file. Every other entry takes the provider's
   * own primitives — native recursive removal and native move.
   *
   * A write that fails leaves no file it created behind. A root that keeps
   * records checks each create's path is missing, adds it to the batch's one
   * record, and makes the file only once a put covers it (I1, C8); a taken path
   * is refused and never recorded. The check runs at most one group ahead of
   * the writes, and one put covers up to eight creates, so a batch makes about
   * N/8 puts and its writes do not start in lockstep. A create whose record
   * cannot be kept is staged and moved into place where the provider can, and
   * refused where it cannot. A root that keeps no record and stages its creates
   * writes each to a temporary sibling and moves it into place. Nothing is
   * written in place unprotected.
   *
   * @param entries - One phase's entries for this provider, in provider paths.
   * @param options - The changeset's abort signal.
   * @returns One receipt per entry, in entry order.
   */
  public override async applyBatch(entries: readonly BatchEntry[], options?: BatchOptions): Promise<BatchReceipt[]> {
    this._assertReady();
    return refuseLargeObjectSources(entries, async (held) => this._applyBytesBatch(held, options));
  }

  /**
   * Undo the creates a realm that is gone left half-written in this root, as
   * the root opens: see {@link FileSystemAccessProvider._verifyUncommitted}.
   * The registry runs it once for each user-picked root it opens.
   *
   * @returns The provider paths it removed.
   */
  public async recoverUncommitted(): Promise<readonly string[]> {
    this._assertReady();
    const uncommitted = this._uncommitted;
    if (uncommitted === undefined) {
      return [];
    }
    await holdRealmOwner();
    let records: UncommittedRecord[];
    try {
      records = await uncommitted.store.list(uncommitted.root);
    } catch (error) {
      console.error(`[filesystem] The unsettled creates of ${uncommitted.root} could not be listed.`, error);
      return [];
    }
    const live = await liveRealmOwners();
    return live === undefined ? [] : this._verifyUncommitted(live, records);
  }

  /**
   * Observe this root through the platform's `FileSystemObserver`.
   *
   * The API is not universally available and `observe()` can be refused for a
   * handle whose permission was revoked; either way the root has a polling
   * fallback, so both resolve `undefined` rather than rejecting.
   *
   * @param listener - Receives every normalised fact batch.
   * @returns A disposer, or `undefined` when no observer could be armed.
   */
  public async observe(listener: (facts: readonly ExternalChangeFact[]) => void): Promise<(() => void) | undefined> {
    const browser = globalThis as typeof globalThis & { FileSystemObserver?: FileSystemObserverConstructor };
    if (typeof browser.FileSystemObserver !== 'function') {
      return undefined;
    }
    const observer = new browser.FileSystemObserver((records) => {
      listener(records.map((record) => toExternalChangeFact(record)));
    });
    try {
      await observer.observe(this._rootHandle, { recursive: true });
    } catch {
      observer.disconnect();
      return undefined;
    }
    return () => {
      observer.disconnect();
    };
  }

  /**
   * Stream the contents of `path` with optional positional/length slicing and abort support.
   *
   * @param path - Absolute file path to read.
   * @param options - Optional `position`, `length`, and `signal` for partial reads.
   * @returns A `ReadableStream` of byte chunks.
   */
  public readFileStream(path: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> {
    this._assertReady();
    this._assertRootedPath(path);
    validateFileReadStreamOptions(options);
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    let initialize: Promise<void>;
    let settled = false;
    let abortHandler: (() => void) | undefined;
    let cancelReason: unknown;
    let readerCancelled = false;

    const cancelReader = async (reason: unknown): Promise<void> => {
      if (reader === undefined || readerCancelled) {
        return;
      }
      readerCancelled = true;
      try {
        await reader.cancel(reason);
      } catch {
        // Cancellation cannot replace the stream's existing result.
      }
    };

    const cleanup = (): void => {
      if (abortHandler !== undefined) {
        options?.signal?.removeEventListener('abort', abortHandler);
        abortHandler = undefined;
      }
    };

    return new ReadableStream({
      start: (controller) => {
        initialize = (async () => {
          try {
            const fileHandle = await this._resolveFileHandle(path);
            const file = await fileHandle.getFile();
            let blob: Blob = file;
            if (options?.position !== undefined || options?.length !== undefined) {
              const start = options.position ?? 0;
              const end = options.length === undefined ? file.size : start + options.length;
              blob = file.slice(start, end);
            }
            reader = blob.stream().getReader();
            if (settled) {
              await cancelReader(cancelReason);
            }
          } catch (error) {
            if (!settled) {
              throw error;
            }
          }
        })();

        abortHandler = () => {
          if (settled) {
            return;
          }
          settled = true;
          const error = new DOMException('The operation was aborted.', 'AbortError');
          cancelReason = error;
          cleanup();
          void cancelReader(error);
          controller.error(error);
        };
        if (options?.signal?.aborted) {
          abortHandler();
        } else {
          options?.signal?.addEventListener('abort', abortHandler, { once: true });
        }
      },
      pull: async (controller) => {
        try {
          await initialize;
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- An abort event can settle the stream while initialization is suspended.
          if (settled) {
            return;
          }
          const chunk = await reader!.read();
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- An abort event can settle the stream while the reader is suspended.
          if (settled) {
            return;
          }
          if (chunk.done) {
            settled = true;
            cleanup();
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(chunk.value));
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            controller.error(error);
          }
        }
      },
      cancel: async (reason) => {
        settled = true;
        cancelReason = reason;
        cleanup();
        try {
          await initialize;
          await cancelReader(reason);
        } catch {
          // Initialization or native cancellation has already ended the stream.
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Protected instance methods
  // ---------------------------------------------------------------------------

  /**
   * Replace a file's contents. The writable stream is the only write API
   * available to user-picked roots; {@link import('#backend/opfs-provider.js').OPFSProvider}
   * overrides this with sync access handles.
   *
   * @param fileHandle - Handle for the already-created target file.
   * @param bytes - Full new contents.
   */
  protected async _writeBytes(fileHandle: FileSystemFileHandle, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      try {
        await writable?.abort(error);
      } catch {
        // Preserve the write/close failure that caused the abort.
      }
      throw error;
    }
  }

  /**
   * Commit one batch write's bytes to its file handle. The writable stream
   * writes a swap file and moves it over the target on close, so the
   * replacement is atomic (I1).
   *
   * @param fileHandle - Handle for the target, created if it was absent.
   * @param data - The bytes, in hand or staged.
   * @param _destination - The target's directory and name, for a provider that stages and moves.
   */
  protected async _writeBatchData(
    fileHandle: FileSystemFileHandle,
    data: Uint8Array<ArrayBuffer> | Blob,
    _destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<void> {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    } catch (error) {
      try {
        await writable?.abort(error);
      } catch {
        // Preserve the write/close failure that caused the abort.
      }
      throw error;
    }
  }

  /**
   * Exclusive mode writes the tail in place and can expose a torn tail after a
   * crash. The rewrite fallback uses Chromium's swap file and atomic rename.
   */
  protected async _appendBytes(
    path: string,
    fileHandle: FileSystemFileHandle,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const writable = await this._openExclusiveWritable(fileHandle);
    if (writable === undefined) {
      await this._appendFileByRewrite(path, bytes);
      return;
    }
    try {
      const file = await fileHandle.getFile();
      const position = file.size;
      await writable.write({ type: 'write', position, data: bytes });
      await writable.close();
    } catch (error) {
      try {
        await writable.abort(error);
      } catch {
        // Preserve the append/close failure that caused the abort.
      }
      throw error;
    }
  }

  /**
   * Move one regular file whose destination {@link FileSystemAccessProvider.rename}
   * has already proven absent. A user-picked root has no portable native move,
   * so the bytes are copied and the source unlinked; missing destination
   * parents are created by the write.
   *
   * @param from - Source file path.
   * @param to - Absent destination file path.
   */
  protected async _moveFile(from: string, to: string): Promise<void> {
    const data = await this.readFileRaw(from);
    await this.writeFile(to, data);
    await this.unlink(from);
  }

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    this._assertReady();
    this._assertRootedPath(path);
    const fileHandle = await this._resolveFileHandle(path);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  protected async mkdirSingle(path: string): Promise<void> {
    this._assertReady();
    this._assertRootedPath(path);
    this._invalidateHandleCachePrefix(path);
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eexist(path);
    }

    const parentHandle = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;

    try {
      await parentHandle.getDirectoryHandle(name);
      throw this._eexist(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw error;
      }
      if (hasDomName(error, 'TypeMismatchError')) {
        throw this._eexist(path);
      }
      if (!hasDomName(error, 'NotFoundError')) {
        throw error;
      }
    }

    await parentHandle.getDirectoryHandle(name, { create: true });
  }

  protected async _resolveDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
    this._assertReady();
    this._assertRootedPath(path);
    const cached = this._handleCache.get(path);
    if (cached) {
      this._touchHandleCache(path);
      return cached;
    }

    const segments = this._splitPath(path);
    const generation = this._handleGeneration;
    let handle = this._rootHandle;
    let resolvedPath = '';

    for (const segment of segments) {
      resolvedPath = resolvedPath === '' ? segment : `${resolvedPath}/${segment}`;
      const cachedSegment = generation === this._handleGeneration ? this._handleCache.get(resolvedPath) : undefined;
      if (cachedSegment) {
        this._touchHandleCache(resolvedPath);
        handle = cachedSegment;
        continue;
      }
      try {
        // Concurrent sibling file reads share only the pending handle acquisition.
        // Invalidation detaches old work so it cannot repopulate the current cache.
        const current = generation === this._handleGeneration;
        const pending = current ? this._pendingDirectoryHandles.get(resolvedPath) : undefined;
        const acquisition = pending ?? handle.getDirectoryHandle(segment);
        if (current && pending === undefined) {
          this._pendingDirectoryHandles.set(resolvedPath, acquisition);
        }
        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential directory traversal required.
          handle = await acquisition;
        } finally {
          if (this._pendingDirectoryHandles.get(resolvedPath) === acquisition) {
            this._pendingDirectoryHandles.delete(resolvedPath);
          }
        }
      } catch (error) {
        if (hasDomName(error, 'TypeMismatchError')) {
          throw this._enotdir(resolvedPath);
        }
        if (hasDomName(error, 'NotFoundError')) {
          throw this._enoent(path);
        }
        throw error;
      }
      if (generation === this._handleGeneration) {
        this._setHandleCache(resolvedPath, handle);
      }
    }

    return handle;
  }

  protected async _resolveFileHandle(path: string): Promise<FileSystemFileHandle> {
    this._assertReady();
    this._assertRootedPath(path);
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eisdir(path);
    }

    const fileName = segments.pop()!;

    const parentHandle = await this._resolveDirectoryHandle(segments.join('/'));

    try {
      return await parentHandle.getFileHandle(fileName);
    } catch (error) {
      if (hasDomName(error, 'TypeMismatchError')) {
        throw this._eisdir(path);
      }
      if (hasDomName(error, 'NotFoundError')) {
        throw this._enoent(path);
      }
      throw error;
    }
  }

  protected _splitPath(path: string): string[] {
    this._assertRootedPath(path);
    return path.split('/').filter(Boolean);
  }

  /** Lifecycle readiness hook. Handle-backed user roots are ready at construction. */
  // oxlint-disable-next-line no-empty-function -- OPFS overrides this hook; ordinary File System Access roots are ready at construction.
  protected _assertReady(): void {}

  // ---------------------------------------------------------------------------
  // Private instance methods
  // ---------------------------------------------------------------------------

  protected async _createFileHandle(path: string): Promise<{
    fileHandle: FileSystemFileHandle;
    createdFile: boolean;
    createdDirectories: string[];
  }> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eisdir(path);
    }
    const fileName = segments.pop()!;
    const { directoryHandle, createdDirectories } = await this._openDirectoryForWrite(segments.join('/'));
    try {
      try {
        return {
          fileHandle: await directoryHandle.getFileHandle(fileName),
          createdFile: false,
          createdDirectories,
        };
      } catch (error) {
        if (hasDomName(error, 'TypeMismatchError')) {
          throw this._eisdir(path);
        }
        if (!hasDomName(error, 'NotFoundError')) {
          throw error;
        }
        return {
          fileHandle: await directoryHandle.getFileHandle(fileName, { create: true }),
          createdFile: true,
          createdDirectories,
        };
      }
    } catch (error) {
      await this._cleanupCreatedDirectories(createdDirectories);
      throw error;
    }
  }

  /**
   * Resolve the directory at `path` for a write, creating missing ancestors in
   * path order. A failure removes exactly the directories this call created.
   *
   * @param path - Directory path; `''` is the root.
   * @returns The directory handle and the paths this call created, shallowest first.
   */
  protected async _openDirectoryForWrite(path: string): Promise<{
    directoryHandle: FileSystemDirectoryHandle;
    createdDirectories: string[];
  }> {
    const createdDirectories: string[] = [];
    let directoryHandle = this._rootHandle;
    let directoryPath = '';
    try {
      for (const segment of this._splitPath(path)) {
        directoryPath = directoryPath === '' ? segment : `${directoryPath}/${segment}`;
        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential directory traversal is required by the handle API.
          directoryHandle = await directoryHandle.getDirectoryHandle(segment);
        } catch (error) {
          if (hasDomName(error, 'TypeMismatchError')) {
            throw this._enotdir(directoryPath);
          }
          if (!hasDomName(error, 'NotFoundError')) {
            throw error;
          }
          // oxlint-disable-next-line no-await-in-loop -- Missing ancestors are created in path order.
          directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create: true });
          createdDirectories.push(directoryPath);
        }
      }
      return { directoryHandle, createdDirectories };
    } catch (error) {
      await this._cleanupCreatedDirectories(createdDirectories);
      throw error;
    }
  }

  /**
   * Undo what a crashed create left, and nothing else. For each record whose
   * owner realm is gone, a recorded path is removed only when, under its
   * exclusive lock, it is empty, was recorded to hold bytes, and was last
   * modified no later than the record was kept: the empty file the crashed
   * batch created and never wrote. A file edited since, or holding any bytes,
   * stays. Each record is deleted once its entries are checked; one that
   * cannot be deleted is reported, and checking it again later is harmless.
   *
   * @param liveOwners - Owner realms still holding their lock, read after the records were listed.
   * @param records - The root's records, listed before `liveOwners` was read.
   * @returns The provider paths it removed.
   */
  protected async _verifyUncommitted(
    liveOwners: ReadonlySet<string>,
    records: readonly UncommittedRecord[],
  ): Promise<readonly string[]> {
    const uncommitted = this._uncommitted;
    if (uncommitted === undefined) {
      return [];
    }
    let verified = 0;
    const removed: string[] = [];
    for (const record of records) {
      if (record.owner === uncommitted.owner || liveOwners.has(record.owner)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- a record's entries are checked before it is deleted.
      const outcomes = await Promise.all(record.entries.map(async (entry) => this._undoCrashedCreate(record, entry)));
      verified += outcomes.length;
      removed.push(...record.entries.filter((_, index) => outcomes[index] === true).map(({ path }) => path));
      try {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await deleteUncommittedRecord(uncommitted.store, record);
      } catch (error) {
        workerTimings.count('uncommitted.deleteFailed');
        console.error('[filesystem] A checked uncommitted-changeset record is still kept.', error);
      }
    }
    if (verified > 0) {
      workerTimings.count('uncommitted.verified', verified);
    }
    if (removed.length > 0) {
      workerTimings.count('uncommitted.removed', removed.length);
      this._onRecovered?.(removed);
    }
    return removed;
  }

  /**
   * Publish a create's bytes without its file ever being empty at its path:
   * staged elsewhere and moved into place. A provider that cannot answers
   * `false` and the create is refused.
   *
   * @param _data - The bytes.
   * @param _destination - The target's directory and name.
   * @returns Whether the file now holds the bytes.
   */
  protected async _stageCreate(
    _data: Uint8Array<ArrayBuffer> | Blob,
    _destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Write a stream to a staged file and move it into place (W6.3). A provider
   * that cannot answers `false` before it reads the stream, and the writable
   * stream's swap file is used instead.
   *
   * @param _source - The bytes, in order.
   * @param _destination - The target's directory and name.
   * @returns Whether the file now holds the bytes.
   */
  protected async _stageStream(
    _source: ReadableStream<Uint8Array<ArrayBuffer>>,
    _destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<boolean> {
    return false;
  }

  protected async _cleanupFailedFileCreation(
    path: string,
    created: { createdFile: boolean; createdDirectories: readonly string[] },
  ): Promise<void> {
    if (created.createdFile) {
      try {
        await this._removeEntry(path, false, 'file');
      } catch {
        return;
      }
    }
    await this._cleanupCreatedDirectories(created.createdDirectories);
  }

  protected async _cleanupCreatedDirectories(paths: readonly string[]): Promise<void> {
    for (const path of paths.toReversed()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Cleanup must proceed from deepest child to parent.
        await this._removeEntry(path, false);
      } catch {
        break;
      }
    }
  }

  /**
   * Write a stream through a file's writable stream, which replaces the file
   * only on close; an error aborts it and cancels the source.
   *
   * @param fileHandle - The file.
   * @param source - The bytes, in order.
   */
  private async _streamInto(
    fileHandle: FileSystemFileHandle,
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
  ): Promise<void> {
    const reader = source.getReader();
    let writable: FileSystemWritableFileStream | undefined;
    try {
      writable = await fileHandle.createWritable();
      // oxlint-disable-next-line no-await-in-loop -- a stream is written one chunk after another.
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await writable.write(read.value);
      }
      await writable.close();
    } catch (error) {
      await writable?.abort(error).catch(() => undefined);
      await reader.cancel(error).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Create a file from a stream, never leaving partial bytes at its path (I1).
   * A root that keeps no record stages a temporary sibling, the name the
   * revisions open sweeps, and moves it into place (a picked folder without a
   * native move copies it). A root that keeps a record puts it before the file
   * is made and deletes it once the write settles; a record that cannot be
   * kept refuses the create. A root with neither writes the file in place,
   * as `writeFile` does.
   *
   * @param path - The absent file's path.
   * @param source - The bytes, in order.
   * @param destination - Its directory and name.
   */
  private async _streamCreate(
    path: string,
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<void> {
    const { directory, name } = destination;
    const uncommitted = this._uncommitted;
    if (uncommitted === undefined && this._stageCreates) {
      const siblingName = `.${name}.tau-staged.${randomUuid()}.tmp`;
      const siblingPath = `${path.slice(0, path.length - name.length)}${siblingName}`;
      try {
        await this._streamInto(await directory.getFileHandle(siblingName, { create: true }), source);
        await this._moveFile(siblingPath, path);
      } catch (error) {
        await this._removeEntry(siblingPath, false, 'file').catch(() => undefined);
        throw error;
      }
      return;
    }
    let record: UncommittedRecord | undefined;
    if (uncommitted !== undefined) {
      await holdRealmOwner();
      /* Any size above zero marks the file as one that should hold bytes, which is all recovery asks. */
      record = {
        root: uncommitted.root,
        owner: uncommitted.owner,
        changesetId: randomUuid(),
        recordedAt: Date.now(),
        entries: [{ path, size: 1 }],
      };
      try {
        await uncommitted.store.put(record);
        workerTimings.count('uncommitted.puts');
      } catch (error) {
        throw new Error(`${path} was not created: its crash record could not be kept.`, { cause: error });
      }
    }
    try {
      const fileHandle = await directory.getFileHandle(name, { create: true });
      try {
        await this._streamInto(fileHandle, source);
      } catch (error) {
        await this._removeEntry(path, false, 'file').catch(() => undefined);
        throw error;
      }
    } finally {
      if (record !== undefined && uncommitted !== undefined) {
        await deleteUncommittedRecord(uncommitted.store, record).catch((error: unknown) => {
          workerTimings.count('uncommitted.deleteFailed');
          console.error('[filesystem] A settled uncommitted-changeset record is still kept.', error);
        });
      }
    }
  }

  /**
   * Check a batch's creates and record them ahead of its writes (I1, C8).
   *
   * Groups of creates (1, 2, 4, then 8) are looked up in turn under the
   * batch's exclusive locks; the missing ones are added to the batch's one
   * record and put together, before any of their files is made. A taken path
   * is refused and never recorded. The check stays at most one group ahead of
   * the writes it serves; after a put fails, every later create gets that
   * error, so it is staged or refused instead of written unprotected.
   *
   * @param batch - The root's store, key and owner; the batch's creates, in
   *   entry order; its directory memo; and the changeset's abort signal.
   * @returns Each create's check, as its write asks for it, and the record kept once every check settled.
   */
  private _checkAndRecordCreates({
    uncommitted,
    creates,
    openForWrite,
    signal,
  }: Readonly<{
    uncommitted: Readonly<{ store: UncommittedChangesetStore; root: string; owner: string }>;
    creates: readonly BatchWrite[];
    openForWrite: (path: string) => Promise<FileSystemDirectoryHandle>;
    signal: AbortSignal | undefined;
  }>): Readonly<{
    next: (entry: BatchWrite) => Promise<CreateCheck>;
    settled: () => Promise<UncommittedRecord | undefined>;
  }> {
    const checks = new Map(creates.map((entry) => [entry, Promise.withResolvers<CreateCheck>()]));
    const resolve = (entry: BatchWrite, check: CreateCheck): void => {
      checks.get(entry)?.resolve(check);
    };
    let asked = 0;
    let wake: (() => void) | undefined;
    const awaken = (): void => {
      wake?.();
      wake = undefined;
    };
    signal?.addEventListener('abort', awaken, { once: true });
    const changesetId = randomUuid();
    const recorded: UncommittedEntry[] = [];
    let kept: UncommittedRecord | undefined;
    let failed: Readonly<{ error: unknown }> | undefined;
    let start = 0;
    /* Stay at most one group ahead of the writes this check serves. */
    const catchUp = async (): Promise<void> => {
      if (start - asked < createsPerPut || signal?.aborted === true) {
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      await catchUp();
    };
    const run = async (): Promise<void> => {
      for (const group of createGroups(creates)) {
        // oxlint-disable-next-line no-await-in-loop -- waits for the writes to catch up.
        await catchUp();
        if (signal?.aborted === true) {
          for (const entry of creates.slice(start)) {
            resolve(entry, { receipt: { outcome: 'failed', error: signal.reason } });
          }
          return;
        }
        // oxlint-disable-next-line no-await-in-loop -- one group at a time, so a put covers what its lookups found.
        const targets = await Promise.all(group.map(async (entry) => this._findCreateTarget(entry, openForWrite)));
        const missing = group.filter((_, index) => !('outcome' in targets[index]!));
        if (missing.length > 0 && failed === undefined) {
          recorded.push(
            ...missing.map(({ path, data }) => ({ path, size: data instanceof Blob ? data.size : data.byteLength })),
          );
          const record: UncommittedRecord = {
            root: uncommitted.root,
            owner: uncommitted.owner,
            changesetId,
            recordedAt: Date.now(),
            entries: [...recorded],
          };
          try {
            // oxlint-disable-next-line no-await-in-loop -- the record is rewritten in place, one put at a time.
            await uncommitted.store.put(record);
            kept = record;
            workerTimings.count('uncommitted.puts');
          } catch (error) {
            failed = { error };
          }
        }
        for (const [index, entry] of group.entries()) {
          const target = targets[index]!;
          resolve(
            entry,
            'outcome' in target
              ? { receipt: target }
              : { destination: target, ...(failed === undefined ? {} : { unrecorded: failed }) },
          );
        }
        start += group.length;
      }
    };
    const done = (async (): Promise<void> => {
      try {
        await run();
      } catch (error) {
        for (const entry of creates) {
          resolve(entry, { receipt: { outcome: 'failed', error } });
        }
      }
    })();
    return {
      next: async (entry) => {
        asked += 1;
        awaken();
        return checks.get(entry)!.promise;
      },
      settled: async () => {
        awaken();
        await done;
        signal?.removeEventListener('abort', awaken);
        return kept;
      },
    };
  }

  /**
   * Finish one checked create: make its file and write it, or settle it as
   * its check said.
   *
   * @param entry - The create.
   * @param check - What the batch's check found and recorded for it.
   * @returns Its receipt; never rejects.
   */
  private async _applyCheckedCreate(entry: BatchWrite, check: CreateCheck): Promise<BatchReceipt> {
    if ('receipt' in check) {
      return check.receipt;
    }
    if (check.unrecorded !== undefined) {
      return this._publishUnrecordedCreate(entry, check.destination, check.unrecorded.error);
    }
    const { directory, name } = check.destination;
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await directory.getFileHandle(name, { create: true });
    } catch (error) {
      return { outcome: 'failed', error: hasDomName(error, 'TypeMismatchError') ? this._eisdir(entry.path) : error };
    }
    return this._writeOpenedFile(entry, { fileHandle, directory, name, createdFile: true });
  }

  /**
   * Find where a create's file goes, refusing a taken path.
   *
   * @param entry - The create.
   * @param openForWrite - The batch's directory memo.
   * @returns Its directory and name, or the receipt that refused it; never rejects.
   */
  private async _findCreateTarget(
    entry: BatchWrite,
    openForWrite: (path: string) => Promise<FileSystemDirectoryHandle>,
  ): Promise<CreateDestination | BatchReceipt> {
    try {
      const segments = this._splitPath(entry.path);
      const name = segments.pop();
      if (name === undefined) {
        return { outcome: 'failed', error: this._eisdir(entry.path) };
      }
      const directory = await openForWrite(segments.join('/'));
      try {
        await directory.getFileHandle(name);
        return { outcome: 'failed', error: this._eexist(entry.path) };
      } catch (error) {
        if (hasDomName(error, 'TypeMismatchError')) {
          return { outcome: 'failed', error: this._eexist(entry.path) };
        }
        if (!hasDomName(error, 'NotFoundError')) {
          throw error;
        }
      }
      return { directory, name };
    } catch (error) {
      return { outcome: 'failed', error };
    }
  }

  /**
   * Publish a create on a root that keeps no record: stage it where the
   * provider can, otherwise write a temporary sibling and move it into place,
   * as before changesets. A crash leaves the sibling, which the revisions open
   * sweeps, and never an empty file at the create's path.
   *
   * @param entry - The create.
   * @param destination - Its directory and name; the file is not there yet.
   * @returns Its receipt; never rejects.
   */
  private async _stageSiblingCreate(entry: BatchWrite, destination: CreateDestination): Promise<BatchReceipt> {
    try {
      if (await this._stageCreate(entry.data, destination)) {
        return { outcome: 'applied', kind: 'file', created: true };
      }
    } catch (error) {
      return { outcome: 'failed', error };
    }
    // The name `@taucad/revisions` sweeps a temporary sibling by (`parseTemporarySibling`).
    const siblingName = `.${destination.name}.tau-staged.${randomUuid()}.tmp`;
    const siblingPath = `${entry.path.slice(0, entry.path.length - destination.name.length)}${siblingName}`;
    let moving = false;
    try {
      const sibling = await destination.directory.getFileHandle(siblingName, { create: true });
      await this._writeBatchData(sibling, entry.data, { directory: destination.directory, name: siblingName });
      moving = true;
      await this._moveFile(siblingPath, entry.path);
      return { outcome: 'applied', kind: 'file', created: true };
    } catch (error) {
      await this._removeEntry(siblingPath, false, 'file').catch(() => undefined);
      return moving ? { outcome: 'uncertain', error } : { outcome: 'failed', error };
    }
  }

  /**
   * A create whose record could not be kept, before its file exists: publish
   * the bytes staged and moved into place, or refuse it.
   *
   * @param entry - The create.
   * @param destination - Its directory and name; the file is not there yet.
   * @param recordError - Why the record could not be kept.
   * @returns Its receipt; never rejects.
   */
  private async _publishUnrecordedCreate(
    entry: BatchWrite,
    destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
    recordError: unknown,
  ): Promise<BatchReceipt> {
    try {
      if (await this._stageCreate(entry.data, destination)) {
        return { outcome: 'applied', kind: 'file', created: true };
      }
    } catch (error) {
      return { outcome: 'failed', error };
    }
    return {
      outcome: 'failed',
      error: new Error(`${entry.path} was not created: its crash record could not be kept.`, { cause: recordError }),
    };
  }

  /**
   * Remove one recorded file if, and only if, it is the empty file a crashed
   * create left: under its exclusive lock, empty, recorded to hold bytes, and
   * last modified within the slack either side of the record.
   *
   * @param record - The dead realm's record.
   * @param entry - The path and its expected size.
   * @returns Whether the file was removed.
   */
  private async _undoCrashedCreate(record: UncommittedRecord, entry: UncommittedEntry): Promise<boolean> {
    if (entry.size === 0) {
      return false;
    }
    const segments = this._splitPath(entry.path);
    const name = segments.at(-1);
    if (name === undefined) {
      return false;
    }
    const claims: LockClaim[] = [{ token: `${record.root}:${entry.path}` }];
    for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
      claims.push({ token: `${record.root}:${segments.slice(0, depth).join('/')}`, shared: true });
    }
    return withCrossTabLocks(claims, async () => {
      let file: File;
      try {
        const directory = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
        const handle = await directory.getFileHandle(name);
        file = await handle.getFile();
      } catch {
        /* Absent, or not a file: nothing to undo. */
        return false;
      }
      /* A file modified outside the window around the record is not the one
       * the crashed batch created: edited since, or copied in with an old time. */
      if (
        file.size > 0 ||
        file.lastModified < record.recordedAt - uncommittedModifiedSlackMilliseconds ||
        file.lastModified > record.recordedAt + uncommittedModifiedSlackMilliseconds
      ) {
        return false;
      }
      try {
        await this._removeEntry(entry.path, false, 'file');
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Open one batch write's file: the parent from the batch's memo, a lookup,
   * and a create when it is missing. A create refuses a taken path.
   *
   * @param entry - The write.
   * @param openForWrite - The batch's directory memo.
   * @returns The opened file, or the receipt that refused it; never rejects.
   */
  private async _openBatchFile(
    entry: BatchWrite,
    openForWrite: (path: string) => Promise<FileSystemDirectoryHandle>,
  ): Promise<OpenedFile | BatchReceipt> {
    try {
      const segments = this._splitPath(entry.path);
      const name = segments.pop();
      if (name === undefined) {
        return { outcome: 'failed', error: this._eisdir(entry.path) };
      }
      const directory = await openForWrite(segments.join('/'));
      try {
        const fileHandle = await directory.getFileHandle(name);
        return entry.create === true
          ? { outcome: 'failed', error: this._eexist(entry.path) }
          : { fileHandle, directory, name, createdFile: false };
      } catch (error) {
        if (hasDomName(error, 'TypeMismatchError')) {
          return {
            outcome: 'failed',
            error: entry.create === true ? this._eexist(entry.path) : this._eisdir(entry.path),
          };
        }
        if (!hasDomName(error, 'NotFoundError')) {
          throw error;
        }
      }
      try {
        const fileHandle = await directory.getFileHandle(name, { create: true });
        return { fileHandle, directory, name, createdFile: true };
      } catch (error) {
        throw hasDomName(error, 'TypeMismatchError') ? this._eisdir(entry.path) : error;
      }
    } catch (error) {
      return { outcome: 'failed', error };
    }
  }

  /**
   * Write an opened file's bytes. A file this batch created is removed again
   * when the bytes do not land, so its path is absent, as it was.
   *
   * @param entry - The write.
   * @param opened - Its opened file.
   * @returns Its receipt; never rejects.
   */
  private async _writeOpenedFile(entry: BatchWrite, opened: OpenedFile): Promise<BatchReceipt> {
    try {
      await this._writeBatchData(opened.fileHandle, entry.data, { directory: opened.directory, name: opened.name });
      return { outcome: 'applied', kind: 'file', ...(entry.create === true ? { created: true } : {}) };
    } catch (error) {
      if (opened.createdFile) {
        try {
          await this._removeEntry(entry.path, false, 'file');
          return { outcome: 'failed', error };
        } catch {
          return { outcome: 'uncertain', error };
        }
      }
      return isRefusal(error) ? { outcome: 'failed', error } : { outcome: 'uncertain', error };
    }
  }

  /**
   * One batch write on a root that keeps no record, or a write that is not a
   * create: open its file, then write it.
   *
   * @param entry - The write.
   * @param openForWrite - The batch's directory memo.
   * @returns Its receipt; never rejects.
   */
  private async _applyBatchWrite(
    entry: BatchWrite,
    openForWrite: (path: string) => Promise<FileSystemDirectoryHandle>,
  ): Promise<BatchReceipt> {
    const opened = await this._openBatchFile(entry, openForWrite);
    return 'outcome' in opened ? opened : this._writeOpenedFile(entry, opened);
  }

  /**
   * What kind of entry `path` names, from the directory handles alone.
   *
   * `stat` reads a file's leading bytes to classify its content; the existence
   * and kind checks a mutation makes before it writes need none of that, and
   * on OPFS the read was most of what a rename cost.
   *
   * @param path - Absolute path to look up.
   * @returns `'file'`, `'dir'`, or `undefined` when nothing is there.
   * @throws `ENOTDIR` when an ancestor of `path` is a file.
   */
  private async _entryKind(path: string): Promise<'file' | 'dir' | undefined> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      return 'dir';
    }
    let parent: FileSystemDirectoryHandle;
    try {
      parent = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
    const name = segments.at(-1)!;
    try {
      await parent.getFileHandle(name);
      return 'file';
    } catch (error) {
      if (!hasDomName(error, 'NotFoundError') && !hasDomName(error, 'TypeMismatchError')) {
        throw error;
      }
    }
    try {
      await parent.getDirectoryHandle(name);
      return 'dir';
    } catch (error) {
      if (hasDomName(error, 'NotFoundError') || hasDomName(error, 'TypeMismatchError')) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Decide what a listing does with a file whose stat failed after enumeration.
   *
   * `getFile()` on a removed entry rejects `NotFoundError`, and the entry is
   * skipped. Reading a `File` snapshot whose entry was removed or replaced
   * after `getFile()` rejects `NotReadableError`, which a permission failure
   * also raises: the name is looked up again, skipped when it is gone, and its
   * fresh handle returned when something is there now.
   *
   * @param directory - The directory being listed.
   * @param name - The entry whose stat failed.
   * @param error - The stat failure.
   * @returns A fresh handle to stat once more, or `undefined` to skip the entry.
   * @throws The original failure when it is neither of the two above.
   */
  private async _listedAgain(
    directory: FileSystemDirectoryHandle,
    name: string,
    error: unknown,
  ): Promise<FileSystemFileHandle | undefined> {
    if (hasDomName(error, 'NotFoundError')) {
      return undefined;
    }
    if (!hasDomName(error, 'NotReadableError')) {
      throw error;
    }
    try {
      return await directory.getFileHandle(name);
    } catch (lookupError) {
      if (hasDomName(lookupError, 'NotFoundError')) {
        return undefined;
      }
      throw error;
    }
  }

  private async _openExclusiveWritable(
    fileHandle: FileSystemFileHandle,
  ): Promise<FileSystemWritableFileStream | undefined> {
    if (this._exclusiveWritableSupported === false) {
      return undefined;
    }
    const capableHandle = fileHandle as ExclusiveWritableFileHandle;
    let writable: FileSystemWritableFileStream;
    try {
      writable = await capableHandle.createWritable({ keepExistingData: true, mode: 'exclusive' });
    } catch (error) {
      if (error instanceof TypeError) {
        this._exclusiveWritableSupported = false;
        return undefined;
      }
      throw error;
    }
    if (this._exclusiveWritableSupported === true) {
      return writable;
    }

    let competing: FileSystemWritableFileStream | undefined;
    try {
      competing = await fileHandle.createWritable();
    } catch (error) {
      if (hasDomName(error, 'NoModificationAllowedError')) {
        this._exclusiveWritableSupported = true;
        return writable;
      }
      try {
        await writable.abort(error);
      } catch {
        // Preserve the competing-writer probe failure.
      }
      throw error;
    }

    // Older Chromium ignores unknown Web IDL dictionary members, so a
    // successful competing writer proves `mode: 'exclusive'` was ignored.
    this._exclusiveWritableSupported = false;
    await Promise.allSettled([writable.abort(), competing.abort()]);
    return undefined;
  }

  /**
   * Remove one entry and forget the handles kept for it.
   *
   * @param path - Where the entry sits, relative to the root.
   * @param recursive - Remove a directory's contents too.
   * @param kind - `'file'` when the entry is known to be a file, so only its own kept handle is forgotten.
   */
  private async _removeEntry(path: string, recursive: boolean, kind?: 'file'): Promise<void> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      return;
    }
    const name = segments.pop()!;
    const parent = await this._resolveDirectoryHandle(segments.join('/'));
    await parent.removeEntry(name, { recursive });
    this._invalidateHandleCachePrefix(path, kind);
  }

  private async _missingDirectoryPaths(path: string): Promise<string[]> {
    const missing: string[] = [];
    let current = '';
    let ancestorMissing = false;
    for (const segment of this._splitPath(path)) {
      current = current === '' ? segment : `${current}/${segment}`;
      if (ancestorMissing) {
        missing.push(current);
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Determine exactly which destination ancestors the rename will create.
        await this._resolveDirectoryHandle(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        ancestorMissing = true;
        missing.push(current);
      }
    }
    return missing;
  }

  /**
   * Keep `handle` for `key` as the most recently used; a new key past the
   * bound evicts the least recently used, a known key only moves.
   *
   * @param key - The file's path.
   * @param handle - Its handle, from a listing or a lookup.
   */
  private _setFileHandleCache(key: string, handle: FileSystemFileHandle): void {
    if (this._fileHandleCache.has(key)) {
      this._fileHandleCache.delete(key);
    } else if (this._fileHandleCache.size >= this._handleCacheMax) {
      const firstKey = this._fileHandleCache.keys().next().value;
      if (firstKey !== undefined) {
        this._fileHandleCache.delete(firstKey);
      }
    }
    this._fileHandleCache.set(key, handle);
  }

  /**
   * Move a kept file handle that just answered to the most recently used end,
   * unless it was forgotten meanwhile.
   *
   * @param key - The file's path.
   * @param handle - The handle that answered.
   */
  private _touchFileHandleCache(key: string, handle: FileSystemFileHandle): void {
    if (this._fileHandleCache.get(key) === handle) {
      this._fileHandleCache.delete(key);
      this._fileHandleCache.set(key, handle);
    }
  }

  /**
   * Forget the file handles of the paths a batch's writes name. Its moves and
   * deletes go through rename, unlink and rmdir, which forget their own paths.
   *
   * @param entries - The batch that was applied.
   */
  private _forgetBatchFileHandles(entries: readonly BatchEntry[]): void {
    for (const entry of entries) {
      if (entry.op === 'write' || entry.op === 'append') {
        this._fileHandleCache.delete(entry.path);
      }
    }
  }

  /**
   * Forget the kept file handle at `path`, and for a path that may be a
   * directory every one under it; the root forgets them all.
   *
   * @param path - The file or directory whose handles go, relative to the root.
   * @param kind - `'file'` when `path` is known to be a file: only its own key is forgotten, without a scan.
   */
  private _forgetFileHandlesUnder(path: string, kind?: 'file'): void {
    if (kind === 'file') {
      this._fileHandleCache.delete(path);
      return;
    }
    if (path === '') {
      this._fileHandleCache.clear();
      return;
    }
    const prefix = `${path}/`;
    for (const key of this._fileHandleCache.keys()) {
      if (key === path || key.startsWith(prefix)) {
        this._fileHandleCache.delete(key);
      }
    }
  }

  private _setHandleCache(key: string, handle: FileSystemDirectoryHandle): void {
    if (this._handleCache.size >= this._handleCacheMax) {
      const firstKey = this._handleCache.keys().next().value;
      if (firstKey !== undefined) {
        this._handleCache.delete(firstKey);
      }
    }
    this._handleCache.set(key, handle);
  }

  /**
   * Move the entry for `key` to the end of the Map iteration order (most recently used).
   *
   * @param key - Cache key whose recency should be bumped.
   */
  private _touchHandleCache(key: string): void {
    const value = this._handleCache.get(key);
    if (value) {
      this._handleCache.delete(key);
      this._handleCache.set(key, value);
    }
  }

  private _invalidateHandleCachePrefix(path: string, kind?: 'file'): void {
    this._handleGeneration++;
    this._pendingDirectoryHandles.clear();
    this._forgetFileHandlesUnder(path, kind);
    if (path === '') {
      this._handleCache.clear();
      return;
    }
    const prefix = path + '/';
    for (const key of this._handleCache.keys()) {
      if (key === path || key.startsWith(prefix)) {
        this._handleCache.delete(key);
      }
    }
  }

  /**
   * Recursively copy every entry under the source directory to the
   * destination, then remove the source. Order matters: contents must be
   * written before the source is removed.
   *
   * @param from - Source absolute directory path.
   * @param to   - Destination absolute directory path.
   */
  private async _renameDirectory(from: string, to: string): Promise<void> {
    const createdDirectories = await this._missingDirectoryPaths(to);
    try {
      await this._copyDirectoryContents(from, to);

      const segments = this._splitPath(from);
      if (segments.length === 0) {
        throw new Error(`Cannot rename the filesystem root`);
      }
      const parentHandle = await this._resolveDirectoryHandle(segments.slice(0, -1).join('/'));
      const name = segments.at(-1)!;
      await parentHandle.removeEntry(name, { recursive: true });
      this._invalidateHandleCachePrefix(from);
    } catch (error) {
      if (createdDirectories.includes(to)) {
        try {
          await this._removeEntry(to, true);
        } catch {
          // Preserve the rename failure; remaining residue stays visible for recovery.
        }
      }
      await this._cleanupCreatedDirectories(createdDirectories.filter((path) => path !== to));
      throw error;
    }
  }

  /**
   * Copy every entry from `source` to `destination`, creating any missing
   * destination directories on the way.
   *
   * @param source      - Absolute source directory path.
   * @param destination - Absolute destination directory path.
   */
  private async _copyDirectoryContents(source: string, destination: string): Promise<void> {
    const sourceHandle = await this._resolveDirectoryHandle(source);
    await this.mkdir(destination, { recursive: true });

    for await (const [entryName, entryHandle] of directoryEntries(sourceHandle)) {
      if (entryHandle.kind === 'directory') {
        await this._copyDirectoryContents(`${source}/${entryName}`, `${destination}/${entryName}`);
      } else {
        const file = await entryHandle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        await this.writeFile(`${destination}/${entryName}`, bytes);
      }
    }
  }

  /**
   * {@link applyBatch} over entries that carry their bytes.
   *
   * @param entries - One phase's entries, none a large-object source.
   * @param options - The changeset's abort signal.
   * @returns One receipt per entry, in entry order.
   */
  private async _applyBytesBatch(
    entries: readonly BytesBatchEntry[],
    options: BatchOptions | undefined,
  ): Promise<BatchReceipt[]> {
    const directories = new Map<string, Promise<FileSystemDirectoryHandle>>();
    const openForWrite = async (path: string): Promise<FileSystemDirectoryHandle> => {
      if (path === '') {
        return this._rootHandle;
      }
      let pending = directories.get(path);
      if (pending === undefined) {
        const separator = path.lastIndexOf('/');
        const parent = separator === -1 ? '' : path.slice(0, separator);
        const name = path.slice(separator + 1);
        pending = (async () => {
          const handle = await openForWrite(parent);
          try {
            return await handle.getDirectoryHandle(name, { create: true });
          } catch (error) {
            throw hasDomName(error, 'TypeMismatchError') ? this._enotdir(path) : error;
          }
        })();
        directories.set(path, pending);
      }
      return pending;
    };
    const creates = entries.filter((entry): entry is BatchWrite => entry.op === 'write' && entry.create === true);
    const checks =
      this._uncommitted === undefined || creates.length === 0
        ? undefined
        : this._checkAndRecordCreates({
            uncommitted: this._uncommitted,
            creates,
            openForWrite,
            signal: options?.signal,
          });
    const receipts = await runBatch(
      entries,
      async (entry) => {
        if (entry.op !== 'write') {
          return applyEntryWithPrimitives(this, entry);
        }
        if (entry.create !== true) {
          return this._applyBatchWrite(entry, openForWrite);
        }
        if (checks !== undefined) {
          return this._applyCheckedCreate(entry, await checks.next(entry));
        }
        if (this._stageCreates) {
          const destination = await this._findCreateTarget(entry, openForWrite);
          return 'outcome' in destination ? destination : this._stageSiblingCreate(entry, destination);
        }
        return this._applyBatchWrite(entry, openForWrite);
      },
      options,
    );
    this._forgetBatchFileHandles(entries);
    const kept = await checks?.settled();
    if (kept !== undefined && this._uncommitted !== undefined) {
      /* Every writable of the batch has closed: the creates have settled. A
       * record left behind is harmless: its files hold their bytes. */
      try {
        await deleteUncommittedRecord(this._uncommitted.store, kept);
      } catch (error) {
        workerTimings.count('uncommitted.deleteFailed');
        console.error('[filesystem] A settled uncommitted-changeset record is still kept.', error);
      }
    }
    return receipts;
  }
}
