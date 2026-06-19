import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';

/** Controls how serialized glTF or GLB shape names are normalized. */
export type NormalizeGltfShapeNamesOptions = {
  format: 'glb' | 'gltf';
  rewriteLegacyGeneratedNames?: boolean;
};

/**
 * Normalize unnamed or known-generated semantic glTF node and mesh names.
 *
 * @param bytes - GLB or embedded glTF JSON bytes.
 * @param options - Input format and legacy-name rewrite behavior.
 * @returns Serialized bytes with normalized semantic node and mesh names.
 */
export async function normalizeGltfShapeNames(
  bytes: Uint8Array<ArrayBuffer>,
  { format, rewriteLegacyGeneratedNames = false }: NormalizeGltfShapeNamesOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  return normalizeGltfGeometryNames(bytes, {
    format,
    rewriteLegacyGeneratedShapeNames: rewriteLegacyGeneratedNames,
  });
}
