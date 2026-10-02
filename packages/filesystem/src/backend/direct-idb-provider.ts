/**
 * Path-keyed IndexedDB filesystem provider.
 *
 * Replaces ZenFS's inode-based IndexedDB layer with a VS Code-style
 * design: paths are keys, file content is the value, directory metadata
 * is derived from key prefixes, and `getAllKeys()` hydrates an in-memory
 * path set on init (~26ms for 10k entries vs ~12s ZenFS full scan).
 */

import type { FileStat, ProviderCapabilities } from '#types.js';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';

const storeName = 'files';
const dbVersion = 1;

function parentDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : path.slice(0, lastSlash);
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

  public readonly capabilities: ProviderCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: true,
  };

  private _db: IDBDatabase | undefined;
  private readonly _dbName: string;

  /** In-memory path index: tracks all file paths for O(1) existence/readdir. */
  private readonly _paths = new Set<string>();
  /** In-memory directory set: derived from file paths. */
  private readonly _dirs = new Set<string>(['/']);
  /** Timestamps per path for stat(). */
  private readonly _mtimes = new Map<string, number>();
  /** Cached file sizes populated on write/read to avoid loading full content for stat. */
  private readonly _fileSizes = new Map<string, number>();

  /** Pending writes accumulated for the next batched IDB transaction. */
  private readonly _writeBatch: Array<{ path: string; data: Uint8Array<ArrayBuffer> }> = [];
  /** Promise for the currently in-flight flush, or undefined when idle. */
  private _flushActive: Promise<void> | undefined;
  /** Promise for the queued follow-up flush, or undefined when none is queued. */
  private _flushQueued: Promise<void> | undefined;
  /** Resolver for the queued follow-up flush. */
  private _flushQueuedResolve: (() => void) | undefined;
  /** Rejector for the queued follow-up flush. */
  private _flushQueuedReject: ((reason: unknown) => void) | undefined;

  public constructor(databasePrefix: string) {
    super();
    this._dbName = `${databasePrefix}-fs-direct`;
  }

  // ---------------------------------------------------------------------------
  // Public instance methods
  // ---------------------------------------------------------------------------

  /**
   * Open (or create) the IndexedDB database and hydrate the in-memory
   * path index via `getAllKeys()`.
   */
  public async initialize(): Promise<void> {
    this._db = await this._openDb();
    await this._hydratePathIndex();
  }

  /**
   * Persist `data` at `path`, creating any missing parent directories.
   * Writes are batched into a single IDB transaction.
   *
   * @param path - Absolute file path to write.
   * @param data - Bytes or UTF-8 string to store.
   */
  public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._ensureOpen();
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this._ensureParentDirs(path);
    this._paths.add(path);
    this._mtimes.set(path, Date.now());
    this._fileSizes.set(path, bytes.byteLength);

    this._writeBatch.push({ path, data: bytes });
    await this._throttledFlush();
  }

  /**
   * List immediate child names under `path` (resolved from the in-memory path index).
   *
   * @param path - Absolute directory path to enumerate.
   * @returns The names of files and subdirectories directly inside `path`.
   */
  public async readdir(path: string): Promise<string[]> {
    const normalizedPath = path === '/' ? '/' : path;
    if (!this._dirs.has(normalizedPath)) {
      throw this._enoent(path);
    }

    const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`;
    const entries = new Set<string>();

    for (const filePath of this._paths) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) {
          entries.add(firstSegment);
        }
      }
    }

    for (const directoryPath of this._dirs) {
      if (directoryPath !== normalizedPath && directoryPath.startsWith(prefix)) {
        const rest = directoryPath.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) {
          entries.add(firstSegment);
        }
      }
    }

    return [...entries];
  }

  /**
   * Batched readdir + stat — eliminates the N+1 stat round-trips per directory listing.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
    const names = await this.readdir(path);
    const prefix = path === '/' ? '/' : `${path}/`;
    const result: Array<{ name: string } & FileStat> = [];
    const unknownSizePaths: Array<{ index: number; fullPath: string }> = [];

    for (const name of names) {
      const fullPath = `${prefix}${name}`;
      if (this._dirs.has(fullPath)) {
        result.push({
          name,
          type: 'dir',
          size: 0,
          mtimeMs: this._mtimes.get(fullPath) ?? Date.now(),
        });
      } else {
        const cachedSize = this._fileSizes.get(fullPath);
        if (cachedSize === undefined) {
          unknownSizePaths.push({ index: result.length, fullPath });
          result.push({
            name,
            type: 'file',
            size: 0,
            mtimeMs: this._mtimes.get(fullPath) ?? Date.now(),
          });
        } else {
          result.push({
            name,
            type: 'file',
            size: cachedSize,
            mtimeMs: this._mtimes.get(fullPath) ?? Date.now(),
          });
        }
      }
    }

    if (unknownSizePaths.length > 0 && this._db) {
      await new Promise<void>((resolve, reject) => {
        const tx = this._db!.transaction(storeName, 'readonly');
        let remaining = unknownSizePaths.length;

        const store = tx.objectStore(storeName);
        const bindRequest = (request: IDBRequest, entryFullPath: string, entryIndex: number) => {
          request.addEventListener('success', () => {
            const data = request.result as Uint8Array<ArrayBuffer> | undefined;
            const size = data?.byteLength ?? 0;
            this._fileSizes.set(entryFullPath, size);
            result[entryIndex] = { ...result[entryIndex]!, size };
            remaining--;
            if (remaining === 0) {
              resolve();
            }
          });
          request.addEventListener('error', () => {
            reject(request.error ?? new Error(`IDB get failed for '${entryFullPath}'`));
          });
        };
        for (const { index, fullPath } of unknownSizePaths) {
          bindRequest(store.get(fullPath), fullPath, index);
        }
      });
    }

    return result;
  }

  /**
   * Resolve metadata for `path`. File sizes are cached after first read to avoid IDB round-trips.
   *
   * @param path - Absolute path to stat.
   * @returns Type/size/mtime for the entry at `path`.
   */
  public async stat(path: string): Promise<FileStat> {
    if (this._dirs.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: this._mtimes.get(path) ?? Date.now() };
    }
    if (this._paths.has(path)) {
      const cachedSize = this._fileSizes.get(path);
      if (cachedSize !== undefined) {
        return { type: 'file', size: cachedSize, mtimeMs: this._mtimes.get(path) ?? Date.now() };
      }
      const data = await this._idbGet(path);
      const size = data?.byteLength ?? 0;
      this._fileSizes.set(path, size);
      return { type: 'file', size, mtimeMs: this._mtimes.get(path) ?? Date.now() };
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
    if (!this._paths.has(path)) {
      throw this._enoent(path);
    }
    await this._idbDelete(path);
    this._paths.delete(path);
    this._mtimes.delete(path);
    this._fileSizes.delete(path);
  }

  /**
   * Drop the directory entry for `path`. Refuses to remove the root.
   *
   * @param path - Absolute directory path to remove.
   */
  public async rmdir(path: string): Promise<void> {
    if (!this._dirs.has(path) || path === '/') {
      throw this._enoent(path);
    }
    this._dirs.delete(path);
    this._mtimes.delete(path);
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

    if (this._dirs.has(from) && !this._paths.has(from)) {
      await this._renameDirectory(from, to);
      return;
    }

    if (!this._paths.has(from)) {
      throw this._enoent(from);
    }
    const data = await this._idbGet(from);
    if (data === undefined) {
      throw this._enoent(from);
    }
    this._ensureParentDirs(to);
    await this._idbPut(to, data);
    await this._idbDelete(from);
    this._paths.delete(from);
    this._paths.add(to);
    const mtime = this._mtimes.get(from) ?? Date.now();
    this._mtimes.delete(from);
    this._mtimes.set(to, mtime);
    const size = this._fileSizes.get(from);
    this._fileSizes.delete(from);
    if (size !== undefined) {
      this._fileSizes.set(to, size);
    }
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

    if (filePaths.length === 0) {
      this._ensureParentDirs(to);
      for (const directory of directoriesToMove) {
        const newDirectory = to + directory.slice(from.length);
        this._dirs.add(newDirectory);
        this._dirs.delete(directory);
        const mtime = this._mtimes.get(directory) ?? Date.now();
        this._mtimes.delete(directory);
        this._mtimes.set(newDirectory, mtime);
      }
      return;
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
      const tx = this._db!.transaction(storeName, 'readwrite', { durability: 'relaxed' });
      const store = tx.objectStore(storeName);
      for (const [oldPath, data] of fileData) {
        const newPath = to + oldPath.slice(from.length);
        store.delete(oldPath);
        store.put(data, newPath);
      }
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Directory rename transaction failed'));
      });
    });

    this._ensureParentDirs(to);
    for (const oldPath of filePaths) {
      const newPath = to + oldPath.slice(from.length);
      this._paths.delete(oldPath);
      this._paths.add(newPath);
      const mtime = this._mtimes.get(oldPath) ?? Date.now();
      this._mtimes.delete(oldPath);
      this._mtimes.set(newPath, mtime);
      const size = this._fileSizes.get(oldPath);
      this._fileSizes.delete(oldPath);
      if (size !== undefined) {
        this._fileSizes.set(newPath, size);
      }
    }
    for (const directory of directoriesToMove) {
      const newDirectory = to + directory.slice(from.length);
      this._dirs.add(newDirectory);
      this._dirs.delete(directory);
      const mtime = this._mtimes.get(directory) ?? Date.now();
      this._mtimes.delete(directory);
      this._mtimes.set(newDirectory, mtime);
    }
  }

  /**
   * Import many files in a single IndexedDB transaction.
   * Replaces `BulkImportableStoreFS` for high-volume writes.
   *
   * @param files - Map of path to file content for bulk insertion.
   */
  public async bulkImport(files: Map<string, Uint8Array<ArrayBuffer>>): Promise<void> {
    this._ensureOpen();
    if (files.size === 0) {
      return;
    }

    const now = Date.now();
    await new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite', { durability: 'relaxed' });
      const store = tx.objectStore(storeName);

      for (const [path, content] of files) {
        store.put(content, path);
        this._ensureParentDirs(path);
        this._paths.add(path);
        this._mtimes.set(path, now);
        this._fileSizes.set(path, content.byteLength);
      }

      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('bulkImport transaction failed'));
      });
    });
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
    if (!this._paths.has(path)) {
      throw this._enoent(path);
    }
    const data = await this._idbGet(path);
    if (data === undefined) {
      throw this._enoent(path);
    }
    this._fileSizes.set(path, data.byteLength);
    return data;
  }

  protected async mkdirSingle(path: string): Promise<void> {
    if (this._dirs.has(path)) {
      const error = new Error(`EEXIST: directory already exists '${path}'`);
      (error as NodeJS.ErrnoException).code = 'EEXIST';
      throw error;
    }
    const parent = parentDirectory(path);
    if (parent !== '/' && !this._dirs.has(parent)) {
      throw this._enoent(parent);
    }
    this._dirs.add(path);
    this._mtimes.set(path, Date.now());
  }

  // ---------------------------------------------------------------------------
  // Write batching (VS Code Throttler pattern)
  // ---------------------------------------------------------------------------

  /**
   * Throttled flush: at most one active flush + one queued. Multiple writes
   * arriving while a flush is active accumulate in `_writeBatch` and are
   * flushed together in the next `_flushBatch` call.
   *
   * @returns Resolves once the caller's write has been durably committed (either
   *   by the active flush or by the next queued flush).
   */
  private async _throttledFlush(): Promise<void> {
    if (this._flushActive) {
      if (!this._flushQueued) {
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        this._flushQueued = promise;
        this._flushQueuedResolve = resolve;
        this._flushQueuedReject = reject;
      }
      return this._flushQueued;
    }

    this._flushActive = this._flushBatch();
    try {
      await this._flushActive;
    } finally {
      this._flushActive = undefined;
    }

    if (this._flushQueuedResolve) {
      const resolve = this._flushQueuedResolve;
      const reject = this._flushQueuedReject!;
      this._flushQueued = undefined;
      this._flushQueuedResolve = undefined;
      this._flushQueuedReject = undefined;

      this._flushActive = this._flushBatch();
      // async-iife: bootstrap — settlement is observed via the queued resolver/rejecter,
      // not via this fire-and-forget chain; awaiting here would block the caller's flush.
      // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional: resolve/reject the queued promise without awaiting (fires the follow-up flush)
      void this._flushActive
        // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional chaining for throttle handoff
        .then(() => {
          this._flushActive = undefined;
          resolve();
        })
        // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional chaining for throttle handoff
        .catch((error: unknown) => {
          this._flushActive = undefined;
          reject(error);
        });
    }
  }

  /** Drain the current batch into a single IDB transaction. */
  private async _flushBatch(): Promise<void> {
    const batch = this._writeBatch.splice(0, this._writeBatch.length);
    if (batch.length === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite', { durability: 'relaxed' });
      const store = tx.objectStore(storeName);
      for (const { path, data } of batch) {
        store.put(data, path);
      }
      tx.addEventListener('complete', () => {
        resolve();
      });
      tx.addEventListener('error', () => {
        reject(tx.error ?? new Error('Batch write transaction failed'));
      });
    });
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

  /** Hydrate the in-memory path index from all stored keys. */
  private async _hydratePathIndex(): Promise<void> {
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

    for (const key of keys) {
      const path = typeof key === 'string' ? key : JSON.stringify(key);
      this._paths.add(path);
      this._addParentDirs(path);
    }
  }

  /**
   * Register all parent directories of a path in the dirs set.
   *
   * @param path - File path whose ancestor directories should be indexed.
   */
  private _addParentDirs(path: string): void {
    let directory = parentDirectory(path);
    while (directory !== '/' && !this._dirs.has(directory)) {
      this._dirs.add(directory);
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

  private _ensureOpen(): void {
    if (!this._db) {
      throw new Error('DirectIdbProvider is not initialized or has been disposed');
    }
  }

  private _enoent(path: string): Error {
    const error = new Error(`ENOENT: no such file or directory '${path}'`);
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    return error;
  }

  private async _idbGet(key: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.addEventListener('success', () => {
        resolve(request.result as Uint8Array<ArrayBuffer> | undefined);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`IDB get failed for '${key}'`));
      });
    });
  }

  private async _idbPut(key: string, value: Uint8Array<ArrayBuffer>): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite', { durability: 'relaxed' });
      const store = tx.objectStore(storeName);
      const request = store.put(value, key);

      request.addEventListener('success', () => {
        resolve();
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`IDB put failed for '${key}'`));
      });
    });
  }

  private async _idbDelete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite', { durability: 'relaxed' });
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.addEventListener('success', () => {
        resolve();
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`IDB delete failed for '${key}'`));
      });
    });
  }
  /* eslint-enable @typescript-eslint/member-ordering -- restore the default rule outside this class. */
}
