/**
 * Extract the file extension from a filename.
 * Returns the extension without the leading dot, or empty string if no extension.
 *
 * @param filename - The filename to extract the extension from.
 * @returns The file extension (e.g., 'ts', 'scad', 'kcl') or empty string.
 *
 * @example
 * getFileExtension('main.ts') // 'ts'
 * getFileExtension('test.scad') // 'scad'
 * getFileExtension('noextension') // ''
 */
export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
    return '';
  }

  return filename.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Decode Uint8Array to string for text files
 *
 * @param data - The binary data to decode.
 * @returns The decoded string.
 *
 * @example
 * decodeTextFile(new Uint8Array([72, 101, 108, 108, 111])) // 'Hello'
 */
export function decodeTextFile(data: Uint8Array<ArrayBuffer>): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(data);
}

/**
 * Encode string to Uint8Array for text files
 *
 * @param text - The text to encode.
 * @returns The encoded binary data.
 *
 * @example
 * encodeTextFile('Hello') // Uint8Array([72, 101, 108, 108, 111])
 */
export function encodeTextFile(text: string): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}
