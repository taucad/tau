import { parseOff } from '#components/geometry/kernel/utils/import-off.js';
import { createStlAscii, createStlBinary } from '#components/geometry/kernel/utils/export-stl.js';
import type { ExportFormat } from '#types/kernel.types.js';

/**
 * Convert OFF format data to STL blob
 * @param offContent - The OFF file content as string
 * @param format - The output format: 'stl' for ASCII STL, 'stl-binary' for binary STL
 */
export async function convertOffToStl(
  offContent: string,
  format: Extract<ExportFormat, 'stl' | 'stl-binary'>,
): Promise<Blob> {
  // Parse the OFF file
  const offData = parseOff(offContent);

  // Convert to the requested format
  if (format === 'stl') {
    return createStlAscii(offData);
  }

  // Default to binary STL format
  return createStlBinary(offData);
}
