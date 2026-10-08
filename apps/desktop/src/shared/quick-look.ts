/** IPC contract for the macOS Quick Look bridge. */

/**
 * Quick Look feature flag: the Finder extensions, the in-app panel and their
 * release checks. Off while the macOS 15 sandbox blocks the extensions'
 * WKWebView converter and hosted runners lack the GPU its render needs; see
 * `docs/research/quick-look-disabled.md` (Tau Brain). Set to `true`
 * to build, package, verify and expose Quick Look again. The implementation
 * stays in place.
 */
export const quickLookEnabled: boolean = false;

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

export type DesktopOpenFile = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly name: string;
};
