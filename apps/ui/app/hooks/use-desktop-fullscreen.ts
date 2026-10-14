import { useSyncExternalStore } from 'react';
import { isDesktopFullscreen, onDesktopFullscreenChange } from '#filesystem/desktop-bridge.js';

const serverSnapshot = (): boolean => false;

export const useDesktopFullscreen = (): boolean =>
  useSyncExternalStore(onDesktopFullscreenChange, isDesktopFullscreen, serverSnapshot);
