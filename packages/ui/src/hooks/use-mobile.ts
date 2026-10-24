import { createElement, useContext, useSyncExternalStore } from 'react';
import { responsiveSurfaceContext } from '#hooks/responsive-surface.js';
import type { ReactNode } from 'react';
const mobileBreakpoint = 768;
const mobileQuery = `(max-width: ${mobileBreakpoint - 1}px)`;

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof globalThis.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = globalThis.matchMedia(mobileQuery);
  mql.addEventListener('change', onChange);
  return () => {
    mql.removeEventListener('change', onChange);
  };
};

const getSnapshot = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(mobileQuery).matches;

const getServerSnapshot = (): boolean => false;

/**
 * Report whether the viewport is narrower than Tau's mobile breakpoint. The
 * value is read from `matchMedia` on the first client render, so a component
 * mounted on the client never sees the desktop value first on a phone. Server
 * rendering and hydration have no viewport and report `false`; React
 * re-renders with the client value right after hydrating. A layout that must
 * not mount its desktop branch on a phone therefore renders a placeholder
 * arranged by CSS until its first client render, rather than the `false`
 * branch.
 *
 * @returns Whether the current viewport is mobile-sized.
 * @public
 *
 * @example <caption>Derive a responsive layout mode</caption>
 * ```typescript
 * import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
 *
 * export const useLayoutMode = (): 'mobile' | 'desktop' => (useIsMobile() ? 'mobile' : 'desktop');
 * ```
 */
export function useIsMobile(): boolean {
  const surface = useContext(responsiveSurfaceContext);
  const viewport = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return surface?.isMobile ?? viewport;
}

/**
 * Provide the logical viewport of an embedded UI surface. Portals remain in that surface.
 * Normal application routes omit this provider and use the browser viewport.
 *
 * @param properties - Embedded viewport mode, portal element and content.
 * @returns The scoped responsive surface.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React provider exported with its hook in this non-JSX module.
export const ResponsiveSurfaceProvider = (properties: {
  readonly isMobile: boolean;
  readonly container: HTMLElement | undefined;
  readonly children?: ReactNode;
}): ReactNode => {
  return createElement(responsiveSurfaceContext.Provider, { value: properties }, properties.children);
};
