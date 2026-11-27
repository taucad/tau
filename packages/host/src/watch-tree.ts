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
 */
import { lstatSync, readdirSync, watch } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import { join, sep } from 'node:path';

/** A tree watch; `close()` ends it. */
export type TreeWatcher = { close(): void };

/**
 * Receives the changed path, relative to the root with `/` separators (`''` for the root itself), or `undefined` when
 * the platform could not name it.
 */
type TreeListener = (path: string | undefined) => void;

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
  readonly #listener: TreeListener;
  readonly #onError: (error: Error) => void;
  /* By directory path relative to the root, `''` for the root. */
  readonly #watchers = new Map<string, ReturnType<typeof watch>>();
  #closed = false;

  public constructor(root: string, listener: TreeListener, onError: (error: Error) => void) {
    this.#root = root;
    this.#listener = listener;
    this.#onError = onError;
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
      watcher = watch(absolute, { persistent: false }, (_event, name) => {
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
        this.#onError(error);
      } else {
        this.#forget(directory);
        this.#listener(directory);
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
        this.#listener(path);
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
      this.#listener(undefined);
      return;
    }
    /* A directory that is no longer one reports its own change under its own name: name the directory instead. */
    if (directory !== '' && !entry(join(this.#root, directory))?.isDirectory()) {
      this.#forget(directory);
      this.#listener(directory);
      return;
    }
    const path = directory === '' ? name : `${directory}/${name}`;
    this.#listener(path);
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
 * @param listener - Receives each changed path relative to `root`, or `undefined` when the platform could not name it.
 * @param onError - Called once the watch has lost track of `root` (an overflow, a root that went away).
 * @returns The watch; it never keeps the process alive.
 */
export const watchTree = (root: string, listener: TreeListener, onError: (error: Error) => void): TreeWatcher => {
  if (process.platform === 'linux') {
    return new DirectoryTreeWatcher(root, listener, onError);
  }
  const watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
    listener(filename?.split(sep).join('/'));
  });
  watcher.on('error', onError);
  return watcher;
};
