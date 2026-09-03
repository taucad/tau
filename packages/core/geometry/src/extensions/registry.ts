import type { Extension, PlatformIO } from '@gltf-transform/core';
import { EXTManifold } from 'manifold-3d/manifold-gltf';
import { FbNgonEncodingExtension } from '#extensions/fb-ngon-encoding.js';
import { KittyCadBoundaryRepresentation } from '#extensions/kittycad-boundary-representation.js';
import { TauCadTopology } from '#extensions/tau-cad-topology.js';

/**
 * Extensions preserved by Tau glTF-Transform pipelines.
 *
 * @public
 */
export const tauCadGltfExtensions = [
  EXTManifold,
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
