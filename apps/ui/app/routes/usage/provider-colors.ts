import { stringToColor } from '@taucad/ui-core/utils/color.utils';

/**
 * Consistent colour for a usage dimension value (provider, model or activity),
 * so the same value keeps its colour across every chart and badge.
 */
export function getUsageColor(value: string): string {
  return stringToColor(value, 0.5);
}
