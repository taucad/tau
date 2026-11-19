/**
 * The code-load owner's lazy component (PL7 FP9, `#lib/code-loading`): the one way the page realm calls `React.lazy`.
 * Kept apart from `load` so modules a worker also runs never take React with it.
 */

import { lazy as reactLazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { isModuleLoadFailure } from '#lib/code-loading.js';

/** How a lazy component is made. */
export type LazyOptions<Component> = Readonly<{
  /** What renders instead when the component's code fails to load: optional code degrades to it. */
  fallback?: Component;
}>;

/**
 * A lazy component through the owner: the one way the page realm calls `React.lazy`. Its factory loads its code with
 * `load` (`#lib/code-loading`) (with `optional: true` when it declares a fallback).
 *
 * @param factory - Loads the component's module.
 * @param options - The fallback for optional code.
 * @returns The lazy component.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- React's own `lazy` constraint: any component's props.
export const lazy = <Component extends ComponentType<any>>(
  factory: () => Promise<{ default: Component }>,
  options: LazyOptions<Component> = {},
): LazyExoticComponent<Component> => {
  const { fallback } = options;
  if (fallback === undefined) {
    return reactLazy(factory);
  }
  return reactLazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isModuleLoadFailure(error)) {
        return { default: fallback };
      }
      throw error;
    }
  });
};
