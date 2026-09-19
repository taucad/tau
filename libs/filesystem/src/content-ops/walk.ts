/**
 * Enumerating a subtree through the provider port (charter D1, D2).
 *
 * @module
 */

import { joinRelativePath } from '@taucad/utils/path';
import { readDirectoryEntries } from '#backend/directory-entries.js';
import type { FileSystemProvider } from '#types.js';

/** One entry a walk yields, relative to the walked root. @public */
export type WalkEntry = {
  /** POSIX path relative to the walked root; never `''` and never leading-slashed. */
  readonly relativePath: string;
  readonly kind: 'file' | 'dir';
};

/**
 * Options shared by every read content operation.
 * @public
 *
 * @example <caption>A whole-project export carries only the bytes that are the project</caption>
 * ```typescript
 * import { classify } from '@taucad/filesystem/path-registry';
 *
 * const versionedOnly = (relativePath: string, kind: 'file' | 'dir'): boolean =>
 *   kind === 'dir' || classify(relativePath).versioned;
 * ```
 */
export type WalkOptions = {
  /**
   * Which entries to keep, asked before the read and before the descent, so a
   * refused directory costs one `readdir` at its parent and nothing else.
   * Every entry is kept when omitted.
   */
  readonly admits?: (relativePath: string, kind: 'file' | 'dir') => boolean;
  readonly signal?: AbortSignal;
};

/** The slice of the port a walk reads through. @public */
export type WalkFileSystem = Pick<FileSystemProvider, 'readdir' | 'readdirEntries' | 'stat'>;

/**
 * Enumerate a directory's subtree, depth-first, without reading any bytes.
 *
 * The mask is whatever the given surface enumerates: over a composed view a
 * hidden entry is simply never seen, with no filter argument and no second copy
 * of the path policy. `admits` is for the filters a caller owns itself.
 *
 * @param filesystem - Provider, rooted filesystem or composed view to enumerate.
 * @param path       - Root-relative directory to walk; `''` is the surface's own root.
 * @param options    - Optional caller filter and abort signal.
 * @returns Every admitted entry below `path`, each directory before its own subtree.
 * @public
 */
export function walk(filesystem: WalkFileSystem, path: string, options?: WalkOptions): AsyncGenerator<WalkEntry> {
  /* Depth-first pre-order, so a caller can act on a directory before its contents. */
  async function* from(relative: string): AsyncGenerator<WalkEntry> {
    if (options?.signal?.aborted === true) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    for (const entry of await readDirectoryEntries(filesystem, joinRelativePath(path, relative))) {
      const relativePath = joinRelativePath(relative, entry.name);
      if (options?.admits?.(relativePath, entry.kind) === false) {
        continue;
      }
      yield { relativePath, kind: entry.kind };
      if (entry.kind === 'dir') {
        yield* from(relativePath);
      }
    }
  }

  return from('');
}
