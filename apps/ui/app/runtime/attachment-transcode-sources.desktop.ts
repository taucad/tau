/**
 * The image formats the desktop composer admits for conversion. The desktop renderer runs no transcoder: it converts
 * in the `default` utility runtime, which registers the raster transcoder through `image()` and the HEIF transcoder
 * through `heif()`. So the list is written out here rather than derived, because deriving it would put the
 * transcoders and their codecs in the renderer (`ui:check-desktop-payload`).
 *
 * `attachment-transcode-sources.desktop.test.ts` holds it equal to the web list, derived from the attachment runtime's
 * edges to `jpeg`, and to edges the utility's `image()` registers, the way `assertKernelRosterCoverage` holds the
 * product kernel catalog against each host's runtime roster.
 */
export const attachmentTranscodeSources: readonly string[] = [
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'bmp',
  'tiff',
  'heic',
  'heif',
];
