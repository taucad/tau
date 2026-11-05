/**
 * Read a project's Git objects as they are stored: no LFS smudge, no tree
 * walk, nothing written. For a caller that must judge foreign bytes before
 * anything trusts them (a fetched GeoSpec candidate closure).
 *
 * @module
 */

import type { FileSystemProvider, PrivateStore } from '@taucad/filesystem';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import { readTreeEntries } from '#object-store/tree-codec.js';
import type { TreeCodecEntry } from '#object-store/tree-codec.js';

/** One entry of a stored tree. @public */
export type RawTreeEntry = TreeCodecEntry;

/** Stored objects, read raw. @public */
export type RawObjectReader = Readonly<{
  /** One tree's entries in stored order, or `undefined` when no tree has that id. */
  readTree: (oid: string) => Promise<readonly RawTreeEntry[] | undefined>;
  /** One blob's stored bytes, or `undefined` when no blob has that id. */
  readBlob: (oid: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
}>;

/**
 * A raw reader over the store at `.git`, through the rooted view's private
 * store when it has one.
 *
 * @param filesystem - The project's filesystem.
 * @returns Its tree and blob readers.
 * @public
 */
export const createRawObjectReader = (
  filesystem: FileSystemProvider & { readonly privateStore?: PrivateStore },
): RawObjectReader => {
  const objects = createObjectStore({
    files: gitFilesOf(filesystem, '.git'),
    gitdir: '.git',
    compute: createInlineCompute(),
    fenceName: `${filesystem.id}:.git`,
  });
  return Object.freeze({
    readTree: async (oid: string) => readTreeEntries(objects, oid),
    readBlob: async (oid: string) => {
      const object = await objects.read(oid);
      return object?.type === 'blob' ? object.data : undefined;
    },
  });
};
