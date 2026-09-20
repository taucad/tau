/**
 * Git's own tree object id, computed over a captured tree without writing it.
 *
 * Moved out of `revision-effects.ts` unchanged (W10.1): the group depends on
 * nothing in `createRevisionActors`, so it was module-level there already.
 */
import type { FileMode } from '@taucad/filesystem';
import type { ImmutableRevisionTree } from '#algorithms/index.js';
import { bytesToHex, concatBytes, digest, hexToBytes } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';

const textEncoder = new TextEncoder();
const directoryMode = '40000';

/* One git object's framed bytes: `<type> <length>\0<body>`. */
const frameObject = (type: 'blob' | 'tree', body: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  concatBytes(textEncoder.encode(`${type} ${String(body.length)}\0`), body);

type TreeNode = {
  readonly files: Map<string, Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }>>;
  readonly directories: Map<string, TreeNode>;
};

const emptyNode = (): TreeNode => ({ files: new Map(), directories: new Map() });

/* Fold a flat path-keyed tree into the nested shape a git tree object has. */
const nodeOf = (tree: ImmutableRevisionTree): TreeNode => {
  const root = emptyNode();
  for (const { path, content, mode } of tree.entries()) {
    const segments = path.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let child = node.directories.get(segment);
      if (child === undefined) {
        child = emptyNode();
        node.directories.set(segment, child);
      }
      node = child;
    }
    node.files.set(segments.at(-1) ?? path, { content, mode });
  }
  return root;
};

/* Git's own entry order: byte-wise by name, a directory sorting as `name/`. */
const compareBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): number => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
};

/**
 * One blob's object id, hashed once per buffer (B3).
 *
 * The same captured tree is folded more than once on the way to a revision —
 * the I5 gate, the claim {@link revisionTreeId} makes, and the port's own write
 * all hash it — and pure-JS SHA-1 runs at about 39 MiB/s, so the repeats were
 * the measurable cost of a save on a project with a large file in it (L4).
 *
 * Keyed on the buffer, not the path: identity is the only test that cannot be
 * wrong, so the ids stay byte-identical by construction. A capture that read a
 * file again produces a new buffer and is simply a miss. The table is weak, so
 * it holds nothing a caller has let go of.
 *
 * @param content - The file's bytes.
 * @param format - The store's recorded object hash.
 * @returns Lowercase hexadecimal blob object id.
 */
const blobOid = (content: Uint8Array<ArrayBuffer>, format: ObjectFormat): string => {
  const held = blobOids.get(content);
  if (held !== undefined && held.format === format) {
    return held.oid;
  }
  const oid = bytesToHex(digest(format, frameObject('blob', content)));
  blobOids.set(content, { format, oid });
  return oid;
};

const blobOids = new WeakMap<Uint8Array<ArrayBuffer>, Readonly<{ format: ObjectFormat; oid: string }>>();
const treeOids = new WeakMap<ImmutableRevisionTree, Map<ObjectFormat, string>>();

const hashNode = (node: TreeNode, format: ObjectFormat): string => {
  const entries = [
    ...[...node.files].map(([name, file]) => ({
      name,
      mode: file.mode,
      sortKey: textEncoder.encode(name),
      oid: blobOid(file.content, format),
    })),
    ...[...node.directories].map(([name, child]) => ({
      name,
      mode: directoryMode,
      sortKey: textEncoder.encode(`${name}/`),
      oid: hashNode(child, format),
    })),
  ].sort((left, right) => compareBytes(left.sortKey, right.sortKey));
  const body = concatBytes(
    ...entries.map((entry) => concatBytes(textEncoder.encode(`${entry.mode} ${entry.name}\0`), hexToBytes(entry.oid))),
  );
  return bytesToHex(digest(format, frameObject('tree', body)));
};

/**
 * The object id the tree would have in the store, computed without writing it.
 *
 * The I5 gate compares a cut against the head's `treeId`, and the head's comes
 * from a recorded commit — so this has to be the *git* tree id and not a digest
 * of Tau's own choosing, or the gate would never hold and every turn would mint
 * an identical revision. Every mint checks the claim: `writeRevision` compares
 * what the engine recorded against what this computed, and refuses on a
 * mismatch rather than silently re-minting forever.
 *
 * @param tree - The captured tree.
 * @param format - The store's recorded object hash.
 * @returns Lowercase hexadecimal tree object id.
 * @public
 */
export const revisionTreeId = (tree: ImmutableRevisionTree, format: ObjectFormat): string => {
  const held = treeOids.get(tree)?.get(format);
  if (held !== undefined) {
    return held;
  }
  const oid = hashNode(nodeOf(tree), format);
  const byFormat = treeOids.get(tree) ?? new Map<ObjectFormat, string>();
  byFormat.set(format, oid);
  treeOids.set(tree, byFormat);
  return oid;
};
