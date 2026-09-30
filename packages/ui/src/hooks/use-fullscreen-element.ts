import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void): (() => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
  };
};
const getSnapshot = (): Element | undefined => document.fullscreenElement ?? undefined;
const getServerSnapshot = (): undefined => undefined;

/**
 * Keep portalled overlays inside the native fullscreen surface, including when fullscreen changes after mounting.
 *
 * @internal
 * @returns The fullscreen element, or undefined when the document is windowed.
 */
export const useFullscreenElement = (): Element | undefined =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
