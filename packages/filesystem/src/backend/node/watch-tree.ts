/**
 * Watch a directory tree, without letting a path that changes type crash the process.
 *
 * On Linux, Node's recursive `fs.watch` is JavaScript over one inotify watch
 * per directory. When a watched directory is replaced by a file, its stale
 * watch fires under the path's own name and Node `lstat`s `<path>/<path>`
 * inside its own event handler. `throwIfNoEntry: false` hides ENOENT but not
 * ENOTDIR, so the throw escapes as an uncaught exception no caller can catch
 * (Node 26.13, `lib/internal/fs/recursive_watch.js`). macOS (FSEvents) and
 * Windows watch recursively in native code and keep Node's watcher.
 *
 * Every recursive watch of a project tree on Node goes through here. Once
 * Node's recursive watcher treats ENOTDIR as a missing entry, the Linux branch
 * can go and this becomes `fs.watch(root, { recursive: true })`.
 */
import { lstatSync, readdirSync, watch } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * A tree watch; `close()` ends it.
 * @public
 */
export type TreeWatcher = { close(): void };

/**
 * What a tree watch reports to, and whether it keeps the process alive.
 * @public
 */
export type WatchTreeOptions = Readonly<{
  /**
   * Receives each changed path, relative to the root with `/` separators (`''` for the root itself), or `undefined`
   * when the platform could not name it.
   */
  onChange: (path: string | undefined) => void;
  /** Called once the watch has lost track of the root (an overflow, a root that went away). */
  onError: (error: Error) => void;
  /** Keep the process alive while the watch is open, as `fs.watch` does by default. Defaults to `false`. */
  persistent?: boolean;
}>;

/* The entry's own stats, or nothing: ENOENT, and ENOTDIR when an ancestor is now a file, both mean "not here". */
const entry = (path: string): Stats | undefined => {
  try {
    return lstatSync(path, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
};

/** One non-recursive watch per directory, which inotify reports by entry name. */
class DirectoryTreeWatcher {
  readonly #root: string;
  readonly #options: WatchTreeOptions;
  /* By directory path relative to the root, `''` for the root. */
  readonly #watchers = new Map<string, ReturnType<typeof watch>>();
  #closed = false;

  public constructor(root: string, options: WatchTreeOptions) {
    this.#root = root;
    this.#options = options;
    this.#watchDirectory('', true);
  }

  public close(): void {
    this.#closed = true;
    for (const watcher of this.#watchers.values()) {
      watcher.close();
    }
    this.#watchers.clear();
  }

  /* Watch `directory` and every directory below it; a directory that appeared later reports what it already holds. */
  #watchDirectory(directory: string, initial: boolean): void {
    if (this.#closed || this.#watchers.has(directory)) {
      return;
    }
    const absolute = join(this.#root, directory);
    let watcher: ReturnType<typeof watch>;
    try {
      watcher = watch(absolute, { persistent: this.#options.persistent ?? false }, (_event, name) => {
        this.#onEvent(directory, name ?? undefined);
      });
    } catch (error) {
      if (directory === '') {
        throw error;
      }
      /* Gone again before it could be watched: its parent's event already named it. */
      return;
    }
    watcher.on('error', (error) => {
      if (directory === '') {
        this.#options.onError(error);
      } else {
        this.#forget(directory);
        this.#options.onChange(directory);
      }
    });
    this.#watchers.set(directory, watcher);
    let entries: Dirent[];
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      this.#forget(directory);
      return;
    }
    for (const child of entries) {
      const path = directory === '' ? child.name : `${directory}/${child.name}`;
      if (!initial) {
        this.#options.onChange(path);
      }
      if (child.isDirectory()) {
        this.#watchDirectory(path, initial);
      }
    }
  }

  #onEvent(directory: string, name: string | undefined): void {
    if (this.#closed) {
      return;
    }
    if (name === undefined) {
      this.#options.onChange(undefined);
      return;
    }
    /* A directory that is no longer one reports its own change under its own name: name the directory instead. */
    if (directory !== '' && !entry(join(this.#root, directory))?.isDirectory()) {
      this.#forget(directory);
      this.#options.onChange(directory);
      return;
    }
    const path = directory === '' ? name : `${directory}/${name}`;
    this.#options.onChange(path);
    if (entry(join(this.#root, path))?.isDirectory()) {
      this.#watchDirectory(path, false);
    } else {
      this.#forget(path);
    }
  }

  /* Stop watching `directory` and everything below it. */
  #forget(directory: string): void {
    const prefix = `${directory}/`;
    for (const [path, watcher] of this.#watchers) {
      if (path === directory || path.startsWith(prefix)) {
        watcher.close();
        this.#watchers.delete(path);
      }
    }
  }
}

/**
 * Watch `root` and everything below it.
 *
 * @param root - The directory to watch; throws when it cannot be watched.
 * @param options - Where changes and the loss of the watch are reported.
 * @returns The watch, open until `close()`.
 * @public
 */
export const watchTree = (root: string, options: WatchTreeOptions): TreeWatcher => {
  if (process.platform === 'linux') {
    return new DirectoryTreeWatcher(root, options);
  }
  const watcher = watch(root, { recursive: true, persistent: options.persistent ?? false }, (_event, filename) => {
    options.onChange(filename?.split(sep).join('/'));
  });
  watcher.on('error', options.onError);
  return watcher;
};
