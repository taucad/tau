/**
 * GlTF 2.0 binary (`.glb`) inspector. Produces a small set of standard
 * properties (asset metadata, mesh / primitive / vertex / triangle counts)
 * and a scene-level axis-aligned bounding box derived purely from the
 * accessor `min`/`max` extrema and node-hierarchy TRS transforms.
 *
 * The inspector is the rendering side of the visual validator described
 * in `p1-electron-bbox-viewer` — the renderer surfaces it next to the
 * Three.js viewer so changes to a parametric model (e.g. doubling a cube
 * `length`) produce a corresponding change in the displayed bbox
 * dimensions.
 *
 * Pure parsing — no DOM, no Three.js, no GPU. Runs identically in a
 * worker, in jsdom, or in Node.
 *
 * @see https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
 */

const GLB_MAGIC = 0x46_54_6c_67;
const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const CHUNK_TYPE_JSON = 0x4e_4f_53_4a;

/**
 * Subset of glTF 2.0 JSON we read. Fields that the inspector ignores
 * (materials, textures, animations, skins, ...) are omitted from this
 * shape so the type stays focused.
 *
 * @public
 */
export type GltfJson = {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    matrix?: readonly number[];
    translation?: readonly [number, number, number];
    rotation?: readonly [number, number, number, number];
    scale?: readonly [number, number, number];
  }>;
  meshes?: Array<{
    primitives: Array<{
      attributes: { POSITION?: number; [key: string]: number | undefined };
      indices?: number;
      mode?: number;
    }>;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';
    min?: readonly number[];
    max?: readonly number[];
  }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
  buffers?: Array<{ byteLength: number }>;
};

/**
 * Inspector result — the renderer-side validator displays these fields.
 *
 * @public
 */
export type GltfInspection = {
  readonly asset: { readonly version: string; readonly generator: string | undefined };
  readonly counts: {
    readonly meshes: number;
    readonly primitives: number;
    readonly vertices: number;
    readonly triangles: number;
  };
  readonly bbox: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
    readonly size: readonly [number, number, number];
    readonly center: readonly [number, number, number];
  };
};

/**
 * Inspect a `.glb` `ArrayBuffer` and return the standard properties
 * surfaced by the bbox viewer.
 *
 * @param glb - The raw `.glb` bytes (e.g. the geometry payload returned by
 *   `RuntimeClient.openFile().nextRender()`).
 * @returns The {@link GltfInspection} summary.
 *
 * @public
 */
export function inspectGlb(glb: ArrayBuffer): GltfInspection {
  const json = parseGlbJson(glb);
  return inspectGltfJson(json);
}

/**
 * Inspect a parsed glTF JSON object directly. Used by tests and by the
 * runtime path when JSON is already extracted.
 *
 * @public
 */
export function inspectGltfJson(json: GltfJson): GltfInspection {
  const asset = {
    version: json.asset.version,
    generator: json.asset.generator,
  } as const;

  const counts = countGeometry(json);
  const bbox = computeSceneBbox(json);

  return { asset, counts, bbox };
}

/**
 * Pack a glTF JSON object into a JSON-only `.glb` `ArrayBuffer`. Used by
 * tests; mirrors the binary layout that real glTF writers (e.g. OCCT,
 * `gltf-transform`) produce when there are no embedded buffers.
 *
 * @public
 */
export function packGlbForTest(json: GltfJson): ArrayBuffer {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(json));
  /* JSON chunk must be padded to a 4-byte boundary with `0x20` per the
   * glTF spec. */
  const paddedLength = jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4);
  const padded = new Uint8Array(paddedLength);
  padded.set(jsonBytes, 0);
  for (let index = jsonBytes.byteLength; index < paddedLength; index++) {
    padded[index] = 0x20;
  }
  const totalLength = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, CHUNK_TYPE_JSON, true);
  new Uint8Array(buffer, 20, paddedLength).set(padded);
  return buffer;
}

