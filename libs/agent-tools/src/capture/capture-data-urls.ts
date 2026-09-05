/**
 * Data-URL encoding for captured images, beside the recipe that produced them.
 *
 * The daemon reaches for `Buffer` (`packages/host/src/agent-tools.ts`); a
 * browser host has none, so this is the browser-side half of the same step. It
 * lives with the recipe rather than in the app so a worker-placed capture does
 * not have to import the page's capture module to encode its own output.
 *
 * @module
 */

/** The shape both hosts' raster exports share. @public */
export type CapturedImageFile = {
  readonly mimeType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
};

/**
 * Code points per `String.fromCodePoint` call.
 *
 * `uint8array-extras` spreads 65 535 of them per chunk, which sits at V8's
 * argument limit: it survives a shallow main-thread stack and throws
 * `RangeError: Maximum call stack size exceeded` from anywhere deeper — a Web
 * Worker, or a page a few frames down. That is what every browser-hosted
 * `screenshot` returned, because one lossless 1600² view is megabytes. Eight
 * kilobytes of arguments cannot overflow anything.
 */
const argumentChunk = 8192;

const encodeBase64 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += argumentChunk) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + argumentChunk));
  }
  // oxlint-disable-next-line no-restricted-globals -- btoa is available in runtime browser targets and Node 24; the suggested library is the defect this encoder exists to avoid.
  return btoa(binary);
};

/**
 * Encode captured images as `data:` URLs for the chat transcript.
 *
 * @param files - Raster exports from one capture, in view order.
 * @returns One `data:` URL per file, in the same order.
 * @public
 *
 * @example <caption>Encode a single isometric capture</caption>
 * ```typescript
 * import { captureFilesToDataUrls } from '@taucad/agent-tools/capture';
 *
 * declare const webp: Uint8Array<ArrayBuffer>;
 *
 * const [dataUrl] = captureFilesToDataUrls([{ mimeType: 'image/webp', bytes: webp }]);
 * ```
 */
export const captureFilesToDataUrls = (files: readonly CapturedImageFile[]): string[] =>
  files.map((file) => `data:${file.mimeType};base64,${encodeBase64(file.bytes)}`);
