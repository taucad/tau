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

import type { ImmutableRevisionTree } from '#algorithms/index.js';
import { adoptRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';

import { digestHex } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import { blobOid } from '#tree-id-memo.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  hasGeneratedAttributesBlock,
  isAttributesPath,
  isLargeObjectPath,
  largeObjectThresholdBytes,
  largeObjectVerdict,
  repositoryLargeObjectMatcher,
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
 * What a cut's parent recorded at each path, for the clean to keep (rule 13):
 * the blob id each path holds, from the parent's tree objects alone (a
 * `listTree`), so no blob is read. Whether that blob was the content itself or
 * its pointer is answered by hashing the content both ways. A cut with no
 * parent has none.
 *
 * @public
 */
export type LargeObjectBasis = Readonly<{
  format: ObjectFormat;
  blobs: ReadonlyMap<string, string>;
}>;

/**
 * A cut's basis from its parent's tree listing.
 *
 * @param format - The store's object format.
 * @param listing - The parent's files, as `listTree` lists them.
 * @returns The basis.
 * @public
 */
export const largeObjectBasisOf = (
  format: ObjectFormat,
  listing: Iterable<Readonly<{ path: string; oid: string }>>,
): LargeObjectBasis => Object.freeze({ format, blobs: new Map([...listing].map(({ path, oid }) => [path, oid])) });

/** How one cut is cleaned: its parent's representation, and the host's case folding. @public */
export type CleanLargeObjectsOptions = Readonly<{
  /** The parent's entries: unchanged content keeps their representation (rule 13). */
  basis?: LargeObjectBasis | undefined;
  /** `core.ignoreCase`, on a native host whose repository asks for it. */
  ignoreCase?: boolean | undefined;
}>;

/**
 * One tree as a store records it, and the objects that go beside it.
 *
 * The rule, in one place because both legs must reach the same tree (I4/I5),
 * and derived from the tree and its parent alone, as stock Git derives it
 * (D16):
 *
 * - content unchanged from the parent keeps the parent's representation — a
 *   blob stays a blob and a pointer stays a pointer, whatever the attributes
 *   now say — because Git cleans only what is added, and never renormalizes
 *   on its own (rule 13);
 * - new or changed content is a pointer exactly where the tree's own
 *   `.gitattributes` files put it on `filter=lfs`;
 * - when the root attributes file carries Tau's well-formed block and a new
 *   or changed file is in a family (whatever its case) or at or above
 *   {@link largeObjectThresholdBytes} with no attributes line speaking for it,
 *   the cut regenerates that block in place — the current families, the
 *   per-path lines it holds, and a line for each such file (P15). A cut that
 *   adds no line leaves the block as it is. Size and family alone never
 *   pointerise: a stock clone smudges what its attributes name;
 * - a tree with no Tau block is the person's: no line is added and no
 *   attributes file is written;
 * - bytes that already *are* a pointer are stored as themselves.
 *
 * Pure: the objects come back for the caller's own store to write. They are
 * the tree's own bytes, shared rather than copied — a store writes them out
 * and must never write *into* them.
 *
 * @param tree - The captured tree, with every file's real bytes.
 * @param options - The parent's basis, and case folding.
 * @returns The tree to record, and the large objects by their oid (read-only).
 * @public
 */
