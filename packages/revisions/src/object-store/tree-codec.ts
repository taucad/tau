/**
 * Git tree objects, as bytes: the codec the object store reads and writes
 * trees with.
 *
 * Decoded entries match what `isomorphic-git`'s tree reader returned — a
 * directory's mode spelled `040000`, the kind derived from the mode — so a
 * reader that moved off the library sees the same values.
 *
 * @module
 */

import { bytesToHex, concatBytes, hexToBytes } from '#object-hash.js';
import type { ObjectStore } from '#object-store/object-store.js';
import type { TreeObject } from '#tree-id-memo.js';

/** One entry of a tree object. */
export type TreeCodecEntry = Readonly<{
  /** `040000`, `100644`, `100755`, `120000` or `160000`. */
  mode: string;
  /** The entry's name in its directory. */
  path: string;
  oid: string;
  type: 'tree' | 'blob' | 'commit';
}>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const oidBytes = 20;

const kindOf = (mode: string): TreeCodecEntry['type'] => {
  switch (mode) {
    case '040000': {
      return 'tree';
    }
    case '100644':
    case '100755':
    case '120000': {
      return 'blob';
    }
    case '160000': {
      return 'commit';
    }
    default: {
      throw new TypeError(`A tree entry has an unknown mode ${mode}.`);
    }
  }
};

/**
 * The entries of one tree object's body.
 *
 * @param body - The tree's bytes, without the object frame.
 * @returns Its entries, in stored order.
 */
export const decodeTree = (body: Uint8Array<ArrayBuffer>): TreeCodecEntry[] => {
  const entries: TreeCodecEntry[] = [];
  let cursor = 0;
  while (cursor < body.byteLength) {
    const space = body.indexOf(0x20, cursor);
    const nul = body.indexOf(0, space);
    if (space === -1 || nul === -1 || nul + 1 + oidBytes > body.byteLength) {
      throw new TypeError('A tree object is truncated.');
    }
    const stored = textDecoder.decode(body.subarray(cursor, space));
    const mode = stored === '40000' ? '040000' : stored;
    const path = textDecoder.decode(body.subarray(space + 1, nul));
    if (path.includes('/') || path.includes('\\') || path === '' || path === '.' || path === '..') {
      throw new TypeError(`A tree entry has an unsafe name ${JSON.stringify(path)}.`);
    }
    entries.push({ mode, path, oid: bytesToHex(body.slice(nul + 1, nul + 1 + oidBytes)), type: kindOf(mode) });
    cursor = nul + 1 + oidBytes;
  }
  return entries;
};

/**
 * One tree object's body, from the memo's entries: already in Git's order,
 * a directory spelled `40000` as Git stores it.
 *
 * @param entries - The tree's entries, as the tree-id memo ordered them.
 * @returns The body bytes.
 */
export const encodeTree = (entries: TreeObject['entries']): Uint8Array<ArrayBuffer> =>
  concatBytes(
    ...entries.map((entry) =>
      concatBytes(textEncoder.encode(`${entry.mode.replace(/^0/u, '')} ${entry.name}\0`), hexToBytes(entry.oid)),
    ),
  );

/**
 * One tree's entries, read through an object store.
 *
 * @param objects - The store.
 * @param oid - The tree's id.
 * @returns Its entries, or `undefined` when the store holds no tree by that id.
 */
export const readTreeEntries = async (
  objects: Pick<ObjectStore, 'read'>,
  oid: string,
): Promise<TreeCodecEntry[] | undefined> => {
  const object = await objects.read(oid);
  return object?.type === 'tree' ? decodeTree(object.data) : undefined;
};

/**
 * Store one tree the memo built, under the id the memo hashed.
 *
 * @param objects - The store.
 * @param tree - The memo's tree: its id and its ordered entries.
 * @returns The tree's id.
 */
export const writeTreeObject = async (
  objects: Pick<ObjectStore, 'writeLoose'>,
  tree: Pick<TreeObject, 'oid' | 'entries'>,
): Promise<string> => {
  await objects.writeLoose([{ type: 'tree', data: encodeTree(tree.entries), oid: tree.oid }]);
  return tree.oid;
};
