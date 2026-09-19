/**
 * Git LFS pointers, as bytes (A24, S35).
 *
 * A pointer is three lines of ASCII and a SHA-256 of the content — the whole
 * format — so Tau writes its own rather than shelling out to `git lfs clean`
 * for every blob. Two things follow, and both are the reason:
 *
 * - **Identity is the same on every host.** A tree containing a large object
 *   hashes identically in the browser and on a disk host, because the pointer
 *   that goes into the tree is computed from the content by this module and not
 *   by whichever engine happens to be installed. A `git lfs` binary that is
 *   present on one host and absent on another cannot move a `treeId` (I4).
 * - **The bytes are still git-lfs's.** The pointer this writes is byte-identical
 *   to `git lfs clean`'s, and the object is stored at the path git-lfs reads, so
 *   `git lfs push`, `git lfs pull` and a stock clone all work with no Tau code.
 *
 * The transport half — the batch API, the upload before the ref push — is
 * git-lfs's own on disk hosts and Tau's own in the browser (S49, W11). Nothing
 * here knows about a remote.
 */

import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionTreeInput } from '#algorithms/index.js';

import { digestHex } from '#object-hash.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  isTrackedLargeObjectPath,
  largeObjectThresholdBytes,
} from '#workspace-config.js';

/** One large object, as a tree entry names it. @public */
export type LfsPointer = Readonly<{
  /** Lowercase hexadecimal SHA-256 of the content. */
  oid: string;
  /** Content length in bytes. */
  size: number;
}>;

const specVersion = 'https://git-lfs.github.com/spec/v1';
const textEncoder = new TextEncoder();
/** Fatal: a pointer is ASCII, so content that is not valid UTF-8 is not one. */
const textDecoder = new TextDecoder('utf-8', { fatal: true });
/** The attributes file is text a person may have hand-written; never fatal. */
const decoder = new TextDecoder();
/** A pointer is three short lines; anything longer is content. */
const maximumPointerBytes = 1024;

/**
 * The pointer bytes for one blob's content.
 *
 * @param content - The blob's real bytes.
 * @returns The pointer, and the text a tree entry carries in its place.
 * @public
 *
 * @example <caption>What goes into the tree</caption>
 * ```typescript
 * import { lfsPointerFor } from '@taucad/revisions';
 *
 * const { pointer, bytes } = lfsPointerFor(new Uint8Array(new ArrayBuffer(5_000_000)));
 * pointer.size; // 5000000
 * bytes.byteLength; // 128-ish: three lines of ASCII
 * ```
 */
export const lfsPointerFor = (
  content: Uint8Array<ArrayBuffer>,
): Readonly<{ pointer: LfsPointer; bytes: Uint8Array<ArrayBuffer> }> => {
  const pointer: LfsPointer = Object.freeze({ oid: digestHex('sha256', content), size: content.byteLength });
  return Object.freeze({
    pointer,
    bytes: textEncoder.encode(`version ${specVersion}\noid sha256:${pointer.oid}\nsize ${String(pointer.size)}\n`),
  });
};

/**
 * Read one blob's content as a pointer, or report that it is content.
 *
 * @param content - Bytes as the store holds them.
 * @returns The pointer, or `undefined` when these bytes are the real thing.
 * @public
 */
export const readLfsPointer = (content: Uint8Array<ArrayBuffer>): LfsPointer | undefined => {
  if (content.byteLength > maximumPointerBytes) {
    return undefined;
  }
  let text: string;
  try {
    text = textDecoder.decode(content);
  } catch {
    return undefined;
  }
  /* The spec's own order and spelling: `version` first, then the keys sorted,
   * one space each. A file that merely mentions the spec URL is not a pointer. */
  const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([\da-f]{64})\nsize (\d{1,19})\n$/u.exec(
    text,
  );
  if (match === null) {
    return undefined;
  }
  return Object.freeze({ oid: match[1]!, size: Number(match[2]) });
};

/**
 * Where one large object lives, relative to the store's LFS root.
 *
 * git-lfs's own layout (`lfs/objects/<first two>/<next two>/<oid>`), so an
 * object Tau wrote is an object `git lfs push` uploads.
 *
 * @param oid - The pointer's object id.
 * @returns The store-relative path, with `/` separators.
 * @public
 */
export const lfsObjectPath = (oid: string): string => `lfs/objects/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;

/**
 * One tree as a store records it, and the objects that go beside it.
 *
 * The rule, in one place because both legs must reach the same tree (I4):
 *
 * - a path `.gitattributes` tracks — by family, or by its own name — is stored
 *   as a pointer;
 * - a file at or above {@link largeObjectThresholdBytes} whose family is *not*
 *   tracked gets a line of its own appended to the generated block first, and
 *   is then stored as a pointer (P15). Size alone never pointerises: a stock
 *   clone smudges what its attributes name, so a pointer with no attribute
 *   behind it is a file a person can never read again;
 * - bytes that already *are* a pointer are stored as themselves, so a checkout
 *   holding an un-smudged pointer never becomes a pointer to a pointer.
 *
 * Pure: the objects come back for the caller's own store to write.
 *
 * @param tree - The captured tree, with every file's real bytes.
 * @returns The tree to record, and the large objects by their oid.
 * @public
 */
export const cleanLargeObjects = (
  tree: ImmutableRevisionTree,
): Readonly<{ tree: ImmutableRevisionTree; objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>> }> => {
  /* One cut is cleaned twice: once by the I5 gate, to know the tree id it is
   * about to compare, and once by the port writing that exact tree. Both SHA-256
   * every large object in it, which on a project with one 5 MiB part file was
   * the whole cost of a save (L4). Keyed on the tree, which is immutable, so the
   * second answer is the first one rather than a recomputation of it. */
  const cached = cleanedTrees.get(tree);
  if (cached !== undefined) {
    return cached;
  }
  const entries = tree.entries();
  const attributesEntry = entries.find((entry) => entry.path === generatedGitattributesPath);
  const existing = attributesEntry === undefined ? undefined : decoder.decode(attributesEntry.content);
  const untracked = entries
    .filter(
      (entry) =>
        entry.content.byteLength >= largeObjectThresholdBytes &&
        !isTrackedLargeObjectPath(entry.path, existing) &&
        readLfsPointer(entry.content) === undefined,
    )
    .map((entry) => entry.path);
  const attributes = untracked.length === 0 ? existing : generatedGitattributesContent(existing, untracked);
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const cleaned = entries.map((entry): RevisionTreeInput => {
    if (entry.path === generatedGitattributesPath && attributes !== existing) {
      return [entry.path, textEncoder.encode(attributes), entry.mode];
    }
    if (!isTrackedLargeObjectPath(entry.path, attributes) || readLfsPointer(entry.content) !== undefined) {
      return [entry.path, entry.content, entry.mode];
    }
    const { pointer, bytes } = lfsPointerFor(entry.content);
    objects.set(pointer.oid, entry.content);
    return [entry.path, bytes, entry.mode];
  });
  if (attributes !== existing && attributesEntry === undefined) {
    cleaned.push([generatedGitattributesPath, textEncoder.encode(attributes)]);
  }
  const recorded = Object.freeze({
    tree: objects.size === 0 && attributes === existing ? tree : new ImmutableRevisionTree(cleaned),
    objects,
  });
  cleanedTrees.set(tree, recorded);
  return recorded;
};

/** Cleaned cuts, held only while their caller still holds the tree. */
const cleanedTrees = new WeakMap<
  ImmutableRevisionTree,
  Readonly<{ tree: ImmutableRevisionTree; objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>> }>
>();
