/**
 * Reading a subtree's bytes through the provider port (charter D1, D2).
 *
 * @module
 */

import { joinRelativePath } from '@taucad/utils/path';
import { walk } from '#content-ops/walk.js';
import type { WalkFileSystem, WalkOptions } from '#content-ops/walk.js';
import type { FileSystemProvider } from '#types.js';

/** The slice of the port {@link contents} reads through. @public */
export type ContentFileSystem = WalkFileSystem & Pick<FileSystemProvider, 'readFile'>;

/**
 * Read a directory's subtree into its file bytes, keyed relative to it.
 *
 * @param filesystem - Provider, rooted filesystem or composed view to read through.
 * @param path       - Root-relative directory to read; `''` is the surface's own root.
 * @param options    - Optional caller filter and abort signal.
 * @returns File bytes keyed by path relative to `path`, in walk order.
 * @public
 */
export async function contents(
  filesystem: ContentFileSystem,
  path: string,
  options?: WalkOptions,
): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
  const files: Record<string, Uint8Array<ArrayBuffer>> = {};
  for await (const { relativePath, kind } of walk(filesystem, path, options)) {
    if (kind === 'file') {
      // oxlint-disable-next-line no-await-in-loop -- Sequential reads required for recursive collection
      files[relativePath] = await filesystem.readFile(joinRelativePath(path, relativePath));
    }
  }
  return files;
}
