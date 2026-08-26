/**
 * Transport-internal Node.js filesystem handle factory.
 *
 * Produces the discriminated `inline`-arm {@link RuntimeFileSystemHandle}
 * backing the public {@link fromNodeFs} factory in
 * `filesystem/from-node-fs.ts`. Lives under `transport/_internal/` so the
 * public `@taucad/runtime/filesystem` surface exposes only the opaque
 * `RuntimeFileSystem` value, never the underlying handle shape.
 *
 * Spec/instance contract: `_fromNodeFsHandle(basePath)` returns a
 * plain-data spec whose `create()` factory mints a fresh adapter wrapper
 * around Node `fs.promises` per binding. The underlying disk is shared
 * by definition (the host filesystem is a global resource), so each
 * `RuntimeFileSystemBase` observes the same persisted state — but the
 * adapter object itself is freshly built per `RuntimeClient`,
 * mirroring the in-memory and fs-like factories for shape uniformity.
 *
 * @internal
 */

import { toFileStat } from '@taucad/types/constants';
import type { RuntimeFileSystemBase, RuntimeWatchEvent, RuntimeWatchRequest } from '#types/runtime-kernel.types.js';
import type { RuntimeFileSystemHandle } from '#transport/_internal/runtime-filesystem-handle.js';
import fs from 'node:fs/promises';
import type { FSWatcher } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { statSync, watch as watchDirectory } from 'node:fs';
import path from 'node:path';
import { resolveVirtualPath, VirtualPathError } from '@taucad/utils/path';

/**
 * Internal: produce the discriminated `inline`-arm handle backing
 * {@link fromNodeFs}. Captures `basePath` in the spec closure; each
 * `create()` invocation builds a fresh `RuntimeFileSystemBase` adapter
 * targeting the same host directory.
 *
 * @internal
 * @param basePath - Host directory mapped to VFS `/` — kernel paths beginning
 * with `/` resolve under here (POSIX `path.join` would ignore `basePath`
 * otherwise).
 * @returns Discriminated handle whose `create()` mints a fresh adapter
 * each invocation; the underlying disk is intentionally shared.
 */
export function _fromNodeFsHandle(basePath: string): RuntimeFileSystemHandle {
  return {
    kind: 'inline',
    create: () => buildNodeFsBase(basePath),
  };
}

/**
 * Normalize an `fs.watch` filename. Node types it as non-nullable, but the OS
 * genuinely drops it when it cannot describe the change — which is a loss
 * signal, not a no-op, so it has to survive into the handler as `undefined`.
 * @param filename - Raw second argument of the `fs.watch` change listener.
 * @returns The changed entry's name, or `undefined` when the OS dropped it.
 */
const toWatchedName = (filename: unknown): string | undefined => {
  if (typeof filename === 'string') {
    return filename;
  }
  return filename instanceof Uint8Array ? new TextDecoder().decode(filename) : undefined;
};

/**
 * Build a fresh `RuntimeFileSystemBase` adapter wrapping Node
 * `fs.promises` rooted at `basePath`. The adapter is per-binding; the
 * underlying disk is shared.
 */
