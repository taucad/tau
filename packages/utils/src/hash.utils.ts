/**
 * Fast non-cryptographic string/byte hashing (djb2) for cache keys, checksums,
 * and change-detection fingerprints.
 *
 * NOT suitable for security — use a cryptographic hash (e.g. SHA-256 via
 * `crypto.subtle`) wherever collision resistance against adversaries matters.
 */

/**
 * Hashes a byte array with djb2, avoiding UTF-8 decode overhead.
 *
 * @param data - The bytes to hash.
 * @returns An 8-character lowercase hex string (32-bit unsigned).
 * @public
 */
export function hashBytes(data: Uint8Array<ArrayBuffer>): string {
  let hash = 5381;
  for (const byte of data) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc, no-bitwise -- unsigned 32-bit wraparound is intentional
    hash = (hash * 33 + byte) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

/**
 * Hashes a string with djb2 without an intermediate byte allocation.
 *
 * Iterates UTF-16 code units via `codePointAt`, so a surrogate pair contributes
 * its full code point at the lead unit (kept identical to the prior in-repo
 * implementations for output stability).
 *
 * @param input - The string to hash.
 * @returns An 8-character lowercase hex string (32-bit unsigned).
 * @public
 */
export function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index++) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc, no-bitwise -- unsigned 32-bit wraparound is intentional
    hash = (hash * 33 + input.codePointAt(index)!) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

/**
 * Serialize JSON-compatible data with object keys sorted recursively.
 * Array order is preserved; object properties whose value is `undefined`
 * follow `JSON.stringify` semantics and are omitted.
 *
 * @param value - JSON-compatible value to serialize.
 * @returns Stable canonical JSON text.
 * @public
 */
export function canonicalJson(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((entry) => canonicalize(entry));
    }
    if (input === null || typeof input !== 'object') {
      return input;
    }
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  };

  const serialized = JSON.stringify(canonicalize(value));
  return serialized;
}

/** Compute lowercase hexadecimal SHA-256 with the host Web Crypto implementation. @public */
export async function sha256Bytes(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compute lowercase hexadecimal SHA-256 for UTF-8 text. @public */
export async function sha256String(input: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(input));
}
