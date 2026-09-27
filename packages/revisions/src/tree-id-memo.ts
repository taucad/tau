/**
 * Git tree ids and tree objects for successive trees, computing only what
 * changed (E3, with E1's shared records making the blob half exact).
 *
 * A blob id is keyed on the bytes a tree holds — shared by every later tree
 * that did not change the file, and never written — and a tree object id on
 * its directory's full text form, so a one-file edit digests one blob and the
 * tree objects on that file's path, and nothing else (L4-F1, L4-F3). Hashing
 * copies of the bytes, as `git-tree-id.ts` used to, re-digested everything on
 * every cut. `revisionTreeId` is this over one module-level memo; a checkout's
 * gate and a store's writer each keep their own.
 */
import type { ImmutableRevisionTree } from '#algorithms/index.js';
import { revisionTreeFiles } from '#algorithms/revision-tree.js';
import type { RevisionTreeFile } from '#algorithms/revision-tree.js';
import { bytesToHex, concatBytes, digest, hexToBytes } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';

const textEncoder = new TextEncoder();
const directoryMode = '40000';

/* One git object's framed bytes: `<type> <length>\0<body>`. */
const frameObject = (type: 'blob' | 'tree', body: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  concatBytes(textEncoder.encode(`${type} ${String(body.length)}\0`), body);

/*
 * Blob ids by the bytes a tree holds. Identity is exact because those bytes
 * are never written (`RevisionTreeFile`), and weak because a buffer no tree
 * holds any more has no id worth keeping.
 */
const blobOids = new WeakMap<Uint8Array<ArrayBuffer>, Partial<Record<ObjectFormat, string>>>();
const blobOid = (content: Uint8Array<ArrayBuffer>, format: ObjectFormat): string => {
  const held = blobOids.get(content) ?? {};
  held[format] ??= bytesToHex(digest(format, frameObject('blob', content)));
  blobOids.set(content, held);
  return held[format];
};

/* Whole trees: the gate, the claim and the port's write ask of one tree. */
const treeObjects = new WeakMap<ImmutableRevisionTree, Partial<Record<ObjectFormat, TreeObject>>>();

type TreeNode = {
  readonly files: Map<string, RevisionTreeFile>;
  readonly directories: Map<string, TreeNode>;
};

const emptyNode = (): TreeNode => ({ files: new Map(), directories: new Map() });

/* Fold a flat path-keyed tree into the nested shape a git tree object has. */
const nodeOf = (tree: ImmutableRevisionTree): TreeNode => {
  const root = emptyNode();
  for (const [path, file] of revisionTreeFiles(tree)) {
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
    node.files.set(segments.at(-1)!, file);
  }
  return root;
};

/* Git's own entry order: byte-wise by name, a directory sorting as `name/`. */
const compareBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): number => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
};

/**
 * One tree object as a store records it: its id and its entries in git's
 * order, each subtree an object of its own, so a writer can store children
 * first and skip any subtree the store already holds.
 *
 * @internal
 */
export type TreeObject = Readonly<{
  oid: string;
  entries: ReadonlyArray<
    Readonly<
      { name: string; mode: string; oid: string } & (
        | { type: 'blob'; content: Uint8Array<ArrayBuffer> }
        | { type: 'tree'; tree: TreeObject }
      )
    >
  >;
}>;

/** Tree ids for one checkout's cuts. @internal */
export type TreeIdMemo = Readonly<{
  /**
   * The object id the tree would have in the store, computed without writing
   * it.
   *
   * @param tree - A captured (and, for an LFS store, cleaned) tree.
   * @param format - The store's recorded object hash.
   * @returns Lowercase hexadecimal tree object id.
   */
  treeId: (tree: ImmutableRevisionTree, format: ObjectFormat) => string;
  /**
   * The same tree as the graph of objects a store writes. The blob contents
   * are the tree's own bytes: never write them.
   *
   * @param tree - A captured (and, for an LFS store, cleaned) tree.
   * @param format - The store's recorded object hash.
   * @returns The root tree object.
   */
  treeObject: (tree: ImmutableRevisionTree, format: ObjectFormat) => TreeObject;
}>;

/**
 * A tree-node memo (E3).
 *
 * Each directory keeps the text form of the tree object it last hashed to —
 * every entry's mode, name and id, in git's order — and its id; a directory
 * whose text form is unchanged is not digested again. The text form is the
 * object's whole content, so a hit cannot be wrong.
 *
 * **Bound.** One slot per directory of the last tree hashed in each object
 * format — slots the next tree does not have are dropped — so a memo holds at
 * most one tree's directory listing per format (about 70 bytes per entry)
 * however many trees, checkouts or projects pass through it. Blob ids and
 * whole-tree objects are weak on the bytes and trees they describe.
 *
 * @internal
 * @returns A memo for the successive trees of one checkout or one store.
 */
export const createTreeIdMemo = (): TreeIdMemo => {
  const directories = new Map<string, Readonly<{ text: string; oid: string }>>();

  /* One walk: the format it hashes in and the directories it reached. */
  const hashNode = (
    node: TreeNode,
    slot: string,
    walk: Readonly<{ format: ObjectFormat; visited: Set<string> }>,
  ): TreeObject => {
    const { format, visited } = walk;
    type SortedEntry = TreeObject['entries'][number] & Readonly<{ sortKey: Uint8Array<ArrayBuffer> }>;
    const entries = [
      ...[...node.files].map(
        ([name, file]): SortedEntry => ({
          name,
          mode: file.mode,
          sortKey: textEncoder.encode(name),
          oid: blobOid(file.content, format),
          type: 'blob',
          content: file.content,
        }),
      ),
      ...[...node.directories].map(([name, child]): SortedEntry => {
        const tree = hashNode(child, `${slot}/${name}`, walk);
        return {
          name,
          mode: directoryMode,
          sortKey: textEncoder.encode(`${name}/`),
          oid: tree.oid,
          type: 'tree',
          tree,
        };
      }),
    ].sort((left, right) => compareBytes(left.sortKey, right.sortKey));
    /* Names hold no NUL and ids are fixed-length, so the concatenation is
     * injective: equal text is an equal tree object. */
    const text = entries.map((entry) => `${entry.mode} ${entry.name}\0${entry.oid}`).join('');
    visited.add(slot);
    let oid = directories.get(slot)?.text === text ? directories.get(slot)!.oid : undefined;
    if (oid === undefined) {
      const body = concatBytes(
        ...entries.map((entry) =>
          concatBytes(textEncoder.encode(`${entry.mode} ${entry.name}\0`), hexToBytes(entry.oid)),
        ),
      );
      oid = bytesToHex(digest(format, frameObject('tree', body)));
      directories.set(slot, { text, oid });
    }
    return Object.freeze({
      oid,
      entries: Object.freeze(entries.map(({ sortKey: _sortKey, ...entry }) => Object.freeze(entry))),
    });
  };

  const treeObject = (tree: ImmutableRevisionTree, format: ObjectFormat): TreeObject => {
    const held = treeObjects.get(tree) ?? {};
    if (held[format] === undefined) {
      const visited = new Set<string>();
      held[format] = hashNode(nodeOf(tree), format, { format, visited });
      /* A directory the tree no longer has keeps no slot. */
      for (const slot of directories.keys()) {
        if (!visited.has(slot) && (slot === format || slot.startsWith(`${format}/`))) {
          directories.delete(slot);
        }
      }
      treeObjects.set(tree, held);
    }
    return held[format];
  };

  return { treeId: (tree, format) => treeObject(tree, format).oid, treeObject };
};
