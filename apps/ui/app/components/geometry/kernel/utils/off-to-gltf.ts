import { parseOff } from '#components/geometry/kernel/utils/import-off.js';
import { createGlb, createGltf } from '#components/geometry/kernel/utils/export-glb.js';

/**
 * Convert OFF format data to GLTF/GLB blob
 * @param offContent - The OFF file content as string
 * @param format - The output format: 'glb' for binary GLTF, 'gltf' for JSON GLTF
 */
export async function convertOffToGltf(offContent: string, format: 'glb' | 'gltf' = 'glb'): Promise<Blob> {
  // Parse the OFF file
  const offData = parseOff(offContent);

  // Convert to the requested format
  if (format === 'gltf') {
    return createGltf(offData);
  }

  // Default to GLB format
  return createGlb(offData);
}
