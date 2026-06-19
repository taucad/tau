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
