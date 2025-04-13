import { Buffer } from 'node:buffer';
import { generateId } from 'ai';

const idLength = 21;

function hexToBase64(hex: string, length: number): string {
  return Buffer.from(hex, 'hex').toString('base64').slice(0, length);
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
 * Generates a base64 encoded prefixed ID
 * @param prefix - The prefix to use for the ID
 * @returns A string in the format "prefix_<id>"
 */
export function generatePrefixedId(prefix: IdPrefix, seed?: string): string {
  // If seed is provided, use it to generate a prefixed ID
  const idPart = seed ? hexToBase64(seed, idLength) : generateId(idLength);
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
