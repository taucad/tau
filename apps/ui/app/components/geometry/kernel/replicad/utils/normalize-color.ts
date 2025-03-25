// import parse from 'parse-css-color';
import { converter, serializeHex } from 'culori';

const rgb = converter('rgb');

/**
 * Normalize a color string to a hex color and alpha value.
 * @param color - The color string to normalize.
 * @returns The normalized color and alpha value.
 */
export function normalizeColor(color: string): { color: string; alpha: number } {
  const parsedRgb = rgb(color);
  if (!parsedRgb) return { color: '#fff', alpha: 1 };
  const hex = serializeHex(parsedRgb);

  return { color: hex, alpha: parsedRgb.alpha ?? 1 };
}
