import { desktopBridge } from '#filesystem/desktop-bridge.js';

// Check if we're in a browser environment
// oxlint-disable-next-line unicorn/no-typeof-undefined -- window can be undefined during SSR
export const isBrowser = typeof globalThis.window !== 'undefined';

/**
 * Check if OPFS (Origin Private File System) is supported.
 * OPFS is available in modern browsers via navigator.storage.getDirectory().
 *
 * Enabled in dev mode due to localhost SSL exception for OPFS.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory
 */
export const isOpfsSupported = isBrowser && 'storage' in navigator && 'getDirectory' in navigator.storage;

/**
 * Check if the File System Access API is supported.
 * This API allows the app to read/write files in a user-selected directory
 * on their local filesystem via showDirectoryPicker().
 *
 * Supported in Chrome 86+, Edge 86+, Opera 72+. Not available in Firefox or Safari.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
 */
export const isFileSystemAccessSupported = isBrowser && 'showDirectoryPicker' in globalThis.window;

/**
 * What a picked directory turns into on this host.
 *
 * - `webaccess`: a `FileSystemDirectoryHandle` from `showDirectoryPicker`.
 * - `node`: an absolute host path from the Electron directory dialog.
 * @public
 */
export type DirectoryPick =
  | { readonly backend: 'webaccess'; readonly handle: FileSystemDirectoryHandle }
  | { readonly backend: 'node'; readonly path: string };

/**
 * Options accepted by every picker arm. `id` lets a browser reopen the last
 * folder for the same logical picker; the desktop dialog ignores it today.
 * @public
 */
export type DirectoryPickerOptions = {
  readonly id?: string;
  readonly mode?: 'read' | 'readwrite';
};

/**
 * Host capability for choosing a directory.
 *
 * Replaces the bare `isFileSystemAccessSupported` boolean at the picker call
 * sites: on the desktop build the File System Access API exists (the renderer
 * is Chromium) but must not be used — a picked folder there has to become an
 * absolute path the node backend can serve.
 * @public
 */
export type DirectoryPickerCapability = {
  readonly available: boolean;
  /** Which backend a successful pick produces. */
  readonly backend: 'webaccess' | 'node';
  /**
   * Show the picker.
   *
   * @param options - Picker identity and access mode.
   * @returns The pick, or `undefined` when the user cancelled.
   */
  pick(options?: DirectoryPickerOptions): Promise<DirectoryPick | undefined>;
};

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

/**
 * The directory picker for this host.
 *
 * @returns The host's picker capability.
 * @public
 */
export const directoryPicker = (): DirectoryPickerCapability => {
  const bridge = desktopBridge();
  if (bridge) {
    return {
      available: true,
      backend: 'node',
      pick: async (options) => {
        const path = await bridge.dialog.selectDirectory(options?.id === undefined ? undefined : { id: options.id });
        return path === undefined ? undefined : { backend: 'node', path };
      },
    };
  }
  return {
    available: isFileSystemAccessSupported,
    backend: 'webaccess',
    pick: async (options) => {
      if (!isFileSystemAccessSupported) {
        return undefined;
      }
      try {
        return {
          backend: 'webaccess',
          handle: await globalThis.window.showDirectoryPicker({
            ...(options?.id === undefined ? {} : { id: options.id }),
            mode: options?.mode ?? 'readwrite',
          }),
        };
      } catch (error) {
        if (isAbortError(error)) {
          return undefined;
        }
        throw error;
      }
    },
  };
};

/**
 * The picker when this host's picks are `FileSystemDirectoryHandle`s.
 *
 * The call sites that hand their pick straight to a handle-typed API — the
 * settings folder swap, workspace recovery, and the import drop zone — gate on
 * this instead of on {@link isFileSystemAccessSupported}: the desktop renderer
 * has `showDirectoryPicker` but must not use it.
 *
 * @returns The handle-producing picker, or `undefined` on a host without one.
 * @public
 */
export const webAccessDirectoryPicker = ():
  | { pick(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle | undefined> }
  | undefined => {
  const picker = directoryPicker();
  if (!picker.available || picker.backend !== 'webaccess') {
    return undefined;
  }
  return {
    pick: async (options) => {
      const picked = await picker.pick(options);
      return picked?.backend === 'webaccess' ? picked.handle : undefined;
    },
  };
};
