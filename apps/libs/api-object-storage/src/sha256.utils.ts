import { createHash } from 'node:crypto';

/**
 * Computes lowercase hex SHA-256 of bytes (sync).
 */
export const sha256HexFromBytes = (bytes: Uint8Array<ArrayBuffer>): string =>
  createHash('sha256').update(bytes).digest('hex');

/**
 * Content-addressed object key with two-character shard prefix (git/registry pattern).
 * Returns a namespace-relative key `<shard2>/<shard62>` for use with the `blobs`
 * storage namespace — `ObjectStorageService` prepends `blobs/` automatically.
 */
export const blobKeyFromSha256Hex = (sha256Hex: string): string => {
  const normalized = sha256Hex.toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new TypeError('sha256Hex must be 64 lowercase hex characters');
  }

  return `${normalized.slice(0, 2)}/${normalized.slice(2)}`;
};

/**
 * Every way a content-addressed blob can be served, and the key suffix each one
 * is stored under. The digest names the bytes; the suffix names how they are
 * served. A blob is shared by every tenant that publishes the same bytes, so two
 * publications that serve them differently must never share an object, or the
 * second one's write changes what the first one's viewers receive (tau #2008).
 *
 * The default type keeps the bare digest key, so every object written before
 * served metadata joined the key is still at the key its readers derive.
 */
export const servedBlobKeySuffixes = {
  'application/octet-stream': '',
  'image/webp': '.webp',
} as const;

/** A content type a content-addressed blob may be served with. */
export type ServedBlobContentType = keyof typeof servedBlobKeySuffixes;

/**
 * The namespace-relative key of a blob's bytes served with one content type.
 *
 * @param sha256Hex - The bytes' SHA-256.
 * @param contentType - How the object is served.
 * @returns `<shard2>/<shard62>` plus that type's suffix.
 */
export const servedBlobKey = (sha256Hex: string, contentType: ServedBlobContentType): string =>
  `${blobKeyFromSha256Hex(sha256Hex)}${servedBlobKeySuffixes[contentType]}`;

/**
 * Every key one digest can be stored under, for a collector that removes the
 * bytes once nothing references the digest.
 *
 * @param sha256Hex - The bytes' SHA-256.
 * @returns One key per served content type.
 */
export const servedBlobKeys = (sha256Hex: string): readonly string[] =>
  Object.keys(servedBlobKeySuffixes).map((contentType) =>
    servedBlobKey(sha256Hex, contentType as ServedBlobContentType),
  );
