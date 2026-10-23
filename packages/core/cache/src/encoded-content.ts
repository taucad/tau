import { contentDigest, digestContent } from '#digest.js';
import type { ContentDigest, EncodedContent } from '#types.js';

/** Aggregate content publication ceiling. @internal */
export const maxEncodedBytes = 64 * 1024 * 1024;
/** Metadata and content record ceiling. @internal */
export const maxEncodedEntries = 4096;

/**
 * Validate the digests a codec attests for its leaves.
 * @param encoded - Codec output.
 * @param leafCount - Number of content leaves it carries.
 * @returns The validated digests index for index, or `undefined` when the codec attests none.
 */
const attestedDigests = (
  encoded: Uint8Array<ArrayBuffer> | EncodedContent,
  leafCount: number,
): readonly ContentDigest[] | undefined => {
  const digests: readonly unknown[] | undefined = encoded instanceof Uint8Array ? undefined : encoded.digests;
  if (digests === undefined) {
    return undefined;
  }
  if (!Array.isArray(digests) || digests.length !== leafCount) {
    throw new TypeError('Codec digests must match its content leaves index for index.');
  }
  return digests.map((value) => {
    if (typeof value !== 'string') {
      throw new TypeError('Codec digests must be content digests.');
    }
    return contentDigest({ value });
  });
};

/**
 * Hash each owned leaf that has no attested digest and intern the unique ones under the budget.
 * @param input - Owned leaves with optional attested digests, the root identity and cancellation.
 * @returns Unique leaves by digest, excluding the root.
 */
const internLeaves = async (input: {
  readonly owned: ReadonlyArray<{ readonly leaf: Uint8Array<ArrayBuffer>; readonly digest: ContentDigest | undefined }>;
  readonly rootDigest: ContentDigest;
  readonly rootSize: number;
  readonly signal: AbortSignal;
}): Promise<Map<ContentDigest, Uint8Array<ArrayBuffer>>> => {
  const content = new Map<ContentDigest, Uint8Array<ArrayBuffer>>();
  let size = input.rootSize;
  for (const { leaf, digest: attested } of input.owned) {
    // oxlint-disable-next-line no-await-in-loop -- hash one owned leaf at a time
    const digest = attested ?? (await digestContent({ bytes: leaf }));
    input.signal.throwIfAborted();
    if (digest !== input.rootDigest && !content.has(digest)) {
      size += leaf.byteLength;
      if (size > maxEncodedBytes) {
        throw new RangeError('Codec content exceeds the publication budget.');
      }
      content.set(digest, leaf);
    }
  }
  return content;
};

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
  const attested = attestedDigests(encoded, leaves.length);
  const ranges = new Map<ArrayBuffer, Set<string>>([[root.buffer, new Set([`${root.byteOffset}:${root.byteLength}`])]]);
  const unique: Array<Uint8Array<ArrayBuffer>> = [];
  const uniqueDigests: Array<ContentDigest | undefined> = [];
  let ownershipSize = root.byteLength;
  for (const [index, leaf] of leaves.entries()) {
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
    uniqueDigests.push(attested?.[index]);
  }
  // Capture synchronously; hashing must not expose retained buffers to later mutation. An attested
  // leaf is already the codec's own copy with its digest, so it is neither copied nor hashed again.
  const bytes = new Uint8Array(root);
  const owned = unique.map((leaf, index) => ({
    leaf: uniqueDigests[index] === undefined ? new Uint8Array(leaf) : leaf,
    digest: uniqueDigests[index],
  }));
  const rootDigest = await digestContent({ bytes });
  signal.throwIfAborted();
  const content = await internLeaves({ owned, rootDigest, rootSize: bytes.byteLength, signal });
  return { bytes, digest: rootDigest, content };
};