function parseGlbJson(glb: ArrayBuffer): GltfJson {
  if (glb.byteLength < GLB_HEADER_BYTES + CHUNK_HEADER_BYTES) {
    throw new Error('Invalid glTF magic — buffer too short for header.');
  }
  const view = new DataView(glb);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid glTF magic — expected 0x46546C67, got 0x${magic.toString(16).padStart(8, '0')}.`);
  }
  const chunkLength = view.getUint32(GLB_HEADER_BYTES, true);
  const chunkType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  if (chunkType !== CHUNK_TYPE_JSON) {
    throw new Error('Invalid glTF chunk — first chunk must be JSON.');
  }
  const jsonBytes = new Uint8Array(glb, GLB_HEADER_BYTES + CHUNK_HEADER_BYTES, chunkLength);
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(jsonBytes)) as GltfJson;
}

function countGeometry(json: GltfJson): GltfInspection['counts'] {
  let meshes = 0;
  let primitives = 0;
  let vertices = 0;
  let triangles = 0;

  for (const mesh of json.meshes ?? []) {
    meshes++;
    for (const primitive of mesh.primitives) {
      primitives++;
      const positionIndex = primitive.attributes.POSITION;
      if (positionIndex !== undefined && json.accessors?.[positionIndex]) {
        vertices += json.accessors[positionIndex].count;
      }
      /* Index buffer counts triangles directly; primitive.mode defaults to
       * 4 (TRIANGLES) per the glTF spec. */
      const mode = primitive.mode ?? 4;
      if (mode === 4) {
        const indexAccessor = primitive.indices === undefined ? undefined : json.accessors?.[primitive.indices];
        const positionAccessor = positionIndex === undefined ? undefined : json.accessors?.[positionIndex];
        if (indexAccessor) {
          triangles += indexAccessor.count / 3;
        } else if (positionAccessor) {
          triangles += positionAccessor.count / 3;
        }
      }
    }
  }

  return { meshes, primitives, vertices, triangles };
}

type Vec3 = readonly [number, number, number];
type Mat4 = readonly number[];

function computeSceneBbox(json: GltfJson): GltfInspection['bbox'] {
  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  const rootNodes = scene?.nodes ?? [];

  let min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (const nodeIndex of rootNodes) {
    const result = walkNode(json, nodeIndex, identity());
    if (result) {
      min = vec3Min(min, result.min);
      max = vec3Max(max, result.max);
    }
  }

  if (!Number.isFinite(min[0])) {
    /* Empty scene — return zero-sized bbox at origin so consumers don't
     * have to special-case the no-geometry case. */
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [0, 0, 0],
      center: [0, 0, 0],
    };
  }

  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { min, max, size, center };
}

function walkNode(json: GltfJson, nodeIndex: number, parentMatrix: Mat4): { min: Vec3; max: Vec3 } | undefined {
  const node = json.nodes?.[nodeIndex];
  if (!node) {
    return undefined;
  }
  const localMatrix = nodeMatrix(node);
  const worldMatrix = mat4Multiply(parentMatrix, localMatrix);

  let min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let hasGeometry = false;

  if (node.mesh !== undefined) {
    const meshBox = meshBboxFromAccessors(json, node.mesh);
    if (meshBox) {
      hasGeometry = true;
      const transformed = transformBbox(meshBox, worldMatrix);
      min = vec3Min(min, transformed.min);
      max = vec3Max(max, transformed.max);
    }
  }

  for (const childIndex of node.children ?? []) {
    const childBox = walkNode(json, childIndex, worldMatrix);
    if (childBox) {
      hasGeometry = true;
      min = vec3Min(min, childBox.min);
      max = vec3Max(max, childBox.max);
    }
  }

  return hasGeometry ? { min, max } : undefined;
}

function meshBboxFromAccessors(json: GltfJson, meshIndex: number): { min: Vec3; max: Vec3 } | undefined {
  const mesh = json.meshes?.[meshIndex];
  if (!mesh) {
    return undefined;
  }
  let min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let any = false;
  for (const primitive of mesh.primitives) {
    const positionIndex = primitive.attributes.POSITION;
    if (positionIndex === undefined) {
      continue;
    }
    const accessor = json.accessors?.[positionIndex];
    if (!accessor?.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) {
      continue;
    }
    any = true;
    min = vec3Min(min, [accessor.min[0]!, accessor.min[1]!, accessor.min[2]!]);
    max = vec3Max(max, [accessor.max[0]!, accessor.max[1]!, accessor.max[2]!]);
  }
  return any ? { min, max } : undefined;
}

function nodeMatrix(node: NonNullable<GltfJson['nodes']>[number]): Mat4 {
  if (node.matrix?.length === 16) {
    return node.matrix;
  }
  const t = node.translation ?? ([0, 0, 0] as const);
  const r = node.rotation ?? ([0, 0, 0, 1] as const);
  const s = node.scale ?? ([1, 1, 1] as const);
  return composeTRS(t, r, s);
}

function composeTRS(t: Vec3, r: readonly [number, number, number, number], s: Vec3): Mat4 {
  /* Quaternion (x, y, z, w) → 3×3 rotation × scale, then translation. Matches
   * glTF 2.0 §3.7.3.4 column-major TRS composition. */
  const [x, y, z, w] = r;
  const [sx, sy, sz] = s;
  const [tx, ty, tz] = t;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,

    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,

    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,

    tx,
    ty,
    tz,
    1,
  ];
}

function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  /* Column-major glTF convention; right-multiplies child-local by parent. */
  const result: number[] = Array.from<number>({ length: 16 }).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      result[col * 4 + row] =
        a[0 * 4 + row]! * b[col * 4 + 0]! +
        a[1 * 4 + row]! * b[col * 4 + 1]! +
        a[2 * 4 + row]! * b[col * 4 + 2]! +
        a[3 * 4 + row]! * b[col * 4 + 3]!;
    }
  }
  return result;
}

function transformPoint(p: Vec3, m: Mat4): Vec3 {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

function transformBbox(box: { min: Vec3; max: Vec3 }, m: Mat4): { min: Vec3; max: Vec3 } {
  /* Transform all 8 corners — produces a tight AABB of the rotated box in
   * world space (looser than transforming the OBB but correct for axis-
   * aligned reporting). */
  const corners: Vec3[] = [
    [box.min[0], box.min[1], box.min[2]],
    [box.max[0], box.min[1], box.min[2]],
    [box.min[0], box.max[1], box.min[2]],
    [box.max[0], box.max[1], box.min[2]],
    [box.min[0], box.min[1], box.max[2]],
    [box.max[0], box.min[1], box.max[2]],
    [box.min[0], box.max[1], box.max[2]],
    [box.max[0], box.max[1], box.max[2]],
  ];
  let min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const corner of corners) {
    const transformed = transformPoint(corner, m);
    min = vec3Min(min, transformed);
    max = vec3Max(max, transformed);
  }
  return { min, max };
}

function vec3Min(a: Vec3, b: Vec3): Vec3 {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}

function vec3Max(a: Vec3, b: Vec3): Vec3 {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}
