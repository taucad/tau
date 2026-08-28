/**
 * Path-keyed IndexedDB filesystem provider.
 *
 * Replaces ZenFS's inode-based IndexedDB layer with a VS Code-style
 * design: paths are keys, file content is the value, directory metadata
 * is derived from key prefixes, and `getAllKeys()` hydrates an in-memory
 * path set on init (~26ms for 10k entries vs ~12s ZenFS full scan).
 */

import type { FileContentMetadata } from '@taucad/types';
import type { DirectoryEntry, FileStat, ProviderCapabilities } from '#types.js';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { indexDirectoryEntries } from '#backend/directory-entries.js';
import { getFileContentMetadata } from '#content-metadata.js';

const storeName = 'files';
const dbVersion = 1;
const directoryKeyPrefix = '\0directory:';

const toStoragePath = (path: string): string => `/${path}`;
const fromStoragePath = (path: string): string => (path.startsWith('/') ? path.slice(1) : path);
const directoryStorageKey = (path: string): string => `${directoryKeyPrefix}${toStoragePath(path)}`;
const directoryPathFromKey = (key: string): string | undefined =>
  key.startsWith(directoryKeyPrefix) ? fromStoragePath(key.slice(directoryKeyPrefix.length)) : undefined;

function parentDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? '' : path.slice(0, lastSlash);
}

/**
 * Filesystem provider backed by a single IndexedDB object store
 * with path-as-key, content-as-value storage.
 *
 * @public
 */
export class DirectIdbProvider extends AbstractFileSystemProvider {
  /* eslint-disable @typescript-eslint/member-ordering -- `_renameDirectory` and the IDB flush helpers are intentionally co-located with the public methods that call them so the IDB-transaction lifecycle stays readable; relocating them would split a tightly-coupled triple. */
  /**
   * Backend identifier; always `'indexeddb'`.
   * @returns The literal string `'indexeddb'`.
   */
  public get id(): string {
    return 'indexeddb';
  }

  public readonly capabilities: ProviderCapabilities;

  private _db: IDBDatabase | undefined;
  private readonly _dbName: string;

  /** In-memory path index: tracks all file paths for O(1) existence/readdir. */
  private _paths = new Set<string>();
  /** In-memory directory set: derived from file paths. */
  private _dirs = new Set<string>(['']);
  /**
   * Metadata for rows this provider has written or read, so `stat` does not
   * fetch the whole blob again.
   *
   * ponytail: coherent because this provider is the only writer in its tab and
   * {@link refresh} clears it; a peer tab's write is visible only after the
   * refresh the cross-tab coordinator already triggers.
   */
  private _fileMeta = new Map<string, { size: number } & FileContentMetadata>();
  /** Pending writes accumulated for the next batched IDB transaction. */
  private readonly _writeBatch: Array<{
    path: string;
    data: Uint8Array<ArrayBuffer>;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];
  /** Admitted writes that have not settled, used to reject concurrent tree collisions. */
  private readonly _pendingWritePaths = new Map<string, number>();
  /** Promise for the currently in-flight flush, or undefined when idle. */
  private _flushActive: Promise<void> | undefined;
  public constructor(databasePrefix: string) {
    super();
    this._dbName = `${databasePrefix}-fs-direct`;
    this.capabilities = {
      persistent: true,
      writable: true,
      quotaBased: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Public instance methods
  // ---------------------------------------------------------------------------

  /**
   * Open (or create) the IndexedDB database and hydrate the in-memory
   * path index via `getAllKeys()`.
   */
  public async initialize(): Promise<void> {
    const database = await this._openDb();
    this._db = database;
    try {
      const snapshot = await this._readPathIndexSnapshot();
      this._paths = snapshot.paths;
      this._dirs = snapshot.directories;
      this._fileMeta = new Map();
    } catch (error) {
      database.close();
      if (this._db === database) {
        this._db = undefined;
      }
      throw error;
    }
  }

  /** Refresh the provider's metadata indexes from the backing database. */
  public async refresh(): Promise<void> {
    this._ensureOpen();
    const snapshot = await this._readPathIndexSnapshot();
    this._paths = snapshot.paths;
    this._dirs = snapshot.directories;
    this._fileMeta = new Map();
  }

  /**
   * Persist `data` at `path`, creating any missing parent directories.
   * Writes are batched into a single IDB transaction.
   *
   * @param path - Absolute file path to write.
   * @param data - Bytes or UTF-8 string to store.
   * @returns A promise that settles when the queued generation commits or fails.
   */
  public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._ensureOpen();
    this._assertRootedPath(path);
    this._assertWritablePath(path);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const deferred = Promise.withResolvers<void>();
    this._pendingWritePaths.set(path, (this._pendingWritePaths.get(path) ?? 0) + 1);
    this._writeBatch.push({ path, data: bytes, resolve: deferred.resolve, reject: deferred.reject });
    this._flushActive ??= this._drainFlushes();
    return deferred.promise.finally(() => {
      const remaining = (this._pendingWritePaths.get(path) ?? 1) - 1;
      if (remaining === 0) {
        this._pendingWritePaths.delete(path);
      } else {
        this._pendingWritePaths.set(path, remaining);
      }
    });
  }

  /**
   * List immediate child names under `path` (resolved from the in-memory path index).
   *
   * @param path - Absolute directory path to enumerate.
   * @returns The names of files and subdirectories directly inside `path`.
   */
  public async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirEntries(path);
    return entries.map((entry) => entry.name);
  }

