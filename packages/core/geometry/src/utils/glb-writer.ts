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
import type { SpatialMatrix } from '@taucad/spatial';
import type { GeometryGltf, JSONObject } from '@taucad/runtime/types';
import type { GLTF } from '@gltf-transform/core';
import { collectGltfExtensions, validateGlbMaterial, validateGlbResources } from '#utils/glb-material.js';
import type { GlbMaterial, GlbResources } from '#utils/glb-material.js';
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- Preserve the existing writer material type export.
export type { GlbMaterial } from '#utils/glb-material.js';

// =============================================================================
// Types
// =============================================================================

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
  /** Per-vertex texture coordinates, indexed by glTF TEXCOORD set. */
  texCoords?: Float32Array[];
  /** Per-vertex tangent xyz and bitangent handedness w. */
  tangents?: Float32Array;
  /**
   * Triangle or line indices. Omit them for a de-indexed soup: glTF draws arrays when a primitive
   * has no `indices`, so an identity buffer only adds payload bytes and an accessor.
   * Uint16 indices may reach 65534; use Uint32 for larger values. The writer preserves the supplied width.
   */
  indices?: Uint16Array | Uint32Array;
  material: GlbMaterial;
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
};

/** Exact oriented 2-manifold surface topology retained across render-vertex seams. @public */
export type GlbManifoldTopology = {
  /** Triangle indices into the mesh asset's shared POSITION accessor. */
  indices: Uint32Array;
};

/**
 * A scene node containing one or more mesh primitives.
 *
 * @public
 */
