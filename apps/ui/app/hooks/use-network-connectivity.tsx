/**
 * Modified from Remix PWA to use globalThis instead of window and default to online=true for SSR
 *
 * @see https://github.com/remix-pwa/monorepo/blob/6fa72a544991a59f8b384a733746a6ec65af75f5/packages/client/hooks/useNetworkConnectivity.ts
 */

import { useEffect, useSyncExternalStore } from 'react';

const subscribeToNetworkConnectivity = (callback: () => void) => {
  globalThis.addEventListener('online', callback);
  globalThis.addEventListener('offline', callback);
  return () => {
    globalThis.removeEventListener('online', callback);
    globalThis.removeEventListener('offline', callback);
  };
};

const getNetworkConnectivitySnapshot = () => globalThis.navigator.onLine;

// Always show "Online" for server-generated HTML
const getNetworkConnectivityServerSnapshot = () => true;

export const useNetworkConnectivity = (
  options: {
    onOnline?: (isOnline: boolean) => void;
    onOffline?: (isOnline: boolean) => void;
  } = {},
) => {
  const isOnline = useSyncExternalStore(
    subscribeToNetworkConnectivity,
    getNetworkConnectivitySnapshot,
    getNetworkConnectivityServerSnapshot,
  );

  useEffect(() => {
    if (isOnline) {
      options.onOnline?.(true);
    } else if (options.onOnline) {
      options.onOffline?.(false);
    }
  }, [isOnline, options]);

  return isOnline;
};
