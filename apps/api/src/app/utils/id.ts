import { Buffer } from 'node:buffer';
import { generateId } from 'ai';
import { encodeBytes } from './base62.js';

const idLength = 21;

/**
 * Converts a hex string to base62 encoding, preserving full entropy
 */
function hexToBase62(hex: string): string {
  return encodeBytes(Buffer.from(hex, 'hex'));
}

export const idPrefix = {
  /**
   * An LLM chat message ID.
   */
  message: 'msg',
  /**
   * An LLM chat ID.
   */
  chat: 'chat',
  /**
   * An LLM chat tool call ID.
   */
  toolCall: 'tool',
  /**
   * An LLM chat source ID.
   */
  source: 'src',
  /**
   * An LLM chat run ID.
   */
  run: 'run',
} as const satisfies Record<string, string>;

export type IdPrefix = (typeof idPrefix)[keyof typeof idPrefix];

/**
 * Generates a base62 encoded prefixed ID
 * @param prefix - The prefix to use for the ID
 * @returns A string in the format "prefix_<id>"
 */
export function generatePrefixedId(prefix: IdPrefix, seed?: string): string {
  // If seed is provided, use it to generate a prefixed ID with base62 encoding
  const idPart = seed ? hexToBase62(seed) : generateId(idLength);
  return `${prefix}_${idPart}`;
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
