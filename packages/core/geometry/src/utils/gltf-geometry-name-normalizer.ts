import { BufferUtils, NodeIO, Primitive } from '@gltf-transform/core';
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
  sharedMesh: boolean;
  firstOccurrence: boolean;
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
  sharedMesh,
  firstOccurrence,
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
  if (!sharedMesh || (firstOccurrence && !resolvedMeshName)) {
    mesh.setName(resolvedName);
  }
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

const readGlbJson = (bytes: Uint8Array<ArrayBuffer>): JSONDocument['json'] => {
  if (bytes.byteLength < 20) {
    throw new Error('Invalid glTF 2.0 binary');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  if (
    view.getUint32(0, true) !== 0x46_54_6c_67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e_4f_53_4a ||
    20 + jsonLength > bytes.byteLength
  ) {
    throw new Error('Invalid glTF 2.0 binary');
  }
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim()) as JSONDocument['json'];
};

const writeGlbJson = (source: Uint8Array<ArrayBuffer>, json: JSONDocument['json']): Uint8Array<ArrayBuffer> => {
  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const sourceJsonLength = sourceView.getUint32(12, true);
  const remainder = source.subarray(20 + sourceJsonLength);
  const jsonBytes = BufferUtils.pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const output = new Uint8Array(20 + jsonBytes.byteLength + remainder.byteLength);
  output.set(source.subarray(0, 12));
  const outputView = new DataView(output.buffer);
  outputView.setUint32(8, output.byteLength, true);
  outputView.setUint32(12, jsonBytes.byteLength, true);
  outputView.setUint32(16, 0x4e_4f_53_4a, true);
  output.set(jsonBytes, 20);
  output.set(remainder, 20 + jsonBytes.byteLength);
  return output;
};

const normalizeGlbGeometryNames = (
  bytes: Uint8Array<ArrayBuffer>,
  options: Required<Omit<NormalizeGltfGeometryNamesOptions, 'format' | 'io'>>,
): Uint8Array<ArrayBuffer> => {
  const json = readGlbJson(bytes);
  const meshUses = new Map<number, number>();
  for (const node of json.nodes ?? []) {
    if (node.mesh !== undefined) {
      meshUses.set(node.mesh, (meshUses.get(node.mesh) ?? 0) + 1);
    }
  }
  const namedMeshes = new Set<number>();
  let shapeIndex = 0;
  for (const node of json.nodes ?? []) {
    const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
    if (
      !mesh?.primitives.some((primitive) => (primitive.mode ?? Primitive.Mode['TRIANGLES']) !== Primitive.Mode['LINES'])
    ) {
      continue;
    }
    const nodeName = usableShapeName(node.name, options.rewriteLegacyGeneratedShapeNames);
    const meshName = usableShapeName(mesh.name, options.rewriteLegacyGeneratedShapeNames);
    const name = nodeName ?? meshName ?? formatShapeName(shapeIndex);
    node.name = name;
    if (meshUses.get(node.mesh!) === 1 || (!namedMeshes.has(node.mesh!) && !meshName)) {
      mesh.name = name;
    }
    namedMeshes.add(node.mesh!);
    shapeIndex++;
  }
  for (const material of json.materials ?? []) {
    if (options.materialNamePolicy === 'clear-all') {
      material.name = '';
    } else if (options.materialNamePolicy === 'clear-generated') {
      material.name = resolveMaterialName({ name: material.name, source: options.materialNameSource }) ?? '';
    }
  }
  for (const scene of json.scenes ?? []) {
    if (options.sceneNamePolicy === 'clear-all') {
      scene.name = '';
    } else if (options.sceneNamePolicy === 'clear-generated') {
      scene.name = resolveSceneName({ name: scene.name, source: options.sceneNameSource }) ?? '';
    }
  }
  return writeGlbJson(bytes, json);
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
  if (format === 'glb') {
    return normalizeGlbGeometryNames(bytes, {
      rewriteLegacyGeneratedShapeNames,
      materialNameSource,
      sceneNameSource,
      materialNamePolicy,
      sceneNamePolicy,
    });
  }
  const io = configuredIo ?? registerTauGltfExtensions(new NodeIO()).registerExtensions([KHRMaterialsUnlit]);
  const document = await io.readJSON({
    json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'],
    resources: {},
  });

  const meshUses = new Map<Mesh, number>();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh) {
      meshUses.set(mesh, (meshUses.get(mesh) ?? 0) + 1);
    }
  }
  const namedMeshes = new Set<Mesh>();
  let shapeIndex = 0;
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !hasSemanticPrimitive(mesh)) {
      continue;
    }

    normalizeNodeAndMeshNames({
      node,
      mesh,
      shapeIndex,
      rewriteLegacyGeneratedShapeNames,
      sharedMesh: meshUses.get(mesh)! > 1,
      firstOccurrence: !namedMeshes.has(mesh),
    });
    namedMeshes.add(mesh);
    shapeIndex++;
  }

  normalizeMaterialNames(document, materialNamePolicy, materialNameSource);
  normalizeSceneNames(document, sceneNamePolicy, sceneNameSource);

  const result = await io.writeJSON(document);
  const json = embedGltfResources(result.json as unknown as Record<string, unknown>, result.resources);
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
