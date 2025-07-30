import { Buffer } from 'node:buffer';
import { encodeBytes } from '#utils/base62.js';

/**
 * Converts a hex string to base62 encoding, preserving full entropy
 */
export function hexToBase62(hex: string): string {
  return encodeBytes(Buffer.from(hex, 'hex'));
}
