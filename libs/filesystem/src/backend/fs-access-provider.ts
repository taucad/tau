/**
 * File System Access API filesystem provider.
 *
 * Wraps a user-selected `FileSystemDirectoryHandle` (from `showDirectoryPicker()`)
 * to provide direct read/write access to a local directory. Also serves as the
 * base for OPFSProvider since OPFS exposes the same handle API.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
 */

import type { DirectoryEntry, FileReadStreamOptions, FileStat, ProviderCapabilities } from '#types.js';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { fileStatFromFile } from '#content-metadata.js';
import { validateFileReadStreamOptions } from '#backend/stream-utils.js';

const handleCacheMaxEntries = 10_000;

/**
 * Concurrent `getFile()` calls per directory listing. High enough to hide
 * per-handle latency, low enough not to swamp the File System Access queue.
 */
const statConcurrency = 16;

type FileSystemDirectoryEntryHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
type IterableFileSystemDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryEntryHandle]>;
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
  };

  protected _rootHandle: FileSystemDirectoryHandle;
  private readonly _handleCache = new Map<string, FileSystemDirectoryHandle>();
  private readonly _handleCacheMax = handleCacheMaxEntries;

  public constructor(rootHandle: FileSystemDirectoryHandle) {
    super();
    this._rootHandle = rootHandle;
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
    const directoryHandle = await this._resolveDirectoryHandle(path);
    const entries: DirectoryEntry[] = [];
    for await (const [name, handle] of directoryEntries(directoryHandle)) {
      entries.push({ name, kind: handle.kind === 'directory' ? 'dir' : 'file' });
    }
    return entries;
  }

  /**
   * Batched readdir + stat — eliminates the N+1 stat round-trips per directory
   * listing. Child metadata comes from the `File` object; contents are read only
   * when {@link fileStatFromFile} needs them, in chunks of {@link statConcurrency}.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
    this._assertReady();
    const directoryHandle = await this._resolveDirectoryHandle(path);
    const handles: Array<[string, FileSystemDirectoryEntryHandle]> = [];
    for await (const entry of directoryEntries(directoryHandle)) {
      handles.push(entry);
    }

    const result: Array<{ name: string } & FileStat> = [];
    for (let offset = 0; offset < handles.length; offset += statConcurrency) {
      // oxlint-disable-next-line no-await-in-loop -- Chunked awaits are what bounds concurrency to statConcurrency.
      const chunk = await Promise.all(
        handles
          .slice(offset, offset + statConcurrency)
          .map(async ([name, handle]) =>
            handle.kind === 'directory'
              ? ({ name, type: 'dir', size: 0, mtimeMs: 0 } satisfies { name: string } & FileStat)
              : { name, ...(await fileStatFromFile(await handle.getFile())) },
          ),
      );
      result.push(...chunk);
    }
    return result;
  }

  /**
   * Resolve metadata for `path`. Throws `ENOENT` when neither a file nor directory entry matches.
   *
   * @param path - Absolute path to stat.
   * @returns Type/size/mtime for the entry at `path`.
   */
  public async stat(path: string): Promise<FileStat> {
    this._assertReady();
    const segments = this._splitPath(path);

    if (segments.length === 0) {
      return { type: 'dir', size: 0, mtimeMs: 0 };
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;

    let fileError: unknown;
    try {
      const fileHandle = await parentHandle.getFileHandle(name);
      return await fileStatFromFile(await fileHandle.getFile());
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
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eisdir(path);
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    const entry = await this.stat(path);
    if (entry.type === 'dir') {
      throw this._eisdir(path);
    }
    await parentHandle.removeEntry(name);
  }

  /**
   * Delete the directory at `path` (non-recursive).
   *
   * @param path - Absolute directory path to remove.
   */
  public async rmdir(path: string): Promise<void> {
    this._assertReady();
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._enoent(path);
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    const entry = await this.stat(path);
    if (entry.type !== 'dir') {
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
   * Move the file or directory at `from` to `to`. Files are copied + unlinked
   * (the FS Access API has no native rename); directories are walked
   * recursively and re-created under the new path.
   *
   * @param from - Source absolute path.
   * @param to - Destination absolute path.
   */
  public async rename(from: string, to: string): Promise<void> {
    this._assertReady();
    if (from === to) {
      await this.stat(from);
      return;
    }
    if (from === '/') {
      throw this._einval(from);
    }
    const sourceStat = await this.stat(from);
    if (sourceStat.type === 'dir' && to.startsWith(`${from}/`)) {
      throw this._einval(to);
    }
    try {
      await this.stat(to);
      throw this._eexist(to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    if (sourceStat.type === 'dir') {
      await this._renameDirectory(from, to);
      return;
    }
    const data = await this.readFileRaw(from);
    await this.writeFile(to, data);
    await this.unlink(from);
    this._invalidateHandleCachePrefix(from);
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
      return;
    }
    for (const prefix of prefixes) {
      this._invalidateHandleCachePrefix(prefix);
    }
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

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    this._assertReady();
    const fileHandle = await this._resolveFileHandle(path);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  protected async mkdirSingle(path: string): Promise<void> {
    this._assertReady();
    this._invalidateHandleCachePrefix(path);
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eexist(path);
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
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
    const cached = this._handleCache.get(path);
    if (cached) {
      this._touchHandleCache(path);
      return cached;
    }

    const segments = this._splitPath(path);
    let handle = this._rootHandle;
    let resolvedPath = '';

    for (const segment of segments) {
      resolvedPath += '/' + segment;
      const cachedSegment = this._handleCache.get(resolvedPath);
      if (cachedSegment) {
        this._touchHandleCache(resolvedPath);
        handle = cachedSegment;
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential directory traversal required
        handle = await handle.getDirectoryHandle(segment);
      } catch (error) {
        if (hasDomName(error, 'TypeMismatchError')) {
          throw this._enotdir(resolvedPath);
        }
        if (hasDomName(error, 'NotFoundError')) {
          throw this._enoent(path);
        }
        throw error;
      }
      this._setHandleCache(resolvedPath, handle);
    }

    return handle;
  }

  protected async _resolveFileHandle(path: string): Promise<FileSystemFileHandle> {
    this._assertReady();
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eisdir(path);
    }

    const fileName = segments.pop()!;

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.join('/'));

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
    return path.split('/').filter(Boolean);
  }

  /** Lifecycle readiness hook. Handle-backed user roots are ready at construction. */
  // oxlint-disable-next-line no-empty-function -- OPFS overrides this hook; ordinary File System Access roots are ready at construction.
  protected _assertReady(): void {}

  // ---------------------------------------------------------------------------
  // Private instance methods
  // ---------------------------------------------------------------------------

  private async _createFileHandle(path: string): Promise<{
    fileHandle: FileSystemFileHandle;
    createdFile: boolean;
    createdDirectories: string[];
  }> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._eisdir(path);
    }
    const fileName = segments.pop()!;
    const createdDirectories: string[] = [];
    let directoryHandle = this._rootHandle;
    let directoryPath = '';

    try {
      for (const segment of segments) {
        directoryPath += `/${segment}`;
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

  private async _cleanupFailedFileCreation(
    path: string,
    created: { createdFile: boolean; createdDirectories: readonly string[] },
  ): Promise<void> {
    if (created.createdFile) {
      try {
        await this._removeEntry(path, false);
      } catch {
        return;
      }
    }
    await this._cleanupCreatedDirectories(created.createdDirectories);
  }

  private async _cleanupCreatedDirectories(paths: readonly string[]): Promise<void> {
    for (const path of paths.toReversed()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Cleanup must proceed from deepest child to parent.
        await this._removeEntry(path, false);
      } catch {
        break;
      }
    }
  }

  private async _removeEntry(path: string, recursive: boolean): Promise<void> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      return;
    }
    const name = segments.pop()!;
    const parent = await this._resolveDirectoryHandle(`/${segments.join('/')}`);
    await parent.removeEntry(name, { recursive });
    this._invalidateHandleCachePrefix(path);
  }

  private async _missingDirectoryPaths(path: string): Promise<string[]> {
    const missing: string[] = [];
    let current = '';
    let ancestorMissing = false;
    for (const segment of this._splitPath(path)) {
      current += `/${segment}`;
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

  private _invalidateHandleCachePrefix(path: string): void {
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
      const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
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
}
