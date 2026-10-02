import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Mechanism, Pose } from '@taucad/kinematics';
import type { GeometryComponentPrimitiveRef } from '@taucad/types';
import {
  buildGltfComponentManifest,
  parseGltfBytes,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import {
  createGltfComponentOwnership,
  getComponentAncestorIds,
  getGltfPrimitiveComponentId,
} from '#components/geometry/graphics/metadata/gltf-component-visibility.js';

export type CaptureModelPresentation = {
  readonly mechanism?: Mechanism;
  readonly pose?: Pose;
  readonly opacityByComponentId: Readonly<Record<string, number>>;
};

/** Copies current-view pose and surface opacity into capture-only GLB bytes. Source buffers remain untouched. */
export async function prepareCapturePresentation(
  source: Uint8Array<ArrayBuffer>,
  input: CaptureModelPresentation & {
    readonly sourceFile: string;
    readonly geometryHash: string;
  },
): Promise<{
  content: Uint8Array<ArrayBuffer>;
  geometryHash: string;
  remapPrimitives: (references: readonly GeometryComponentPrimitiveRef[]) => GeometryComponentPrimitiveRef[];
}> {
  const unchanged = {
    content: source,
    geometryHash: input.geometryHash,
    remapPrimitives: (references: readonly GeometryComponentPrimitiveRef[]) => [...references],
  };
  for (const opacity of Object.values(input.opacityByComponentId)) {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new RangeError('Capture component opacity must be in [0, 1].');
    }
  }
  if ((!input.mechanism || !input.pose) && Object.values(input.opacityByComponentId).every((value) => value === 1)) {
    return unchanged;
  }
  let modified = false;
  const { json } = parseGltfBytes(source);
  const manifest = buildGltfComponentManifest(source, input);
  const ownership = createGltfComponentOwnership(manifest);
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const materials: Array<NonNullable<typeof json.materials>[number] & { alphaMode?: 'BLEND' }> = json.materials ?? [];
  const parents = new Map<number, number>();
  for (const [index, node] of nodes.entries()) {
    for (const child of node.children ?? []) {
      parents.set(child, index);
    }
  }
  const worlds = new Map<number, Matrix4>();
  const visiting = new Set<number>();
  const world = (index: number): Matrix4 => {
    const cached = worlds.get(index);
    if (cached) {
      return cached;
    }
    if (visiting.has(index)) {
      throw new Error('Capture GLB has a cyclic node hierarchy.');
    }
    visiting.add(index);
    const node = nodes[index];
    const matrix = node?.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3().fromArray(node?.translation ?? [0, 0, 0]),
          new Quaternion().fromArray(node?.rotation ?? [0, 0, 0, 1]),
          new Vector3().fromArray(node?.scale ?? [1, 1, 1]),
        );
    const parent = parents.get(index);
    if (parent !== undefined) {
      matrix.premultiply(world(parent));
    }
    visiting.delete(index);
    worlds.set(index, matrix);
    return matrix;
  };
  // Capture every as-built placement before changing any parent matrix.
  for (const index of nodes.keys()) {
    world(index);
  }
  const linkByComponent = new Map<string, string>();
  for (const [linkId, link] of Object.entries(input.mechanism?.links ?? {})) {
    for (const component of link.components) {
      linkByComponent.set(component, linkId);
    }
  }
  const targets = new Map<number, string>();
  for (const [index, component] of ownership.componentIdByNodeIndex) {
    const link = linkByComponent.get(component);
    if (link !== undefined && input.pose?.linkTransforms[link]) {
      targets.set(index, link);
    }
  }
  for (const [index, link] of targets) {
    let ancestor = parents.get(index);
    let inherited = false;
    while (ancestor !== undefined) {
      if (targets.has(ancestor)) {
        inherited = true;
        break;
      }
      ancestor = parents.get(ancestor);
    }
    if (inherited) {
      continue;
    }
    const node = nodes[index]!;
    const parent = parents.get(index);
    const pre = parent === undefined ? new Matrix4() : world(parent).clone().invert();
    modified = true;
    node.matrix = pre
      .multiply(new Matrix4().fromArray(input.pose!.linkTransforms[link]!))
      .multiply(world(index))
      .toArray();
    delete node.translation;
    delete node.rotation;
    delete node.scale;
  }
  const originalMeshes = new Map<number, number>();
  for (const [nodeIndex, node] of nodes.entries()) {
    if (node.mesh === undefined) {
      continue;
    }
    const meshIndex = node.mesh;
    const mesh = meshes[meshIndex];
    if (!mesh) {
      continue;
    }
    const primitives = (mesh.primitives ?? []).map((primitive, primitiveIndex) => {
      // The live viewer does not apply per-component opacity to its edge lines.
      if ((primitive.mode ?? 4) < 4) {
        return primitive;
      }
      const componentId = getGltfPrimitiveComponentId(ownership, {
        nodeIndex,
        meshIndex,
        primitiveIndex,
      });
      if (!componentId) {
        return primitive;
      }
      const owner = [componentId, ...getComponentAncestorIds(manifest, componentId)].find(
        (id) => input.opacityByComponentId[id] !== undefined,
      );
      const opacity = owner === undefined ? undefined : input.opacityByComponentId[owner];
      if (opacity === undefined || opacity >= 1) {
        return primitive;
      }
      const original = primitive.material === undefined ? {} : (materials[primitive.material] ?? {});
      const factor = original.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      materials.push({
        ...original,
        pbrMetallicRoughness: {
          ...original.pbrMetallicRoughness,
          baseColorFactor: [factor[0]!, factor[1]!, factor[2]!, opacity],
        },
        alphaMode: 'BLEND',
      });
      return { ...primitive, material: materials.length - 1 };
    });
    if (primitives.some((primitive, index) => primitive !== mesh.primitives?.[index])) {
      modified = true;
      originalMeshes.set(nodeIndex, meshIndex);
      node.mesh = meshes.length;
      meshes.push({ ...mesh, primitives });
    }
  }
  if (!modified) {
    return unchanged;
  }
  json.nodes = nodes;
  json.meshes = meshes;
  json.materials = materials;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint32(0, true) !== 0x46_54_6c_67 || view.getUint32(4, true) !== 2) {
    throw new Error('Current-view capture requires GLB version 2.');
  }
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.byteLength / 4) * 4;
  const remainder = source.subarray(20 + view.getUint32(12, true));
  const content = new Uint8Array(20 + padded + remainder.byteLength);
  content.set(source.subarray(0, 12));
  const header = new DataView(content.buffer);
  header.setUint32(8, content.byteLength, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e_4f_53_4a, true);
  content.fill(0x20, 20, 20 + padded);
  content.set(encoded, 20);
  content.set(remainder, 20 + padded);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
  return {
    content,
    geometryHash: `${input.geometryHash}:presentation:${Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
    remapPrimitives: (references) =>
      references.map((reference) => ({
        ...reference,
        meshIndex: originalMeshes.has(reference.nodeIndex) ? nodes[reference.nodeIndex]!.mesh! : reference.meshIndex,
      })),
  };
}