  /**
   * List immediate children of `path` with their kinds, resolved from the
   * in-memory path index — no row reads.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its kind.
   */
  public async readdirEntries(path: string): Promise<DirectoryEntry[]> {
    this._ensureOpen();
    this._assertRootedPath(path);
    if (this._paths.has(path)) {
      throw this._enotdir(path);
    }
    if (!this._dirs.has(path)) {
      throw this._enoent(path);
    }

    const prefix = path === '' ? '' : `${path}/`;
    return indexDirectoryEntries(prefix, this._paths, this._dirs);
  }

  /**
   * Batched readdir + stat — eliminates the N+1 stat round-trips per directory listing.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
    this._assertRootedPath(path);
    const names = await this.readdir(path);
    const prefix = path === '' ? '' : `${path}/`;
    const result: Array<{ name: string } & FileStat> = [];
    const fileMetadataPaths: Array<{
      index: number;
      fullPath: string;
      cached: ({ size: number } & FileContentMetadata) | undefined;
    }> = [];
    const missingIndexes = new Set<number>();

    for (const name of names) {
      const fullPath = `${prefix}${name}`;
      if (this._dirs.has(fullPath)) {
        result.push({
          name,
          type: 'dir',
          size: 0,
          mtimeMs: 0,
        });
      } else {
        const cached = this._fileMeta.get(fullPath);
        fileMetadataPaths.push({ index: result.length, fullPath, cached });
        result.push(
          cached
            ? { name, type: 'file', mtimeMs: 0, ...cached }
            : {
                name,
                type: 'file',
                size: 0,
                mtimeMs: 0,
                contentKind: 'text',
                lineCount: 1,
              },
        );
      }
    }

    if (fileMetadataPaths.length > 0 && this._db) {
      await new Promise<void>((resolve, reject) => {
        const tx = this._db!.transaction(storeName, 'readonly');
        let remaining = fileMetadataPaths.length;

        const store = tx.objectStore(storeName);
        const bindRequest = (
          request: IDBRequest,
          entry: { entryFullPath: string; entryIndex: number; cached: boolean },
        ) => {
          const { entryFullPath, entryIndex, cached } = entry;
          request.addEventListener('success', () => {
            const row = request.result as Uint8Array<ArrayBuffer> | IDBValidKey | undefined;
            if (row === undefined) {
              this._purgeFileProjection(entryFullPath);
              missingIndexes.add(entryIndex);
            } else if (!cached) {
              result[entryIndex] = {
                name: result[entryIndex]!.name,
                type: 'file',
                mtimeMs: 0,
                ...this._rememberFileMeta(entryFullPath, row as Uint8Array<ArrayBuffer>),
              };
            }
            remaining--;
            if (remaining === 0) {
              resolve();
            }
          });
          request.addEventListener('error', () => {
            reject(request.error ?? new Error(`IDB get failed for '${entryFullPath}'`));
          });
        };
        for (const { index, fullPath, cached } of fileMetadataPaths) {
          // Cached rows only need an existence probe; uncached rows need the bytes.
          const storagePath = toStoragePath(fullPath);
          bindRequest(cached ? store.getKey(storagePath) : store.get(storagePath), {
            entryFullPath: fullPath,
            entryIndex: index,
            cached: cached !== undefined,
          });
        }
      });
    }

    return result.filter((_, index) => !missingIndexes.has(index));
  }

  /**
   * Resolve authoritative metadata for `path` from the durable row.
   *
   * @param path - Absolute path to stat.
   * @returns Type/size/mtime for the entry at `path`.
   */
  public async stat(path: string): Promise<FileStat> {
    this._ensureOpen();
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: 0 };
    }
    const cached = this._fileMeta.get(path);
    if (cached && this._paths.has(path)) {
      // The durable row still decides existence — `getKey` confirms it without
      // transferring (and structured-cloning) the whole blob.
      if (await this._idbHasKey(path)) {
        return { type: 'file', mtimeMs: 0, ...cached };
      }
      this._purgeFileProjection(path);
      throw this._enoent(path);
    }
    if (this._paths.has(path)) {
      const data = await this._idbGet(path);
      if (data === undefined) {
        this._purgeFileProjection(path);
        throw this._enoent(path);
      }
      return { type: 'file', mtimeMs: 0, ...this._rememberFileMeta(path, data) };
    }
    const repaired = await this._idbGet(path);
    if (repaired !== undefined) {
      this._paths.add(path);
      this._ensureParentDirs(path);
      return { type: 'file', mtimeMs: 0, ...this._rememberFileMeta(path, repaired) };
    }
    throw this._enoent(path);
  }

  /**
   * Delete the regular file at `path` from IDB and the in-memory index.
   *
   * @param path - Absolute file path to remove.
   */
  public async unlink(path: string): Promise<void> {
    this._ensureOpen();
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      throw this._eisdir(path);
    }
    if (!this._paths.has(path)) {
      throw this._enoent(path);
    }
    await this._idbDelete(toStoragePath(path));
    this._purgeFileProjection(path);
  }

  /**
   * Drop the directory entry for `path`. Refuses to remove the root.
   *
   * @param path - Absolute directory path to remove.
   */
  public async rmdir(path: string): Promise<void> {
    this._ensureOpen();
    this._assertRootedPath(path);
    if (this._paths.has(path)) {
      throw this._enotdir(path);
    }
    if (!this._dirs.has(path) || path === '') {
      throw this._enoent(path);
    }
    const prefix = `${path}/`;
    if ([...this._paths, ...this._dirs].some((entry) => entry.startsWith(prefix))) {
      throw this._enotempty(path);
    }
    await this._idbDelete(directoryStorageKey(path));
    this._dirs.delete(path);
  }

  /**
   * Move the file or directory at `from` to `to`. Files are moved via
   * copy + delete (IDB has no atomic rename). Directories are walked and
   * every contained file is re-keyed under the new prefix atomically
   * within a single IDB transaction.
   *
   * @param from - Source absolute path.
   * @param to - Destination absolute path.
   */
  public async rename(from: string, to: string): Promise<void> {
    this._ensureOpen();
    this._assertRootedPath(from);
    this._assertRootedPath(to);
    if (from === to) {
      if (!this._dirs.has(from) && !this._paths.has(from)) {
        throw this._enoent(from);
      }
      return;
    }

    if (this._dirs.has(from) && !this._paths.has(from)) {
      if (from === '' || to.startsWith(`${from}/`)) {
        throw this._einval(to);
      }
      if (this._dirs.has(to) || this._paths.has(to)) {
        throw this._eexist(to);
      }
      this._assertNoFileAncestor(to);
      await this._renameDirectory(from, to);
      return;
    }

    if (!this._paths.has(from)) {
      throw this._enoent(from);
    }
    if (this._dirs.has(to) || this._paths.has(to)) {
      throw this._eexist(to);
    }
    this._assertNoFileAncestor(to);
    const data = await this._idbGet(from);
    if (data === undefined) {
      this._purgeFileProjection(from);
      throw this._enoent(from);
    }
    await new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(data, toStoragePath(to));
      store.delete(toStoragePath(from));
      this._putParentDirectoryRows(store, to);
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('File rename transaction failed'));
      });
      tx.addEventListener('abort', () => {
        reject(tx.error ?? new Error('File rename transaction aborted'));
      });
    });
    this._ensureParentDirs(to);
    this._purgeFileProjection(from);
    this._paths.add(to);
    this._rememberFileMeta(to, data);
  }

  private async _renameDirectory(from: string, to: string): Promise<void> {
    this._ensureOpen();

    const sourcePrefix = `${from}/`;
    const filePaths: string[] = [];
    for (const path of this._paths) {
      if (path.startsWith(sourcePrefix)) {
        filePaths.push(path);
      }
    }

    const directoriesToMove: string[] = [from];
    for (const directory of this._dirs) {
      if (directory.startsWith(sourcePrefix)) {
        directoriesToMove.push(directory);
      }
    }

    const fileData = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const path of filePaths) {
      // oxlint-disable-next-line no-await-in-loop -- Sequential reads required to assemble the directory subtree before the rewrite transaction
      const data = await this._idbGet(path);
      if (data !== undefined) {
        fileData.set(path, data);
      }
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const [oldPath, data] of fileData) {
        const newPath = to + oldPath.slice(from.length);
        store.delete(toStoragePath(oldPath));
        store.put(data, toStoragePath(newPath));
      }
      for (const directory of directoriesToMove) {
        const newDirectory = to + directory.slice(from.length);
        store.delete(directoryStorageKey(directory));
        store.put(true, directoryStorageKey(newDirectory));
      }
      this._putParentDirectoryRows(store, to);
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Directory rename transaction failed'));
      });
      tx.addEventListener('abort', () => {
        reject(tx.error ?? new Error('Directory rename transaction aborted'));
      });
    });

    this._ensureParentDirs(to);
    for (const oldPath of filePaths) {
      this._purgeFileProjection(oldPath);
    }
    for (const [oldPath, data] of fileData) {
      const newPath = to + oldPath.slice(from.length);
      this._paths.add(newPath);
      this._rememberFileMeta(newPath, data);
    }
    for (const directory of directoriesToMove) {
      const newDirectory = to + directory.slice(from.length);
      this._dirs.add(newDirectory);
      this._dirs.delete(directory);
    }
  }

  /** Close the underlying IDB connection. Subsequent operations throw until {@link initialize} is called again. */
  public override dispose(): void {
    this._db?.close();
    this._db = undefined;
  }

  // ---------------------------------------------------------------------------
  // Protected instance methods
  // ---------------------------------------------------------------------------

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    this._ensureOpen();
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      throw this._eisdir(path);
    }
    const data = await this._idbGet(path);
    if (data === undefined) {
      this._purgeFileProjection(path);
      throw this._enoent(path);
    }
    this._paths.add(path);
    this._ensureParentDirs(path);
    this._rememberFileMeta(path, data);
    return new Uint8Array(data);
  }

  protected async mkdirSingle(path: string): Promise<void> {
    this._ensureOpen();
    this._assertRootedPath(path);
    if (this._dirs.has(path) || this._paths.has(path) || this._pendingWritePaths.has(path)) {
      throw this._eexist(path);
    }
    const parent = parentDirectory(path);
    if (this._paths.has(parent) || this._pendingWritePaths.has(parent)) {
      throw this._enotdir(parent);
    }
    if (!this._dirs.has(parent)) {
      throw this._enoent(parent);
    }
    await new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(true, directoryStorageKey(path));
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error(`Directory create failed for '${path}'`));
      });
      tx.addEventListener('abort', () => {
        reject(tx.error ?? new Error(`Directory create aborted for '${path}'`));
      });
    });
    this._dirs.add(path);
  }

  // ---------------------------------------------------------------------------
  // Write batching (VS Code Throttler pattern)
  // ---------------------------------------------------------------------------

  /** Drain every queued generation; a failed generation does not strand later writes. */
  private async _drainFlushes(): Promise<void> {
    try {
      while (this._writeBatch.length > 0) {
        const generation = this._writeBatch.splice(0);
        try {
          // oxlint-disable-next-line no-await-in-loop -- Generations must commit in arrival order.
          await this._flushBatch(generation);
          for (const entry of generation) {
            entry.resolve();
          }
        } catch (error) {
          for (const entry of generation) {
            entry.reject(error);
          }
        }
      }
    } finally {
      this._flushActive = undefined;
      if (this._writeBatch.length > 0) {
        this._flushActive = this._drainFlushes();
      }
    }
  }

  /**
   * Commit one queued generation in a single IndexedDB transaction.
   *
   * @param batch - Owned writes in the generation.
   */
  private async _flushBatch(batch: ReadonlyArray<{ path: string; data: Uint8Array<ArrayBuffer> }>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const { path, data } of batch) {
        this._putParentDirectoryRows(store, path);
        store.put(data, toStoragePath(path));
      }
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Batch write transaction failed'));
      });
      tx.addEventListener('abort', () => {
        reject(tx.error ?? new Error('Batch write transaction aborted'));
      });
    });

    for (const { path, data } of batch) {
      this._ensureParentDirs(path);
      this._paths.add(path);
      this._rememberFileMeta(path, data);
    }
  }

  // ---------------------------------------------------------------------------
  // Private instance methods
  // ---------------------------------------------------------------------------

  private async _openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._dbName, dbVersion);

      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      });

      request.addEventListener('success', () => {
        resolve(request.result);
      });

      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`Failed to open IndexedDB: ${this._dbName}`));
      });
    });
  }

  /**
   * Read a complete metadata snapshot without exposing partial hydration.
   *
   * @returns Complete file and directory path indexes.
   */
  private async _readPathIndexSnapshot(): Promise<{ paths: Set<string>; directories: Set<string> }> {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAllKeys();

      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to get all keys'));
      });
    });

    const paths = new Set<string>();
    const directories = new Set<string>(['']);

    for (const key of keys) {
      const storagePath = typeof key === 'string' ? key : JSON.stringify(key);
      const directoryPath = directoryPathFromKey(storagePath);
      if (directoryPath !== undefined) {
        directories.add(directoryPath);
        this._addParentDirs(directoryPath, directories);
        continue;
      }
      const path = fromStoragePath(storagePath);
      paths.add(path);
      this._addParentDirs(path, directories);
    }
    for (const path of paths) {
      if (directories.has(path)) {
        throw this._errno('EIO', 'persisted path is both a file and directory', path);
      }
    }
    return { paths, directories };
  }

  /**
   * Register all parent directories of a path in the dirs set.
   *
   * @param path - File path whose ancestor directories should be indexed.
   * @param directories - Directory index to update.
   */
  private _addParentDirs(path: string, directories = this._dirs): void {
    let directory = parentDirectory(path);
    while (directory !== '' && !directories.has(directory)) {
      directories.add(directory);
      directory = parentDirectory(directory);
    }
  }

  /**
   * Ensure all parent directories exist in the in-memory index.
   *
   * @param path - File path whose parent directories should be created.
   */
  private _ensureParentDirs(path: string): void {
    this._addParentDirs(path);
  }

  private _assertWritablePath(path: string): void {
    if (this._dirs.has(path) || [...this._pendingWritePaths.keys()].some((pending) => pending.startsWith(`${path}/`))) {
      throw this._eisdir(path);
    }
    this._assertNoFileAncestor(path);
  }

  private _purgeFileProjection(path: string): void {
    this._paths.delete(path);
    this._fileMeta.delete(path);
  }

  /**
   * Cache the metadata of bytes this provider already holds, so a later `stat`
   * needs no row read.
   *
   * @param path - Absolute file path the bytes belong to.
   * @param data - Row contents.
   * @returns The cached size and content metadata.
   */
  private _rememberFileMeta(path: string, data: Uint8Array<ArrayBuffer>): { size: number } & FileContentMetadata {
    const metadata = { size: data.byteLength, ...getFileContentMetadata(data) };
    this._fileMeta.set(path, metadata);
    return metadata;
  }

  private _assertNoFileAncestor(path: string): void {
    let parent = parentDirectory(path);
    while (parent !== '') {
      if (this._paths.has(parent) || this._pendingWritePaths.has(parent)) {
        throw this._enotdir(parent);
      }
      parent = parentDirectory(parent);
    }
  }

  private _putParentDirectoryRows(store: IDBObjectStore, path: string): void {
    let parent = parentDirectory(path);
    while (parent !== '') {
      store.put(true, directoryStorageKey(parent));
      parent = parentDirectory(parent);
    }
  }

  private _ensureOpen(): void {
    if (!this._db) {
      throw new Error('DirectIdbProvider is not initialized or has been disposed');
    }
  }

  private async _idbGet(key: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(toStoragePath(key));

      request.addEventListener('success', () => {
        resolve(request.result as Uint8Array<ArrayBuffer> | undefined);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`IDB get failed for '${key}'`));
      });
    });
  }

  /**
   * Test for a durable row without reading its value.
   *
   * @param key - Row key to probe.
   * @returns `true` when the row exists.
   */
  private async _idbHasKey(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getKey(toStoragePath(key));

      request.addEventListener('success', () => {
        resolve(request.result !== undefined);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`IDB getKey failed for '${key}'`));
      });
    });
  }

  private async _idbDelete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);

      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error(`IDB delete failed for '${key}'`));
      });
      tx.addEventListener('abort', () => {
        reject(tx.error ?? new Error(`IDB delete aborted for '${key}'`));
      });
    });
  }
  /* eslint-enable @typescript-eslint/member-ordering -- restore the default rule outside this class. */
}
