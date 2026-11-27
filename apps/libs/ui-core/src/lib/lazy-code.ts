import { lazy } from 'react';
import type { ComponentProps, ComponentType, LazyExoticComponent } from 'react';
import { isCodeLoadFailure, loadCode } from '#lib/code-loading.js';

/** Options for {@link lazyCode}. */
// oxlint-disable-next-line typescript/no-explicit-any -- React.lazy's own constraint: any component's props.
export type LazyCodeOptions<Component extends ComponentType<any>> = {
  /**
   * The component to render when the code cannot be loaded in this page: code the page can do without (a decorative
   * spinner, an enhancement) declares one, so a failed load degrades to it instead of failing the panel that holds it.
   * Without one, the failure reaches the nearest error boundary, which offers Reload.
   */
  readonly fallback?: ComponentType<ComponentProps<Component>>;
};

/**
 * `React.lazy` through the page's one code-loading owner (`loadCode`, PL7 staging defects blueprint FP9): a failed
 * load is handed to the page's recovery once and never retried in place, since `React.lazy` keeps its rejection and
 * the realm keeps the failed module. `tau-lint/code-loading-owner` bans `lazy()` from React elsewhere.
 *
 * @example
 * ```tsx
 * const Spinner = lazyCode(async () => import('#components/spinner.js'), { fallback: FlatSpinner });
 * ```
 *
 * @param load - Imports the module with a literal specifier and returns its component as `default`.
 * @param options - The fallback for optional code.
 * @returns The lazy component.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- React.lazy's own constraint: any component's props.
export const lazyCode = <Component extends ComponentType<any>>(
  load: () => Promise<{ default: Component }>,
  options?: LazyCodeOptions<Component>,
): LazyExoticComponent<Component> => {
  const fallback = options?.fallback;
  return lazy(async () => {
    try {
      return await loadCode(load, { optional: fallback !== undefined });
    } catch (error) {
      if (fallback !== undefined && isCodeLoadFailure(error)) {
        // The fallback takes the same props, which is all a lazy component's caller can see of it.
        return { default: fallback as Component };
      }
      throw error;
    }
  });
};
