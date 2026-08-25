import { NodeIO, Primitive } from '@gltf-transform/core';
import type { Document, JSONDocument, Mesh, Node, PlatformIO } from '@gltf-transform/core';

import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { registerTauGltfExtensions } from '#extensions/registry.js';
import { embedGltfResources } from '#utils/gltf-embed.js';
import { resolveMaterialName, resolveSceneName } from '#utils/geometry-names.js';
import type { GeometryNameSource } from '#utils/geometry-names.js';

import { formatShapeName, isLegacyGeneratedShapeName, normalizeShapeName } from '#utils/shape-names.js';

/** Options for normalizing user-visible and identity-bearing names in serialized glTF/GLB bytes. @public */
export type NormalizeGltfGeometryNamesOptions = {
  format: 'glb' | 'gltf';
  io?: PlatformIO;
  rewriteLegacyGeneratedShapeNames?: boolean;
  materialNameSource?: GeometryNameSource;
  sceneNameSource?: GeometryNameSource;
  materialNamePolicy?: 'preserve' | 'clear-generated' | 'clear-all';
  sceneNamePolicy?: 'preserve' | 'clear-generated' | 'clear-all';
};

type NormalizeNodeAndMeshNamesOptions = {
  node: Node;
  mesh: Mesh;
  shapeIndex: number;
  rewriteLegacyGeneratedShapeNames: boolean;
};

const hasSemanticPrimitive = (mesh: Mesh): boolean =>
  mesh.listPrimitives().some((primitive) => primitive.getMode() !== Primitive.Mode['LINES']);

const usableShapeName = (name: string | undefined, rewriteLegacyGeneratedNames: boolean): string | undefined => {
  const normalized = normalizeShapeName(name);
  if (!normalized) {
    return undefined;
  }

  if (rewriteLegacyGeneratedNames && isLegacyGeneratedShapeName(normalized)) {
    return undefined;
  }

  return normalized;
};

const normalizeNodeAndMeshNames = ({
  node,
  mesh,
  shapeIndex,
  rewriteLegacyGeneratedShapeNames,
}: NormalizeNodeAndMeshNamesOptions): void => {
  const nodeName = node.getName();
  const meshName = mesh.getName();
  const resolvedNodeName = usableShapeName(nodeName, rewriteLegacyGeneratedShapeNames);
  const resolvedMeshName = usableShapeName(meshName, rewriteLegacyGeneratedShapeNames);

  if (resolvedNodeName && resolvedMeshName && resolvedNodeName === resolvedMeshName) {
    return;
  }

  const resolvedName = resolvedNodeName ?? resolvedMeshName ?? formatShapeName(shapeIndex);
  node.setName(resolvedName);
  mesh.setName(resolvedName);
};

const normalizeMaterialNames = (
  document: Document,
  policy: NormalizeGltfGeometryNamesOptions['materialNamePolicy'],
  source: GeometryNameSource,
): void => {
  if (policy === 'preserve') {
    return;
  }

  for (const material of document.getRoot().listMaterials()) {
    if (policy === 'clear-all') {
      material.setName('');
      continue;
    }

    const resolvedName = resolveMaterialName({ name: material.getName(), source });
    material.setName(resolvedName ?? '');
  }
};

const normalizeSceneNames = (
  document: Document,
  policy: NormalizeGltfGeometryNamesOptions['sceneNamePolicy'],
  source: GeometryNameSource,
): void => {
  if (policy === 'preserve') {
    return;
  }

  for (const scene of document.getRoot().listScenes()) {
    if (policy === 'clear-all') {
      scene.setName('');
      continue;
    }

    const resolvedName = resolveSceneName({ name: scene.getName(), source });
    scene.setName(resolvedName ?? '');
  }
};

/**
 * Normalize Tau geometry names inside serialized glTF or GLB content.
 *
 * @param bytes - Serialized glTF JSON or GLB bytes.
 * @param options - Format and provenance policy for shape, material, and scene names.
 * @returns Serialized bytes with normalized geometry names.
 * @public
 */
export async function normalizeGltfGeometryNames(
  bytes: Uint8Array<ArrayBuffer>,
  {
    format,
    io: configuredIo,
    rewriteLegacyGeneratedShapeNames = false,
    materialNameSource = 'authored',
    sceneNameSource = 'authored',
    materialNamePolicy = 'preserve',
    sceneNamePolicy = 'preserve',
  }: NormalizeGltfGeometryNamesOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const io = configuredIo ?? registerTauGltfExtensions(new NodeIO()).registerExtensions([KHRMaterialsUnlit]);
  const document =
    format === 'glb'
      ? await io.readBinary(bytes)
      : await io.readJSON({
          json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'],
          resources: {},
        });

  let shapeIndex = 0;
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !hasSemanticPrimitive(mesh)) {
      continue;
    }

    normalizeNodeAndMeshNames({ node, mesh, shapeIndex, rewriteLegacyGeneratedShapeNames });
    shapeIndex++;
  }

  normalizeMaterialNames(document, materialNamePolicy, materialNameSource);
  normalizeSceneNames(document, sceneNamePolicy, sceneNameSource);

  if (format === 'glb') {
    return io.writeBinary(document);
  }

  const result = await io.writeJSON(document);
  const json = embedGltfResources(result.json as unknown as Record<string, unknown>, result.resources);
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
