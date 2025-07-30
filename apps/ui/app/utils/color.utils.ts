import { hashCode } from '#utils/crypto.js';

/**
 * Converts a hash string to an OKLCH color using the design system
 * @param hash - Hexadecimal hash string
 * @returns OKLCH color string with CSS variables
 */
function hashToColor(hash: string, opacity = 1): string {
  const hashNumber = Number.parseInt(hash, 36);
  const hue = hashNumber % 360;

  // Use medium lightness and appropriate chroma for good visibility
  const lightness = 'var(--l-medium)';
  const chroma = '0.2'; // Strong enough for good saturation

  if (opacity === 1) {
    return `oklch(${lightness} ${chroma} ${hue}deg)`;
  }

  return `oklch(${lightness} ${chroma} ${hue}deg / ${opacity})`;
}

/**
 * Converts a string input to a deterministic OKLCH color using a hash function
 * @param input - Any string input
 * @returns OKLCH color string with CSS variables
 */
export function stringToColor(input: string, opacity = 1): string {
  const hash = hashCode(input);
  return hashToColor(hash, opacity);
}
