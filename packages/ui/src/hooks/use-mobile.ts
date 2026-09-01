import { useEffect, useState } from 'react';

const mobileBreakpoint = 768;

/**
 * Report whether the viewport is narrower than Tau's mobile breakpoint. The
 * value is `false` during server rendering and updates through `matchMedia`.
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
  const [isMobile, setIsMobile] = useState<boolean | undefined>();

  useEffect(() => {
    const mql = globalThis.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < mobileBreakpoint);
    };

    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < mobileBreakpoint);
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, []);

  return Boolean(isMobile);
}
