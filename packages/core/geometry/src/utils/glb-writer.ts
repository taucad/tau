/**
 * Direct GLB/glTF binary serializer for mesh-only CAD output.
 *
 * Produces spec-compliant glTF 2.0 GLB binaries without the overhead of
 * a full document model library. Non-interleaved buffer layout (separate
 * bufferViews per attribute).
 *
 * @public
 *
 * @see docs/policy/gltf-construction-policy.md
 */

import { packageName, packageVersion } from '#utils/package-info.js';
import type { GeometryGltf, JSONObject } from '@taucad/runtime/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Material properties for a glTF primitive.
 *
 * @public
 */
export type GlbMaterial = {
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  doubleSided: boolean;
  alphaMode: 'OPAQUE' | 'BLEND';
  name?: string;
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

/**
 * A single mesh primitive with geometry data and material.
 *
 * @public
 */
export type GlbPrimitive = {
  /** GlTF primitive mode: 4 = TRIANGLES, 1 = LINES */
  mode: number;
  positions: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
  material: GlbMaterial;
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

/** Exact oriented 2-manifold surface topology retained across render-vertex seams. @public */
export type GlbManifoldTopology = {
  /** Triangle indices into the node's shared POSITION accessor. */
  indices: Uint32Array;
};

/**
 * A scene node containing one or more mesh primitives.
 *
 * @public
 */
export type GlbNode = {
  name?: string;
  primitives: GlbPrimitive[];
  /** Exact topology for a triangle-only surface mesh; the writer validates and serializes `EXT_mesh_manifold`. */
  manifoldTopology?: GlbManifoldTopology;
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

/** Additional binary buffer view written into a glTF asset. @public */
export type GlbExtraBufferView = {
  key: string;
  data: Uint8Array<ArrayBuffer>;
  target?: number;
};

/** Root glTF extensions, optionally resolved after extra buffer views are assigned. @public */
export type GlbInputExtensions =
  | Record<string, JSONObject>
  | ((extraBufferViews: Record<string, number>) => Record<string, JSONObject>);

/**
 * Input for the GLB writer describing the full scene.
 *
 * @public
 */
export type GlbInput = {
  nodes: GlbNode[];
  extras?: JSONObject;
  extensions?: GlbInputExtensions;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  extraBufferViews?: GlbExtraBufferView[];
};

// =============================================================================
// Constants
// =============================================================================

const glbMagic = 0x46_54_6c_67;
const glbVersion = 2;
const jsonChunkType = 0x4e_4f_53_4a;
const binChunkType = 0x00_4e_49_42;
const glbHeaderSize = 12;
const chunkHeaderSize = 8;

const componentTypeFloat = 5126;
const componentTypeUnsignedInt = 5125;
const targetArrayBuffer = 34_962;
const targetElementArrayBuffer = 34_963;

// =============================================================================
// Internal helpers
// =============================================================================

function computeMinMax(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

function alignTo4(value: number): number {
  const remainder = value % 4;
  return remainder === 0 ? value : value + (4 - remainder);
}

type GltfJson = {
  asset: { version: string; generator: string; extras?: JSONObject };
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<{ mesh: number; name?: string; extras?: JSONObject; extensions?: Record<string, JSONObject> }>;
  meshes: Array<{
    primitives: GltfJsonPrimitive[];
    name?: string;
    extensions?: Record<string, JSONObject>;
  }>;
  accessors: GltfJsonAccessor[];
  bufferViews: GltfJsonBufferView[];
  buffers: Array<{ byteLength: number; uri?: string }>;
  materials: GltfJsonMaterial[];
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

type GltfJsonPrimitive = {
  attributes: Record<string, number>;
  mode: number;
  material: number;
  indices: number;
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

type GltfJsonAccessor = {
  bufferView: number;
  byteOffset: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  sparse?: {
    count: number;
    indices: { bufferView: number; componentType: number };
    values: { bufferView: number };
  };
};

type GltfJsonBufferView = {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target?: number;
};

type GltfJsonMaterial = {
  doubleSided: boolean;
  pbrMetallicRoughness: {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor?: number;
  };
  alphaMode?: string;
  name?: string;
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

type BufferEntry = {
  data: Uint8Array<ArrayBuffer>;
  byteOffset: number;
};

type ValidatedManifoldTopology = {
  renderIndices: Uint32Array;
  mergeIndices: Uint32Array;
  mergeValues: Uint32Array;
};

const arraysEqual = (left: Float32Array | undefined, right: Float32Array | undefined): boolean =>
  left === right ||
  (left?.length === right?.length && left?.every((value, index) => value === right?.[index]) === true);

const validateManifoldTopology = (node: GlbNode): ValidatedManifoldTopology => {
  const topology = node.manifoldTopology!;
  const first = node.primitives[0];
  if (!first || node.primitives.some((primitive) => primitive.mode !== 4)) {
    throw new Error('manifoldTopology requires one or more TRIANGLES primitives');
  }
  if (
    first.positions.length === 0 ||
    first.positions.length % 3 !== 0 ||
    first.positions.some((value) => !Number.isFinite(value)) ||
    (first.normals?.length ?? first.positions.length) !== first.positions.length ||
    node.primitives.some((primitive) => primitive.indices.length % 3 !== 0)
  ) {
    throw new Error('manifoldTopology requires complete finite triangle attributes and indices');
  }
  if (
    node.primitives.some(
      (primitive) =>
        !arraysEqual(primitive.positions, first.positions) || !arraysEqual(primitive.normals, first.normals),
    )
  ) {
    throw new Error('manifoldTopology primitives must share identical POSITION and NORMAL attributes');
  }

  const renderIndices = new Uint32Array(
    node.primitives.reduce((count, primitive) => count + primitive.indices.length, 0),
  );
  let offset = 0;
  for (const primitive of node.primitives) {
    renderIndices.set(primitive.indices, offset);
    offset += primitive.indices.length;
  }
  if (topology.indices.length !== renderIndices.length || topology.indices.length % 3 !== 0) {
    throw new Error('manifoldTopology and render index streams must contain the same complete triangles');
  }

  const vertexCount = first.positions.length / 3;
  const mergeIndices: number[] = [];
  const mergeValues: number[] = [];
  const edges = new Map<string, { count: number; winding: number }>();
  const links = Array.from({ length: vertexCount }, () => [] as Array<[number, number]>);
  for (let index = 0; index < topology.indices.length; index++) {
    const vertex = topology.indices[index]!;
    if (vertex >= vertexCount) {
      throw new Error('manifoldTopology index out of range');
    }
    if (vertex !== renderIndices[index]) {
      const original = renderIndices[index]!;
      if (original >= vertexCount) {
        throw new Error('render index out of range');
      }
      const originalOffset = original * 3;
      const manifoldOffset = vertex * 3;
      if (
        first.positions[originalOffset] !== first.positions[manifoldOffset] ||
        first.positions[originalOffset + 1] !== first.positions[manifoldOffset + 1] ||
        first.positions[originalOffset + 2] !== first.positions[manifoldOffset + 2]
      ) {
        throw new Error('manifoldTopology may merge only vertices with identical POSITION values');
      }
      mergeIndices.push(index);
      mergeValues.push(vertex);
    }
  }
  for (let index = 0; index < topology.indices.length; index += 3) {
    const triangle = topology.indices.subarray(index, index + 3);
    if (triangle[0] === triangle[1] || triangle[1] === triangle[2] || triangle[2] === triangle[0]) {
      throw new Error('manifoldTopology contains a collapsed triangle');
    }
    links[triangle[0]!]!.push([triangle[1]!, triangle[2]!]);
    links[triangle[1]!]!.push([triangle[2]!, triangle[0]!]);
    links[triangle[2]!]!.push([triangle[0]!, triangle[1]!]);
    for (const [start, end] of [
      [triangle[0]!, triangle[1]!],
      [triangle[1]!, triangle[2]!],
      [triangle[2]!, triangle[0]!],
    ] as const) {
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count++;
      edge.winding += start < end ? 1 : -1;
      edges.set(key, edge);
    }
  }
  if ([...edges.values()].some(({ count, winding }) => count !== 2 || winding !== 0)) {
    throw new Error('manifoldTopology is not an oriented 2-manifold');
  }
  for (const link of links) {
    if (link.length === 0) {
      continue;
    }
    const adjacency = new Map<number, number[]>();
    for (const [left, right] of link) {
      adjacency.set(left, [...(adjacency.get(left) ?? []), right]);
      adjacency.set(right, [...(adjacency.get(right) ?? []), left]);
    }
    if ([...adjacency.values()].some((neighbors) => neighbors.length !== 2)) {
      throw new Error('manifoldTopology has a non-manifold vertex link');
    }
    const start = adjacency.keys().next().value!;
    const pending = [start];
    const visited = new Set<number>();
    while (pending.length > 0) {
      const vertex = pending.pop()!;
      if (visited.has(vertex)) {
        continue;
      }
      visited.add(vertex);
      pending.push(...adjacency.get(vertex)!);
    }
    if (visited.size !== adjacency.size) {
      throw new Error('manifoldTopology has a disconnected vertex link');
    }
  }

  return {
    renderIndices,
    mergeIndices: Uint32Array.from(mergeIndices),
    mergeValues: Uint32Array.from(mergeValues),
  };
};

/**
 * Build the glTF JSON structure and binary buffer from the input.
 *
 * @param input - the scene description
 * @returns the JSON structure and binary buffer
 */
function buildGltf(input: GlbInput): { json: GltfJson; binBuffer: Uint8Array<ArrayBuffer> } {
  const accessors: GltfJsonAccessor[] = [];
  const bufferViews: GltfJsonBufferView[] = [];
  const materials: GltfJsonMaterial[] = [];
  const meshes: GltfJson['meshes'] = [];
  const nodes: GltfJson['nodes'] = [];
  const sceneNodes: number[] = [];
  const bufferEntries: BufferEntry[] = [];
  let currentByteOffset = 0;

  const materialCache = new Map<string, number>();

  /**
   * Deduplicate materials by their property key.
   *
   * @param mat - material properties to deduplicate
   * @returns index into the materials array
   */
  function getOrCreateMaterial(mat: GlbMaterial): number {
    const key = `${mat.baseColorFactor.join(',')}|${mat.metallicFactor}|${mat.roughnessFactor}|${mat.doubleSided}|${mat.alphaMode}|${mat.name ?? ''}|${JSON.stringify(mat.extras ?? {})}|${JSON.stringify(mat.extensions ?? {})}`;
    const existing = materialCache.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const materialJson: GltfJsonMaterial = {
      doubleSided: mat.doubleSided,
      pbrMetallicRoughness: {
        baseColorFactor: mat.baseColorFactor,
        metallicFactor: mat.metallicFactor,
      },
    };

    if (mat.roughnessFactor !== 1) {
      materialJson.pbrMetallicRoughness.roughnessFactor = mat.roughnessFactor;
    }

    if (mat.alphaMode !== 'OPAQUE') {
      materialJson.alphaMode = mat.alphaMode;
    }

    if (mat.name) {
      materialJson.name = mat.name;
    }
    if (mat.extras) {
      materialJson.extras = mat.extras;
    }
    if (mat.extensions) {
      materialJson.extensions = mat.extensions;
    }

    const index = materials.length;
    materials.push(materialJson);
    materialCache.set(key, index);
    return index;
  }

  /**
   * Append typed array data to the binary buffer and register a bufferView.
   *
   * @param data - typed array data to add
   * @param target - buffer view target (ARRAY_BUFFER or ELEMENT_ARRAY_BUFFER)
   * @returns index of the new bufferView
   */
  function addBufferView(data: Float32Array | Uint32Array | Uint8Array<ArrayBuffer>, target?: number): number {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const aligned = alignTo4(bytes.byteLength);
    const padded = new Uint8Array(aligned);
    padded.set(bytes);

    const viewIndex = bufferViews.length;
    const bufferView: GltfJsonBufferView = {
      buffer: 0,
      byteOffset: currentByteOffset,
      byteLength: bytes.byteLength,
    };
    if (target !== undefined) {
      bufferView.target = target;
    }
    bufferViews.push(bufferView);

    bufferEntries.push({ data: padded, byteOffset: currentByteOffset });
    currentByteOffset += aligned;
    return viewIndex;
  }

  for (const node of input.nodes) {
    const primitiveJsons: GltfJsonPrimitive[] = [];
    let meshExtensions: Record<string, JSONObject> | undefined;

    if (node.manifoldTopology) {
      const { renderIndices, mergeIndices, mergeValues } = validateManifoldTopology(node);
      const first = node.primitives[0]!;
      const positionViewIndex = addBufferView(first.positions, targetArrayBuffer);
      const { min, max } = computeMinMax(first.positions);
      const positionAccessorIndex = accessors.length;
      accessors.push({
        bufferView: positionViewIndex,
        byteOffset: 0,
        componentType: componentTypeFloat,
        count: first.positions.length / 3,
        type: 'VEC3',
        min,
        max,
      });
      const attributes: Record<string, number> = {};
      attributes['POSITION'] = positionAccessorIndex;
      if (first.normals && first.normals.length > 0) {
        const normalViewIndex = addBufferView(first.normals, targetArrayBuffer);
        const normalAccessorIndex = accessors.length;
        accessors.push({
          bufferView: normalViewIndex,
          byteOffset: 0,
          componentType: componentTypeFloat,
          count: first.normals.length / 3,
          type: 'VEC3',
        });
        attributes['NORMAL'] = normalAccessorIndex;
      }
      const indexViewIndex = addBufferView(renderIndices, targetElementArrayBuffer);
      let indexOffset = 0;
      for (const primitive of node.primitives) {
        const indexAccessorIndex = accessors.length;
        accessors.push({
          bufferView: indexViewIndex,
          byteOffset: indexOffset * Uint32Array.BYTES_PER_ELEMENT,
          componentType: componentTypeUnsignedInt,
          count: primitive.indices.length,
          type: 'SCALAR',
        });
        indexOffset += primitive.indices.length;
        primitiveJsons.push({
          attributes,
          mode: primitive.mode,
          material: getOrCreateMaterial(primitive.material),
          indices: indexAccessorIndex,
          ...(primitive.extras ? { extras: primitive.extras } : {}),
          ...(primitive.extensions ? { extensions: primitive.extensions } : {}),
        });
      }
      const manifoldAccessorIndex = accessors.length;
      const manifoldAccessor: GltfJsonAccessor = {
        bufferView: indexViewIndex,
        byteOffset: 0,
        componentType: componentTypeUnsignedInt,
        count: node.manifoldTopology.indices.length,
        type: 'SCALAR',
      };
      accessors.push(manifoldAccessor);
      const manifoldAttributes: JSONObject = {};
      manifoldAttributes['POSITION'] = positionAccessorIndex;
      const extension: JSONObject = {
        manifoldPrimitive: { attributes: manifoldAttributes, indices: manifoldAccessorIndex, mode: 4 },
      };
      if (mergeIndices.length > 0) {
        const mergeIndexView = addBufferView(mergeIndices);
        const mergeValueView = addBufferView(mergeValues);
        const mergeIndexAccessor = accessors.length;
        accessors.push({
          bufferView: mergeIndexView,
          byteOffset: 0,
          componentType: componentTypeUnsignedInt,
          count: mergeIndices.length,
          type: 'SCALAR',
        });
        const mergeValueAccessor = accessors.length;
        accessors.push({
          bufferView: mergeValueView,
          byteOffset: 0,
          componentType: componentTypeUnsignedInt,
          count: mergeValues.length,
          type: 'SCALAR',
        });
        manifoldAccessor.sparse = {
          count: mergeIndices.length,
          indices: { bufferView: mergeIndexView, componentType: componentTypeUnsignedInt },
          values: { bufferView: mergeValueView },
        };
        extension['mergeIndices'] = mergeIndexAccessor;
        extension['mergeValues'] = mergeValueAccessor;
      }
      meshExtensions = {};
      meshExtensions['EXT_mesh_manifold'] = extension;
    }

    for (const primitive of node.manifoldTopology ? [] : node.primitives) {
      const materialIndex = getOrCreateMaterial(primitive.material);

      const positionViewIndex = addBufferView(primitive.positions, targetArrayBuffer);
      const { min, max } = computeMinMax(primitive.positions);
      const positionAccessorIndex = accessors.length;
      accessors.push({
        bufferView: positionViewIndex,
        byteOffset: 0,
        componentType: componentTypeFloat,
        count: primitive.positions.length / 3,
        type: 'VEC3',
        min,
        max,
      });

      const attributes: Record<string, number> = {};
      attributes['POSITION'] = positionAccessorIndex;

      if (primitive.normals && primitive.normals.length > 0) {
        const normalViewIndex = addBufferView(primitive.normals, targetArrayBuffer);
        const normalAccessorIndex = accessors.length;
        accessors.push({
          bufferView: normalViewIndex,
          byteOffset: 0,
          componentType: componentTypeFloat,
          count: primitive.normals.length / 3,
          type: 'VEC3',
        });
        attributes['NORMAL'] = normalAccessorIndex;
      }

      const indexViewIndex = addBufferView(primitive.indices, targetElementArrayBuffer);
      const indexAccessorIndex = accessors.length;
      accessors.push({
        bufferView: indexViewIndex,
        byteOffset: 0,
        componentType: componentTypeUnsignedInt,
        count: primitive.indices.length,
        type: 'SCALAR',
      });

      primitiveJsons.push({
        attributes,
        mode: primitive.mode,
        material: materialIndex,
        indices: indexAccessorIndex,
        ...(primitive.extras ? { extras: primitive.extras } : {}),
        ...(primitive.extensions ? { extensions: primitive.extensions } : {}),
      });
    }

    if (primitiveJsons.length > 0) {
      const meshIndex = meshes.length;
      meshes.push({
        primitives: primitiveJsons,
        ...(node.name ? { name: node.name } : {}),
        ...(meshExtensions ? { extensions: meshExtensions } : {}),
      });

      const nodeIndex = nodes.length;
      const nodeJson: GltfJson['nodes'][number] = { mesh: meshIndex };
      if (node.name) {
        nodeJson.name = node.name;
      }
      if (node.extras) {
        nodeJson.extras = node.extras;
      }
      if (node.extensions) {
        nodeJson.extensions = node.extensions;
      }
      nodes.push(nodeJson);
      sceneNodes.push(nodeIndex);
    }
  }

  const extraBufferViewIndices: Record<string, number> = {};
  for (const extraBufferView of input.extraBufferViews ?? []) {
    extraBufferViewIndices[extraBufferView.key] = addBufferView(extraBufferView.data, extraBufferView.target);
  }

  const totalBinSize = currentByteOffset;
  const binBuffer = new Uint8Array(totalBinSize);
  for (const entry of bufferEntries) {
    binBuffer.set(entry.data, entry.byteOffset);
  }

  const json: GltfJson = {
    asset: {
      version: '2.0',
      generator: `${packageName}@${packageVersion}`,
      ...(input.extras ? { extras: input.extras } : {}),
    },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBinSize }],
    materials,
  };

  if (input.extensions) {
    json.extensions =
      typeof input.extensions === 'function' ? input.extensions(extraBufferViewIndices) : input.extensions;
  }

  const extensionsUsed = input.nodes.some((node) => node.manifoldTopology)
    ? [...(input.extensionsUsed ?? []), 'EXT_mesh_manifold']
    : input.extensionsUsed;
  if (extensionsUsed && extensionsUsed.length > 0) {
    json.extensionsUsed = [...new Set(extensionsUsed)];
  }

  if (input.extensionsRequired && input.extensionsRequired.length > 0) {
    json.extensionsRequired = [...new Set(input.extensionsRequired)];
  }

  return { json, binBuffer };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Serialize a scene to GLB (binary glTF) format.
 *
 * Produces a spec-compliant glTF 2.0 GLB binary with non-interleaved
 * buffer layout. Synchronous — no async overhead.
 *
 * @param input - scene description with nodes, primitives, and materials
 * @returns the GLB binary as a Uint8Array
 *
 * @public
 */
export function writeGlb(input: GlbInput): Uint8Array<ArrayBuffer> {
  const { json, binBuffer } = buildGltf(input);

  const jsonString = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonString);
  const jsonPaddedLength = alignTo4(jsonBytes.byteLength);
  const binPaddedLength = alignTo4(binBuffer.byteLength);

  const totalLength = glbHeaderSize + chunkHeaderSize + jsonPaddedLength + chunkHeaderSize + binPaddedLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);

  let offset = 0;

  view.setUint32(offset, glbMagic, true);
  offset += 4;
  view.setUint32(offset, glbVersion, true);
  offset += 4;
  view.setUint32(offset, totalLength, true);
  offset += 4;

  view.setUint32(offset, jsonPaddedLength, true);
  offset += 4;
  view.setUint32(offset, jsonChunkType, true);
  offset += 4;
  glb.set(jsonBytes, offset);
  for (let i = jsonBytes.byteLength; i < jsonPaddedLength; i++) {
    glb[offset + i] = 0x20; // Pad with spaces
  }
  offset += jsonPaddedLength;

  view.setUint32(offset, binPaddedLength, true);
  offset += 4;
  view.setUint32(offset, binChunkType, true);
  offset += 4;
  glb.set(binBuffer, offset);

  return glb;
}

/**
 * Serialize a scene to self-contained glTF JSON format with base64-embedded binary data.
 *
 * The binary buffer is encoded as a `data:application/octet-stream;base64,...` URI
 * in the `buffers[0].uri` field, producing a single-file glTF.
 *
 * @param input - scene description with nodes, primitives, and materials
 * @returns the glTF JSON as a UTF-8 encoded Uint8Array
 *
 * @public
 */
export function writeGltfJson(input: GlbInput): Uint8Array<ArrayBuffer> {
  const { json, binBuffer } = buildGltf(input);

  let binaryString = '';
  for (const byte of binBuffer) {
    binaryString += String.fromCodePoint(byte);
  }

  // oxlint-disable-next-line no-restricted-globals -- btoa is available in target environments
  const base64Data = btoa(binaryString);
  json.buffers[0]!.uri = `data:application/octet-stream;base64,${base64Data}`;

  const jsonString = JSON.stringify(json, undefined, 2);
  return new TextEncoder().encode(jsonString);
}

/**
 * Create a canonical empty GLB scene.
 *
 * Empty renders are successful geometry artifacts with no scene nodes, not
 * render failures and not fake degenerate triangles.
 *
 * @returns a valid GLB binary with zero meshes
 *
 * @public
 */
export function createEmptyGlb(): Uint8Array<ArrayBuffer> {
  return writeGlb({ nodes: [] });
}

/**
 * Create a canonical empty self-contained glTF JSON scene.
 *
 * @returns a UTF-8 encoded glTF JSON file with zero meshes
 *
 * @public
 */
export function createEmptyGltf(): Uint8Array<ArrayBuffer> {
  return writeGltfJson({ nodes: [] });
}

/**
 * Create a runtime geometry artifact for a successful empty render.
 *
 * @returns a glTF geometry artifact backed by {@link createEmptyGlb}
 *
 * @public
 */
export function createEmptyGltfGeometry(): GeometryGltf {
  return { format: 'gltf', content: createEmptyGlb() };
}
