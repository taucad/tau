/**
 * B-rep edge overlay and topology for offline glTF exports.
 *
 * The overlay follows the layout the Replicad and OpenCascade kernels write. Each solid's edges become one `LINES`
 * primitive on the solid's mesh: de-indexed segments, `tauComponentKind: 'line'`, a `node/<n>/edges` selector and
 * `edgeGroups` counted in XYZ scalars. The edges come from `NativeHelpers.edges`, which reads each edge's samples on
 * the face triangulation, so line vertices coincide with surface vertices.
 *
 * The topology is Zoo's `KITTYCAD_boundary_representation` with the structure only (solids, shells, faces, loops,
 * edges, no geometry), which is what the Zoo kernel's topology enrichment reads to make faces and bodies selectable
 * the same way online exports are.
 */
import { formatPrimitiveSelector, transformVertexArray } from '@taucad/geometry-core';
import { cadEdgeOverlayMaterialDefaults, kittyCadBoundaryRepresentationExtension } from '@taucad/runtime/types';
import type { ShapeEdges, SolidTopology } from '#offline/offline-helpers.js';

/** The parts of glTF JSON the edge overlay touches. */
export type GltfJson = {
  asset: unknown;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  bufferViews?: Array<Record<string, unknown>>;
  accessors?: Array<Record<string, unknown>>;
  materials?: Array<Record<string, unknown>>;
  meshes?: Array<{
    name?: string;
    primitives: Array<{ [key: string]: unknown; mode?: number }>;
  }>;
  nodes?: Array<{
    name?: string;
    mesh?: number;
    extensions?: Record<string, unknown>;
  }>;
  extensions?: Record<string, unknown>;
  extensionsUsed?: string[];
};

/** What the export adds to each solid's mesh node. */
export type SolidOverlay = { edges?: ShapeEdges; topology?: SolidTopology };

const linesMode = 1;
const unlitExtension = 'KHR_materials_unlit';
const align4 = (value: number): number => Math.ceil(value / 4) * 4;

/**
 * Writes the solids' topology as the root `KITTYCAD_boundary_representation` payload, with each solid's node pointing
 * at its solid. Face order is the writer's primitive order, which `NativeHelpers.topology` follows.
 *
 * @param json - glTF JSON; edited in place
 * @param topologyByNode - topology per node index
 */
function appendTopology(json: GltfJson, topologyByNode: ReadonlyMap<number, SolidTopology>): void {
  const payload = {
    solids: [] as Array<{ shells: number[] }>,
    shells: [] as Array<{ faces: number[] }>,
    faces: [] as Array<{ loops: number[] }>,
    loops: [] as Array<{ edges: number[] }>,
    edges: [] as Array<Record<string, never>>,
  };
  for (const [nodeIndex, shells] of topologyByNode) {
    const edgeBase = payload.edges.length;
    let edgeCount = 0;
    const shellIndices = shells.map((faces) => {
      const faceIndices = faces.map((loops) => {
        const loopIndices = loops.map((edges) => {
          edgeCount = Math.max(edgeCount, ...edges.map((edge) => edge + 1));
          return (
            payload.loops.push({
              edges: edges.map((edge) => edgeBase + edge),
            }) - 1
          );
        });
        return payload.faces.push({ loops: loopIndices }) - 1;
      });
      return payload.shells.push({ faces: faceIndices }) - 1;
    });
    for (let edge = 0; edge < edgeCount; edge++) {
      payload.edges.push({});
    }

    const node = json.nodes![nodeIndex]!;
    node.extensions = {
      ...node.extensions,
      [kittyCadBoundaryRepresentationExtension]: {
        solid: payload.solids.length,
      },
    };
    payload.solids.push({ shells: shellIndices });
  }

  if (payload.solids.length > 0) {
    json.extensions = {
      ...json.extensions,
      [kittyCadBoundaryRepresentationExtension]: payload,
    };
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), kittyCadBoundaryRepresentationExtension])];
  }
}

/**
 * Appends each solid's edges to the mesh of the node the writer named after it, replacing the writer's own lines,
 * and writes the solids' topology. The glTF is edited in place as JSON plus one binary buffer, so the export stays
 * synchronous.
 *
 * @param json - glTF JSON whose first buffer is `bin`; edited in place
 * @param bin - the first buffer's bytes
 * @param overlays - edges and topology per solid id
 * @returns the grown buffer
 */
