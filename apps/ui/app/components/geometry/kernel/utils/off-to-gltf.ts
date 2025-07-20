import { parseOff } from '~/components/geometry/kernel/utils/import-off.js';
import { createGlb } from '~/components/geometry/kernel/utils/export-glb.js';

/**
 * Convert OFF format data directly to GLTF/GLB blob
 * This bypasses intermediate types and goes straight from OFF to GLTF
 */
export async function convertOffToGltf(offContent: string): Promise<Blob> {
  // Parse the OFF file
  const offData = parseOff(offContent);

  // Convert directly to GLB
  return createGlb(offData);
}
