/**
 * In-memory filesystem provider backed by a simple Map.
 *
 * Replaces the ZenFS `InMemory` backend for ephemeral, non-persistent
 * filesystem operations (tests, scratch spaces).
 */

import type { DirectoryEntry, FileStat, ProviderCapabilities } from '#types.js';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { indexDirectoryEntries } from '#backend/directory-entries.js';
import { fileStatFromBytes } from '#content-metadata.js';

/**
 * Non-persistent, in-memory filesystem provider.
 *
 * @public
 */
export class MemoryProvider extends AbstractFileSystemProvider {
  /**
   * Backend identifier; always `'memory'`.
   * @returns The literal string `'memory'`.
   */
  public get id(): string {
    return 'memory';
  }

  public readonly capabilities: ProviderCapabilities = {
    persistent: false,
    writable: true,
    quotaBased: false,
  };

  private readonly _files = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly _dirs = new Set<string>(['']);
  private readonly _mtimes = new Map<string, number>();

  // ---------------------------------------------------------------------------
  // Public instance methods
  // ---------------------------------------------------------------------------

  /**
   * Persist `data` at `path`, creating any missing parent directories.
   *
   * @param path - Absolute file path to write.
   * @param data - Bytes or UTF-8 string to store.
   */
  public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      throw this._eisdir(path);
    }
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    this._ensureParentDirs(path);
    this._files.set(path, bytes);
    this._mtimes.set(path, Date.now());
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
   * List immediate children of `path` with their kinds.
   *
   * @param path - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its kind.
   */
  public async readdirEntries(path: string): Promise<DirectoryEntry[]> {
    this._assertRootedPath(path);
    if (this._files.has(path)) {
      throw this._enotdir(path);
    }
    if (!this._dirs.has(path)) {
      throw this._enoent(path);
    }

    const prefix = path === '' ? '' : `${path}/`;
    return indexDirectoryEntries(prefix, this._files.keys(), this._dirs);
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
    for (const name of names) {
      const fullPath = `${prefix}${name}`;
      if (this._dirs.has(fullPath)) {
        result.push({
          name,
          type: 'dir',
          size: 0,
          mtimeMs: this._mtimes.get(fullPath) ?? 0,
        });
      } else {
        const data = this._files.get(fullPath);
        result.push({ name, ...fileStatFromBytes(data ?? new Uint8Array(), this._mtimes.get(fullPath) ?? Date.now()) });
      }
    }
    return result;
  }

  /**
   * Resolve metadata for `path`. Throws `ENOENT` when the entry is unknown.
   *
   * @param path - Absolute path to stat.
   * @returns Type/size/mtime for the entry at `path`.
   */
  public async stat(path: string): Promise<FileStat> {
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: this._mtimes.get(path) ?? 0 };
    }
    const data = this._files.get(path);
    if (data) {
      return fileStatFromBytes(data, this._mtimes.get(path) ?? Date.now());
    }
    throw this._enoent(path);
  }

  /**
   * Delete the regular file at `path`.
   *
   * @param path - Absolute file path to remove.
   */
  public async unlink(path: string): Promise<void> {
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      throw this._eisdir(path);
    }
    if (!this._files.has(path)) {
      throw this._enoent(path);
    }
    this._files.delete(path);
    this._mtimes.delete(path);
  }

  /**
   * Delete the empty directory at `path`. Refuses to remove the root or non-empty directories.
   *
   * @param path - Absolute directory path to remove.
   */
  public async rmdir(path: string): Promise<void> {
    this._assertRootedPath(path);
    if (this._files.has(path)) {
      throw this._enotdir(path);
    }
    if (!this._dirs.has(path) || path === '') {
      throw this._enoent(path);
    }
    const prefix = `${path}/`;
    if ([...this._files.keys(), ...this._dirs].some((entryPath) => entryPath.startsWith(prefix))) {
      throw this._enotempty(path);
    }
    this._dirs.delete(path);
    this._mtimes.delete(path);
  }

  /**
   * Move the file or directory at `from` to `to`, recursively rewriting child paths.
   *
   * @param from - Source absolute path.
   * @param to - Destination absolute path.
   */
  public async rename(from: string, to: string): Promise<void> {
    this._assertRootedPath(from);
    this._assertRootedPath(to);
    if (from === to) {
      if (!this._dirs.has(from) && !this._files.has(from)) {
        throw this._enoent(from);
      }
      return;
    }

    if (from === '') {
      throw this._einval(from);
    }

    if (this._dirs.has(from)) {
      if (to.startsWith(`${from}/`)) {
        throw this._einval(to);
      }
      if (this._dirs.has(to) || this._files.has(to)) {
        throw this._eexist(to);
      }
      this._ensureParentDirs(to);

      const prefix = `${from}/`;
      const entriesToMove: Array<[string, Uint8Array<ArrayBuffer>]> = [];
      const directoriesToMove: string[] = [];

      for (const [path, data] of this._files) {
        if (path.startsWith(prefix)) {
          entriesToMove.push([path, data]);
        }
      }
      for (const directory of this._dirs) {
        if (directory.startsWith(prefix)) {
          directoriesToMove.push(directory);
        }
      }

      this._dirs.add(to);
      this._dirs.delete(from);

      for (const [oldPath, data] of entriesToMove) {
        const newPath = to + oldPath.slice(from.length);
        this._files.set(newPath, data);
        this._files.delete(oldPath);
        const mtime = this._mtimes.get(oldPath) ?? Date.now();
        this._mtimes.delete(oldPath);
        this._mtimes.set(newPath, mtime);
      }

      for (const oldDirectory of directoriesToMove) {
        const newDirectory = to + oldDirectory.slice(from.length);
        this._dirs.add(newDirectory);
        this._dirs.delete(oldDirectory);
        const mtime = this._mtimes.get(oldDirectory);
        this._mtimes.delete(oldDirectory);
        if (mtime !== undefined) {
          this._mtimes.set(newDirectory, mtime);
        }
      }

      const mtime = this._mtimes.get(from) ?? Date.now();
      this._mtimes.delete(from);
      this._mtimes.set(to, mtime);
      return;
    }

    const data = this._files.get(from);
    if (!data) {
      throw this._enoent(from);
    }
    if (this._dirs.has(to) || this._files.has(to)) {
      throw this._eexist(to);
    }
    this._ensureParentDirs(to);
    this._files.set(to, data);
    this._files.delete(from);
    const mtime = this._mtimes.get(from) ?? Date.now();
    this._mtimes.delete(from);
    this._mtimes.set(to, mtime);
  }

  // ---------------------------------------------------------------------------
  // Protected instance methods
  // ---------------------------------------------------------------------------

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    this._assertRootedPath(path);
    if (this._dirs.has(path)) {
      throw this._eisdir(path);
    }
    const data = this._files.get(path);
    if (!data) {
      throw this._enoent(path);
    }
    return new Uint8Array(data);
  }

  protected async mkdirSingle(path: string): Promise<void> {
    this._assertRootedPath(path);
    if (this._dirs.has(path) || this._files.has(path)) {
      throw this._eexist(path);
    }
    const separator = path.lastIndexOf('/');
    const parent = separator === -1 ? '' : path.slice(0, separator);
    if (this._files.has(parent)) {
      throw this._enotdir(parent);
    }
    if (!this._dirs.has(parent)) {
      throw this._enoent(parent);
    }
    this._dirs.add(path);
    this._mtimes.set(path, Date.now());
  }

  // ---------------------------------------------------------------------------
  // Private instance methods
  // ---------------------------------------------------------------------------

  private _ensureParentDirs(path: string): void {
    const separator = path.lastIndexOf('/');
    let directory = separator === -1 ? '' : path.slice(0, separator);
    const missing: string[] = [];
    while (directory !== '') {
      if (this._files.has(directory)) {
        throw this._enotdir(directory);
      }
      if (!this._dirs.has(directory)) {
        missing.push(directory);
      }
      const parentSeparator = directory.lastIndexOf('/');
      directory = parentSeparator === -1 ? '' : directory.slice(0, parentSeparator);
    }
    for (const missingDirectory of missing) {
      this._dirs.add(missingDirectory);
    }
  }
}

/**
 * Create a non-persistent, in-memory filesystem provider.
 *
 * @returns Provider backed by a simple in-memory Map.
 *
 * @public
 * @example <caption>Ephemeral in-memory filesystem</caption>
 * ```typescript
 * import { createMemoryProvider } from '@taucad/filesystem/backend';
 *
 * const provider = await createMemoryProvider();
 * await provider.writeFile('hello.txt', 'world');
 * ```
 */
export const createMemoryProvider = async (): Promise<MemoryProvider> => new MemoryProvider();
