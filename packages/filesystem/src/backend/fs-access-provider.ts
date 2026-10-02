/**
 * File System Access API filesystem provider.
 *
 * Wraps a user-selected `FileSystemDirectoryHandle` (from `showDirectoryPicker()`)
 * to provide direct read/write access to a local directory. Also serves as the
 * base for OPFSProvider since OPFS exposes the same handle API.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
 */

import type { FileReadStreamOptions, FileStat, ProviderCapabilities } from '#types.js';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { streamChunkSize } from '#backend/stream-utils.js';

const handleCacheMaxEntries = 10_000;

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
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const fileHandle = await this._resolveFileHandle(path, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(bytes);
    } finally {
      await writable.close();
    }
  }

  /**
   * List immediate child names under `path`.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns The names of files and subdirectories directly inside `path`.
   */
  public async readdir(path: string): Promise<string[]> {
    const directoryHandle = await this._resolveDirectoryHandle(path);
    const entries: string[] = [];
    for await (const [name] of directoryHandle.entries()) {
      entries.push(name);
    }
    return entries;
  }

  /**
   * Batched readdir + stat — eliminates the N+1 stat round-trips per directory listing.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
    const directoryHandle = await this._resolveDirectoryHandle(path);
    const result: Array<{ name: string } & FileStat> = [];
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind === 'directory') {
        result.push({ name, type: 'dir', size: 0, mtimeMs: Date.now() });
      } else {
        // oxlint-disable-next-line no-await-in-loop -- Sequential within single directory iteration
        const file = await handle.getFile();
        result.push({ name, type: 'file', size: file.size, mtimeMs: file.lastModified });
      }
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
    const segments = this._splitPath(path);

    if (segments.length === 0) {
      return { type: 'dir', size: 0, mtimeMs: Date.now() };
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;

    try {
      const fileHandle = await parentHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      return { type: 'file', size: file.size, mtimeMs: file.lastModified };
    } catch {
      try {
        await parentHandle.getDirectoryHandle(name);
        return { type: 'dir', size: 0, mtimeMs: Date.now() };
      } catch {
        throw this._enoent(path);
      }
    }
  }

  /**
   * Delete the regular file at `path`.
   *
   * @param path - Absolute file path to remove.
   */
  public async unlink(path: string): Promise<void> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._enoent(path);
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    await parentHandle.removeEntry(name);
  }

  /**
   * Delete the directory at `path` (non-recursive).
   *
   * @param path - Absolute directory path to remove.
   */
  public async rmdir(path: string): Promise<void> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._enoent(path);
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    await parentHandle.removeEntry(name, { recursive: false });
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
    const sourceStat = await this.stat(from);
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
   * Stream the contents of `path` with optional positional/length slicing and abort support.
   *
   * @param path - Absolute file path to read.
   * @param options - Optional `position`, `length`, and `signal` for partial reads.
   * @returns A `ReadableStream` of byte chunks.
   */
  public readFileStream(path: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> {
    const resolveHandle = async () => this._resolveFileHandle(path);
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;

    return new ReadableStream({
      start: async (controller) => {
        try {
          const fileHandle = await resolveHandle();
          const file = await fileHandle.getFile();

          let blob: Blob = file;
          if (options?.position !== undefined || options?.length !== undefined) {
            const start = options.position ?? 0;
            const end = options.length === undefined ? file.size : start + options.length;
            blob = file.slice(start, end);
          }

          const nativeStream = blob.stream();
          reader = nativeStream.getReader();

          let buffer = new Uint8Array(0);

          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- reader loop
          while (true) {
            if (options?.signal?.aborted) {
              controller.error(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }

            // oxlint-disable-next-line no-await-in-loop -- Sequential stream reads
            const { done, value } = await reader.read();
            if (done) {
              if (buffer.byteLength > 0) {
                controller.enqueue(buffer);
              }
              controller.close();
              return;
            }

            const merged = new Uint8Array(buffer.byteLength + value.byteLength);
            merged.set(buffer);
            merged.set(value, buffer.byteLength);
            buffer = merged;

            while (buffer.byteLength >= streamChunkSize) {
              controller.enqueue(buffer.slice(0, streamChunkSize));
              buffer = buffer.slice(streamChunkSize);
            }
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel: async () => {
        try {
          await reader?.cancel();
        } catch {
          // Reader may already be closed; safe to ignore
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Protected instance methods
  // ---------------------------------------------------------------------------

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const fileHandle = await this._resolveFileHandle(path);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  protected async mkdirSingle(path: string): Promise<void> {
    this._invalidateHandleCachePrefix(path);
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      return;
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;

    try {
      await parentHandle.getDirectoryHandle(name);
      const error = new Error(`EEXIST: directory already exists '${path}'`);
      (error as NodeJS.ErrnoException).code = 'EEXIST';
      throw error;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw error;
      }
    }

    await parentHandle.getDirectoryHandle(name, { create: true });
  }

  protected async _resolveDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
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
      } catch {
        throw this._enoent(path);
      }
      this._setHandleCache(resolvedPath, handle);
    }

    return handle;
  }

  protected async _resolveFileHandle(path: string, options?: { create: boolean }): Promise<FileSystemFileHandle> {
    const segments = this._splitPath(path);
    if (segments.length === 0) {
      throw this._enoent(path);
    }

    const fileName = segments.pop()!;

    if (options?.create && segments.length > 0) {
      let directoryHandle = this._rootHandle;
      for (const segment of segments) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential directory creation required
        directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create: true });
      }
      return directoryHandle.getFileHandle(fileName, { create: true });
    }

    const parentHandle = await this._resolveDirectoryHandle('/' + segments.join('/'));

    try {
      return await parentHandle.getFileHandle(fileName, { create: options?.create });
    } catch {
      throw this._enoent(path);
    }
  }

  protected _splitPath(path: string): string[] {
    return path.split('/').filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Private instance methods
  // ---------------------------------------------------------------------------

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
    await this._copyDirectoryContents(from, to);

    const segments = this._splitPath(from);
    if (segments.length === 0) {
      throw new Error(`Cannot rename the filesystem root`);
    }
    const parentHandle = await this._resolveDirectoryHandle('/' + segments.slice(0, -1).join('/'));
    const name = segments.at(-1)!;
    await parentHandle.removeEntry(name, { recursive: true });
    this._invalidateHandleCachePrefix(from);
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

    const destinationSegments = this._splitPath(destination);
    let destinationHandle = this._rootHandle;
    for (const segment of destinationSegments) {
      // oxlint-disable-next-line no-await-in-loop -- Sequential directory creation required
      destinationHandle = await destinationHandle.getDirectoryHandle(segment, { create: true });
    }

    for await (const [entryName, entryHandle] of sourceHandle.entries()) {
      if (entryHandle.kind === 'directory') {
        await this._copyDirectoryContents(`${source}/${entryName}`, `${destination}/${entryName}`);
      } else {
        const file = await entryHandle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const destinationFile = await destinationHandle.getFileHandle(entryName, { create: true });
        const writable = await destinationFile.createWritable();
        try {
          await writable.write(bytes);
        } finally {
          await writable.close();
        }
      }
    }
  }

  private _enoent(path: string): Error {
    const error = new Error(`ENOENT: no such file or directory '${path}'`);
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    return error;
  }
}
