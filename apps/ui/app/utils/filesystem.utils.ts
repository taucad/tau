import type { GeometryFile } from '@taucad/types';

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
 * Create a GeometryFile from code string and filename.
 * Converts the code to Uint8Array using UTF-8 encoding.
 *
 * @param code - The code string to convert.
 * @param filename - The filename for the geometry file.
 * @returns A GeometryFile object.
 *
 * @example
 * createGeometryFile('cube([10, 10, 10]);', 'cube.scad')
 * createGeometryFile('import { Sketch } from "replicad"', 'main.ts')
 */
export function createGeometryFile(code: string, filename: string): GeometryFile {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);

  return {
    filename,
    data,
  };
}

/**
 * Alias for createGeometryFile for backwards compatibility.
 * Create a GeometryFile from code string and filename.
 *
 * @param code - The code string to convert.
 * @param filename - The filename for the geometry file.
 * @returns A GeometryFile object.
 *
 * @example
 * createGeometryFileFromCode('cube([10, 10, 10]);', 'cube.scad')
 */
export function createGeometryFileFromCode(code: string, filename: string): GeometryFile {
  return createGeometryFile(code, filename);
}
