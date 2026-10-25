/**
 * SHA-256 digests for GeoSpec lineage and artifact evidence.
 *
 * Inlined from Tau's hash utilities (`sha256Bytes`) so that `geospec` depends on no Tau package; the digest is
 * byte-identical.
 */

import { sha256 } from '#support/sha256.js';

/**
 * Compute lowercase hexadecimal SHA-256. Uses WebCrypto where present and falls back to a pure-JS implementation on
 * insecure origins (plain-http LAN pages), where `crypto.subtle` is undefined; the digest is identical either way.
 *
 * @param data - The bytes to digest.
 * @returns The 64-character lowercase hexadecimal digest.
 */
export async function sha256Bytes(data: Uint8Array<ArrayBuffer>): Promise<string> {
  // Lib types declare `subtle` non-optional; insecure browser origins omit it at runtime.
  const { subtle } = globalThis.crypto as { subtle?: SubtleCrypto };
  const digest = subtle ? new Uint8Array(await subtle.digest('SHA-256', data)) : sha256(data);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
