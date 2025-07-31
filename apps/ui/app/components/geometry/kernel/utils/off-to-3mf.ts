import { parseOff } from '#components/geometry/kernel/utils/import-off.js';
import { export3mf } from '#components/geometry/kernel/utils/export-3mf.js';

/**
 * Convert OFF format data to 3MF blob
 * @param offContent - The OFF file content as string
 * @param extruderColors - Optional array of extruder colors for multi-material printing
 */
export async function convertOffTo3mf(
  offContent: string,
  extruderColors?: Array<[number, number, number]>,
): Promise<Blob> {
  // Parse the OFF file
  const offData = parseOff(offContent);

  // Convert to 3MF format
  return export3mf(offData, extruderColors);
}
