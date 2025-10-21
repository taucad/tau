import { hashCode } from '#utils/crypto.utils.js';
import { clamp } from '#utils/number.utils.js';

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

/**
 * Darken or lighten a hexadecimal color by a given amount. Applies clamp to ensure the color stays within the valid 0-255 range.
 *
 * @param hex - Hexadecimal color string (e.g., "#RRGGBB" or "RRGGBB")
 * @param amount - Amount to darken (positive) or lighten (negative) the color (-1 to 1, where 0 = no change, 1 = subtract 255, -1 = add 255)
 * @returns Modified hexadecimal color string with # prefix
 */
export function adjustHexColorBrightness(hex: string, amount = 0.1): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB components
  const r = Number.parseInt(cleanHex.slice(0, 2), 16);
  const g = Number.parseInt(cleanHex.slice(2, 4), 16);
  const b = Number.parseInt(cleanHex.slice(4, 6), 16);

  // Normalize amount to 0-255 range and apply to all channels equally
  // Positive amount darkens (subtracts), negative amount lightens (adds)
  const normalizedAmount = amount * 255;

  // Clamp values to ensure they stay in valid 0-255 range
  const modifiedR = clamp(r - normalizedAmount, 0, 255);
  const modifiedG = clamp(g - normalizedAmount, 0, 255);
  const modifiedB = clamp(b - normalizedAmount, 0, 255);

  // Convert back to hex with padding
  const modifiedHex = [modifiedR, modifiedG, modifiedB]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');

  return `#${modifiedHex}`;
}
