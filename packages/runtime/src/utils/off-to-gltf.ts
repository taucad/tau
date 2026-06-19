import { parseOff } from '#utils/import-off.js';
import { createGlb, createGltf } from '#utils/export-glb.js';
import { createVertexTransform } from '#framework/common.js';
import type { GeometryOutputTransformOptions } from '#framework/common.js';

export type ConvertOffToGltfOptions = GeometryOutputTransformOptions & {
  format?: 'glb' | 'gltf';
};

/**
 * Converts OFF format data to a glTF/GLB file with configurable coordinate system.
 *
 * @param offContent - the OFF file content as a string
 * @param options - Output format, coordinate convention, and unit convention.
 * @returns the encoded glTF/GLB as a byte array
 *
 * @public
 */
export async function convertOffToGltf(
  offContent: string,
  options: ConvertOffToGltfOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const offData = parseOff(offContent);
  const format = options.format ?? 'glb';
  const transform = createVertexTransform(options);

  if (format === 'gltf') {
    return createGltf(offData, transform);
  }

  return createGlb(offData, transform);
}
