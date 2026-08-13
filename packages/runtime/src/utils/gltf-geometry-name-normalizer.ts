import type { Document, JSONDocument, Mesh, Node } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { registerTauGltfExtensions } from '@taucad/gltf-extensions';
import type { GeometryNameSource } from '#utils/geometry-names.js';
import { resolveMaterialName, resolveSceneName } from '#utils/geometry-names.js';
import { formatShapeName, isLegacyGeneratedShapeName, normalizeShapeName } from '#utils/shape-names.js';

/** Options for normalizing user-visible and identity-bearing names in serialized glTF/GLB bytes. */
export type NormalizeGltfGeometryNamesOptions = {
  format: 'glb' | 'gltf';
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

const encodeBase64 = (data: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCodePoint(byte);
  }
  // oxlint-disable-next-line no-restricted-globals -- btoa is available in runtime browser targets and Node 24.
  return btoa(binary);
};

const embedGltfResources = (
  json: Record<string, unknown>,
  resources: Record<string, Uint8Array<ArrayBuffer> | ArrayBuffer>,
): Record<string, unknown> => {
  const buffers = Array.isArray(json['buffers']) ? json['buffers'] : [];
  for (const buffer of buffers) {
    if (!buffer || typeof buffer !== 'object') {
      continue;
    }
    const record = buffer as Record<string, unknown>;
    const uri = typeof record['uri'] === 'string' ? record['uri'] : undefined;
    const resource = uri ? resources[uri] : undefined;
    if (!resource) {
      continue;
    }
    const bytes = resource instanceof Uint8Array ? resource : new Uint8Array(resource);
    record['uri'] = `data:application/octet-stream;base64,${encodeBase64(bytes)}`;
  }
  return json;
};

const hasSemanticPrimitive = (mesh: Mesh): boolean =>
  mesh.listPrimitives().some((primitive) => primitive.getMode() !== 1);

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
 */
export async function normalizeGltfGeometryNames(
  bytes: Uint8Array<ArrayBuffer>,
  {
    format,
    rewriteLegacyGeneratedShapeNames = false,
    materialNameSource = 'authored',
    sceneNameSource = 'authored',
    materialNamePolicy = 'preserve',
    sceneNamePolicy = 'preserve',
  }: NormalizeGltfGeometryNamesOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const io = registerTauGltfExtensions(new NodeIO()).registerExtensions([KHRMaterialsUnlit]);
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
