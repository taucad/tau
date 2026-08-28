/**
 * The Node `VmFileSystem`.
 *
 * The VM executes a spec module against an abstract filesystem so the same
 * runner works in a browser worker; this is the Node binding of that
 * abstraction, and it is engine code for exactly one reason — it touches the
 * real disk.
 *
 * Every path is resolved UNDER the root. A spec module is untrusted input, and
 * a `../` that escaped the project root would let it read the machine; the
 * escape is refused outright rather than clamped, so a misconfigured project
 * fails loudly instead of quietly reading the wrong tree.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertRootedPath } from '@taucad/runtime/kernel';

/**
 * The VM's filesystem contract, declared here rather than imported.
 *
 * D-S3 is explicit that the engine needs no dependency on the VM: it is substrate
 * machinery owned by `@taucad/esbuild`. The seam references this shape
 * structurally, so an engine-side declaration satisfies it without pulling the
 * bundler in.
 *
 * @public
 */
export type VmFileSystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
};

/**
 * Resolve one VM path to a real path under the root.
 *
 * @param root - The project root.
 * @param path - A canonical path rooted by the supplied project capability.
 * @returns The absolute host path.
 * @throws Error when the path escapes the root.
 * @public
 */
export const resolveUnderRoot = (root: string, path: string): string => {
  const base = resolve(root);
  const resolved = resolve(base, assertRootedPath(path));
  const inside = relative(base, resolved);
  if (inside.startsWith(`..${sep}`) || inside === '..') {
    throw new Error(`GeoSpec refused a path outside the project root: '${path}'.`);
  }
  return resolved;
};

const isContained = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};

const nearestExistingPath = async (target: string): Promise<string> => {
  let candidate = target;
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Ancestors must be checked from nearest to farthest.
      await lstat(candidate);
      return candidate;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error;
      }
      const parent = dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      candidate = parent;
    }
  }
};

/**
 * Create a Node `VmFileSystem` rooted at `root`.
 *
 * @param root - Absolute project root path.
 * @returns A VM filesystem confined to `root`.
 * @public
 */
export const createNodeVmFileSystem = (root: string): VmFileSystem => {
  const absoluteRoot = resolve(root);
  const realRootPromise = realpath(absoluteRoot);
  const admitTarget = async (target: string, path: string): Promise<string> => {
    const [realRoot, existingPath] = await Promise.all([realRootPromise, nearestExistingPath(target)]);
    if (!isContained(realRoot, await realpath(existingPath))) {
      throw Object.assign(new Error(`GeoSpec refused a symbolic link outside the project root: '${path}'.`), {
        code: 'EACCES',
      });
    }
    return target;
  };
  const at = async (path: string): Promise<string> => admitTarget(resolveUnderRoot(absoluteRoot, path), path);
  const read = (async (path: string, encoding?: 'utf8') =>
    encoding === 'utf8'
      ? readFile(await at(path), 'utf8')
      : new Uint8Array(await readFile(await at(path)))) as VmFileSystem['readFile'];
  return {
    exists: async (path: string) => {
      try {
        await readFile(await at(path));
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          return false;
        }
        throw error;
      }
    },
    readFile: read,
    writeFile: async (path: string, content: string) => {
      const target = resolveUnderRoot(absoluteRoot, path);
      const targetDirectory = dirname(target);
      await admitTarget(targetDirectory, path);
      await mkdir(targetDirectory, { recursive: true });

      const [realRoot, admittedDirectory] = await Promise.all([realRootPromise, realpath(targetDirectory)]);
      if (!isContained(realRoot, admittedDirectory)) {
        throw Object.assign(new Error(`GeoSpec refused a symbolic link outside the project root: '${path}'.`), {
          code: 'EACCES',
        });
      }

      const admittedTarget = join(admittedDirectory, basename(target));
      const targetStat = await lstat(admittedTarget).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      if (targetStat?.isSymbolicLink()) {
        throw Object.assign(new Error(`GeoSpec refused to replace a symbolic link: '${path}'.`), { code: 'ELOOP' });
      }

      const temporaryPath = join(admittedDirectory, `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
      try {
        const handle = await open(temporaryPath, 'wx');
        try {
          await handle.writeFile(content, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }

        const currentDirectory = await realpath(targetDirectory);
        if (currentDirectory !== admittedDirectory || !isContained(realRoot, currentDirectory)) {
          throw Object.assign(new Error(`GeoSpec refused a changed parent directory: '${path}'.`), { code: 'ELOOP' });
        }
        const currentTarget = await lstat(admittedTarget).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
          }
          throw error;
        });
        if (currentTarget?.isSymbolicLink()) {
          throw Object.assign(new Error(`GeoSpec refused to replace a symbolic link: '${path}'.`), { code: 'ELOOP' });
        }
        await rename(temporaryPath, admittedTarget);
      } finally {
        await unlink(temporaryPath).catch(() => undefined);
      }
    },
    ensureDir: async (path: string) => {
      const target = await at(path);
      await mkdir(target, { recursive: true });
      const [realRoot, realTarget] = await Promise.all([realRootPromise, realpath(target)]);
      if (!isContained(realRoot, realTarget)) {
        throw Object.assign(new Error(`GeoSpec refused a symbolic link outside the project root: '${path}'.`), {
          code: 'EACCES',
        });
      }
    },
  };
};