export function appendEdgesToGltf(
  json: GltfJson,
  bin: Uint8Array<ArrayBuffer>,
  overlays: ReadonlyMap<string, SolidOverlay>,
): Uint8Array<ArrayBuffer> {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [bin];
  let { byteLength } = bin;
  let materialIndex: number | undefined;
  const topologyByNode = new Map<number, SolidTopology>();
  for (const [nodeIndex, node] of (json.nodes ?? []).entries()) {
    const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
    const overlay = overlays.get(node.name ?? '') ?? overlays.get(mesh?.name ?? '');
    if (mesh && overlay?.topology) {
      topologyByNode.set(nodeIndex, overlay.topology);
    }

    const edges = overlay?.edges;
    if (!mesh || !edges?.edgeGroups.length) {
      continue;
    }

    if (materialIndex === undefined) {
      json.materials ??= [];
      materialIndex = json.materials.length;
      json.materials.push({
        pbrMetallicRoughness: {
          baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
          metallicFactor: cadEdgeOverlayMaterialDefaults.metallicFactor,
          roughnessFactor: cadEdgeOverlayMaterialDefaults.roughnessFactor,
        },
        doubleSided: cadEdgeOverlayMaterialDefaults.doubleSided,
        extensions: { [unlitExtension]: {} },
      });
      json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), unlitExtension])];
    }

    const positions = transformVertexArray(edges.lines, { coordinateSystem: 'y-up', unit: { length: 'meter' } });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const [index, value] of positions.entries()) {
      min[index % 3] = Math.min(min[index % 3]!, value);
      max[index % 3] = Math.max(max[index % 3]!, value);
    }

    const offset = align4(byteLength);
    chunks.push(new Uint8Array(offset - byteLength), new Uint8Array(positions.buffer));
    byteLength = offset + positions.byteLength;
    json.bufferViews ??= [];
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: positions.byteLength, target: 34_962 });
    json.accessors ??= [];
    json.accessors.push({
      bufferView: json.bufferViews.length - 1,
      componentType: 5126,
      count: positions.length / 3,
      type: 'VEC3',
      min,
      max,
    });
    mesh.primitives = mesh.primitives.filter((primitive) => primitive.mode !== linesMode);
    mesh.primitives.push({
      mode: linesMode,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantic
      attributes: { POSITION: json.accessors.length - 1 },
      material: materialIndex,
      extras: {
        tauComponentKind: 'line',
        tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'edges'),
        edgeGroups: edges.edgeGroups,
        tauEdgeGroupUnit: 'xyz-scalars-v1',
      },
    });
  }

  appendTopology(json, topologyByNode);
  const grown = new Uint8Array(align4(byteLength));
  let cursor = 0;
  for (const chunk of chunks) {
    grown.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  json.buffers ??= [{ byteLength: 0 }];
  json.buffers[0]!.byteLength = grown.byteLength;
  return grown;
}

/**
 * Adds the edge overlay and topology to a GLB written by `RWGltf_CafWriter`.
 *
 * @param glb - the GLB bytes
 * @param overlays - edges and topology per solid id
 * @returns the GLB with one `LINES` primitive per solid mesh
 */
export function appendEdgesToGlb(
  glb: Uint8Array<ArrayBuffer>,
  overlays: ReadonlyMap<string, SolidOverlay>,
): Uint8Array<ArrayBuffer> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GltfJson;
  const binStart = 20 + jsonLength;
  const bin =
    binStart + 8 <= glb.byteLength
      ? glb.subarray(binStart + 8, binStart + 8 + view.getUint32(binStart, true))
      : new Uint8Array();
  const grown = appendEdgesToGltf(json, bin, overlays);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = align4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonPadded + 8 + grown.byteLength;
  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46_54_6c_67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, total, true);
  outView.setUint32(12, jsonPadded, true);
  outView.setUint32(16, 0x4e_4f_53_4a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  outView.setUint32(20 + jsonPadded, grown.byteLength, true);
  outView.setUint32(24 + jsonPadded, 0x00_4e_49_42, true);
  out.set(grown, 28 + jsonPadded);
  return out;
}
