/* oxlint-disable no-await-in-loop -- Serialized reads bound transient memory and preserve cancellation between files. */
import { assertRootedPath, joinRelativePath, sha256Bytes } from '@taucad/runtime/kernel';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

import type { PicogkBrowserSnapshot } from '#picogk-browser-session.js';

// Match the native workspace mirror and its .NET/PicoGK exclusions.
const excludedDirectories = new Set(['.git', '.hg', '.svn', '.tau', 'node_modules', 'bin', 'obj', '.vs']);
const excludedSuffixes = ['.dll', '.exe', '.pdb'];
const encoder = new TextEncoder();

/**
 * Project only the caller's rooted authored filesystem into an immutable browser input.
 * @internal
 * @param options - Authorized filesystem, operation content cache and cancellation signal.
 * @returns Content-identified files; asset edits invalidate the same worker as source edits.
 */
export const createPicogkBrowserSnapshot = async (options: {
  readonly filesystem: KernelFileSystem;
  readonly contents?: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>;
  readonly signal: AbortSignal;
}): Promise<PicogkBrowserSnapshot> => {
  const files: Array<{ path: string; contents: Uint8Array<ArrayBuffer> }> = [];
  const identities: Array<readonly [string, string]> = [];
  const folded = new Map<string, string>();
  const visit = async (directory: string): Promise<void> => {
    options.signal.throwIfAborted();
    const listing = await options.filesystem.readdirStat(directory);
    for (const entry of listing.toSorted((left, right) => (left.name < right.name ? -1 : 1))) {
      options.signal.throwIfAborted();
      const path = assertRootedPath(joinRelativePath(directory, entry.name));
      if (path === 'thumbnail.webp') {
        continue;
      }
      const key = path.toLocaleLowerCase('en-US');
      const collision = folded.get(key);
      if (collision && collision !== path) {
        throw new Error(`PicoGK workspace has a case-colliding path: ${collision} and ${path}.`);
      }
      folded.set(key, path);
      if (entry.type === 'dir') {
        if (!excludedDirectories.has(entry.name)) {
          await visit(path);
        }
        continue;
      }
      if (excludedSuffixes.some((suffix) => path.endsWith(suffix))) {
        continue;
      }
      const seeded = options.contents?.get(path);
      const cached = typeof seeded === 'string' ? encoder.encode(seeded) : seeded;
      const bytes = cached?.byteLength === entry.size ? cached : await options.filesystem.readFile(path);
      options.signal.throwIfAborted();
      if (bytes.byteLength !== entry.size) {
        throw new Error(`PicoGK workspace changed while mirroring: ${path}.`);
      }
      const contents = new Uint8Array(bytes);
      identities.push([path, await sha256Bytes(contents)]);
      files.push({ path, contents });
    }
  };
  await visit('');
  const revision = await sha256Bytes(encoder.encode(JSON.stringify(identities)));
  options.signal.throwIfAborted();
  return { revision, files };
};
