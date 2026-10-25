import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/* Theme spacing beyond Tailwind's numeric scale, so `size-touch-row` replaces `h-8` rather than sitting beside it. */
const twMerge = extendTailwindMerge({ extend: { theme: { spacing: ['touch-row'] } } });

/**
 * Merge conditional class names and resolve conflicting Tailwind utilities.
 *
 * @public
 * @param inputs - Class values accepted by `clsx`.
 * @returns The merged class string.
 *
 * @example <caption>Merge a component class</caption>
 * ```typescript
 * import { cn } from '@taucad/ui/utils/cn';
 *
 * export const className = cn('px-2', true && 'px-3');
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
