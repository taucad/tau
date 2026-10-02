import { digestContent } from '#digest.js';
import type { ContentDigest, EncodedContent } from '#types.js';

/** Aggregate content publication ceiling. @internal */
export const maxEncodedBytes = 64 * 1024 * 1024;
/** Metadata and content record ceiling. @internal */
export const maxEncodedEntries = 4096;

/**
 * Own codec bytes before asynchronous hashing and intern identical leaves.
 * @internal
 * @param encoded - Codec metadata and content leaves, or legacy self-contained bytes.
 * @param signal - Cancellation context for ownership and hashing.
 * @returns Owned metadata, its digest, and unique content leaves.
 */
export const ownEncodedContent = async (
  encoded: Uint8Array<ArrayBuffer> | EncodedContent,
  signal: AbortSignal,
): Promise<{
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly digest: ContentDigest;
  readonly content: ReadonlyMap<ContentDigest, Uint8Array<ArrayBuffer>>;
}> => {
  signal.throwIfAborted();
  const root = encoded instanceof Uint8Array ? encoded : encoded.bytes;
  const leaves = encoded instanceof Uint8Array ? [] : encoded.content;
  if (!(root instanceof Uint8Array) || !(root.buffer instanceof ArrayBuffer) || !Array.isArray(leaves)) {
    throw new TypeError('Codec output must contain byte arrays.');
  }
  if (
    !(encoded instanceof Uint8Array) &&
    (root.byteLength > maxEncodedBytes || leaves.length + 1 > maxEncodedEntries)
  ) {
    throw new RangeError('Codec content exceeds the publication budget.');
  }
  const ranges = new Map<ArrayBuffer, Set<string>>([[root.buffer, new Set([`${root.byteOffset}:${root.byteLength}`])]]);
  const unique: Array<Uint8Array<ArrayBuffer>> = [];
  let ownershipSize = root.byteLength;
  for (const leaf of leaves) {
    if (!(leaf instanceof Uint8Array)) {
      throw new TypeError('Codec content must contain byte arrays.');
    }
    const { buffer } = leaf;
    if (!(buffer instanceof ArrayBuffer)) {
      throw new TypeError('Codec content must have ArrayBuffer backing.');
    }
    const key = `${leaf.byteOffset}:${leaf.byteLength}`;
    let offsets = ranges.get(buffer);
    if (offsets?.has(key)) {
      continue;
    }
    ownershipSize += leaf.byteLength;
    // ponytail: bound copies before hashing; distinct equal buffers may bypass. Stream only with proven immutable ownership.
    if (ownershipSize > maxEncodedBytes) {
      throw new RangeError('Codec content exceeds the transient ownership budget.');
    }
    if (offsets === undefined) {
      offsets = new Set<string>();
      ranges.set(buffer, offsets);
    }
    offsets.add(key);
    unique.push(new Uint8Array(buffer, leaf.byteOffset, leaf.byteLength));
  }
  // Capture synchronously; hashing must not expose retained buffers to later mutation.
  const bytes = new Uint8Array(root);
  const owned = unique.map((leaf) => new Uint8Array(leaf));
  const content = new Map<ContentDigest, Uint8Array<ArrayBuffer>>();
  const rootDigest = await digestContent({ bytes });
  signal.throwIfAborted();
  let size = bytes.byteLength;
  for (const leaf of owned) {
    // oxlint-disable-next-line no-await-in-loop -- hash one owned leaf at a time
    const digest = await digestContent({ bytes: leaf });
    signal.throwIfAborted();
    if (digest !== rootDigest && !content.has(digest)) {
      size += leaf.byteLength;
      if (size > maxEncodedBytes) {
        throw new RangeError('Codec content exceeds the publication budget.');
      }
      content.set(digest, leaf);
    }
  }
  return { bytes, digest: rootDigest, content };
};
