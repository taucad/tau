import type { ExportFile } from '#types/file.types.js';
import { mimeTypes } from '#constants/mime-types.constants.js';

/**
 * Create an {@link ExportFile} with the MIME type auto-resolved from the format extension.
 * Uses direct indexing into {@link mimeTypes} since the `format` parameter is constrained
 * to valid file extensions at compile time.
 *
 * @param format - Known export file extension.
 * @param name - Output filename; `.${format}` is appended when it does not already end in it.
 * @param bytes - Exported file bytes.
 * @returns A named export with its canonical MIME type and a filename carrying the format's extension.
 *
 * @public
 */
export const createExportFile = (
  format: keyof typeof mimeTypes,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
): ExportFile => ({
  name: name.toLowerCase().endsWith(`.${format}`) ? name : `${name}.${format}`,
  bytes,
  mimeType: mimeTypes[format],
});
