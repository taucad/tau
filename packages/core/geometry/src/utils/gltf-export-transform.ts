import { WebIO } from '@gltf-transform/core';
import type { Document, JSONDocument } from '@gltf-transform/core';

import { allExtensions } from '#gltf.extensions.js';
import { admitMechanism, transformMechanism } from '@taucad/kinematics';
import { createCoordinateTransform, createScalingTransform, gltfCoordinateTransformMatrix } from '#gltf.transforms.js';
import { registerTauGltfExtensions } from '#extensions/registry.js';
import type { TauCadTopologyRoot } from '#extensions/tau-cad-topology.js';
import { isJsonObject } from '#extensions/json.js';
import { embedGltfResources } from '#utils/gltf-embed.js';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject } from '@taucad/runtime/types';
import type { GeometryOutputTransformOptions } from '#geometry-transform.utils.js';

type GltfExportTransformOptions = GeometryOutputTransformOptions & {
  format: 'glb' | 'gltf';
  /** Retain mesh-only Tau component ownership and re-express its mechanism in the export frame. */
  preserveMeshTopology?: boolean;
};

const preserveTransformedMeshTopology = (document: Document, options: GltfExportTransformOptions): boolean => {
  const root = document.getRoot();
  const topology = root.getExtension<TauCadTopologyRoot>(tauCadTopologyExtension);
  if (!topology) {
    return false;
  }
  const payload = topology.getPayload();
  const { components } = payload;
  if (
    !Array.isArray(components) ||
    !components.every(
      (component) =>
        isJsonObject(component) &&
        isJsonObject(component['capabilities']) &&
        component['capabilities']['hasPreciseTopology'] === false,
    )
  ) {
    return false;
  }
  if (payload['mechanism'] !== undefined) {
    const admitted = admitMechanism(payload['mechanism']);
    if (admitted.status === 'invalid') {
      throw new Error(`Cannot preserve mesh mechanism: ${admitted.issues[0]?.message}`);
    }
    const outcome = transformMechanism({
      mechanism: admitted.mechanism,
      units: { length: options.unit?.length === 'millimeter' ? 'mm' : 'm', angle: admitted.mechanism.units.angle },
      ...(options.coordinateSystem === 'z-up' ? { matrix: gltfCoordinateTransformMatrix } : {}),
    });
    if (outcome.status === 'invalid') {
      throw new Error(`Cannot transform mesh mechanism: ${outcome.issues[0]?.message}`);
    }
    topology.setPayload({ ...payload, mechanism: structuredClone(outcome.mechanism) as unknown as JSONObject });
  }
  root.setExtension(kittyCadBoundaryRepresentationExtension, null);
  for (const node of root.listNodes()) {
    node.setExtension(kittyCadBoundaryRepresentationExtension, null);
  }
  return true;
};

const stripTopologyMetadataForTransformedExport = (document: Document): void => {
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
 * @param bytes - Source GLB or glTF bytes.
 * @param options - Output units, frame, format, and optional mesh topology preservation.
 * @returns Transformed bytes in the requested format.
 * @public
 */
export async function transformGltfExportBytes(
  bytes: Uint8Array<ArrayBuffer>,
  options: GltfExportTransformOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const shouldRotate = options.coordinateSystem === 'z-up';
  const shouldScale = options.unit?.length === 'millimeter';
  const sourceIsGlb =
    bytes.byteLength >= 4 &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === 0x46_54_6c_67;
  if (!shouldRotate && !shouldScale && sourceIsGlb === (options.format === 'glb')) {
    return bytes;
  }

  const io = registerTauGltfExtensions(new WebIO()).registerExtensions(allExtensions);
  const document = sourceIsGlb
    ? await io.readBinary(bytes)
    : await io.readJSON({
        json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'],
        resources: {},
      });

  if (shouldRotate || shouldScale) {
    await document.transform(createCoordinateTransform(shouldRotate), createScalingTransform(shouldScale));
    if (!options.preserveMeshTopology || !preserveTransformedMeshTopology(document, options)) {
      stripTopologyMetadataForTransformedExport(document);
    }
  }

  if (options.format === 'glb') {
    return io.writeBinary(document);
  }

  const result = await io.writeJSON(document);
  const json = embedGltfResources(result.json as unknown as Record<string, unknown>, result.resources);
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
