/**
 * Converts a Uint8Array or ArrayBuffer to a type compatible with BlobPart.
 *
 * This utility handles the TypeScript type incompatibility between
 * Uint8Array<ArrayBufferLike> and BlobPart that occurs with stricter
 * type checkers (like tsgo). The runtime behavior is unchanged - this
 * is purely a type-level fix.
 *
 * @param data - The Uint8Array or ArrayBuffer to convert
 * @returns The same data with a compatible type for Blob constructor
 * @public
 */
export function asBuffer(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
/** @public */
export function asBuffer(data: ArrayBufferLike): ArrayBuffer;
/** @public */
export function asBuffer(data: Uint8Array<ArrayBuffer> | ArrayBufferLike): Uint8Array<ArrayBuffer> | ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data;
  }

  return data as ArrayBuffer;
}

/**
 * How long a download's object URL outlives the click.
 *
 * The browser reads the blob after the click returns, and Safari cancels a
 * download whose URL is revoked first; FileSaver.js waits 40 s for the same reason.
 */
const objectUrlLifetimeMilliseconds = 40_000;

/**
 * Trigger a browser file download from a Blob.
 *
 * Creates a temporary anchor element pointing at an object URL for the blob,
 * so the download streams from the blob rather than from a base64 copy of it.
 *
 * @param blob - The blob data to download
 * @param filename - The filename for the downloaded file
 * @public
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, objectUrlLifetimeMilliseconds);
}

/**
 * Match a source path against runtime-declared file extensions.
 *
 * @param entryPath - Source path to inspect
 * @param extensions - Declared extensions, or `*` for all paths
 * @returns Whether the source path matches a declared extension
 * @public
 */
export const sourcePathMatchesExtensions = (entryPath: string, extensions: readonly string[]): boolean => {
  const basename = entryPath.slice(entryPath.lastIndexOf('/') + 1).toLowerCase();
  return extensions.some((extension) => extension === '*' || basename.endsWith(`.${extension.toLowerCase()}`));
};
