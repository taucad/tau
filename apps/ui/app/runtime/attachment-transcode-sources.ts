/**
 * The image formats the composer admits for conversion: every source the raster transcoder and `@taucad/heif` convert
 * to `jpeg`.
 *
 * Written out rather than derived, because deriving the list means importing the transcoder, and the page converts
 * only in a worker (web) or the utility process (desktop), never on the main thread (I3). Importing it here put the
 * transcoder and its codecs in the desktop renderer (`ui:check-desktop-payload`) and, on the web, moved the image
 * probe the composer shares with the transcoder into a chunk on Home's critical path (`ui:check-critical-budget`).
 *
 * `attachment-transcode-sources.test.ts` holds the list equal to `deriveTranscodeSources(attachmentImageRuntime,
 * 'jpeg')` and inside the edges the desktop utility registers through `image()` and `heif()`, the way
 * `assertKernelRosterCoverage` holds the kernel catalog against each host's runtime roster. A format added to either
 * transcoder fails that test until it is named here.
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
