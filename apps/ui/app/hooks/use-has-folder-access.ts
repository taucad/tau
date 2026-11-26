import { useSyncExternalStore } from 'react';
import { directoryPicker } from '@taucad/files-ui/constants/browser.constants';

const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * Whether this host can connect a folder on disk: always on desktop, and on the web only where the File System Access
 * API exists (Chromium; not Safari, Firefox or Brave by default). A surface that offers folders hides itself, or says
 * Home is the only location, when this is false; a titled container around a self-hiding folder control is left empty
 * otherwise (docs/research/remix-home-only-location-blueprint.md). The server cannot tell, so it assumes folders,
 * which is what every desktop build and Chromium browser shows.
 *
 * @returns Whether folders can be connected here.
 */
export const useHasFolderAccess = (): boolean =>
  useSyncExternalStore(
    subscribeToNothing,
    () => directoryPicker().available,
    () => true,
  );
