import type { Extension, PlatformIO } from '@gltf-transform/core';
import { FbNgonEncodingExtension } from '#fb-ngon-encoding.js';
import { KittyCadBoundaryRepresentation } from '#kittycad-boundary-representation.js';
import { TauCadTopology } from '#tau-cad-topology.js';

/**
 * Tau-supported non-Khronos glTF-Transform extensions.
 *
 * @public
 */
export const tauCadGltfExtensions = [
  KittyCadBoundaryRepresentation,
  TauCadTopology,
  FbNgonEncodingExtension,
] as const satisfies ReadonlyArray<typeof Extension>;

/**
 * Register Tau-supported glTF extensions on a glTF-Transform IO instance.
 *
 * @public
 */
export function registerTauGltfExtensions<GltfIo extends Pick<PlatformIO, 'registerExtensions'>>(io: GltfIo): GltfIo {
  return io.registerExtensions([...tauCadGltfExtensions]) as unknown as GltfIo;
}
