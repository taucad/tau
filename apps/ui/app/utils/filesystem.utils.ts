import type { GeometryFile } from '@taucad/types';

/**
 * Extensions that are always binary.
 *
 * These are file types that are never valid UTF-8/text, and are always
 * binary by their format specification.
 */
const binaryExtensions = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'webp',

  // 3D Binary/Model formats
  'glb',
  '3ds',

  // Archives/compression
  'zip',
  'gz',
  'rar',
  '7z',

  // Executables/libraries
  'exe',
  'dll',
  'so',
  'dylib',

  // Fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',

  // Audio/Video
  'mp3',
  'mp4',
  'avi',
  'mov',
  'wav',
  'flac',
]);

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
 * Detect if a file is binary using extension + null byte check (VSCode approach)
 *
 * @param filename - The filename to check.
 * @param data - Optional file data to inspect for null bytes.
 * @returns True if the file is binary, false otherwise.
 *
 * @example
 * isBinaryFile('image.png') // true
 * isBinaryFile('main.ts') // false
 */
export function isBinaryFile(filename: string, data?: Uint8Array): boolean {
  // Fast path: check extension
  const ext = getFileExtension(filename).toLowerCase();
  if (binaryExtensions.has(ext)) {
    return true;
  }

  // Fallback: check for null bytes (like Git does)
  if (data) {
    const sampleSize = Math.min(8000, data.length);
    for (let i = 0; i < sampleSize; i++) {
      if (data[i] === 0) {
        return true;
      }
    }
  }

  return false;
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
export function decodeTextFile(data: Uint8Array): string {
  const decoder = new TextDecoder('utf8');
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
export function encodeTextFile(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

/**
 * Create a GeometryFile from binary data and filename.
 *
 * @param data - The binary data.
 * @param filename - The filename for the geometry file.
 * @returns A GeometryFile object.
 *
 * @example
 * createGeometryFile(new Uint8Array([...]), 'model.glb')
 */
export function createGeometryFile(data: Uint8Array, filename: string): GeometryFile {
  return {
    filename,
    data,
  };
}

/**
 * Create a GeometryFile from code string and filename.
 * Converts the code to Uint8Array using UTF-8 encoding.
 *
 * @param code - The code string to convert.
 * @param filename - The filename for the geometry file.
 * @returns A GeometryFile object.
 *
 * @example
 * createGeometryFileFromCode('cube([10, 10, 10]);', 'cube.scad')
 * createGeometryFileFromCode('import { Sketch } from "replicad"', 'main.ts')
 */
export function createGeometryFileFromCode(code: string, filename: string): GeometryFile {
  return createGeometryFile(encodeTextFile(code), filename);
}
