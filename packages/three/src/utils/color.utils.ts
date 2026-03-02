function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  const modifiedR = Math.floor(clamp(r - normalizedAmount, 0, 255));
  const modifiedG = Math.floor(clamp(g - normalizedAmount, 0, 255));
  const modifiedB = Math.floor(clamp(b - normalizedAmount, 0, 255));

  // Convert back to hex with padding
  const modifiedHex = [modifiedR, modifiedG, modifiedB]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');

  return `#${modifiedHex}`;
}
