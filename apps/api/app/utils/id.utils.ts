import { generateId } from 'ai';
import type { IdPrefix } from '#types/id.types.js';
import { idPrefix } from '#constants/id.constants.js';
import { hexToBase62 } from '#utils/string.utils.js';

const idLength = 21;

/**
 * Generates a base62 encoded prefixed ID
 * @param prefix - The prefix to use for the ID
 * @returns A string in the format "prefix_<id>"
 */
export function generatePrefixedId<T extends IdPrefix>(prefix: T, seed?: string): `${T}_${string}` {
  // If seed is provided, use it to generate a prefixed ID with base62 encoding
  const idPart = seed ? hexToBase62(seed) : generateId(idLength);
  return `${prefix}_${idPart}`;
}

/**
 * Extracts the prefix from a prefixed ID
 * @param id - The prefixed ID
 * @returns The prefix portion of the ID
 * @throws Error if the ID is invalid or doesn't contain a valid prefix
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
 */
export function isValidPrefixedId(id: string): boolean {
  try {
    validatePrefixedId(id);
    return true;
  } catch {
    return false;
  }
}
