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
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { RuntimeFileSystemHandle } from '#transport/_internal/runtime-filesystem-handle.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', virtualPath);
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

  return {
    id: 'runtime:node-fs',
    capabilities: { persistent: true, writable: true, quotaBased: false },
    dispose() {
      /* The Node.js fs module has no per-instance lifecycle to tear down. */
    },
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
      const resolvedPath = await resolve(filePath);
      try {
        await fs.access(resolvedPath);
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
