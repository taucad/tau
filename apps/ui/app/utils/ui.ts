import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names using clsx and tailwind-merge.
 * @param inputs 
 * @returns the merged class names.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Class name interpolation.
 * @param selector The selector to interpolate.
 * @param inputs The class names to interpolate.  
 * @returns the merged class names.
 */
export function cni(selector: string, inputs: ClassValue[]): string {
  return cn(inputs.map((input) => `${selector}:${input}`));
}
