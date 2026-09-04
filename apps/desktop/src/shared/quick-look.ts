/** IPC contract for the macOS Quick Look bridge. */

export const quickLookIpcChannels = {
  close: 'tau:quick-look:close',
  previewPath: 'tau:quick-look:preview-path',
  previewUsdz: 'tau:quick-look:preview-usdz',
} as const;

export const openFilesIpcChannel = 'tau:open-files:consume';

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
