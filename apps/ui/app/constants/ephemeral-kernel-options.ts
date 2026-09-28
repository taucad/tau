// oxlint-disable-next-line no-barrel-files/no-barrel-files -- build-time host seam keeps the browser implementation canonical.
export { defaultKernelOptions as ephemeralKernelOptions } from '#constants/kernel-options.presets.js';

/**
 * Bytes a memory-mounted preview sends with its first render. The browser kernel reads the preview
 * mount through the file-manager bridge, so nothing travels inline (and the bridge serves
 * `thumbnail.webp` read-only, so staging it would fail).
 * @param _files - The preview's root-relative files.
 * @returns Always `undefined` in the browser build.
 */
export const ephemeralPreviewStage = (
  _files: Readonly<Record<string, { readonly content: Uint8Array<ArrayBuffer> }>>,
): Record<string, Uint8Array<ArrayBuffer>> | undefined => undefined;
