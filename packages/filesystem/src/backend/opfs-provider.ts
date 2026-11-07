/**
 * Origin Private File System (OPFS) filesystem provider.
 *
 * OPFS exposes the same directory-handle API as File System Access, so this
 * provider only supplies initialization, identity, and initialization guards.
 */

import type { ProviderCapabilities } from '#types.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { RootedFileSystemError } from '#workspace-errors.js';
import { holdRealmOwner, liveRealmOwners, realmOwnerId } from '#backend/uncommitted-changesets.js';
import type { UncommittedChangesetStore, UncommittedRecord } from '#backend/uncommitted-changesets.js';
import { randomUuid } from '@taucad/utils/id';
import { importStagingPrefix } from '#importer/staging.js';

/**
 * Subset of `FileSystemSyncAccessHandle` this provider uses. Declared locally
 * because the type ships in TypeScript's `webworker` lib, not `dom`.
 */
type SyncAccessHandle = {
  getSize(): number;
  write(data: Uint8Array<ArrayBuffer>, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
};

type SyncAccessCapableFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<SyncAccessHandle>;
};

/**
 * `FileSystemHandle.move()` as OPFS ships it. Declared locally because the DOM
 * lib does not type it yet, and absent in engines that never shipped it.
 */
type MovableFileHandle = FileSystemFileHandle & {
  move?: (destination: FileSystemDirectoryHandle, name: string) => Promise<void>;
};

type OPFSCapabilities = Omit<ProviderCapabilities, 'durability'> & {
  durability: NonNullable<ProviderCapabilities['durability']>;
};

const hasDomName = (error: unknown, name: string): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === name;

const writeAll = (handle: SyncAccessHandle, bytes: Uint8Array<ArrayBuffer>, offset: number): void => {
  let written = 0;
  while (written < bytes.byteLength) {
    const remaining = bytes.byteLength - written;
    const count = handle.write(bytes.subarray(written), { at: offset + written });
    if (!Number.isSafeInteger(count) || count <= 0 || count > remaining) {
      throw new Error(`OPFS sync write made invalid progress after ${written} of ${bytes.byteLength} bytes.`);
    }
    written += count;
  }
};

/** Batch writes at or above this size stage through a sync handle and move into place (I1). */
export const opfsLargeWriteBytes = 8 * 1024 * 1024;

/** The root directory large writes stage in; dot-named, so never a project directory. */
export const opfsStagingDirectory = '.tau-staging';

const readChunkBytes = 4 * 1024 * 1024;

/** Filesystem provider backed by the origin-private filesystem. @public */
export class OPFSProvider extends FileSystemAccessProvider {
  /**
   * OPFS backend identifier.
   *
   * @returns The OPFS backend identifier.
   */
  public override get id(): string {
    return 'opfs';
  }

