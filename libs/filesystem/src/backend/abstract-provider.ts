/**
 * Abstract base class for native filesystem providers.
 *
 * Implements shared logic (exists, lstat, readFile with encoding, recursive mkdir,
 * dispose) so concrete providers only implement storage-specific primitives.
 */

import type { FileSystemProvider, FileStat, ProviderCapabilities } from '#types.js';
import { assertRootedPath } from '@taucad/utils/path';

/**
 * Base class for native {@link FileSystemProvider} implementations.
 *
 * Subclasses implement the abstract storage primitives; this class provides
 * the shared derived operations that are identical across all browser-based
 * backends (IndexedDB, OPFS, File System Access API).
 *
 * @public
 */
export abstract class AbstractFileSystemProvider implements FileSystemProvider {
  public abstract readonly id: string;
  public abstract readonly capabilities: ProviderCapabilities;

  // -- Public instance methods (readFile, mkdir, exists, lstat, dispose) -------

  /**
   * Read the entire contents of `path` as raw bytes.
   *
   * @param path - Absolute file path to read.
   * @returns The file contents as a `Uint8Array`.
   */
  public readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /**
   * Read the entire contents of `path` decoded as a UTF-8 string.
   *
   * @param path - Absolute file path to read.
   * @param encoding - Must be `'utf8'`; selects the string-returning overload.
   * @returns The decoded string contents.
   */
  public readFile(path: string, encoding: 'utf8'): Promise<string>;
  /**
   * Implementation signature for the {@link readFile} overloads.
   *
   * Declared as method-style overloads so TypeScript applies the loose overload
   * implementation check that the {@link FileSystemProvider} contract relies on.
   *
   * @param path - Absolute file path to read.
   * @param encoding - Optional encoding selector; only `'utf8'` is supported.
   * @returns Either the raw bytes or, when `encoding` is supplied, the decoded string.
   */
  public async readFile(path: string, encoding?: 'utf8'): Promise<Uint8Array<ArrayBuffer> | string> {
    this._assertRootedPath(path);
    const raw = await this.readFileRaw(path);
    return encoding === 'utf8' ? new TextDecoder().decode(raw) : raw;
  }

  /**
   * Create the directory at `path`. With `{ recursive: true }`, missing ancestors are
   * created and `EEXIST` is swallowed.
   *
   * @param path - Absolute directory path to create.
   * @param options - When `recursive` is `true`, ancestors are auto-created.
   */
  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this._assertRootedPath(path);
    if (!options?.recursive) {
      await this.mkdirSingle(path);
      return;
    }

    const segments = path.split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential mkdir required for recursive creation
        await this.mkdirSingle(current);
      } catch (error) {
        if ((error as { code?: string }).code !== 'EEXIST') {
          throw error;
        }
        // `EEXIST` is success only when the existing entry is the directory
        // this recursive walk needs. A file at the same path must remain an
        // error instead of becoming a file/directory collision.
        // oxlint-disable-next-line no-await-in-loop -- The kind check belongs to the sequential ancestor walk.
        const existing = await this.stat(current);
        if (existing.type !== 'dir') {
          throw this._eexist(current);
        }
      }
    }
  }

  /**
   * Test whether `path` resolves to any filesystem entry.
   *
   * @param path - Absolute path to probe.
   * @returns `true` when {@link stat} succeeds for `path`, `false` for a
   * recognized absence or non-directory ancestor.
   */
  public async exists(path: string): Promise<boolean> {
    this._assertRootedPath(path);
    try {
      await this.stat(path);
      return true;
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Stat `path` without following symbolic links. Browser backends have no
   * symlinks, so this delegates to {@link stat}.
   *
   * @param path - Absolute path to stat.
   * @returns Metadata for `path`.
   */
  public async lstat(path: string): Promise<FileStat> {
    this._assertRootedPath(path);
    return this.stat(path);
  }

  /** Default no-op disposer; subclasses override when teardown is required. */
  // oxlint-disable-next-line no-empty-function -- Default no-op; subclasses override when cleanup is needed
  public dispose(): void {}

  // -- Public abstract methods (storage-specific) -----------------------------

  public abstract writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  public abstract readdir(path: string): Promise<string[]>;
  public abstract stat(path: string): Promise<FileStat>;
  public abstract unlink(path: string): Promise<void>;
  public abstract rmdir(path: string): Promise<void>;
  public abstract rename(from: string, to: string): Promise<void>;

  /**
   * Construct a provider-neutral errno-style error.
   *
   * @param code - Stable errno code.
   * @param description - Human-readable failure description.
   * @param path - Path associated with the failure.
   * @returns Error carrying the errno code.
   */
  protected _errno(code: string, description: string, path: string): Error {
    const error = new Error(`${code}: ${description} '${path}'`);
    (error as NodeJS.ErrnoException).code = code;
    return error;
  }

  protected _enoent(path: string): Error {
    return this._errno('ENOENT', 'no such file or directory', path);
  }

  protected _eexist(path: string): Error {
    return this._errno('EEXIST', 'file or directory already exists', path);
  }

  protected _eisdir(path: string): Error {
    return this._errno('EISDIR', 'is a directory', path);
  }

  protected _enotdir(path: string): Error {
    return this._errno('ENOTDIR', 'not a directory', path);
  }

  protected _enotempty(path: string): Error {
    return this._errno('ENOTEMPTY', 'directory not empty', path);
  }

  protected _einval(path: string): Error {
    return this._errno('EINVAL', 'invalid argument', path);
  }

  protected _assertRootedPath(path: string): void {
    assertRootedPath(path);
  }

  // -- Protected abstract methods (internal primitives) -----------------------

  /**
   * Read raw bytes from the storage backend.
   * Concrete providers implement this; the public `readFile` wraps it
   * with optional UTF-8 decoding.
   */
  protected abstract readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>>;

  /**
   * Create a single directory. Subclasses must implement this for non-recursive
   * creation. The recursive variant is handled by the base class.
   */
  protected abstract mkdirSingle(path: string): Promise<void>;
}
