import { useSyncExternalStore } from 'react';

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
 * value is read from `matchMedia` on the first client render, so a phone never
 * mounts the desktop layout first. Server rendering and hydration report
 * `false`; React re-renders with the client value right after hydrating.
 *
 * @public
 * @returns Whether the current viewport is mobile-sized.
 *
 * @example <caption>Derive a responsive layout mode</caption>
 * ```typescript
 * import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
 *
 * export const useLayoutMode = (): 'mobile' | 'desktop' => (useIsMobile() ? 'mobile' : 'desktop');
 * ```
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
