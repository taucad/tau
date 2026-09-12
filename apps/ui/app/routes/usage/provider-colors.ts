import { stringToColor } from '#utils/color.utils.js';

/**
 * Consistent colour for a usage dimension value (provider, model or activity),
 * so the same value keeps its colour across every chart and badge.
 */
export function getUsageColor(value: string): string {
  return stringToColor(value, 0.5);
}
