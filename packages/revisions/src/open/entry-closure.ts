/**
 * A project's entry closure: `tau.json` and the files it names (D10).
 *
 * What `entryReady` needs present, read by the oids its revision's tree names
 * and nothing else: the tree is listed from tree objects alone, then
 * `tau.json`'s blob, then the blobs of the files the manifest names. A large
 * object stays its pointer (`largeObjects: 'local'`), for the fill to bring.
 */
import { parseProjectManifestBytes } from '@taucad/project-core';
import type { RevisionId } from '#algorithms/index.js';
import { readLfsPointer } from '#lfs.js';
import type { RevisionPort, RevisionTreeListing } from '#revision-port.js';

/** One file of an entry closure, and the bytes its oid holds. */
export type EntryClosureFile = RevisionTreeListing &
  Readonly<{
    content: Uint8Array<ArrayBuffer>;
    /** The large object a pointer names when its blob is a pointer: the fill brings its bytes. */
    pending?: Readonly<{ oid: string; size: number }>;
  }>;

/** A revision's entry closure. */
export type EntryClosure = Readonly<{
  /** `tau.json` and each file it names that the tree holds, manifest first. */
  files: readonly EntryClosureFile[];
  /** Paths the manifest names that the tree does not hold. */
  missing: readonly string[];
}>;

/**
 * Read one revision's entry closure by the oids its tree names (D10).
 *
 * @param port - The store: its tree listing and its path-scoped tree reads.
 * @param revision - The revision.
 * @returns The closure; `undefined` when the store holds no such revision or
 *   cannot list a tree without reading its blobs.
 */
export const readEntryClosure = async (
  port: Pick<RevisionPort, 'listTree' | 'readTree'>,
  revision: RevisionId,
): Promise<EntryClosure | undefined> => {
  const listing = await port.listTree?.(revision);
  if (listing === undefined) {
    return undefined;
  }
  const listed = new Map(listing.map((entry) => [entry.path, entry]));
  const read = async (paths: readonly string[]): Promise<EntryClosureFile[]> => {
    const held = paths.filter((path) => listed.has(path));
    const tree = held.length === 0 ? undefined : await port.readTree(revision, { largeObjects: 'local', paths: held });
    return held.flatMap((path) => {
      const content = tree?.get(path);
      if (content === undefined) {
        return [];
      }
      const pointer = readLfsPointer(content);
      return [{ ...listed.get(path)!, content, ...(pointer === undefined ? {} : { pending: pointer }) }];
    });
  };
  const [manifest] = await read(['tau.json']);
  const parsed = manifest === undefined ? undefined : parseProjectManifestBytes(manifest.content);
  const main = parsed?.success === true ? parsed.data.assets.main : undefined;
  const named = [...new Set([main?.entryPath, main?.thumbnail].filter((path) => path !== undefined))];
  const files = await read(named);
  return Object.freeze({
    files: Object.freeze([...(manifest === undefined ? [] : [manifest]), ...files]),
    missing: Object.freeze([
      ...(manifest === undefined ? ['tau.json'] : []),
      ...named.filter((path) => !listed.has(path)),
    ]),
  });
};
