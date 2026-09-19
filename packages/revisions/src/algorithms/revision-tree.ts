import { assertRootedPath } from '@taucad/utils/path';
import type { FileMode } from '@taucad/filesystem';

declare const revisionIdBrand: unique symbol;

/** Opaque identity of one immutable revision. @public */
export type RevisionId = string & { readonly [revisionIdBrand]: true };

/** One immutable file entry in a revision tree. @public */
export type RevisionTreeEntry = Readonly<{
  path: string;
  content: Uint8Array<ArrayBuffer>;
  mode: FileMode;
}>;

/** Constructor input for one immutable revision entry. @public */
export type RevisionTreeInput = readonly [path: string, content: Uint8Array<ArrayBuffer> | string, mode?: FileMode];

const textEncoder = new TextEncoder();

const assertOpaqueId = (value: string, label: string): void => {
  if (value.length === 0 || value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
    throw new TypeError(`${label} must be a non-empty opaque identifier without path separators.`);
  }
};

/**
 * Validate and brand an externally supplied revision identity.
 *
 * @param value - Durable opaque revision identifier.
 * @returns The validated nominal identifier.
 * @public
 */
export const revisionId = (value: string): RevisionId => {
  assertOpaqueId(value, 'RevisionId');
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- runtime validation establishes the opaque brand.
  return value as RevisionId;
};

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
 * Runtime-immutable file tree. Inputs and returned bytes are defensively copied,
 * so a revision cannot be changed through a retained `Uint8Array` reference.
 * Empty directories are intentionally absent, matching Git tree semantics.
 *
 * @public
 */
export class ImmutableRevisionTree {
  readonly #files: ReadonlyMap<string, Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }>>;
  readonly #byteLength: number;

  /**
   * Create an immutable tree from root-relative file entries.
   *
   * @param entries - File paths and their bytes or UTF-8 text.
   */
  public constructor(entries: Iterable<RevisionTreeInput>) {
    const files = new Map<string, Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }>>();
    let byteLength = 0;
    for (const [rawPath, content, mode = defaultFileMode] of entries) {
      const path = canonicalFilePath(rawPath);
      const candidateMode: string = mode;
      if (candidateMode !== '100644' && candidateMode !== '100755') {
        throw new TypeError(`Unsupported revision file mode for ${path}: ${String(mode)}`);
      }
      if (files.has(path)) {
        throw new TypeError(`Duplicate revision tree path: ${path}`);
      }
      const bytes = ownedBytes(content);
      files.set(path, { content: bytes, mode });
      byteLength += bytes.byteLength;
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
