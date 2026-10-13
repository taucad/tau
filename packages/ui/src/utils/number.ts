/**
 * Clamp a value into an inclusive range.
 *
 * @param value - The value to clamp.
 * @param min - The lower bound.
 * @param max - The upper bound.
 * @returns `value`, raised to `min` or lowered to `max` when it falls outside.
 * @public
 * @example <caption>Keep a slider value in range</caption>
 * ```typescript
 * import { clamp } from '@taucad/ui/utils/number';
 *
 * clamp(120, 0, 90); // 90
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
