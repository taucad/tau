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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

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
 * @param path - A VM path: absolute-looking paths are root-relative.
 * @returns The absolute host path.
 * @throws Error when the path escapes the root.
 * @public
 */
export const resolveUnderRoot = (root: string, path: string): string => {
  const base = resolve(root);
  // A VM path that starts with `/` is rooted at the PROJECT, not at the host
  // filesystem: that is what makes a spec module portable between hosts.
  const resolved = resolve(base, path.startsWith('/') ? `.${path}` : path);
  const inside = relative(base, resolved);
  if (inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) {
    throw new Error(`GeoSpec refused a path outside the project root: '${path}'.`);
  }
  return resolved;
};

/**
 * Create a Node `VmFileSystem` rooted at `root`.
 *
 * @param root - Absolute project root path.
 * @returns A VM filesystem confined to `root`.
 * @public
 */
export const createNodeVmFileSystem = (root: string): VmFileSystem => {
  const at = (path: string): string => resolveUnderRoot(root, path);
  const read = (async (path: string, encoding?: 'utf8') =>
    encoding === 'utf8'
      ? readFile(at(path), 'utf8')
      : new Uint8Array(await readFile(at(path)))) as VmFileSystem['readFile'];
  return {
    exists: async (path: string) => {
      try {
        await readFile(at(path));
        return true;
      } catch {
        return false;
      }
    },
    readFile: read,
    writeFile: async (path: string, content: string) => {
      const target = at(path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, content, 'utf8');
    },
    ensureDir: async (path: string) => {
      await mkdir(at(path), { recursive: true });
    },
  };
};
