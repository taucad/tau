/**
 * Origin Private File System (OPFS) filesystem provider.
 *
 * OPFS exposes the same directory-handle API as File System Access, so this
 * provider only supplies initialization, identity, and initialization guards.
 */

import type { ProviderCapabilities } from '#types.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { RootedFileSystemError } from '#workspace-errors.js';
import { randomUuid } from '@taucad/utils/id';

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

type OPFSCapabilities = Omit<ProviderCapabilities, 'durability'> & {
  durability: NonNullable<ProviderCapabilities['durability']>;
};

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
  };

  private _initialized = false;

  /** Create an uninitialized provider. Call {@link initialize} before use. */
  // oxlint-disable-next-line typescript/no-unsafe-argument -- Placeholder handle is replaced in initialize().
  public constructor() {
    super(undefined as unknown as FileSystemDirectoryHandle);
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
  }

  /** Revoke the acquired OPFS root until the next successful initialize. */
  public override dispose(): void {
    this._initialized = false;
    super.dispose();
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

  protected override _assertReady(): void {
    if (!this._initialized) {
      throw new Error('OPFSProvider is not initialized. Call initialize() first.');
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