  public override readonly capabilities: OPFSCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: true,
    durability: 'exclusive-append',
    trustworthyMtime: true,
    streamsWrites: true,
  };

  private _initialized = false;

  /**
   * Create an uninitialized provider. Call {@link initialize} before use.
   *
   * @param options - Where unsettled create changesets are recorded (I1):
   *   IndexedDB by default, `false` to keep no record; the storage-root key
   *   they are recorded under; and who is told the paths a recovery removed.
   */
  public constructor(
    options?: Readonly<{
      uncommitted?: UncommittedChangesetStore | false;
      root?: string;
      onRecovered?: (paths: readonly string[]) => void;
    }>,
  ) {
    // oxlint-disable-next-line typescript/no-unsafe-argument -- Placeholder handle is replaced in initialize().
    super(undefined as unknown as FileSystemDirectoryHandle, {
      uncommitted: { root: options?.root ?? 'opfs:origin', store: options?.uncommitted },
      onRecovered: options?.onRecovered,
    });
  }

  /**
   * Obtain the OPFS root directory handle.
   *
   * `navigator.storage.getDirectory` is a function in every WebKit session and
   * only the call separates a persistent profile from an ephemeral
   * (private-browsing) one, where it rejects with a bare
   * `UnknownError: The operation failed for an unknown transient reason (e.g.
   * out of memory).` — a message that is neither true nor actionable. Callers
   * get the typed root failure the filesystem bridge already carries instead.
   */
  public async initialize(): Promise<void> {
    this._initialized = false;
    try {
      this._rootHandle = await navigator.storage.getDirectory();
    } catch (error) {
      throw Object.assign(new RootedFileSystemError('ROOT_UNAVAILABLE'), { cause: error });
    }
    this.capabilities.durability = (await this._supportsSyncAccess()) ? 'exclusive-append' : 'stream-append';
    this._initialized = true;
    await super.refresh();
    await holdRealmOwner();
    await this._recoverDeadOwners();
  }

  /** Revoke the acquired OPFS root until the next successful initialize. */
  public override dispose(): void {
    this._initialized = false;
    super.dispose();
  }

  /**
   * Stage a large batch write through a sync access handle and move it over
   * the target natively, so the target holds its old bytes or its new ones and
   * never a torn file (I1). A crash leaves only the staged file, which the next
   * {@link initialize} in any realm removes once its owner's lock is gone.
   * Smaller writes take the writable stream's atomic swap.
   *
   * @param fileHandle - Handle for the target.
   * @param data - The bytes, in hand or staged.
   * @param destination - The target's directory and name.
   */
  protected override async _writeBatchData(
    fileHandle: FileSystemFileHandle,
    data: Uint8Array<ArrayBuffer> | Blob,
    destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<void> {
    const size = data instanceof Blob ? data.size : data.byteLength;
    if (size < opfsLargeWriteBytes || this.capabilities.durability !== 'exclusive-append') {
      await super._writeBatchData(fileHandle, data, destination);
      return;
    }
    if (!(await this._stageAndMove(data, destination))) {
      await super._writeBatchData(fileHandle, data, destination);
    }
  }

  /**
   * Publish a create whose record could not be kept by staging its bytes and
   * moving them into place, so its path never holds an empty file (I1).
   *
   * @param data - The bytes.
   * @param destination - The target's directory and name.
   * @returns Whether the file now holds the bytes; `false` without sync handles or `move`.
   */
  protected override async _stageCreate(
    data: Uint8Array<ArrayBuffer> | Blob,
    destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<boolean> {
    if (this.capabilities.durability !== 'exclusive-append') {
      return false;
    }
    return this._stageAndMove(data, destination);
  }

  /**
   * Stage a streamed write through a sync access handle, one chunk at a time,
   * and move it into place (W6.3): a crash leaves only the staged file, which
   * the next {@link initialize} removes once its owner's lock is gone.
   *
   * @param source - The bytes, in order.
   * @param destination - The target's directory and name.
   * @returns Whether the bytes were moved into place; `false` without sync handles or `move`.
   */
  protected override async _stageStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<boolean> {
    if (this.capabilities.durability !== 'exclusive-append') {
      return false;
    }
    return this._stageAndMove(source, destination);
  }

  /**
   * Write through a sync access handle — one acquisition instead of the
   * writable stream's three awaits plus its `.crswap` sibling file.
   *
   * A sync handle is exclusive: a concurrent holder makes acquisition throw
   * `NoModificationAllowedError`. One microtask retry covers the common
   * back-to-back-write case; anything still failing falls back to the
   * writable stream so no write that used to succeed starts failing.
   *
   * @param fileHandle - Handle for the already-created target file.
   * @param bytes - Full new contents.
   */
  protected override async _writeBytes(
    fileHandle: FileSystemFileHandle,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const acquire = (fileHandle as SyncAccessCapableFileHandle).createSyncAccessHandle;
    if (typeof acquire !== 'function') {
      await super._writeBytes(fileHandle, bytes);
      return;
    }

    let handle: SyncAccessHandle | undefined;
    for (let attempt = 0; attempt < 2 && handle === undefined; attempt++) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- The retry only exists to await a second attempt.
        handle = await acquire.call(fileHandle);
      } catch {
        // oxlint-disable-next-line no-await-in-loop -- Yield once so a same-tick holder can close.
        await Promise.resolve();
      }
    }
    if (handle === undefined) {
      await super._writeBytes(fileHandle, bytes);
      return;
    }

    try {
      // Write before truncate: a crash in between leaves the new content plus a
      // stale tail rather than an empty file.
      writeAll(handle, bytes, 0);
      handle.truncate(bytes.byteLength);
      handle.flush();
    } finally {
      handle.close();
    }
  }

  /** Append at the sync handle's current size and flush before releasing exclusivity. */
  protected override async _appendBytes(
    path: string,
    fileHandle: FileSystemFileHandle,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const acquire = (fileHandle as SyncAccessCapableFileHandle).createSyncAccessHandle;
    if (typeof acquire !== 'function') {
      await super._appendBytes(path, fileHandle, bytes);
      return;
    }

    let handle: SyncAccessHandle | undefined;
    for (let attempt = 0; attempt < 2 && handle === undefined; attempt++) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- The retry only exists to await a second attempt.
        handle = await acquire.call(fileHandle);
      } catch {
        // oxlint-disable-next-line no-await-in-loop -- Yield once so a same-tick holder can close.
        await Promise.resolve();
      }
    }
    if (handle === undefined) {
      await super._appendBytes(path, fileHandle, bytes);
      return;
    }

    try {
      writeAll(handle, bytes, handle.getSize());
      handle.flush();
    } finally {
      handle.close();
    }
  }

  /**
   * Move one file with the platform's native `move()`: one metadata operation
   * instead of reading the bytes, writing and flushing a copy, and unlinking
   * the source — and atomic, so an interrupted move never leaves both or
   * neither. {@link FileSystemAccessProvider.rename} refuses an existing
   * destination with `EEXIST` first, so the platform's own overwrite behaviour
   * is reached only by a writer outside this provider that creates the target
   * between that check and the move. An engine without `move()`, or one that
   * refuses it as unsupported, takes the inherited copy path. Other platform
   * refusals surface as the errno codes callers already branch on, with the
   * DOM exception as `cause`.
   *
   * @param from - Source file path.
   * @param to - Absent destination file path.
   */
  protected override async _moveFile(from: string, to: string): Promise<void> {
    const source = (await this._resolveFileHandle(from)) as MovableFileHandle;
    const { move } = source;
    if (typeof move !== 'function') {
      await super._moveFile(from, to);
      return;
    }
    const segments = this._splitPath(to);
    const name = segments.pop()!;
    const { directoryHandle, createdDirectories } = await this._openDirectoryForWrite(segments.join('/'));
    try {
      await move.call(source, directoryHandle, name);
    } catch (error) {
      await this._cleanupCreatedDirectories(createdDirectories);
      if (hasDomName(error, 'NotSupportedError')) {
        await super._moveFile(from, to);
        return;
      }
      throw this._moveError(error, from, to);
    }
  }

  protected override _assertReady(): void {
    if (!this._initialized) {
      throw new Error('OPFSProvider is not initialized. Call initialize() first.');
    }
  }

  /**
   * Translate a native `move()` refusal into the errno vocabulary of `rename`.
   *
   * @param error - What `move()` rejected with.
   * @param from - Source file path.
   * @param to - Destination file path.
   * @returns The errno error carrying `error` as its cause, or `error` itself when it has no errno equivalent.
   */
  private _moveError(error: unknown, from: string, to: string): unknown {
    const mapped = hasDomName(error, 'NotFoundError')
      ? this._enoent(from)
      : hasDomName(error, 'InvalidModificationError') || hasDomName(error, 'TypeMismatchError')
        ? this._eexist(to)
        : hasDomName(error, 'NoModificationAllowedError')
          ? this._errno('EBUSY', 'resource busy or locked', from)
          : undefined;
    return mapped === undefined ? error : Object.assign(mapped, { cause: error });
  }

  /**
   * Recover what owner realms that are gone left behind: staging directories
   * of large writes that never reached their move, and create changesets
   * recorded but never settled, whose files are checked for the crash shape
   * (I1). An owner whose lock is still held is writing, so its leftovers stay.
   */
  private async _recoverDeadOwners(): Promise<void> {
    let staging: FileSystemDirectoryHandle | undefined;
    try {
      staging = await this._rootHandle.getDirectoryHandle(opfsStagingDirectory);
    } catch {
      staging = undefined;
    }
    // List the owner directories and records before asking which locks are
    // held. An owner takes its lock before it creates its directory or records
    // a changeset, so everything listed here belonged to an owner that held its
    // lock by then; querying first would miss an owner that started between
    // the query and the listing and remove what it is writing.
    const owners: string[] = [];
    if (staging !== undefined) {
      for await (const name of (staging as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
        owners.push(name);
      }
    }
    let records: UncommittedRecord[] = [];
    if (this._uncommitted !== undefined) {
      try {
        records = await this._uncommitted.store.list(this._uncommitted.root);
      } catch (error) {
        console.error(`[filesystem] The unsettled creates of ${this._uncommitted.root} could not be listed.`, error);
      }
    }
    const live = await liveRealmOwners();
    if (live === undefined) {
      return;
    }
    await Promise.all(
      owners
        /* An import's staging is its journal, kept until its operation commits or is discarded (D12). */
        .filter((owner) => owner !== realmOwnerId && !live.has(owner) && !owner.startsWith(importStagingPrefix))
        .map(async (owner) => staging?.removeEntry(owner, { recursive: true }).catch(() => undefined)),
    );
    await this._verifyUncommitted(live, records);
  }

  /**
   * Write bytes to a staged file through a sync access handle, then move it
   * over the destination natively.
   *
   * @param data - The bytes, in hand or staged.
   * @param destination - The target's directory and name.
   * @returns Whether the bytes were moved into place; `false` when the engine lacks `move` or sync handles.
   */
  private async _stageAndMove(
    data: Uint8Array<ArrayBuffer> | Blob | ReadableStream<Uint8Array<ArrayBuffer>>,
    destination: Readonly<{ directory: FileSystemDirectoryHandle; name: string }>,
  ): Promise<boolean> {
    let size = data instanceof Blob ? data.size : data instanceof ReadableStream ? 0 : data.byteLength;
    const stagingRoot = await this._rootHandle.getDirectoryHandle(opfsStagingDirectory, { create: true });
    const staging = await stagingRoot.getDirectoryHandle(realmOwnerId, { create: true });
    const stagedName = randomUuid();
    const staged = (await staging.getFileHandle(stagedName, { create: true })) as SyncAccessCapableFileHandle &
      MovableFileHandle;
    if (typeof staged.move !== 'function' || typeof staged.createSyncAccessHandle !== 'function') {
      await staging.removeEntry(stagedName);
      return false;
    }
    try {
      const handle = await staged.createSyncAccessHandle();
      try {
        if (data instanceof ReadableStream) {
          const reader = data.getReader();
          try {
            // oxlint-disable-next-line no-await-in-loop -- one chunk in memory at a time.
            for (let read = await reader.read(); !read.done; read = await reader.read()) {
              writeAll(handle, read.value, size);
              size += read.value.byteLength;
            }
          } catch (error) {
            await reader.cancel(error).catch(() => undefined);
            throw error;
          }
        } else if (data instanceof Blob) {
          for (let offset = 0; offset < size; offset += readChunkBytes) {
            // oxlint-disable-next-line no-await-in-loop -- one bounded chunk in memory at a time.
            const chunk = new Uint8Array(await data.slice(offset, offset + readChunkBytes).arrayBuffer());
            writeAll(handle, chunk, offset);
          }
        } else {
          writeAll(handle, data, 0);
        }
        handle.truncate(size);
        handle.flush();
      } finally {
        handle.close();
      }
      await staged.move(destination.directory, destination.name);
      return true;
    } catch (error) {
      await staging.removeEntry(stagedName).catch(() => undefined);
      throw error;
    }
  }

  private async _supportsSyncAccess(): Promise<boolean> {
    const probeName = `.tau-opfs-sync-probe-${randomUuid()}`;
    const fileHandle = await this._rootHandle.getFileHandle(probeName, { create: true });
    try {
      const acquire = (fileHandle as SyncAccessCapableFileHandle).createSyncAccessHandle;
      if (typeof acquire !== 'function') {
        return false;
      }
      let handle: SyncAccessHandle;
      try {
        handle = await acquire.call(fileHandle);
      } catch {
        return false;
      }
      handle.close();
      return true;
    } finally {
      await this._rootHandle.removeEntry(probeName);
    }
  }
}
