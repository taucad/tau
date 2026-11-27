/**
 * A recursive watch on one directory tree that survives the tree changing shape.
 *
 * On macOS and Windows `fs.watch(root, { recursive: true })` is the platform's
 * own recursive watch, and this module is a thin wrapper over it. On Linux Node
 * builds the recursive watch in JavaScript, one inotify watch per directory, and
 * that implementation throws an uncaught `ENOTDIR` from inside its own event
 * callback when a watched directory is replaced by a file of the same name: the
 * removed directory's watch reports its own removal under its own name, Node
 * joins that onto the directory's path (`main.ts/main.ts`) and `lstatSync`s it
 * with `throwIfNoEntry: false`, which tolerates only `ENOENT` (#2972). No
 * `'error'` listener can catch it, so one ordinary save could end the host. On
 * Linux this module therefore keeps the per-directory watches itself, and every
 * look at the tree it makes tolerates the tree having moved on.
 *
 * Every recursive watch of a project tree on Node goes through here. Once
 * Node's recursive watcher treats `ENOTDIR` as a missing entry, the Linux
 * branch can go.
 */

import { lstatSync, readdirSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * A running tree watch.
 * @public
 */
export type TreeWatcher = {
  /** Stop watching; no callback is called afterwards. */
  close(): void;
};

/**
 * What a tree watch reports.
 * @public
 */
export type TreeWatchListener = {
  /**
   * Something at `path` changed: its content, or its kind, or it appeared or went away.
   *
   * @param path - The path relative to the root, `/`-separated; `''` is the root itself, and
   * `undefined` means the platform could not say what changed.
   */
  change(path: string | undefined): void;
  /**
   * The watch failed (an overflow, or a root that went away) and has closed itself.
   *
   * @param error - What the platform reported.
   */
  error(error: Error): void;
};

/**
 * How a tree watch holds the process.
 * @public
 */
export type TreeWatchOptions = Readonly<{
  /** Keep the process alive while the watch is open, as `fs.watch` does by default. Defaults to `false`. */
  persistent?: boolean;
}>;

/**
 * Watch every directory under `root`, recursively.
 *
 * @param root - The absolute path of the directory to watch.
 * @param listener - Told of each change, and of the failure that ends the watch.
 * @param options - Whether the watch keeps the process alive.
 * @returns The running watch.
 * @throws When `root` cannot be watched at all (it is missing, or the platform has no recursive watch).
 * @public
 */
export const watchTree = (root: string, listener: TreeWatchListener, options: TreeWatchOptions = {}): TreeWatcher =>
  process.platform === 'linux'
    ? watchTreeByDirectory(root, listener, options.persistent ?? false)
    : watchTreeNatively(root, listener, options.persistent ?? false);

/**
 * The platform's own recursive watch, where it has one.
 *
 * @param root - The absolute path of the directory to watch.
 * @param listener - Told of each change, and of the failure that ends the watch.
 * @param persistent - Whether the watch keeps the process alive.
 * @returns The running watch.
 */
const watchTreeNatively = (root: string, listener: TreeWatchListener, persistent: boolean): TreeWatcher => {
  let closed = false;
  const fail = (error: Error): void => {
    if (!closed) {
      closed = true;
      watcher.close();
      listener.error(error);
    }
  };
  const watcher = watch(root, { recursive: true, persistent }, (event, filename) => {
    if (closed) {
      return;
    }
    if (event === 'rename' && lookAt(root)?.directory !== true) {
      fail(rootGone(root));
      return;
    }
    listener.change(filename?.split(sep).join('/'));
  });
  watcher.on('error', fail);
  return {
    close: () => {
      closed = true;
      watcher.close();
    },
  };
};

/**
 * The entry at `path` as `lstat` sees it now.
 *
 * @param path - The absolute path to look at.
 * @returns Its kind and inode, or `undefined` when there is none (or a parent of it is now a file).
 */
const lookAt = (path: string): { directory: boolean; ino: number } | undefined => {
  try {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    return stats === undefined ? undefined : { directory: stats.isDirectory(), ino: stats.ino };
  } catch {
    /* `ENOTDIR` and its kin: the path runs through something that is no longer a directory. */
    return undefined;
  }
};

/**
 * The failure a watch reports once its root is no longer a directory.
 *
 * @param root - The watched root.
 * @returns The error, with code `ENOENT`.
 */
const rootGone = (root: string): Error =>
  Object.assign(new Error(`The watched directory went away: ${root}`), { code: 'ENOENT' });

/**
 * One inotify watch per directory, kept by this module (Linux).
 *
 * @param root - The absolute path of the directory to watch.
 * @param listener - Told of each change, and of the failure that ends the watch.
 * @param persistent - Whether the watch keeps the process alive.
 * @returns The running watch.
 */
const watchTreeByDirectory = (root: string, listener: TreeWatchListener, persistent: boolean): TreeWatcher => {
  /* Each watched directory by its relative path (`''` is the root), with the inode it was watched as. */
  const directories = new Map<string, { watcher: FSWatcher; ino: number }>();
  let closed = false;
  const close = (): void => {
    closed = true;
    for (const { watcher } of directories.values()) {
      watcher.close();
    }
    directories.clear();
  };
  const fail = (error: Error): void => {
    if (!closed) {
      close();
      listener.error(error);
    }
  };
  /* Stop watching `relative` and every directory under it. */
  const forget = (relative: string): void => {
    for (const [path, { watcher }] of directories) {
      if (path === relative || path.startsWith(`${relative}/`)) {
        watcher.close();
        directories.delete(path);
      }
    }
  };
  const childOf = (relative: string, name: string): string => (relative === '' ? name : `${relative}/${name}`);
  /*
   * Watch the directory at `relative`, then every directory under it. A directory
   * found after the watch started reports each entry in it, since writes there
   * may have landed before its own watch did.
   */
  const add = (relative: string, ino: number, announce: boolean): void => {
    const absolute = join(root, relative);
    let watcher: FSWatcher;
    try {
      watcher = watch(absolute, { persistent }, (event, filename) => {
        onEvent(relative, event, filename ?? undefined);
      });
    } catch (error) {
      if (relative === '') {
        throw error;
      }
      /* It went away, or became a file, before it could be watched: its parent's watch reports that. */
      return;
    }
    watcher.on('error', (error) => {
      if (relative === '') {
        fail(error);
      } else {
        forget(relative);
        listener.change(relative);
      }
    });
    directories.set(relative, { watcher, ino });
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch (error) {
      if (relative === '') {
        close();
        throw error;
      }
      forget(relative);
      return;
    }
    for (const entry of entries) {
      const child = childOf(relative, entry.name);
      if (announce) {
        listener.change(child);
      }
      if (entry.isDirectory()) {
        const seen = lookAt(join(root, child));
        if (seen?.directory === true) {
          add(child, seen.ino, announce);
        }
      }
    }
  };
  const onEvent = (relative: string, event: string, filename: string | undefined): void => {
    if (closed || !directories.has(relative)) {
      return;
    }
    /*
     * Is this watch still on the directory it was opened on? A removed directory's
     * watch reports its own removal under the directory's own name, which would
     * read as a child of the same name; the parent's watch reports the removal itself.
     */
    const self = lookAt(join(root, relative));
    if (self?.directory !== true || self.ino !== directories.get(relative)?.ino) {
      if (relative === '') {
        fail(rootGone(root));
        return;
      }
      forget(relative);
      return;
    }
    if (filename === undefined) {
      listener.change(undefined);
      return;
    }
    const child = childOf(relative, filename);
    listener.change(child);
    const seen = lookAt(join(root, child));
    const watched = directories.get(child);
    if (watched !== undefined && (event === 'rename' || seen?.directory !== true || seen.ino !== watched.ino)) {
      /*
       * The directory that was watched here may be gone, or replaced (by a file, or by another
       * directory, which can reuse the removed one's inode), so its watch is opened afresh.
       */
      forget(child);
    }
    if (seen?.directory === true && !directories.has(child)) {
      add(child, seen.ino, true);
    }
  };
  const rootSeen = lookAt(root);
  if (rootSeen?.directory !== true) {
    throw Object.assign(new Error(`Not a directory that can be watched: ${root}`), { code: 'ENOTDIR' });
  }
  add('', rootSeen.ino, false);
  return { close };
};
