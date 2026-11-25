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
 *
 * A change here that can move a tree id bumps `compareRulesRevision`
 * (`compare-record.ts`), so no earlier release's comparison record answers.
 */
import type { ImmutableRevisionTree } from '#algorithms/index.js';
import { revisionTreeFiles } from '#algorithms/revision-tree.js';
import type { RevisionTreeFile } from '#algorithms/revision-tree.js';
import { bytesToHex, concatBytes, createDigest, digest, hexToBytes } from '#object-hash.js';
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
/** One blob's object id, memoised on the bytes a tree holds (E3). @internal */
export const blobOid = (content: Uint8Array<ArrayBuffer>, format: ObjectFormat): string => {
  const held = blobOids.get(content) ?? {};
  held[format] ??= bytesToHex(digest(format, frameObject('blob', content)));
  blobOids.set(content, held);
  return held[format];
};

/** Work between two turns of the event loop: a read or a render queued behind hashing waits no longer than this. */
const hashBudgetMilliseconds = 8;
/** Bytes the JS hasher takes per run, between budget checks: about a millisecond of work. */
const hashRunBytes = 256 * 1024;
/** Bytes copied per run into the buffer WebCrypto digests, between budget checks. */
const copyRunBytes = 8 * 1024 * 1024;
/** A file at most this large is hashed in place by the JS hasher: cheaper than a hop to WebCrypto. */
const inPlaceBytes = 64 * 1024;

/**
 * Turns hashing has given the event loop so far, for a harness to report.
 *
 * @internal
 */
export const hashingTurns = { count: 0 };

/*
 * A turn of the event loop that no timer clamp delays: one message through a
 * fresh channel. Not `scheduler.yield`: its continuation runs ahead of tasks of
 * the same priority, so in a worker the file-manager's queued reads (ordinary
 * posted messages) would wait out the whole batch. A posted message queues
 * behind them, so they are served before hashing resumes.
 */
const yieldTurn = async (): Promise<void> => {
  hashingTurns.count += 1;
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.addEventListener('message', () => {
      port1.close();
      resolve();
    });
    port1.start();
    port2.postMessage(undefined);
  });
};

/**
 * Blob ids for many files without holding the thread (STO-25): small files in
 * place, large ones through WebCrypto's digest (off the JavaScript thread)
 * where the realm has it, else the JS hasher a run at a time, and a turn of
 * the event loop only once a few milliseconds of work have passed since the
 * last one, never per file. A memoised id costs nothing. A digest WebCrypto
 * refuses is taken by the JS hasher. Every id lands in the same memo as
 * {@link blobOid}, so a later cut of the same bytes hashes nothing.
 *
 * @internal
 */
export type BlobHashing = Readonly<{
  /**
   * One blob's id, pacing against the work this hashing has done since its last turn.
   *
   * @param content - The tree's own bytes for one file.
   * @param format - The object format.
   * @returns The blob id.
   */
  blobOid: (content: Uint8Array<ArrayBuffer>, format: ObjectFormat) => Promise<string>;
}>;

/**
 * Start a run of paced blob hashing.
 *
 * @param subtle - The WebCrypto digest to use, or `false` for the JS hasher alone; the realm's own when absent.
 * @returns The hashing, its budget starting now.
 * @internal
 */
export const createBlobHashing = (
  subtle: Pick<SubtleCrypto, 'digest'> | false = (globalThis as { crypto?: Crypto }).crypto?.subtle ?? false,
): BlobHashing => {
  let since = performance.now();
  /* A turn once the budget is spent: the clock restarts after it. */
  const pace = async (): Promise<void> => {
    if (performance.now() - since < hashBudgetMilliseconds) {
      return;
    }
    await yieldTurn();
    since = performance.now();
  };
  const inJs = async (header: Uint8Array<ArrayBuffer>, content: Uint8Array<ArrayBuffer>, format: ObjectFormat) => {
    const hasher = createDigest(format);
    hasher.update(header);
    for (let offset = 0; offset < content.length; offset += hashRunBytes) {
      hasher.update(content.subarray(offset, offset + hashRunBytes));
      // oxlint-disable-next-line no-await-in-loop -- a turn when the budget is spent is the point.
      await pace();
    }
    return bytesToHex(hasher.finish());
  };
  const inWebCrypto = async (
    digester: Pick<SubtleCrypto, 'digest'>,
    header: Uint8Array<ArrayBuffer>,
    blob: Readonly<{ content: Uint8Array<ArrayBuffer>; format: ObjectFormat }>,
  ): Promise<string> => {
    const { content, format } = blob;
    /* One buffer for the digest, filled a run at a time: a large file's copy is no stall either. */
    const framed = new Uint8Array(new ArrayBuffer(header.length + content.length));
    framed.set(header);
    for (let offset = 0; offset < content.length; offset += copyRunBytes) {
      framed.set(content.subarray(offset, offset + copyRunBytes), header.length + offset);
      // oxlint-disable-next-line no-await-in-loop -- a turn when the budget is spent is the point.
      await pace();
    }
    const digested = await digester.digest(format === 'sha1' ? 'SHA-1' : 'SHA-256', framed);
    /* The digest ran off this thread, and its answer came on a later task: the budget starts again. */
    since = performance.now();
    return bytesToHex(new Uint8Array(digested));
  };
  const hash = async (content: Uint8Array<ArrayBuffer>, format: ObjectFormat): Promise<string> => {
    const held = blobOids.get(content)?.[format];
    if (held !== undefined) {
      return held;
    }
    let oid: string;
    if (content.length <= inPlaceBytes) {
      oid = blobOid(content, format);
      await pace();
      return oid;
    }
    const header = textEncoder.encode(`blob ${String(content.length)}\0`);
    if (subtle === false) {
      oid = await inJs(header, content, format);
    } else {
      try {
        oid = await inWebCrypto(subtle, header, { content, format });
      } catch {
        /* A realm that refuses the digest still answers: a rollback never waits on WebCrypto. */
        oid = await inJs(header, content, format);
      }
    }
    recordBlobOid(content, format, oid);
    return oid;
  };
  return Object.freeze({ blobOid: hash });
};

/**
 * Take a blob id measured elsewhere for bytes a tree holds — a committed
 * import's facts, measured from its read-back (charter D12, EQ6) — so neither
 * the gate nor a store's writer hashes them again (I2). The caller vouches
 * that the id is of exactly these bytes; an id of the wrong form is ignored.
 *
 * @param content - The tree's own bytes for one file.
 * @param format - The object format the id is in.
 * @param oid - The measured blob id.
 * @internal
 */
export const recordBlobOid = (content: Uint8Array<ArrayBuffer>, format: ObjectFormat, oid: string): void => {
  if (!(format === 'sha1' ? /^[0-9a-f]{40}$/u : /^[0-9a-f]{64}$/u).test(oid)) {
    return;
  }
  const held = blobOids.get(content) ?? {};
  held[format] ??= oid;
  blobOids.set(content, held);
};

/**
 * Whether bytes a tree holds already have an id in this format, hashed or
 * taken, so a caller offering ids for them asks only for what it lacks.
 *
 * @param content - The tree's own bytes for one file.
 * @param format - The object format.
 * @returns `true` when {@link blobOid} would answer without hashing.
 * @internal
 */
export const hasBlobOid = (content: Uint8Array<ArrayBuffer>, format: ObjectFormat): boolean =>
  blobOids.get(content)?.[format] !== undefined;

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