function buildNodeFsBase(basePath: string): RuntimeFileSystemBase {
  const absoluteBase = path.resolve(basePath);
  const realBasePromise = fs.realpath(absoluteBase);

  const isContained = (base: string, target: string): boolean => {
    const relative = path.relative(base, target);
    return (
      relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    );
  };

  const nearestExistingPath = async (target: string): Promise<string> => {
    let candidate = target;
    for (;;) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Walk ancestors in order until the nearest existing path can be realpath-checked.
        await fs.lstat(candidate);
        return candidate;
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
        const parent = path.dirname(candidate);
        if (parent === candidate) {
          throw error;
        }
        candidate = parent;
      }
    }
  };

  const resolve = async (virtualPath: string): Promise<string> => {
    const canonicalPath = resolveVirtualPath(virtualPath);
    const target = path.resolve(absoluteBase, `.${canonicalPath}`);
    if (!isContained(absoluteBase, target)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', virtualPath);
    }

    const [realBase, existingPath] = await Promise.all([realBasePromise, nearestExistingPath(target)]);
    const realExistingPath = await fs.realpath(existingPath);
    if (!isContained(realBase, realExistingPath)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory: ${virtualPath}`), { code: 'ENOENT' });
    }
    return target;
  };

  function readFile(filePath: string, encoding: 'utf8'): Promise<string>;
  function readFile(filePath: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(filePath: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    if (encoding) {
      return fs.readFile(await resolve(filePath), encoding);
    }

    const buf = await fs.readFile(await resolve(filePath));
    return new Uint8Array(buf);
  }

  const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
    left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

  const atomicWriteFile = async (filePath: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
    const targetPath = await resolve(filePath);
    const targetDirectory = path.dirname(targetPath);
    const realBase = await realBasePromise;
    const admittedDirectory = await fs.realpath(targetDirectory);
    if (!isContained(realBase, admittedDirectory)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', filePath);
    }
    const admittedTargetPath = path.join(admittedDirectory, path.basename(targetPath));
    const temporaryPath = path.join(
      admittedDirectory,
      `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    let existingMode: number | undefined;

    try {
      const targetStat = await fs.lstat(admittedTargetPath);
      if (targetStat.isSymbolicLink()) {
        throw Object.assign(new Error(`Refusing to replace symbolic link: ${filePath}`), { code: 'ELOOP' });
      }
      existingMode = targetStat.mode % 0o1000;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      const handle = await fs.open(temporaryPath, 'wx', existingMode ?? 0o666);
      try {
        await handle.writeFile(bytes);
        if (existingMode !== undefined) {
          await handle.chmod(existingMode);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }

      const currentDirectory = await fs.realpath(targetDirectory);
      if (currentDirectory !== admittedDirectory || !isContained(realBase, currentDirectory)) {
        throw Object.assign(new Error(`Refusing to replace a file through a changed parent: ${filePath}`), {
          code: 'ELOOP',
        });
      }
      const currentTargetStat = await fs.lstat(admittedTargetPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      if (currentTargetStat?.isSymbolicLink()) {
        throw Object.assign(new Error(`Refusing to replace symbolic link: ${filePath}`), { code: 'ELOOP' });
      }

      await fs.rename(temporaryPath, admittedTargetPath);
      const directoryHandle = await fs.open(admittedDirectory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }

      const committed = new Uint8Array(await fs.readFile(admittedTargetPath));
      if (!bytesEqual(committed, bytes)) {
        throw Object.assign(new Error(`The committed bytes could not be verified for ${filePath}.`), {
          code: 'WRITE_VERIFICATION_FAILED',
        });
      }
    } finally {
      await fs.unlink(temporaryPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      });
    }
  };

  // ===========================================================================
  // Watch — one non-recursive `fs.watch` per unique parent directory
  // ===========================================================================

  /**
   * One requested path's watch state. `parentDirectory` is where the file
   * itself lives; `watchDirectory` is the nearest ancestor that exists and
   * therefore carries the watcher, and `triggerName` is the direct child of
   * that watcher whose event concerns this entry.
   */
  type WatchEntry = {
    readonly virtualPath: string;
    readonly realPath: string;
    readonly parentDirectory: string;
    watchDirectory: string;
    triggerName: string;
  };

  /** Every live subscription, so `dispose` cannot leak a watcher on abnormal shutdown. */
  // eslint-disable-next-line tau-lint/no-handrolled-fanout -- disposal registry, not pub/sub fan-out: these thunks are unsubscribes invoked once by dispose(), never an event emit. Watch fan-out is one handler per subscription, held by the caller.
  const openSubscriptions = new Set<() => void>();

  /**
   * The kernel sends exactly one pattern, `/.tau/cache/**`.
   * ponytail: prefix-only exclude matching; export `libs/filesystem`'s private
   * `matchesGlob` (`watch-registry.ts:72`) if a caller ever sends a non-prefix glob.
   */
  const isExcluded = (virtualPath: string, excludes: readonly string[]): boolean =>
    excludes.some((pattern) => {
      if (!pattern.endsWith('/**')) {
        return pattern === virtualPath;
      }
      const prefix = pattern.slice(0, -3);
      return virtualPath === prefix || virtualPath.startsWith(`${prefix}/`);
    });

  /**
   * Classify a watch hit by the filesystem, never by `eventType` — macOS reports
   * plain content writes as `rename`. A stat failure that is not "absent" is the
   * kernel's to report through its own re-read, so it counts as present.
   */
  const realPathExists = (realPath: string): boolean => {
    try {
      statSync(realPath);
      return true;
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      return code !== 'ENOENT' && code !== 'ENOTDIR';
    }
  };

  /**
   * Subscribe to change events for `request.paths`. Arms every watcher
   * synchronously: `adaptInlineFileSystem` synthesises `watchReady` with an
   * already-resolved `ready`, so an asynchronous arm would reopen the
   * subscribe-versus-read window the kernel's hash revalidation assumes closed.
   */
  function watch(request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void): () => void {
    const excludes = request.excludes ?? [];
    const watchers = new Map<string, FSWatcher>();
    const entriesByDirectory = new Map<string, Map<string, Set<WatchEntry>>>();
    let unsubscribed = false;

    const emit = (event: RuntimeWatchEvent): void => {
      if (!unsubscribed) {
        handler(event);
      }
    };

    const bucketFor = (directory: string, triggerName: string): Set<WatchEntry> => {
      const byName = entriesByDirectory.get(directory) ?? new Map<string, Set<WatchEntry>>();
      entriesByDirectory.set(directory, byName);
      const bucket = byName.get(triggerName) ?? new Set<WatchEntry>();
      byName.set(triggerName, bucket);
      return bucket;
    };

    /** Open one non-recursive watcher on `directory`, wired for events and for loss. */
    const openWatcher = (directory: string): FSWatcher => {
      const watcher = watchDirectory(directory);
      let lost = false;
      const reportLoss = (): void => {
        if (unsubscribed || lost) {
          return;
        }
        lost = true;
        watchers.delete(directory);
        watcher.close();
        emit({ type: 'reset' });
      };
      watcher.on('change', (_eventType, filename) => {
        handleDirectoryEvent(directory, toWatchedName(filename));
      });
      watcher.on('error', reportLoss);
      watcher.on('close', reportLoss);
      return watcher;
    };

    /**
     * Reuse or open a watcher covering `startDirectory`, walking up to the nearest
     * existing ancestor when it does not exist yet — the kernel legitimately
     * watches paths that were never created (`unresolvedPaths`). A walk above the
     * base directory only ever observes names, and every emitted path is a
     * contained virtual path, so it cannot leak host content.
     * @returns The directory the watcher was actually opened on.
     */
    const armWatcher = (startDirectory: string): string => {
      let candidate = startDirectory;
      for (;;) {
        if (watchers.has(candidate)) {
          return candidate;
        }
        const directory = candidate;
        try {
          watchers.set(directory, openWatcher(directory));
          return directory;
        } catch (error) {
          const { code } = error as NodeJS.ErrnoException;
          const parent = path.dirname(directory);
          if ((code !== 'ENOENT' && code !== 'ENOTDIR') || parent === directory) {
            throw error;
          }
          candidate = parent;
        }
      }
    };

    const register = (entry: WatchEntry): void => {
      for (;;) {
        const directory = armWatcher(entry.parentDirectory);
        entry.watchDirectory = directory;
        entry.triggerName = path.relative(directory, entry.realPath).split(path.sep)[0]!;
        bucketFor(directory, entry.triggerName).add(entry);
        if (directory === entry.parentDirectory) {
          return;
        }
        // The gap directory can appear while this watcher is opening; without the
        // re-check its creation event is already in the past and the leaf is lost.
        if (!realPathExists(path.join(directory, entry.triggerName))) {
          return;
        }
        bucketFor(directory, entry.triggerName).delete(entry);
      }
    };

    function handleDirectoryEvent(directory: string, filename: string | undefined): void {
      if (unsubscribed) {
        return;
      }
      if (filename === undefined) {
        // The OS could not name the change; the stream is no longer trustworthy.
        emit({ type: 'reset' });
        return;
      }
      const bucket = entriesByDirectory.get(directory)?.get(filename);
      if (!bucket) {
        // Siblings and editor temp files are not requested paths.
        return;
      }
      // Snapshot: re-arming below both removes from and can re-add to this bucket.
      const hits: WatchEntry[] = [];
      for (const entry of bucket) {
        hits.push(entry);
      }
      for (const entry of hits) {
        const wasPending = entry.watchDirectory !== entry.parentDirectory;
        if (wasPending) {
          // An intermediate directory appeared: re-arm onto it before classifying,
          // otherwise the leaf's own creation is never observed.
          bucket.delete(entry);
          register(entry);
        }
        if (realPathExists(entry.realPath)) {
          emit({ type: 'change', path: entry.virtualPath });
        } else if (!wasPending) {
          emit({ type: 'delete', path: entry.virtualPath });
        }
      }
    }

    const unsubscribe = (): void => {
      unsubscribed = true;
      openSubscriptions.delete(unsubscribe);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      entriesByDirectory.clear();
    };

    // Contain every requested path lexically before a single watcher is opened.
    // Watch reports names, never bytes, so the resolver's async `realpath` half
    // stays on `readFile`, through which every consequence of an event flows.
    const entries = new Map<string, WatchEntry>();
    for (const requestedPath of request.paths) {
      if (isExcluded(requestedPath, excludes)) {
        continue;
      }
      const virtualPath = resolveVirtualPath(requestedPath);
      const realPath = path.resolve(absoluteBase, `.${virtualPath}`);
      if (!isContained(absoluteBase, realPath)) {
        throw new VirtualPathError('PATH_OUTSIDE_ROOT', requestedPath);
      }
      if (!entries.has(virtualPath)) {
        entries.set(virtualPath, {
          virtualPath,
          realPath,
          parentDirectory: path.dirname(realPath),
          watchDirectory: '',
          triggerName: '',
        });
      }
    }

    try {
      for (const entry of entries.values()) {
        register(entry);
      }
    } catch (error) {
      unsubscribe();
      throw error;
    }
    openSubscriptions.add(unsubscribe);
    return unsubscribe;
  }

  return {
    id: 'runtime:node-fs',
    capabilities: { persistent: true, writable: true, quotaBased: false },
    dispose() {
      // The fs module has no per-instance lifecycle, but an abnormal shutdown
      // must not leak a watcher this adapter opened.
      for (const unsubscribe of openSubscriptions) {
        unsubscribe();
      }
    },
    watch,
    readFile,
    async writeFile(filePath: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
      await atomicWriteFile(filePath, data);
    },
    async mkdir(directoryPath: string, options?: { recursive?: boolean }): Promise<void> {
      await fs.mkdir(await resolve(directoryPath), options);
    },
    async readdir(directoryPath: string): Promise<string[]> {
      return fs.readdir(await resolve(directoryPath));
    },
    async unlink(filePath: string): Promise<void> {
      await fs.unlink(await resolve(filePath));
    },
    async stat(filePath: string) {
      const stats = await fs.stat(await resolve(filePath));
      return toFileStat(stats);
    },
    async rmdir(directoryPath: string): Promise<void> {
      await fs.rmdir(await resolve(directoryPath));
    },
    async rename(oldPath: string, newPath: string): Promise<void> {
      const [resolvedOldPath, resolvedNewPath] = await Promise.all([resolve(oldPath), resolve(newPath)]);
      await fs.rename(resolvedOldPath, resolvedNewPath);
    },
    async lstat(filePath: string) {
      const stats = await fs.lstat(await resolve(filePath));
      return toFileStat(stats);
    },
    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.access(await resolve(filePath));
        return true;
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          return false;
        }
        throw error;
      }
    },
  };
}