export const cleanLargeObjects = (
  tree: ImmutableRevisionTree,
  options: CleanLargeObjectsOptions = {},
): Readonly<{ tree: ImmutableRevisionTree; objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>> }> => {
  /* One cut is cleaned twice: once by the I5 gate, to know the tree id it is
   * about to compare, and once by the port writing that exact tree. Both SHA-256
   * every large object in it, which on a project with one 5 MiB part file was
   * the whole cost of a save (L4). Keyed on the tree, which is immutable, and
   * on what else decides, so the second answer is the first one. */
  const key = `${options.ignoreCase === true ? 'i' : 's'}`;
  const byBasis = cleanedTrees.get(tree);
  const basisKey = options.basis ?? noBasis;
  const cached = byBasis?.get(basisKey)?.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const reading = { ignoreCase: options.ignoreCase === true };
  /* The tree's own records, uncopied: every file this leaves alone is shared
   * with the cleaned tree, so its blob id stays memoised across cuts (E3). */
  const files = revisionTreeFiles(tree);
  const texts = new Map(
    [...files].flatMap(([path, { content }]) => (isAttributesPath(path) ? [[path, decoder.decode(content)]] : [])),
  );
  /* What the parent held at a path, when this content is that very thing (rule 13). Asked only where it decides. */
  const kept = (path: string, content: Uint8Array<ArrayBuffer>): 'pointer' | 'blob' | undefined => {
    const held = options.basis?.blobs.get(path);
    if (held === undefined) {
      return undefined;
    }
    const { format } = options.basis!;
    if (blobOid(content, format) === held) {
      return 'blob';
    }
    return blobOid(pointerOf(content).bytes, format) === held ? 'pointer' : undefined;
  };
  const existing = texts.get(generatedGitattributesPath);
  let attributes = existing;
  if (hasGeneratedAttributesBlock(existing)) {
    /* A line is owed for a new or changed file in a family (whatever its
     * case) or over the threshold that no attributes line speaks for. A path
     * the person turned off LFS for keeps their verdict. */
    const owed = (verdict: (path: string) => boolean | undefined): string[] =>
      [...files]
        .filter(
          ([path, { content }]) =>
            !isAttributesPath(path) &&
            (isLargeObjectPath(path) || content.byteLength >= largeObjectThresholdBytes) &&
            verdict(path) === undefined &&
            readLfsPointer(content) === undefined &&
            kept(path, content) === undefined,
        )
        .map(([path]) => path);
    /* Asked case-sensitively on every host, so the block Tau writes is the same
     * text on both legs: a case-variant file gets its own line even where
     * `core.ignoreCase` would fold it onto a family. */
    if (owed(largeObjectVerdict(texts)).length > 0) {
      /* Only now is the block rewritten: the current families first, then a line for what they still leave out. */
      const current = generatedGitattributesContent(existing);
      const untracked = owed(largeObjectVerdict(new Map([...texts, [generatedGitattributesPath, current]])));
      attributes = untracked.length === 0 ? current : generatedGitattributesContent(current, untracked);
      texts.set(generatedGitattributesPath, attributes);
    }
  }
  const matches = repositoryLargeObjectMatcher(texts, reading);
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const cleaned = new Map(files);
  for (const [path, file] of files) {
    if (isAttributesPath(path) || readLfsPointer(file.content) !== undefined) {
      continue;
    }
    /* Unchanged content keeps the parent's representation; anything else, the attributes'. Every hash is memoised. */
    const wanted = kept(path, file.content) ?? (matches(path) ? 'pointer' : 'blob');
    if (wanted === 'blob') {
      continue;
    }
    const { oid, bytes } = pointerOf(file.content);
    /* The tree's own bytes, not a copy: the result is cached for as long as
     * the tree lives, so a copy held every large export twice and cost a
     * whole copy per gate (review finding 7). Both stores only write them out. */
    objects.set(oid, file.content);
    cleaned.set(path, Object.freeze({ content: bytes, mode: file.mode }));
  }
  if (attributes !== undefined && attributes !== existing) {
    cleaned.set(
      generatedGitattributesPath,
      Object.freeze({
        content: attributesBytesOf(attributes),
        mode: files.get(generatedGitattributesPath)?.mode ?? '100644',
      }),
    );
  }
  const recorded = Object.freeze({
    tree: objects.size === 0 && attributes === existing ? tree : adoptRevisionTree(cleaned),
    objects,
  });
  const perBasis = byBasis ?? new WeakMap<LargeObjectBasis, Map<string, CleanedTree>>();
  const perKey = perBasis.get(basisKey) ?? new Map<string, CleanedTree>();
  perKey.set(key, recorded);
  perBasis.set(basisKey, perKey);
  cleanedTrees.set(tree, perBasis);
  return recorded;
};

type CleanedTree = Readonly<{ tree: ImmutableRevisionTree; objects: ReadonlyMap<string, Uint8Array<ArrayBuffer>> }>;
/* The basis key of a cut with no parent. */
const noBasis: LargeObjectBasis = Object.freeze({ format: 'sha1', blobs: new Map<string, string>() });
/** Cleaned cuts, held only while their caller still holds the tree, by basis and case folding. */
const cleanedTrees = new WeakMap<ImmutableRevisionTree, WeakMap<LargeObjectBasis, Map<string, CleanedTree>>>();

/**
 * The pointer for one large file's bytes, computed once per shared buffer (E2).
 *
 * Keyed on the bytes a tree holds, which every later cut of an unchanged file
 * shares, so a 5 MiB export is SHA-256'd when it changes and never again. The
 * pointer bytes are shared too, so their blob id is memoised as well (E3).
 *
 * @param content - Bytes a tree holds, never written.
 * @returns The pointer's oid and its bytes, shared by every caller.
 */
const pointerOf = (content: Uint8Array<ArrayBuffer>): Readonly<{ oid: string; bytes: Uint8Array<ArrayBuffer> }> => {
  let held = pointers.get(content);
  if (held === undefined) {
    const { pointer, bytes } = lfsPointerFor(content);
    held = Object.freeze({ oid: pointer.oid, bytes });
    pointers.set(content, held);
  }
  return held;
};

const pointers = new WeakMap<Uint8Array<ArrayBuffer>, Readonly<{ oid: string; bytes: Uint8Array<ArrayBuffer> }>>();

/*
 * The generated attributes block's last bytes, so an unchanged block keeps one
 * identity — and one memoised blob id — across cuts.
 *
 * ponytail: one slot; two projects alternating in one process re-hash a few
 * hundred bytes. A map keyed on the text if that ever shows up.
 */
let attributesBytes: Readonly<{ text: string; bytes: Uint8Array<ArrayBuffer> }> | undefined;
const attributesBytesOf = (text: string): Uint8Array<ArrayBuffer> => {
  if (attributesBytes?.text !== text) {
    attributesBytes = { text, bytes: textEncoder.encode(text) };
  }
  return attributesBytes.bytes;
};
