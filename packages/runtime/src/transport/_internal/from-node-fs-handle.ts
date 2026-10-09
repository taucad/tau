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
import type { RuntimeWatchEvent, RuntimeWatchRequest } from '#types/runtime-kernel.types.js';
import type {
  InlineRuntimeFileSystemBase,
  RuntimeFileSystemHandle,
} from '#transport/_internal/runtime-filesystem-handle.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';
import { drainNodeFsProviderWatchClosures, NodeFsProvider } from '@taucad/filesystem/backend/node';

/**
 * Internal: produce the discriminated `inline`-arm handle backing
 * {@link fromNodeFs}. Captures `basePath` in the spec closure; each
 * `create()` invocation builds a fresh `RuntimeFileSystemBase` adapter
 * targeting the same host directory.
 *
 * @internal
 * @param basePath - Host directory mapped to the runtime filesystem root.
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
 * Build a fresh `RuntimeFileSystemBase` adapter wrapping Node
 * `fs.promises` rooted at `basePath`. The adapter is per-binding; the
 * underlying disk is shared.
 */
function buildNodeFsBase(
  basePath: string,
): InlineRuntimeFileSystemBase & Required<Pick<WorkerFileSystemProxy, 'watchReady'>> {
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

  const resolve = async (rootedPath: string): Promise<string> => {
    const canonicalPath = assertRootedPath(rootedPath);
    const target = path.resolve(absoluteBase, canonicalPath);
    if (!isContained(absoluteBase, target)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
    }

    const [realBase, existingPath] = await Promise.all([realBasePromise, nearestExistingPath(target)]);
    const realExistingPath = await fs.realpath(existingPath);
    if (!isContained(realBase, realExistingPath)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory: ${rootedPath}`), { code: 'ENOENT' });
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

    /* D29: the durability guarantee is the temp file's own `fsync` plus the atomic rename. The write
     * also used to `fsync` the parent directory and then read the committed file back for a per-byte
     * compare — a 1 KB write cost ~11 ms, and none of that was the durability. The read-back is gone
     * (OQ-P6) and the directory `fsync` with it; the admission re-checks below stay, because they are
     * what refuses a parent or target swapped between admission and replacement. */
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
    } catch (error) {
      // A successful rename consumes the temp file; only a failed write leaves one behind.
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  };

  // ===========================================================================
  // The Node-only provider owns native observation; read/write remain this adapter's.
  const observation = new NodeFsProvider(absoluteBase);
  const nativeWatchAvailable = (() => {
    try {
      import.meta.resolve('@parcel/watcher');
      return true;
    } catch {
      return false;
    }
  })();
  // eslint-disable-next-line tau-lint/no-handrolled-fanout -- Tracks native watcher disposal, not event subscribers.
  const openSubscriptions = new Set<() => void>();

  const watchReady = (request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void) => {
    const state = { cancelled: false, readySettled: false };
    let nativeUnsubscribe: (() => void) | undefined;
    const closed = Promise.withResolvers<void>();
    const ready = (async (): Promise<void> => {
      try {
        const stop = await observation.watch(request, (event) => {
          if (state.cancelled) {
            return;
          }
          handler(event.type === 'change' ? { type: 'change', path: event.path } : event);
        });
        if (state.cancelled) {
          stop();
        } else {
          nativeUnsubscribe = stop;
        }
      } finally {
        state.readySettled = true;
        if (state.cancelled) {
          closed.resolve();
        }
      }
    })();
    const unsubscribe = (): void => {
      if (state.cancelled) {
        return;
      }
      state.cancelled = true;
      openSubscriptions.delete(unsubscribe);
      nativeUnsubscribe?.();
      // A pending admission's continuation closes its late native subscription.
      if (state.readySettled) {
        closed.resolve();
      }
    };
    openSubscriptions.add(unsubscribe);
    return { unsubscribe, ready, closed: closed.promise };
  };

  /** Preserve the generic synchronous watcher shape; private callers await watchReady. */
  const watch = (request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void): (() => void) => {
    for (const requestedPath of request.paths) {
      assertRootedPath(requestedPath);
    }
    const registration = watchReady(request, handler);
    let active = true;
    const reportAdmissionFailure = async (): Promise<void> => {
      try {
        await registration.ready;
      } catch {
        if (active) {
          handler({ type: 'reset' });
        }
      }
    };
    // async-iife: bootstrap -- the private ready promise is the authoritative error path; direct sync watchers receive reset.
    void reportAdmissionFailure();
    return () => {
      active = false;
      registration.unsubscribe();
    };
  };

  const dispose = (): void => {
    // The fs module has no per-instance lifecycle, but an abnormal shutdown
    // must not leak a watcher this adapter opened.
    for (const unsubscribe of openSubscriptions) {
      unsubscribe();
    }
    observation.dispose();
  };

  return {
    id: 'runtime:node-fs',
    capabilities: { persistent: true, writable: true, quotaBased: false },
    dispose,
    async disposeAsync() {
      dispose();
      // Native subscribe/unsubscribe settle on this isolate's event loop; a
      // worker terminated before they do aborts the process inside the addon.
      await drainNodeFsProviderWatchClosures(observation);
    },
    ...(nativeWatchAvailable ? { watch } : {}),
    watchReady,
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