export type GlbNode = {
  name?: string;
  /** Column-major local placement, validated as finite affine TRS without shear or zero scale. */
  matrix?: SpatialMatrix;
  /** Reuse this immutable array to share one mesh asset; each node retains its own identity and placement. */
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
export type GlbInput = GlbResources & {
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
const componentTypeUnsignedShort = 5123;
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new TypeError('POSITION must contain finite components');
    }
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
  nodes: Array<{
    mesh: number;
    matrix?: SpatialMatrix;
    name?: string;
    extras?: JSONObject;
    extensions?: Record<string, JSONObject>;
  }>;
  meshes: Array<{
    primitives: GltfJsonPrimitive[];
    name?: string;
    extensions?: Record<string, JSONObject>;
  }>;
  accessors: GltfJsonAccessor[];
  bufferViews: GltfJsonBufferView[];
  buffers: Array<{ byteLength: number; uri?: string }>;
  materials: GlbMaterial[];
  images?: GLTF.IImage[];
  textures?: GLTF.ITexture[];
  samplers?: GLTF.ISampler[];
  extras?: JSONObject;
  extensions?: Record<string, JSONObject>;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

type GltfJsonPrimitive = {
  attributes: Record<string, number>;
  mode: number;
  material: number;
  indices?: number;
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

/** A source view and where it lands in the binary buffer; bytes are copied once, at write time. */
type BufferEntry = {
  source: ArrayBufferView;
  byteOffset: number;
};

/** The glTF JSON plus the binary buffer's layout, before any payload byte is copied. */
type GltfLayout = {
  json: GltfJson;
  binByteLength: number;
  /** Copy every view into `target` at `offset` + its layout offset; padding stays zero. */
  writeBin: (target: Uint8Array<ArrayBuffer>, offset: number) => void;
};

type ValidatedManifoldTopology = {
  renderIndices: Uint32Array;
  mergeIndices: Uint32Array;
  mergeValues: Uint32Array;
};

const arraysEqual = (left: Float32Array | undefined, right: Float32Array | undefined): boolean =>
  left === right ||
  (left?.length === right?.length && left?.every((value, index) => value === right?.[index]) === true);

/**
 * Validate component identities once for both binary and JSON output.
 *
 * @param json - Emitted glTF objects and their component references.
 */
const validateComponentIds = (json: GltfJson): void => {
  const names = new Set([
    ...json.nodes.map((node) => node.name),
    ...json.meshes.map((mesh) => mesh.name),
    ...json.materials.map((material) => material.name),
    ...(json.images?.map((image) => image.name) ?? []),
    ...(json.textures?.map((texture) => texture.name) ?? []),
    ...(json.samplers?.map((sampler) => sampler.name) ?? []),
  ]);
  const primitiveIds = json.meshes.map(
    (mesh) => new Set(mesh.primitives.map((primitive) => primitive.extras?.['tauComponentId'])),
  );
  const owners = new Map<string, number>();
  for (const [nodeIndex, node] of json.nodes.entries()) {
    // Primitive extras reference components; surface and edge references may repeat the node's ID.
    const ids = new Set([node.extras?.['tauComponentId'], ...primitiveIds[node.mesh]!]);
    for (const id of ids) {
      if (id === undefined) {
        continue;
      }
      // Tau's existing ASCII namespace is provisional: glTF 2.1 has not fixed its UID character set.
      if (typeof id !== 'string' || id.length === 0 || /[^\w:-]/.test(id)) {
        throw new TypeError(`Invalid tauComponentId at node ${nodeIndex}: expected ASCII letters, digits, _, : or -`);
      }
      const owner = owners.get(id);
      if (owner !== undefined) {
        throw new TypeError(`Duplicate tauComponentId ${id} at nodes ${owner} and ${nodeIndex}`);
      }
      if (names.has(id)) {
        throw new TypeError(`tauComponentId ${id} at node ${nodeIndex} collides with a glTF name`);
      }
      owners.set(id, nodeIndex);
    }
  }
};

/**
 * The indices a manifold node's primitive contributes to the shared render stream.
 *
 * The manifold extension needs one contiguous index buffer covering every primitive, so a
 * de-indexed primitive is materialised here — the one place the identity buffer earns its bytes.
 *
 * @param primitive - The primitive to read.
 * @returns Its indices, or the identity permutation over its vertices.
 */
const manifoldIndices = (primitive: GlbPrimitive): Uint16Array | Uint32Array =>
  primitive.indices ?? Uint32Array.from({ length: primitive.positions.length / 3 }, (_unused, index) => index);

const validateManifoldTopology = (node: GlbNode): ValidatedManifoldTopology => {
  const topology = node.manifoldTopology!;
  if (!(topology.indices instanceof Uint32Array) || topology.indices.length === 0) {
    throw new TypeError('manifoldTopology requires nonempty Uint32 triangle indices');
  }
  const first = node.primitives[0];
  const indicesByPrimitive = node.primitives.map(manifoldIndices);
  if (!first || node.primitives.some((primitive) => primitive.mode !== 4)) {
    throw new Error('manifoldTopology requires one or more TRIANGLES primitives');
  }
  if (
    first.positions.length === 0 ||
    first.positions.length % 3 !== 0 ||
    (first.normals?.length ?? first.positions.length) !== first.positions.length ||
    indicesByPrimitive.some((indices) => indices.length % 3 !== 0)
  ) {
    throw new Error('manifoldTopology requires complete finite triangle attributes and indices');
  }
  if (
    node.primitives.some(
      (primitive) =>
        !arraysEqual(primitive.positions, first.positions) ||
        !arraysEqual(primitive.normals, first.normals) ||
        !arraysEqual(primitive.tangents, first.tangents) ||
        (primitive.texCoords?.length ?? 0) !== (first.texCoords?.length ?? 0) ||
        (primitive.texCoords ?? []).some((coordinates, index) => !arraysEqual(coordinates, first.texCoords?.[index])),
    )
  ) {
    throw new Error(
      'manifoldTopology primitives must share identical POSITION, NORMAL, TANGENT and TEXCOORD attributes',
    );
  }

  const renderIndices = new Uint32Array(indicesByPrimitive.reduce((count, indices) => count + indices.length, 0));
  let offset = 0;
  for (const indices of indicesByPrimitive) {
    renderIndices.set(indices, offset);
    offset += indices.length;
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
 * Build the glTF JSON structure and the binary buffer's layout from the input.
 *
 * Payload bytes are not copied here: each view keeps a reference to its source, and the caller
 * writes all of them once into the final allocation.
 *
 * @param input - the scene description
 * @returns the JSON structure and the binary layout
 */
function buildGltf(input: GlbInput): GltfLayout {
  const accessors: GltfJsonAccessor[] = [];
  const bufferViews: GltfJsonBufferView[] = [];
  const materials: GlbMaterial[] = [];
  const meshes: GltfJson['meshes'] = [];
  const nodes: GltfJson['nodes'] = [];
  const sceneNodes: number[] = [];
  const bufferEntries: BufferEntry[] = [];
  let currentByteOffset = 0;

  const materialCache = new Map<string, number>();
  // ponytail: identity maps live for one write; equal values in unrelated geometry buffers stay separate.
  const materialInputs = new Map<GlbMaterial, Map<string, number>>();
  const meshCache = new Map<GlbPrimitive[], Map<GlbManifoldTopology | undefined, number>>();
  const views = new Map<ArrayBufferLike, Map<string, number>>();
  const accessorCache = new Map<number, Map<string, number>>();
  const indexMaxima = new Map<ArrayBufferLike, Map<string, number>>();
  const floatValidation = new Map<ArrayBufferLike, Map<string, ReturnType<typeof computeMinMax> | undefined>>();
  const validatedPrimitives = new Set<GlbPrimitive>();
  const validatedTangents = new Set<number>();

  function isNumberArray(value: unknown): value is number[] {
    if (!Array.isArray(value)) {
      return false;
    }
    const components: unknown[] = value;
    // oxlint-disable-next-line @typescript-eslint/prefer-for-of, unicorn-js/no-for-loop -- JSON serializes numeric entries, not a custom iterator.
    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      if (typeof component !== 'number' || !Number.isFinite(component)) {
        return false;
      }
    }
    return true;
  }

  function validateMatrix(matrix: unknown): void {
    if (
      !isNumberArray(matrix) ||
      matrix.length !== 16 ||
      matrix[3] !== 0 ||
      matrix[7] !== 0 ||
      matrix[11] !== 0 ||
      matrix[15] !== 1
    ) {
      throw new TypeError('Node matrix must be a finite column-major affine SpatialMatrix');
    }
    const lengths = [
      Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!),
      Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
      Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!),
    ];
    if (lengths.some((length) => length === 0 || !Number.isFinite(length))) {
      throw new TypeError('Node matrix must be TRS-decomposable with nonzero scale columns');
    }
    // Test normalized basis, so large or tiny finite scales do not overflow dot products.
    const columns = lengths.map((length, index) => [
      matrix[index * 4]! / length,
      matrix[index * 4 + 1]! / length,
      matrix[index * 4 + 2]! / length,
    ]);
    for (const [left, right] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      const a = columns[left!]!;
      const b = columns[right!]!;
      if (Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) > 1e-6) {
        throw new TypeError('Node matrix must be TRS-decomposable without shear');
      }
    }
  }

  function validateFloat(
    data: Float32Array,
    size: number,
    position = false,
  ): ReturnType<typeof computeMinMax> | undefined {
    if (!(data instanceof Float32Array) || data.length === 0 || data.length % size !== 0) {
      throw new TypeError(`${position ? 'POSITION' : 'Attribute'} requires complete nonempty FLOAT vectors`);
    }
    const key = `${data.byteOffset}:${data.byteLength}:${size}:${position}`;
    const cache = floatValidation.get(data.buffer) ?? new Map<string, ReturnType<typeof computeMinMax> | undefined>();
    if (cache.has(key)) {
      return cache.get(key);
    }
    const positionKey = `${data.byteOffset}:${data.byteLength}:${size}:true`;
    if (!position && cache.has(positionKey)) {
      return undefined;
    }
    const bounds = position ? computeMinMax(data) : undefined;
    if (!position && data.some((value) => !Number.isFinite(value))) {
      throw new TypeError('Attribute must contain finite components');
    }
    cache.set(key, bounds);
    floatValidation.set(data.buffer, cache);
    return bounds;
  }

  function floatAccessor(data: Float32Array, size: number, position = false): number {
    const bounds = validateFloat(data, size, position);
    const bufferView = addBufferView(data, targetArrayBuffer, `${size}:${position}`);
    const key = `${size}:${position}`;
    const cached = accessorCache.get(bufferView)?.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const index = accessors.length;
    accessors.push({
      bufferView,
      byteOffset: 0,
      componentType: componentTypeFloat,
      count: data.length / size,
      type: `VEC${size}`,
      ...bounds,
    });
    const cache = accessorCache.get(bufferView) ?? new Map<string, number>();
    cache.set(key, index);
    accessorCache.set(bufferView, cache);
    return index;
  }

  function validatePrimitive(primitive: GlbPrimitive): void {
    if (validatedPrimitives.has(primitive)) {
      return;
    }
    validateFloat(primitive.positions, 3, true);
    if (primitive.normals && primitive.normals.length > 0) {
      if (primitive.normals.length !== primitive.positions.length) {
        throw new TypeError('NORMAL count must match POSITION');
      }
      validateFloat(primitive.normals, 3);
    }
    const vertexCount = primitive.positions.length / 3;
    const { indices } = primitive;
    if (indices !== undefined && !(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
      throw new TypeError('Indices must use Uint16Array or Uint32Array');
    }
    if (indices && indices.length > 0) {
      const key = `${indices.byteOffset}:${indices.byteLength}:${indices.BYTES_PER_ELEMENT}`;
      const cache = indexMaxima.get(indices.buffer) ?? new Map<string, number>();
      let maximum = cache.get(key);
      if (maximum === undefined) {
        maximum = 0;
        const restart = indices instanceof Uint16Array ? 65_535 : 4_294_967_295;
        // oxlint-disable-next-line @typescript-eslint/prefer-for-of, unicorn-js/no-for-loop -- Serialized entries must not be replaced by a custom iterator.
        for (let offset = 0; offset < indices.length; offset++) {
          const index = indices[offset]!;
          if (index === restart) {
            throw new TypeError('Indices must not contain the primitive restart sentinel');
          }
          maximum = Math.max(maximum, index);
        }
        cache.set(key, maximum);
        indexMaxima.set(indices.buffer, cache);
      }
      if (maximum >= vertexCount) {
        throw new TypeError('Index must be less than POSITION count');
      }
    }
    const count = indices && indices.length > 0 ? indices.length : vertexCount;
    const { mode } = primitive;
    if (
      !Number.isInteger(mode) ||
      mode < 0 ||
      mode > 6 ||
      (mode === 1 && count % 2 !== 0) ||
      (mode === 4 && count % 3 !== 0) ||
      ((mode === 2 || mode === 3) && count < 2) ||
      ((mode === 5 || mode === 6) && count < 3)
    ) {
      throw new TypeError('Primitive mode requires complete topology elements');
    }
    validatedPrimitives.add(primitive);
  }

  /**
   * Deduplicate materials by their property key.
   *
   * @param primitive - primitive whose material is validated and deduplicated
   * @returns index into the materials array
   */
  function getOrCreateMaterial(primitive: GlbPrimitive): number {
    const mat = primitive.material;
    const layout = `${primitive.texCoords?.length ?? 0}:${primitive.tangents !== undefined}`;
    const cached = materialInputs.get(mat)?.get(layout);
    if (cached !== undefined) {
      return cached;
    }
    validateGlbMaterial(mat, {
      textureCount: input.textures?.length ?? 0,
      texCoordCount: primitive.texCoords?.length ?? 0,
      hasTangents: primitive.tangents !== undefined,
    });
    const key = JSON.stringify(mat, (_property, value: unknown) => {
      if (
        (typeof value === 'number' && !Number.isFinite(value)) ||
        ['bigint', 'function', 'symbol'].includes(typeof value)
      ) {
        throw new TypeError('Material properties, extras and extensions must contain finite JSON values');
      }
      return value;
    });
    const existing = materialCache.get(key);
    const index = existing ?? materials.length;
    if (existing === undefined) {
      materials.push(mat);
      materialCache.set(key, index);
    }
    const cache = materialInputs.get(mat) ?? new Map<string, number>();
    cache.set(layout, index);
    materialInputs.set(mat, cache);
    return index;
  }

  /**
   * Append typed array data to the binary buffer and register a bufferView.
   *
   * @param data - typed array data to add
   * @param target - buffer view target (ARRAY_BUFFER or ELEMENT_ARRAY_BUFFER)
   * @param layout - vertex accessor layout; different no-stride vertex accessors need distinct views
   * @returns index of the new bufferView
   */
  function addBufferView(
    data: Float32Array | Uint16Array | Uint32Array | Uint8Array<ArrayBuffer>,
    target?: number,
    layout?: string,
  ): number {
    const key = `${data.byteOffset}:${data.byteLength}:${target ?? ''}:${layout ?? ''}`;
    const cached = views.get(data.buffer)?.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const aligned = alignTo4(data.byteLength);
    if (!Number.isSafeInteger(currentByteOffset + aligned) || currentByteOffset + aligned > 0xff_ff_ff_ff) {
      throw new RangeError('Binary buffer exceeds GLB uint32 capacity');
    }

    const viewIndex = bufferViews.length;
    const bufferView: GltfJsonBufferView = {
      buffer: 0,
      byteOffset: currentByteOffset,
      byteLength: data.byteLength,
    };
    if (target !== undefined) {
      bufferView.target = target;
    }
    bufferViews.push(bufferView);

    bufferEntries.push({ source: data, byteOffset: currentByteOffset });
    currentByteOffset += aligned;
    const cache = views.get(data.buffer) ?? new Map<string, number>();
    cache.set(key, viewIndex);
    views.set(data.buffer, cache);
    return viewIndex;
  }

  function addMaterialAttributes(primitive: GlbPrimitive, attributes: Record<string, number>): void {
    const add = (semantic: string, data: Float32Array, size: number): void => {
      if (data.length / size !== primitive.positions.length / 3) {
        throw new TypeError(`${semantic} count must match POSITION and contain finite components`);
      }
      attributes[semantic] = floatAccessor(data, size);
    };
    for (const [index, coordinates] of (primitive.texCoords ?? []).entries()) {
      add(`TEXCOORD_${index}`, coordinates, 2);
    }
    if (primitive.tangents) {
      if (!primitive.normals || primitive.normals.length !== primitive.positions.length) {
        throw new TypeError('TANGENT requires matching NORMAL attributes');
      }
      const tangentView = addBufferView(primitive.tangents, targetArrayBuffer, '4:false');
      if (!validatedTangents.has(tangentView)) {
        for (let index = 0; index < primitive.tangents.length; index += 4) {
          const [x, y, z, w] = primitive.tangents.subarray(index, index + 4);
          if (
            ![x, y, z].every((value) => Number.isFinite(value)) ||
            Math.abs(Math.hypot(x!, y!, z!) - 1) > 0.001 ||
            (w !== -1 && w !== 1)
          ) {
            throw new TypeError('TANGENT must contain unit XYZ vectors and W of -1 or 1');
          }
        }
      }
      validatedTangents.add(tangentView);
      add('TANGENT', primitive.tangents, 4);
    }
  }

  for (const node of input.nodes) {
    if (node.matrix !== undefined) {
      validateMatrix(node.matrix);
    }
    const sharedMesh = meshCache.get(node.primitives)?.get(node.manifoldTopology);
    if (sharedMesh !== undefined) {
      const nodeIndex = nodes.length;
      nodes.push({
        mesh: sharedMesh,
        ...(node.name ? { name: node.name } : {}),
        ...(node.matrix ? { matrix: node.matrix } : {}),
        ...(node.extras ? { extras: node.extras } : {}),
        ...(node.extensions ? { extensions: node.extensions } : {}),
      });
      sceneNodes.push(nodeIndex);
      continue;
    }
    const primitiveJsons: GltfJsonPrimitive[] = [];
    let meshExtensions: Record<string, JSONObject> | undefined;

    for (const primitive of node.primitives) {
      validatePrimitive(primitive);
    }
    if (node.manifoldTopology) {
      const { renderIndices, mergeIndices, mergeValues } = validateManifoldTopology(node);
      const first = node.primitives[0]!;
      const positionAccessorIndex = floatAccessor(first.positions, 3, true);
      const attributes: Record<string, number> = {};
      attributes['POSITION'] = positionAccessorIndex;
      if (first.normals && first.normals.length > 0) {
        attributes['NORMAL'] = floatAccessor(first.normals, 3);
      }
      const indexViewIndex = addBufferView(renderIndices, targetElementArrayBuffer);
      addMaterialAttributes(first, attributes);
      let indexOffset = 0;
      for (const primitive of node.primitives) {
        const indexAccessorIndex = accessors.length;
        const indexCount = primitive.indices?.length ?? primitive.positions.length / 3;
        accessors.push({
          bufferView: indexViewIndex,
          byteOffset: indexOffset * Uint32Array.BYTES_PER_ELEMENT,
          componentType: componentTypeUnsignedInt,
          count: indexCount,
          type: 'SCALAR',
        });
        indexOffset += indexCount;
        primitiveJsons.push({
          attributes,
          mode: primitive.mode,
          material: getOrCreateMaterial(primitive),
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
      const materialIndex = getOrCreateMaterial(primitive);

      const attributes: Record<string, number> = {};
      attributes['POSITION'] = floatAccessor(primitive.positions, 3, true);
      if (primitive.normals && primitive.normals.length > 0) {
        attributes['NORMAL'] = floatAccessor(primitive.normals, 3);
      }

      let indexAccessorIndex: number | undefined;
      addMaterialAttributes(primitive, attributes);
      if (primitive.indices !== undefined && primitive.indices.length > 0) {
        const indexViewIndex = addBufferView(primitive.indices, targetElementArrayBuffer);
        const componentType =
          primitive.indices instanceof Uint16Array ? componentTypeUnsignedShort : componentTypeUnsignedInt;
        const key = `${componentType}:SCALAR`;
        const cached = accessorCache.get(indexViewIndex)?.get(key);
        indexAccessorIndex = cached ?? accessors.length;
        if (cached === undefined) {
          accessors.push({
            bufferView: indexViewIndex,
            byteOffset: 0,
            componentType,
            count: primitive.indices.length,
            type: 'SCALAR',
          });
          const cache = accessorCache.get(indexViewIndex) ?? new Map<string, number>();
          cache.set(key, indexAccessorIndex);
          accessorCache.set(indexViewIndex, cache);
        }
      }

      primitiveJsons.push({
        attributes,
        mode: primitive.mode,
        material: materialIndex,
        ...(indexAccessorIndex === undefined ? {} : { indices: indexAccessorIndex }),
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
      const cache = meshCache.get(node.primitives) ?? new Map<GlbManifoldTopology | undefined, number>();
      cache.set(node.manifoldTopology, meshIndex);
      meshCache.set(node.primitives, cache);
      const nodeJson: GltfJson['nodes'][number] = { mesh: meshIndex };
      if (node.matrix) {
        nodeJson.matrix = node.matrix;
      }
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

  const images = input.images?.map(({ data, mimeType, name }) => ({
    bufferView: addBufferView(data),
    mimeType,
    ...(name ? { name } : {}),
  }));
  validateGlbResources(input);
  const totalBinSize = currentByteOffset;

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
    ...(images ? { images } : {}),
    ...(input.textures ? { textures: input.textures } : {}),
    ...(input.samplers ? { samplers: input.samplers } : {}),
  };

  if (input.extensions) {
    json.extensions =
      typeof input.extensions === 'function' ? input.extensions(extraBufferViewIndices) : input.extensions;
  }

  const extensionsUsed = new Set([...(input.extensionsUsed ?? []), ...(input.extensionsRequired ?? [])]);
  collectGltfExtensions(json, extensionsUsed);
  if (extensionsUsed.size > 0) {
    json.extensionsUsed = [...extensionsUsed];
  }

  if (input.extensionsRequired && input.extensionsRequired.length > 0) {
    json.extensionsRequired = [...new Set(input.extensionsRequired)];
  }

  if (input.textures?.some((texture) => texture.extensions?.['EXT_texture_webp'] && texture.source === undefined)) {
    json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_texture_webp'])];
  }

  validateComponentIds(json);

  return {
    json,
    binByteLength: totalBinSize,
    writeBin(target, offset) {
      for (const { source, byteOffset } of bufferEntries) {
        target.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength), offset + byteOffset);
      }
    },
  };
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
 * @throws {TypeError} If geometry, placement, material resources or component identities are invalid.
 * @throws {RangeError} If the binary output exceeds GLB uint32 capacity.
 *
 * @public
 */
export function writeGlb(input: GlbInput): Uint8Array<ArrayBuffer> {
  const { json, binByteLength, writeBin } = buildGltf(input);

  const jsonString = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonString);
  const jsonPaddedLength = alignTo4(jsonBytes.byteLength);
  const binPaddedLength = alignTo4(binByteLength);

  const totalLength = glbHeaderSize + chunkHeaderSize + jsonPaddedLength + chunkHeaderSize + binPaddedLength;
  if (!Number.isSafeInteger(totalLength) || totalLength > 0xff_ff_ff_ff) {
    throw new RangeError('GLB exceeds uint32 capacity');
  }
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
  // The one copy of every payload byte: straight from its source view into the GLB.
  writeBin(glb, offset);

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
 * @throws {TypeError} If geometry, placement, material resources or component identities are invalid.
 * @throws {RangeError} If the binary output exceeds GLB uint32 capacity.
 *
 * @public
 */
export function writeGltfJson(input: GlbInput): Uint8Array<ArrayBuffer> {
  const { json, binByteLength, writeBin } = buildGltf(input);
  const binBuffer = new Uint8Array(binByteLength);
  writeBin(binBuffer, 0);

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
