import { assertRootedPath } from '@taucad/utils/path';

declare const revisionIdBrand: unique symbol;

/** Opaque identity of one immutable revision. @public */
export type RevisionId = string & { readonly [revisionIdBrand]: true };

/** One immutable file entry in a revision tree. @public */
export type RevisionTreeEntry = Readonly<{
  path: string;
  content: Uint8Array<ArrayBuffer>;
}>;

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

/**
 * Runtime-immutable file tree. Inputs and returned bytes are defensively copied,
 * so a revision cannot be changed through a retained `Uint8Array` reference.
 * Empty directories are intentionally absent, matching Git tree semantics.
 *
 * @public
 */
export class ImmutableRevisionTree {
  readonly #files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  readonly #byteLength: number;

  /**
   * Create an immutable tree from root-relative file entries.
   *
   * @param entries - File paths and their bytes or UTF-8 text.
   */
  public constructor(entries: Iterable<readonly [string, Uint8Array<ArrayBuffer> | string]>) {
    const files = new Map<string, Uint8Array<ArrayBuffer>>();
    let byteLength = 0;
    for (const [rawPath, content] of entries) {
      const path = canonicalFilePath(rawPath);
      if (files.has(path)) {
        throw new TypeError(`Duplicate revision tree path: ${path}`);
      }
      const bytes = ownedBytes(content);
      files.set(path, bytes);
      byteLength += bytes.byteLength;
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
    const bytes = this.#files.get(canonicalFilePath(path));
    return bytes === undefined ? undefined : new Uint8Array(bytes);
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
      .map(([path, content]) => ({ path, content: new Uint8Array(content) }));
  }
}
