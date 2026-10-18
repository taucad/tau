/**
 * Code points per `String.fromCodePoint` call. `uint8array-extras` spreads 65 535 per call, which overflows a worker
 * stack (`RangeError: Maximum call stack size exceeded`) while the page's main thread survives it; eight kilobytes of
 * arguments cannot overflow anything.
 */
const argumentChunk = 8192;

/**
 * Base64-encode bytes without overflowing a worker stack.
 *
 * @param bytes - The bytes to encode, of any length.
 * @returns The standard (not URL-safe) base64 text.
 * @internal
 */
export const encodeBase64 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += argumentChunk) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + argumentChunk));
  }
  // oxlint-disable-next-line no-restricted-globals -- the suggested library spreads 65 535 arguments per call, which overflows a worker stack.
  return btoa(binary);
};
