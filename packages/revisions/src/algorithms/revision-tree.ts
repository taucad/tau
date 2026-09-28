import { assertRootedPath } from '@taucad/utils/path';
import type { FileMode } from '@taucad/filesystem';

/** One immutable file entry in a revision tree. @public */
export type RevisionTreeEntry = Readonly<{
  path: string;
  content: Uint8Array<ArrayBuffer>;
  mode: FileMode;
}>;

/** Constructor input for one immutable revision entry. @public */
export type RevisionTreeInput = readonly [path: string, content: Uint8Array<ArrayBuffer> | string, mode?: FileMode];

const textEncoder = new TextEncoder();

const canonicalFilePath = (path: string): string => {
  const canonical = assertRootedPath(path);
  if (canonical === '') {
    throw new TypeError('A revision tree entry must name a file, not the tree root.');
  }
  return canonical;
};

const ownedBytes = (content: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof content === 'string' ? textEncoder.encode(content) : new Uint8Array(content);

const comparePath = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const defaultFileMode: FileMode = '100644';

/**
 * One file as a tree holds it. The bytes are never handed out and never
 * written, so two trees may share a record — and a memo keyed on its bytes'
 * identity is exact (E1–E3).
 *
 * @internal
 */
export type RevisionTreeFile = Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }>;

const ownedFiles = (entries: Iterable<RevisionTreeInput>): Map<string, RevisionTreeFile> => {
  const files = new Map<string, RevisionTreeFile>();
  for (const [rawPath, content, mode = defaultFileMode] of entries) {
    const path = canonicalFilePath(rawPath);
    if (files.has(path)) {
      throw new TypeError(`Duplicate revision tree path: ${path}`);
    }
    files.set(path, Object.freeze({ content: ownedBytes(content), mode }));
  }
  return files;
};

/* A tree read through its public surface only: every byte copied. */
const publicEntries = (tree: ImmutableRevisionTree): RevisionTreeInput[] =>
  tree.entries().map(({ path, content, mode }): RevisionTreeInput => [path, content, mode]);

/* Set only for the duration of one `adoptRevisionTree` construction. */
let adopting: Map<string, RevisionTreeFile> | undefined;
let filesOf: (tree: ImmutableRevisionTree) => ReadonlyMap<string, RevisionTreeFile>;

/**
 * Runtime-immutable file tree. Inputs and returned bytes are defensively copied,
 * so a revision cannot be changed through a retained `Uint8Array` reference.
 * Empty directories are intentionally absent, matching Git tree semantics.
 *
 * @public
 */
export class ImmutableRevisionTree {
  readonly #files: ReadonlyMap<string, RevisionTreeFile>;
  readonly #byteLength: number;

  /**
   * Create an immutable tree from root-relative file entries.
   *
   * @param entries - File paths and their bytes or UTF-8 text.
   */
  public constructor(entries: Iterable<RevisionTreeInput>) {
    const files = adopting ?? ownedFiles(entries);
    adopting = undefined;
    let byteLength = 0;
    for (const [path, { content, mode }] of files) {
      const candidateMode: string = mode;
      if (candidateMode !== '100644' && candidateMode !== '100755') {
        throw new TypeError(`Unsupported revision file mode for ${path}: ${String(mode)}`);
      }
      byteLength += content.byteLength;
    }
    /* A path that is also a directory prefix is a shape Git cannot represent:
     * `isomorphic-git` writes a tree `git fsck --strict` calls
     * `duplicateEntries` and `git fast-import` writes a different tree from the
     * same input, so the two engines would disagree on identity *and* one of
     * them would hold a corrupt object. It fails closed here, the one place
     * every writer passes through (review 4 R27). */
    for (const path of files.keys()) {
      for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
        const prefix = path.slice(0, index);
        if (files.has(prefix)) {
          throw new TypeError(`Revision tree path ${path} collides with the file ${prefix}.`);
        }
      }
    }
    this.#files = files;
    this.#byteLength = byteLength;
  }

  static {
    /**
     * The one reader of `#files` outside the class: `revisionTreeFiles`. A tree
     * built by another copy of this module (a second bundle, a reset module
     * graph) has no `#files` this class can read, so its public entries are
     * copied instead — correct, and simply unshared.
     *
     * @param tree - The tree whose records are read.
     * @returns Its records, uncopied when this module built the tree.
     */
    filesOf = (tree: ImmutableRevisionTree): ReadonlyMap<string, RevisionTreeFile> =>
      #files in tree ? tree.#files : ownedFiles(publicEntries(tree));
  }

  /** Number of files in the tree. */
  public get size(): number {
    return this.#files.size;
  }

  /** Aggregate payload bytes in the tree. */
  public get byteLength(): number {
    return this.#byteLength;
  }

  /**
   * Read one file as an owned byte copy.
   *
   * @param path - Root-relative file path.
   * @returns Owned bytes, or `undefined` when absent.
   */
  public get(path: string): Uint8Array<ArrayBuffer> | undefined {
    const entry = this.#files.get(canonicalFilePath(path));
    return entry === undefined ? undefined : new Uint8Array(entry.content);
  }

  /** Read one file's supported Git mode. */
  public mode(path: string): FileMode | undefined {
    return this.#files.get(canonicalFilePath(path))?.mode;
  }

  /** Test whether a path exists in the tree. */
  public has(path: string): boolean {
    return this.#files.has(canonicalFilePath(path));
  }

  /**
   * Return a stable path-sorted snapshot with owned byte arrays.
   *
   * @returns Deterministically ordered immutable entries.
   */
  public entries(): readonly RevisionTreeEntry[] {
    return [...this.#files.entries()]
      .sort(([left], [right]) => comparePath(left, right))
      .map(([path, entry]) => ({ path, content: new Uint8Array(entry.content), mode: entry.mode }));
  }
}

/**
 * A tree's own records, uncopied, for the package's hashing and cleaning.
 *
 * The bytes belong to the tree: a caller that writes them changes a revision.
 *
 * @internal
 * @param tree - The tree whose records are read.
 * @returns Its records by canonical path.
 */
export const revisionTreeFiles = (tree: ImmutableRevisionTree): ReadonlyMap<string, RevisionTreeFile> => filesOf(tree);

/**
 * Build a tree over records without copying them — the way a tree shares every
 * unchanged file with the one it was derived from (E1).
 *
 * The same checks as the constructor, except path canonicalization: every key
 * must already be canonical, as a key of {@link revisionTreeFiles} is. The
 * caller gives up the map and must never write a record's bytes.
 *
 * @internal
 * @param files - Records by canonical path; owned by the tree from now on.
 * @returns The tree over exactly those records.
 */
export const adoptRevisionTree = (files: Map<string, RevisionTreeFile>): ImmutableRevisionTree => {
  adopting = files;
  try {
    return new ImmutableRevisionTree([]);
  } finally {
    adopting = undefined;
  }
};
