/**
 * Git index (`.git/index`) encoder for the browser leg.
 *
 * `isomorphic-git` has no `read-tree`: its `updateIndex` rewrites the whole
 * index once per path. This writes the whole file once, from a tree, the way
 * `git read-tree` does on the disk leg: version 2, entries sorted by path
 * bytes, and every stat field zero. A zero size is Git's own marker for "stat
 * never read" (what `read-tree` writes too), so the person's first `git status`
 * compares content once and then caches real stat data.
 *
 * SHA-1 only, like the leg that calls it (`createIsomorphicGitRevisionPort`
 * refuses any other object format).
 */

import { concatBytes, digest, hexToBytes } from '#object-hash.js';

/** One path of the tree the index names. @internal */
export type GitIndexEntry = Readonly<{
  /** Root-relative path with `/` separators. */
  path: string;
  /** Git file mode as the tree spells it, `100644` or `100755`. */
  mode: string;
  /** Blob object id, hex. */
  oid: string;
}>;

const signature = new TextEncoder().encode('DIRC');
const version = 2;
/** Ten 32-bit stat words, then the 20-byte oid, then 16 flag bits. */
const fixedEntryBytes = 40 + 20 + 2;
/** The name-length field is 12 bits; longer paths store the maximum. */
const maxNameLength = 0xf_ff;

const compareBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): number => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index++) {
    if (left[index] !== right[index]) {
      return left[index]! - right[index]!;
    }
  }
  return left.length - right.length;
};

/**
 * Encode a complete version 2 index naming exactly these entries.
 *
 * @param entries - Every blob path of one tree; order does not matter.
 * @returns The file bytes, trailing SHA-1 checksum included.
 * @internal
 */
export const encodeGitIndex = (entries: Iterable<GitIndexEntry>): Uint8Array<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const named = [...entries]
    .map((entry) => ({ ...entry, name: encoder.encode(entry.path) }))
    .toSorted((left, right) => compareBytes(left.name, right.name));
  const header = new Uint8Array(new ArrayBuffer(12));
  const headerView = new DataView(header.buffer);
  header.set(signature);
  headerView.setUint32(4, version);
  headerView.setUint32(8, named.length);
  const records = named.map(({ name, mode, oid }) => {
    // At least one NUL terminates the path, then pad the entry to 8 bytes.
    const length = Math.ceil((fixedEntryBytes + name.length + 1) / 8) * 8;
    const record = new Uint8Array(new ArrayBuffer(length));
    const view = new DataView(record.buffer);
    view.setUint32(24, Number.parseInt(mode, 8));
    record.set(hexToBytes(oid), 40);
    view.setUint16(60, Math.min(name.length, maxNameLength));
    record.set(name, fixedEntryBytes);
    return record;
  });
  const body = concatBytes(header, ...records);
  return concatBytes(body, digest('sha1', body));
};
