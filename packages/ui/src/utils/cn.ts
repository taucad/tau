import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
