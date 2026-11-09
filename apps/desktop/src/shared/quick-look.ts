/** IPC contract for the macOS Quick Look bridge. */

/**
 * Quick Look feature flag: the Finder extensions, the in-app panel and their
 * release checks. Off while the macOS 15 sandbox blocks the extensions'
 * WKWebView converter and hosted runners lack the GPU its render needs; see
 * `docs/research/quick-look-disabled.md` (Tau Brain). Return `true`
 * to build, package, verify and expose Quick Look again. The implementation
 * stays in place.
 */
export const isQuickLookEnabled = (): boolean => false;

export const quickLookIpcChannels = {
  close: 'tau:quick-look:close',
  previewPath: 'tau:quick-look:preview-path',
  previewUsdz: 'tau:quick-look:preview-usdz',
} as const;

export const openFilesIpcChannel = 'tau:open-files:consume';
export const generatedImageIpcChannel = 'tau:generated-image:read';

export type QuickLookResult = { readonly success: true } | { readonly success: false; readonly error: string };

export type QuickLookPathRequest = {
  readonly path: string;
  readonly displayName?: string;
};

export type QuickLookUsdzRequest = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly displayName: string;
};

/** A file the operating system opened with Tau, as the import grant main minted for it (W7.4): never its bytes or path. */
export type DesktopOpenFile = {
  readonly grant: string;
  readonly name: string;
};

/** The import folder picker (W7.4): resolves to a grant and the folder's name, never its path. */
export const selectImportFolderIpcChannel = 'tau:select-import-folder';

/** Let go of import grants the asking window holds, once its import is done (W7.4). */
export const releaseImportGrantsIpcChannel = 'tau:release-import-grants';
