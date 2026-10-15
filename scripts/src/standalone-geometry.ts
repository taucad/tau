/**
 * Mesh measurements for the standalone-project oracle (`check-standalone-project.ts`): the enclosed volume of a
 * binary or ASCII STL, or of a binary glTF scene, in cubic millimetres, and the comparison against Tau's export.
 *
 * STL carries no unit; every exporter the oracle reads (Tau, OpenSCAD, build123d, PicoGK, Zoo) writes millimetres.
 * glTF is metres by specification, so a GLB volume is scaled by 1e9.
 */

/** A watertight mesh's measurements: its signed enclosed volume and its axis-aligned bounds. */
export type MeshMeasure = {
  readonly format: 'stl' | 'glb';
  readonly triangles: number;
  /** Enclosed volume in mm³ (positive for outward-facing triangles). */
  readonly volume: number;
  /** Bounding box minimum and maximum in the file's own axes and unit (mm for STL, m for glTF). */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
};

type Vector = [number, number, number];
type Matrix = readonly number[];

/** The relative volume tolerance the charter's standalone bar sets (D34, E4). */
export const volumeTolerance = 1e-6;

const identity: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4×4 product `a · b`, as glTF stores matrices. */
const multiply = (a: Matrix, b: Matrix): Matrix => {
  const out = Array.from({ length: 16 }, () => 0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      }
      out[column * 4 + row] = sum;
    }
  }
  return out;
};

/** A glTF node's local matrix from `matrix`, or from translation, rotation (quaternion) and scale. */
const localMatrix = (node: GltfNode): Matrix => {
  if (node.matrix !== undefined) {
    return node.matrix;
  }
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
};

const transform = (m: Matrix, [x, y, z]: Vector): Vector => [
  (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
  (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
  (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
];

/** Accumulates triangles into a volume (divergence theorem) and bounds. */
class Accumulator {
  public triangles = 0;
  public sixVolume = 0;
  public readonly min: Vector = [Infinity, Infinity, Infinity];
  public readonly max: Vector = [-Infinity, -Infinity, -Infinity];

  public add(a: Vector, b: Vector, c: Vector): void {
    this.triangles += 1;
    this.sixVolume +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    for (const point of [a, b, c]) {
      for (let axis = 0; axis < 3; axis += 1) {
        this.min[axis] = Math.min(this.min[axis] ?? Infinity, point[axis] ?? 0);
        this.max[axis] = Math.max(this.max[axis] ?? -Infinity, point[axis] ?? 0);
      }
    }
  }

  public measure(format: MeshMeasure['format'], unitCubed: number): MeshMeasure {
    return {
      format,
      triangles: this.triangles,
      volume: (this.sixVolume / 6) * unitCubed,
      min: [...this.min],
      max: [...this.max],
    };
  }
}

/**
 * Measure an STL file, binary or ASCII.
 * @param bytes - The file.
 * @returns Its measurements, in millimetres.
 */
export const measureStl = (bytes: Uint8Array<ArrayBuffer>): MeshMeasure => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const accumulator = new Accumulator();
  const count = bytes.byteLength >= 84 ? view.getUint32(80, true) : -1;
  if (count >= 0 && bytes.byteLength === 84 + 50 * count) {
    const point = (offset: number): Vector => [
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
    ];
    for (let index = 0; index < count; index += 1) {
      const offset = 84 + 50 * index + 12;
      accumulator.add(point(offset), point(offset + 12), point(offset + 24));
    }
    return accumulator.measure('stl', 1);
  }
  const text = new TextDecoder().decode(bytes);
  if (!text.trimStart().startsWith('solid')) {
    throw new Error(`Not an STL file: ${bytes.byteLength} bytes, neither binary nor ASCII.`);
  }
  const vertices = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/gu)].map(
    (match): Vector => [Number(match[1]), Number(match[2]), Number(match[3])],
  );
  for (let index = 0; index + 2 < vertices.length; index += 3) {
    accumulator.add(vertices[index] ?? [0, 0, 0], vertices[index + 1] ?? [0, 0, 0], vertices[index + 2] ?? [0, 0, 0]);
  }
  return accumulator.measure('stl', 1);
};

type GltfNode = {
  readonly mesh?: number;
  readonly children?: readonly number[];
  readonly matrix?: Matrix;
  readonly translation?: Vector;
  readonly rotation?: readonly [number, number, number, number];
  readonly scale?: Vector;
};

type GltfAccessor = {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
};

type Gltf = {
  readonly scene?: number;
  readonly scenes?: ReadonlyArray<{ readonly nodes?: readonly number[] }>;
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: ReadonlyArray<{
    readonly primitives: ReadonlyArray<{
      readonly mode?: number;
      readonly indices?: number;
      readonly attributes: Readonly<Record<string, number>>;
    }>;
  }>;
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: ReadonlyArray<{ readonly byteOffset?: number; readonly byteStride?: number }>;
  readonly extensionsRequired?: readonly string[];
};

