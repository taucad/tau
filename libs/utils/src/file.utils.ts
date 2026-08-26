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
 * Trigger a browser file download from a Blob.
 *
 * Creates a temporary anchor element to initiate a file download using
 * a data URL read from the provided Blob.
 *
 * @param blob - The blob data to download
 * @param filename - The filename for the downloaded file
 * @public
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const base64data = reader.result;
      if (typeof base64data === 'string') {
        const a = document.createElement('a');
        a.href = base64data;
        a.download = filename;
        document.body.append(a);
        a.click();
        a.remove();
      } else {
        throw new TypeError('Failed to convert blob to base64 string.');
      }
    });
    reader.addEventListener('error', () => {
      throw new Error('FileReader failed to read the blob.');
    });
    reader.readAsDataURL(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
