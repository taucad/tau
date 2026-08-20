import type { IdPrefix } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { customAlphabet } from 'nanoid';

const idLength = 21;
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', idLength);

/**
 * Generates a prefixed ID
 * @param prefix - The prefix to use for the ID
 * @returns A string in the format "prefix_<id>"
 * @public
 */
export function generatePrefixedId<T extends IdPrefix>(prefix: T): `${T}_${string}` {
  return `${prefix}_${nanoid()}`;
}

/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` is secure-context-only in browsers
 * (absent on a plain-http LAN origin); `getRandomValues` is not, so fall back
 * to it with the version/variant bits set so `z.uuid()` still accepts the id.
 * @returns A v4 UUID string
 * @public
 */
export function randomUuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const b = c.getRandomValues(new Uint8Array(16));
  // oxlint-disable-next-line no-bitwise -- RFC 4122 version nibble
  b[6] = (b[6]! & 0x0f) | 0x40;
  // oxlint-disable-next-line no-bitwise -- RFC 4122 variant bits
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Extracts the prefix from a prefixed ID
 * @param id - The prefixed ID
 * @returns The prefix portion of the ID
 * @throws Error if the ID is invalid or doesn't contain a valid prefix
 * @public
 */
export function extractPrefix(id: string): IdPrefix {
  // Validate first, then extract knowing it's safe
  validatePrefixedId(id);

  // We know this is safe after validation
  return id.split('_')[0]! as IdPrefix;
}

/**
 * Validates if a string is a valid prefixed ID
 * @param id - The string to validate
 * @throws Error if the ID is invalid
 * @public
 */
export function validatePrefixedId(id: string): void {
  if (!id) {
    throw new Error('ID cannot be empty');
  }

  const parts = id.split('_');
  if (parts.length !== 2) {
    throw new Error(`Invalid prefixed ID format: "${id}". Expected format: "prefix_id"`);
  }

  const [prefix, idPart] = parts;
  if (!prefix) {
    throw new Error(`Invalid prefixed ID: "${id}". Prefix cannot be empty`);
  }

  if (!idPart || idPart.length === 0) {
    throw new Error(`Invalid prefixed ID: "${id}". ID part cannot be empty`);
  }

  // Check if prefix is one of the valid prefixes
  const validPrefixes = Object.values(idPrefix);
  if (!validPrefixes.includes(prefix as IdPrefix)) {
    throw new Error(`Invalid prefix: "${prefix}". Valid prefixes are: ${validPrefixes.join(', ')}`);
  }
}

/**
 * Checks if a string is a valid prefixed ID (non-throwing version)
 * @param id - The string to validate
 * @returns boolean indicating if the string is a valid prefixed ID
 * @public
 */
export function isValidPrefixedId(id: string): id is `${IdPrefix}_${string}` {
  try {
    validatePrefixedId(id);
    return true;
  } catch {
    return false;
  }
}
