import { generateId } from 'ai';
import { PrefixType } from './constants';

/**
 * Generates a prefixed ID
 * @param prefix - The prefix to use for the ID
 * @returns A string in the format "prefix_<id>"
 */
export function generatePrefixedId(prefix: PrefixType): string {
  return `${prefix}_${generateId(21)}`;
}

/**
 * Extracts the prefix from a prefixed ID
 * @param id - The prefixed ID
 * @returns The prefix portion of the ID
 */
export function extractPrefix(id: string): string {
  return id.split('_')[0];
}

/**
 * Validates if a string is a valid prefixed ID
 * @param id - The string to validate
 * @returns boolean indicating if the string is a valid prefixed ID
 */
export function isValidPrefixedId(id: string): boolean {
  if (!id) return false;
  const parts = id.split('_');
  return parts.length === 2 && parts[1].length > 0;
}
