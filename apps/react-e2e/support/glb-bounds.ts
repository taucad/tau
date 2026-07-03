type GlbJson = {
  readonly accessors?: Array<{
    readonly bufferView?: number;
    readonly byteOffset?: number;
    readonly componentType?: number;
    readonly count?: number;
    readonly max?: readonly number[];
    readonly min?: readonly number[];
    readonly type?: string;
  }>;
  readonly bufferViews?: Array<{
    readonly buffer?: number;
    readonly byteLength?: number;
    readonly byteOffset?: number;
    readonly byteStride?: number;
  }>;
  readonly meshes?: Array<{
    readonly primitives?: Array<{
      readonly attributes?: {
        readonly POSITION?: number;
      };
    }>;
  }>;
};

export type GlbSummary = {
  readonly bytes: number;
  readonly meshes: number;
  readonly primitives: number;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly size: readonly [number, number, number];
};

const GLB_MAGIC = 0x4654_6c67;
const JSON_CHUNK = 0x4e4f_534a;
const BIN_CHUNK = 0x004e_4942;
const FLOAT = 5126;

const vectorMin = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  Math.min(a[0] ?? 0, b[0] ?? 0),
  Math.min(a[1] ?? 0, b[1] ?? 0),
  Math.min(a[2] ?? 0, b[2] ?? 0),
];

const vectorMax = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  Math.max(a[0] ?? 0, b[0] ?? 0),
  Math.max(a[1] ?? 0, b[1] ?? 0),
  Math.max(a[2] ?? 0, b[2] ?? 0),
];

const parseGlb = (
  bytes: Uint8Array<ArrayBufferLike>,
): { readonly json: GlbJson; readonly bin: Uint8Array<ArrayBufferLike> } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Expected a GLB payload.');
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) {
    throw new Error(`GLB declared length ${declaredLength} did not match payload length ${bytes.byteLength}.`);
  }

  let offset = 12;
  let json: GlbJson | undefined;
  let bin: Uint8Array<ArrayBufferLike> = new Uint8Array();
  while (offset < bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunk = bytes.subarray(chunkStart, chunkStart + chunkLength);
    if (chunkType === JSON_CHUNK) {
      json = JSON.parse(new TextDecoder().decode(chunk).trimEnd()) as GlbJson;
    }
    if (chunkType === BIN_CHUNK) {
      bin = chunk;
    }
    offset = chunkStart + chunkLength;
  }

  if (!json) {
    throw new Error('GLB payload did not contain a JSON chunk.');
  }
  return { json, bin };
};

const readAccessorBounds = (
  json: GlbJson,
  bin: Uint8Array<ArrayBufferLike>,
  accessorIndex: number,
): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } => {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`POSITION accessor ${accessorIndex} is missing.`);
  }
  if (accessor.min && accessor.max) {
    return {
      min: [accessor.min[0] ?? 0, accessor.min[1] ?? 0, accessor.min[2] ?? 0],
      max: [accessor.max[0] ?? 0, accessor.max[1] ?? 0, accessor.max[2] ?? 0],
    };
  }
  if (accessor.componentType !== FLOAT || accessor.type !== 'VEC3' || accessor.bufferView === undefined) {
    throw new Error('POSITION accessor lacks min/max and is not a float VEC3 accessor.');
  }

  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    throw new Error(`POSITION bufferView ${accessor.bufferView} is missing.`);
  }

  const stride = bufferView.byteStride ?? 12;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count ?? 0;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  let min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < count; index += 1) {
    const offset = start + index * stride;
    const point: [number, number, number] = [
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
    ];
    min = vectorMin(min, point);
    max = vectorMax(max, point);
  }
  return { min, max };
};

export const summarizeGlb = (bytes: Uint8Array<ArrayBufferLike>): GlbSummary => {
  const { json, bin } = parseGlb(bytes);
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (primitives.length === 0) {
    throw new Error('Expected at least one GLB primitive.');
  }

  let min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const primitive of primitives) {
    const position = primitive.attributes?.POSITION;
    if (position === undefined) {
      throw new Error('Expected every GLB primitive to have POSITION attributes.');
    }
    const bounds = readAccessorBounds(json, bin, position);
    min = vectorMin(min, bounds.min);
    max = vectorMax(max, bounds.max);
  }

  return {
    bytes: bytes.byteLength,
    meshes: json.meshes?.length ?? 0,
    primitives: primitives.length,
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
};
