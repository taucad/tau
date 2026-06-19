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
import type { JSONObject } from '@taucad/types';

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

/**
 * A scene node containing one or more mesh primitives.
 *
 * @public
 */
export type GlbNode = {
  name?: string;
  primitives: GlbPrimitive[];
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

export type GlbExtraBufferView = {
  key: string;
  data: Uint8Array<ArrayBuffer>;
  target?: number;
};

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
    if (x < minX) {
      minX = x;
    }
    if (y < minY) {
      minY = y;
    }
    if (z < minZ) {
      minZ = z;
    }
    if (x > maxX) {
      maxX = x;
    }
    if (y > maxY) {
      maxY = y;
    }
    if (z > maxZ) {
      maxZ = z;
    }
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

    for (const primitive of node.primitives) {
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

  if (input.extensionsUsed && input.extensionsUsed.length > 0) {
    json.extensionsUsed = [...new Set(input.extensionsUsed)];
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
