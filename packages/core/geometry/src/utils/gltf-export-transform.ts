import { NodeIO } from '@gltf-transform/core';
import type { JSONDocument } from '@gltf-transform/core';

import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { createCoordinateTransform, createScalingTransform } from '#gltf.transforms.js';
import { registerTauGltfExtensions } from '#extensions/registry.js';
import { embedGltfResources } from '#utils/gltf-embed.js';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { GeometryOutputTransformOptions } from '#geometry-transform.utils.js';

type GltfExportTransformOptions = GeometryOutputTransformOptions & {
  format: 'glb' | 'gltf';
};

const stripTopologyMetadataForTransformedExport = (document: Awaited<ReturnType<NodeIO['readBinary']>>): void => {
  const root = document.getRoot();
  root.setExtension(kittyCadBoundaryRepresentationExtension, null);
  root.setExtension(tauCadTopologyExtension, null);

  for (const node of root.listNodes()) {
    node.setExtension(kittyCadBoundaryRepresentationExtension, null);
    const {
      tauComponentId: _tauComponentId,
      tauComponentKind: _tauComponentKind,
      tauComponentSelector: _tauComponentSelector,
      ...extras
    } = node.getExtras();
    node.setExtras(extras);
  }

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const {
        tauComponentId: _tauComponentId,
        tauComponentKind: _tauComponentKind,
        tauComponentSelector: _tauComponentSelector,
        tauSectionOwnerComponentId: _tauSectionOwnerComponentId,
        faceGroups: _faceGroups,
        edgeGroups: _edgeGroups,
        ...extras
      } = primitive.getExtras();
      primitive.setExtras(extras);
    }
  }
};

/**
 * Transform GLB/glTF bytes from glTF-space Y-up meters into an export route's
 * requested coordinate and length-unit convention.
 *
 * This is for kernels whose upstream exporter does not expose unit/axis knobs.
 * Kernels with native writer controls should apply those controls directly.
 * @public
 */
export async function transformGltfExportBytes(
  bytes: Uint8Array<ArrayBuffer>,
  options: GltfExportTransformOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const shouldRotate = options.coordinateSystem === 'z-up';
  const shouldScale = options.unit?.length === 'millimeter';
  if (!shouldRotate && !shouldScale) {
    return bytes;
  }

  const io = registerTauGltfExtensions(new NodeIO()).registerExtensions([KHRMaterialsUnlit]);
  const document =
    options.format === 'glb'
      ? await io.readBinary(bytes)
      : await io.readJSON({
          json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'],
          resources: {},
        });

  await document.transform(createCoordinateTransform(shouldRotate), createScalingTransform(shouldScale));
  stripTopologyMetadataForTransformedExport(document);

  if (options.format === 'glb') {
    return io.writeBinary(document);
  }

  const result = await io.writeJSON(document);
  const json = embedGltfResources(result.json as unknown as Record<string, unknown>, result.resources);
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
