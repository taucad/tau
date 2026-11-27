import { useSyncExternalStore } from 'react';
import { isDesktopFullscreen, onDesktopFullscreenChange } from '@taucad/files-ui/filesystem/desktop-bridge';

const serverSnapshot = (): boolean => false;

export const useDesktopFullscreen = (): boolean =>
  useSyncExternalStore(onDesktopFullscreenChange, isDesktopFullscreen, serverSnapshot);