const componentSizes: Readonly<Record<number, number>> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

/** One glTF accessor component: an unsigned byte, short or int index, or a float. */
const readComponent = (view: DataView, componentType: number, offset: number): number => {
  switch (componentType) {
    case 5121: {
      return view.getUint8(offset);
    }
    case 5123: {
      return view.getUint16(offset, true);
    }
    case 5125: {
      return view.getUint32(offset, true);
    }
    default: {
      return view.getFloat32(offset, true);
    }
  }
};

/**
 * Measure the default scene of a binary glTF: every triangle primitive under its node's world transform.
 * @param bytes - The GLB.
 * @returns Its measurements, the volume in mm³ and the bounds in metres.
 */
export const measureGlb = (bytes: Uint8Array<ArrayBuffer>): MeshMeasure => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46_54_6c_67) {
    throw new Error('Not a binary glTF file.');
  }
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  if ((gltf.extensionsRequired ?? []).length > 0) {
    throw new Error(`Compressed or extended glTF is not measured: ${(gltf.extensionsRequired ?? []).join(', ')}.`);
  }
  const binary = 20 + jsonLength + 8;
  const read = (accessorIndex: number, element: number, component: number): number => {
    const accessor = gltf.accessors?.[accessorIndex];
    const bufferView = gltf.bufferViews?.[accessor?.bufferView ?? -1];
    if (accessor === undefined || bufferView === undefined) {
      throw new Error(`glTF accessor ${accessorIndex} has no buffer view.`);
    }
    const size = componentSizes[accessor.componentType] ?? 4;
    const width = accessor.type === 'VEC3' ? 3 : 1;
    const stride = bufferView.byteStride ?? size * width;
    const offset =
      binary + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + element * stride + component * size;
    return readComponent(view, accessor.componentType, offset);
  };
  const accumulator = new Accumulator();
  type Primitive = NonNullable<Gltf['meshes']>[number]['primitives'][number];
  const addPrimitive = (primitive: Primitive, world: Matrix): void => {
    const position = primitive.attributes['POSITION'];
    if ((primitive.mode ?? 4) !== 4 || position === undefined) {
      return;
    }
    const { indices } = primitive;
    const vertexCount = gltf.accessors?.[position]?.count ?? 0;
    const indexCount = indices === undefined ? vertexCount : (gltf.accessors?.[indices]?.count ?? 0);
    const vertex = (corner: number): Vector => {
      const index = indices === undefined ? corner : read(indices, corner, 0);
      return transform(world, [read(position, index, 0), read(position, index, 1), read(position, index, 2)]);
    };
    for (let corner = 0; corner + 2 < indexCount; corner += 3) {
      accumulator.add(vertex(corner), vertex(corner + 1), vertex(corner + 2));
    }
  };
  const visit = (nodeIndex: number, parent: Matrix): void => {
    const node = gltf.nodes?.[nodeIndex];
    if (node === undefined) {
      return;
    }
    const world = multiply(parent, localMatrix(node));
    for (const primitive of gltf.meshes?.[node.mesh ?? -1]?.primitives ?? []) {
      addPrimitive(primitive, world);
    }
    for (const child of node.children ?? []) {
      visit(child, world);
    }
  };
  for (const root of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) {
    visit(root, identity);
  }
  // The glTF positions are metres.
  return accumulator.measure('glb', 1e9);
};

/**
 * Measure a mesh file by its extension.
 * @param name - The file name.
 * @param bytes - The file.
 * @returns Its measurements.
 */
export const measureMesh = (name: string, bytes: Uint8Array<ArrayBuffer>): MeshMeasure => {
  if (name.endsWith('.glb')) {
    return measureGlb(bytes);
  }
  if (name.endsWith('.stl')) {
    return measureStl(bytes);
  }
  throw new Error(`No mesh measurement for ${name}.`);
};

/** The verdict of one native run against Tau's export of the same project. */
export type VolumeComparison = {
  readonly pass: boolean;
  readonly tau: MeshMeasure;
  readonly native: MeshMeasure;
  /** `|native − tau| / max(|native|, |tau|)`. */
  readonly relativeDifference: number;
};

/**
 * Compare a native run's mesh with Tau's: the same enclosed volume within {@link volumeTolerance}, and not empty.
 * @param tau - Tau's export.
 * @param native - The native run's output.
 * @returns The verdict with both measurements.
 */
export const compareVolumes = (tau: MeshMeasure, native: MeshMeasure): VolumeComparison => {
  const scale = Math.max(Math.abs(tau.volume), Math.abs(native.volume));
  const relativeDifference = scale === 0 ? 0 : Math.abs(native.volume - tau.volume) / scale;
  return {
    pass: scale > 0 && tau.triangles > 0 && native.triangles > 0 && relativeDifference <= volumeTolerance,
    tau,
    native,
    relativeDifference,
  };
};
