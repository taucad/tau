import { parseOFF } from './import_off.js';
import { createGLB } from './export_glb.js';

/**
 * Convert OFF format data directly to GLTF/GLB blob
 * This bypasses intermediate types and goes straight from OFF to GLTF
 */
export function convertOFFToGLTF(offContent: string): Blob {
  // Parse the OFF file
  const offData = parseOFF(offContent);
  
  // Convert directly to GLB
  return createGLB(offData);
}