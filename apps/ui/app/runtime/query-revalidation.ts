import { focusManager, onlineManager } from '@tanstack/react-query';

/**
 * The one revalidation owner for every query of the app (W9 report R2): TanStack Query's online and focus managers,
 * set from the page's real state.
 *
 * TanStack's defaults assume a page that starts online and is focused again only on `visibilitychange`. A launch
 * offline therefore ran and failed every query as if online and never refetched when the network returned, and an app
 * switch on macOS (focus, no visibility change) refetched nothing (W9 D1). Here the online state starts from
 * `navigator.onLine` and follows `online` and `offline`, and focus follows window `focus` as well as
 * `visibilitychange`. Every query then revalidates through TanStack's own `refetchOnReconnect` and
 * `refetchOnWindowFocus`, and a retry paused while offline resumes when the network returns; no feature adds a
 * listener of its own.
 */

/** The window the managers listen to. @public */
export type RevalidationWindow = Pick<Window, 'addEventListener' | 'removeEventListener'> &
  Readonly<{ navigator: Pick<Navigator, 'onLine'> }>;

/**
 * Point TanStack's online and focus managers at a window. Idempotent: a second call replaces the listeners.
 *
 * @param target - The page's window; nothing is installed without one (a server render).
 * @public
 */
export const installQueryRevalidation = (target: RevalidationWindow | undefined): void => {
  if (target === undefined) {
    return;
  }
  onlineManager.setEventListener((setOnline) => {
    const online = (): void => {
      setOnline(true);
    };
    const offline = (): void => {
      setOnline(false);
    };
    setOnline(target.navigator.onLine);
    target.addEventListener('online', online);
    target.addEventListener('offline', offline);
    return () => {
      target.removeEventListener('online', online);
      target.removeEventListener('offline', offline);
    };
  });
  focusManager.setEventListener((handleFocus) => {
    const refocused = (): void => {
      handleFocus();
    };
    target.addEventListener('visibilitychange', refocused);
    target.addEventListener('focus', refocused);
    return () => {
      target.removeEventListener('visibilitychange', refocused);
      target.removeEventListener('focus', refocused);
    };
  });
};
