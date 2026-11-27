import type { GlbMaterial } from '@taucad/geometry-core';
import type { AnyShape } from 'replicad';
import type { OpenCascadeInstance, TopoDS_Shape } from 'replicad-opencascadejs';
import type { GeometryReplicad } from '#replicad.types.js';

/* oxlint-disable new-cap -- OCJS embind exposes C++ PascalCase methods as callable JavaScript functions. */

/**
 */
export type Tessellation = {
  linearTolerance: number;
  angularTolerance: number;
};

/**
 */
// Spelled without `type-fest`: the kernel's context type reaches this, and a `type-fest` type in it would make the
// declaration bundler ship a copy of `type-fest` in `dist/node_modules`.
export type Meshable = AnyShape & Required<Pick<AnyShape, 'mesh' | 'meshEdges'>>;

/**
 * Where one occurrence of a shape sits: the key shared by its OCCT partners (same `TShape`), its orientation and its
 * placement. Reading it never serializes or hashes BRep content.
 */
export type ReplicadShapeOccurrenceInfo = {
  partnerKey: string;
  orientation: string;
  locationMatrix: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  determinant: number;
  canPrototypeMesh: boolean;
};

/**
 * Occurrence identity plus a content hash of the location-stripped BRep. The hash serializes the whole shape, so only
 * product reuse on export reads it; tessellation instancing groups by partner key alone.
 */
export type ReplicadShapeIdentityInfo = ReplicadShapeOccurrenceInfo & {
  prototypeHash: string;
};

/**
 * Reads the occurrence identity of one shape. Partner keys are comparable only between shapes read by the same reader.
 */
export type ReplicadOccurrenceReader = (shape: Meshable) => ReplicadShapeOccurrenceInfo;

/**
 */
export type ReplicadTessellationInstance = {
  name: string;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  material?: GlbMaterial;
  locationMatrix: ReplicadShapeIdentityInfo['locationMatrix'];
  determinant: number;
};

type ReplicadInstancingOc = OpenCascadeInstance & {
  wasmMemory: WebAssembly.Memory;
};

/* eslint-disable @typescript-eslint/naming-convention -- OCJS embind mirrors C++ PascalCase method names. */
type ReplicadInstancingBindings = {
  ReplicadShapeIdentity?: {
    Inspect(shape: unknown): NativeShapeIdentity;
    IsPartner(left: unknown, right: unknown): boolean;
  };
  ReplicadShapeHasher?: {
    HashCode(shape: unknown, upperBound: number): number;
  };
  ReplicadPrototypeMeshExtractor?: {
    ExtractFaces(shape: unknown, tolerance: number, angularTolerance: number, skipNormals: boolean): NativeFaceMesh;
    ExtractEdges(shape: unknown, tolerance: number, angularTolerance: number): NativeEdgeMesh;
  };
};

type NativeShapeIdentity = {
  PrototypeHash(): string;
  PartnerKey(): string;
  Orientation(): string;
  MatrixSize(): number;
  MatrixValue(index: number): number;
  Determinant(): number;
  CanPrototypeMesh(): boolean;
  delete(): void;
};
/* eslint-enable @typescript-eslint/naming-convention -- Restore Tau naming policy outside OCJS embind types. */

type NativeFaceMesh = {
  getVerticesPtr(): number;
  getVerticesSize(): number;
  getNormalsPtr(): number;
  getNormalsSize(): number;
  getTrianglesPtr(): number;
  getTrianglesSize(): number;
  getFaceGroupsPtr(): number;
  getFaceGroupsSize(): number;
  delete(): void;
};

type NativeEdgeMesh = {
  getLinesPtr(): number;
  getLinesSize(): number;
  getEdgeGroupsPtr(): number;
  getEdgeGroupsSize(): number;
  delete(): void;
};

type ReplicadInstancingOrientations = {
  TopAbs_Orientation: {
    TopAbs_FORWARD: unknown;
    TopAbs_REVERSED: unknown;
    TopAbs_INTERNAL: unknown;
    TopAbs_EXTERNAL: unknown;
  };
};

type InspectReplicadShapeIdentityOptions = {
  openCascade: OpenCascadeInstance;
  shape: Meshable;
};

type ExtractPrototypeFacesOptions = {
  openCascade: OpenCascadeInstance;
  shape: Meshable;
  tessellation: Tessellation;
};

type ExtractPrototypeEdgesOptions = {
  openCascade: OpenCascadeInstance;
  shape: Meshable;
  tessellation: Tessellation;
};

type TransformReplicadGeometryInstanceOptions = {
  prototype: GeometryReplicad;
  instance: ReplicadTessellationInstance;
};

type Point3 = readonly [number, number, number];

const angularToleranceToRad = (tessellation: Tessellation): number => tessellation.angularTolerance * (Math.PI / 180);

function asInstancingOc(openCascade: OpenCascadeInstance): ReplicadInstancingOc {
  return openCascade as ReplicadInstancingOc;
}

function asInstancingBindings(openCascade: OpenCascadeInstance): ReplicadInstancingBindings {
  return openCascade as unknown as ReplicadInstancingBindings;
}

function shapeHandle(shape: Meshable): unknown {
  return shape.wrapped;
}

/* Copies, not views: a later memory.grow() would detach a view. Kept at double precision so each instance transform rounds once. */
function readFloat64Array(openCascade: ReplicadInstancingOc, pointer: number, size: number): Float64Array {
  return new Float64Array(openCascade.wasmMemory.buffer).slice(pointer / 8, pointer / 8 + size);
}

function readUint32Array(openCascade: ReplicadInstancingOc, pointer: number, size: number): Uint32Array {
  return new Uint32Array(openCascade.wasmMemory.buffer).slice(pointer / 4, pointer / 4 + size);
}

function readInt32Array(openCascade: ReplicadInstancingOc, pointer: number, size: number): number[] {
  if (size === 0) {
    return [];
  }

  const heap = new Int32Array(openCascade.wasmMemory.buffer);
  return [...heap.subarray(pointer / 4, pointer / 4 + size)];
}

function readFaceGroups(
  openCascade: ReplicadInstancingOc,
  pointer: number,
  size: number,
): GeometryReplicad['faces']['faceGroups'] {
  const raw = readInt32Array(openCascade, pointer, size);
  const faceGroups: GeometryReplicad['faces']['faceGroups'] = [];
  for (let index = 0; index < raw.length; index += 3) {
    faceGroups.push({
      start: raw[index] ?? 0,
      count: raw[index + 1] ?? 0,
      faceId: raw[index + 2] ?? 0,
    });
  }
  return faceGroups;
}

function readEdgeGroups(
  openCascade: ReplicadInstancingOc,
  pointer: number,
  size: number,
): GeometryReplicad['edges']['edgeGroups'] {
  const raw = readInt32Array(openCascade, pointer, size);
  const edgeGroups: GeometryReplicad['edges']['edgeGroups'] = [];
  for (let index = 0; index < raw.length; index += 3) {
    edgeGroups.push({
      start: raw[index] ?? 0,
      count: raw[index + 1] ?? 0,
      edgeId: raw[index + 2] ?? 0,
    });
  }
  return edgeGroups;
}

/**
 */
export function inspectReplicadShapeIdentity({
  openCascade,
  shape,
}: InspectReplicadShapeIdentityOptions): ReplicadShapeIdentityInfo {
  const inspector = asInstancingBindings(openCascade).ReplicadShapeIdentity;
  if (!inspector) {
    throw new Error('Replicad tessellation instancing bindings are unavailable: ReplicadShapeIdentity is missing');
  }

  const raw = inspector.Inspect(shapeHandle(shape));
  try {
    const matrix: number[] = [];
    for (let index = 0; index < raw.MatrixSize(); index++) {
      matrix.push(raw.MatrixValue(index));
    }

    if (matrix.length !== 16) {
      throw new Error(`ReplicadShapeIdentity returned ${matrix.length} matrix values; expected 16`);
    }

    return {
      prototypeHash: raw.PrototypeHash(),
      partnerKey: raw.PartnerKey(),
      orientation: raw.Orientation(),
      locationMatrix: matrix as unknown as ReplicadShapeIdentityInfo['locationMatrix'],
      determinant: raw.Determinant(),
      canPrototypeMesh: raw.CanPrototypeMesh(),
    };
  } finally {
    raw.delete();
  }
}

/** `ReplicadShapeHasher`'s bound: the largest int32, as Replicad's own topology labels use. */
const partnerHashUpperBound = 2_147_483_647;

function emptyOccurrence(): ReplicadShapeOccurrenceInfo {
  return {
    partnerKey: '',
    orientation: 'unknown',
    locationMatrix: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    determinant: 0,
    canPrototypeMesh: false,
  };
}

function orientationName(openCascade: OpenCascadeInstance, orientation: unknown): string {
  const { TopAbs_Orientation: orientations } = openCascade as unknown as ReplicadInstancingOrientations;
  switch (orientation) {
    case orientations.TopAbs_FORWARD: {
      return 'forward';
    }
    case orientations.TopAbs_REVERSED: {
      return 'reversed';
    }
    case orientations.TopAbs_INTERNAL: {
      return 'internal';
    }
    case orientations.TopAbs_EXTERNAL: {
      return 'external';
    }
    default: {
      return 'unknown';
    }
  }
}

function readLocationMatrix(handle: TopoDS_Shape): ReplicadShapeOccurrenceInfo['locationMatrix'] {
  const location = handle.Location();
  try {
    const transformation = location.Transformation();
    try {
      const matrix: number[] = [];
      for (let row = 1; row <= 3; row++) {
        for (let column = 1; column <= 4; column++) {
          matrix.push(transformation.Value(row, column));
        }
      }
      matrix.push(0, 0, 0, 1);
      return matrix as unknown as ReplicadShapeOccurrenceInfo['locationMatrix'];
    } finally {
      transformation.delete();
    }
  } finally {
    location.delete();
  }
}

/* The expansion and operand order of OCCT's gp_Mat::Determinant over the vectorial part, so the value is bit-equal. */
function vectorialDeterminant(matrix: ReplicadShapeOccurrenceInfo['locationMatrix']): number {
  const [m00, m01, m02, , m10, m11, m12, , m20, m21, m22] = matrix;
  return m00 * (m11 * m22 - m21 * m12) - m01 * (m10 * m22 - m20 * m12) + m02 * (m10 * m21 - m20 * m11);
}

/**
 * Partner keys of native shapes: equal exactly when two shapes share a `TShape`. Each shape is hashed at the identity
 * location (`TShape` only; the hasher ignores orientation) and confirmed with `IsPartner` against the representatives
 * seen with that hash, so a hash collision gets its own key. No BRep is serialized.
 */
export type ReplicadPartnerTable = {
  /** The partner key of a non-null handle. */
  keyOf(handle: TopoDS_Shape): string;
  /** Forgets a partner, deleting its representative when the table owns it. */
  forget(key: string): void;
  /** Forgets every partner. */
  dispose(): void;
};

/**
 * Creates a partner table. A borrowing table keeps the shapes it was shown as representatives, so drop it before those
 * shapes are deleted. An owning table keeps its own alias of each representative (the same `TShape` at the identity
 * location), so a key stays valid across renders: the `TShape` cannot be freed and its address reused while the table
 * holds it.
 *
 * @param openCascade - The OpenCascade instance whose Replicad identity bindings to use.
 * @param options - `owned`: keep an alias of each representative instead of borrowing the shape.
 * @returns The table.
 * @throws When the Replicad identity bindings are missing.
 */
export function createReplicadPartnerTable(
  openCascade: OpenCascadeInstance,
  { owned }: { owned: boolean },
): ReplicadPartnerTable {
  const { ReplicadShapeHasher: hasher, ReplicadShapeIdentity: identity } = asInstancingBindings(openCascade);
  if (!hasher) {
    throw new Error('Replicad tessellation instancing bindings are unavailable: ReplicadShapeHasher is missing');
  }
  if (!identity) {
    throw new Error('Replicad tessellation instancing bindings are unavailable: ReplicadShapeIdentity is missing');
  }

  type Representative = { readonly key: string; readonly shape: TopoDS_Shape };
  const buckets = new Map<number, { serial: number; representatives: Representative[] }>();
  const hashOfKey = new Map<string, number>();

  return {
    keyOf(handle) {
      const identityLocation = new openCascade.TopLoc_Location();
      let located: TopoDS_Shape | undefined;
      let hash: number;
      try {
        located = handle.Located(identityLocation, false);
        hash = hasher.HashCode(located, partnerHashUpperBound);
      } catch (error) {
        located?.delete();
        throw error;
      } finally {
        identityLocation.delete();
      }

      let bucket = buckets.get(hash);
      if (!bucket) {
        bucket = { serial: 0, representatives: [] };
        buckets.set(hash, bucket);
      }
      const found = bucket.representatives.find((representative) => identity.IsPartner(representative.shape, handle));
      if (found) {
        located.delete();
        return found.key;
      }
      const key = `${hash.toString(16)}.${String(bucket.serial++)}`;
      if (owned) {
        bucket.representatives.push({ key, shape: located });
      } else {
        located.delete();
        bucket.representatives.push({ key, shape: handle });
      }
      hashOfKey.set(key, hash);
      return key;
    },
    forget(key) {
      const hash = hashOfKey.get(key);
      if (hash === undefined) {
        return;
      }
      hashOfKey.delete(key);
      const bucket = buckets.get(hash)!;
      const index = bucket.representatives.findIndex((representative) => representative.key === key);
      const [removed] = bucket.representatives.splice(index, 1);
      if (owned) {
        removed?.shape.delete();
      }
      if (bucket.representatives.length === 0) {
        buckets.delete(hash);
      }
    },
    dispose() {
      for (const key of hashOfKey.keys()) {
        this.forget(key);
      }
    },
  };
}

/**
 * Creates a reader of occurrence identity. Without a partner table it borrows the shapes it reads as partner
 * representatives for one render, so drop it before those shapes are deleted.
 *
 * @param openCascade - The OpenCascade instance whose Replicad identity bindings to use.
 * @param partners - The partner table keys come from; by default a borrowing table of this reader's own.
 * @returns A reader whose partner keys are equal exactly when two shapes share a `TShape`.
 * @throws When the Replicad identity bindings are missing.
 */
export function createReplicadOccurrenceReader(
  openCascade: OpenCascadeInstance,
  partners: ReplicadPartnerTable = createReplicadPartnerTable(openCascade, { owned: false }),
): ReplicadOccurrenceReader {
  return (shape) => {
    const handle = shapeHandle(shape) as TopoDS_Shape;
    if (handle.IsNull()) {
      return emptyOccurrence();
    }

    const locationMatrix = readLocationMatrix(handle);
    return {
      partnerKey: partners.keyOf(handle),
      orientation: orientationName(openCascade, handle.Orientation()),
      locationMatrix,
      determinant: vectorialDeterminant(locationMatrix),
      canPrototypeMesh: true,
    };
  };
}

/**
 */
export function extractPrototypeFaces({
  openCascade,
  shape,
  tessellation,
}: ExtractPrototypeFacesOptions): GeometryReplicad['faces'] {
  const oc = asInstancingOc(openCascade);
  const extractor = asInstancingBindings(openCascade).ReplicadPrototypeMeshExtractor;
  if (!extractor) {
    throw new Error(
      'Replicad tessellation instancing bindings are unavailable: ReplicadPrototypeMeshExtractor is missing',
    );
  }

  const raw = extractor.ExtractFaces(
    shapeHandle(shape),
    tessellation.linearTolerance,
    angularToleranceToRad(tessellation),
    false,
  );
  try {
    return {
      vertices: readFloat64Array(oc, raw.getVerticesPtr(), raw.getVerticesSize()),
      normals: readFloat64Array(oc, raw.getNormalsPtr(), raw.getNormalsSize()),
      triangles: readUint32Array(oc, raw.getTrianglesPtr(), raw.getTrianglesSize()),
      faceGroups: readFaceGroups(oc, raw.getFaceGroupsPtr(), raw.getFaceGroupsSize()),
    };
  } finally {
    raw.delete();
  }
}

/**
 */
export function extractPrototypeEdges({
  openCascade,
  shape,
  tessellation,
}: ExtractPrototypeEdgesOptions): GeometryReplicad['edges'] {
  const oc = asInstancingOc(openCascade);
  const extractor = asInstancingBindings(openCascade).ReplicadPrototypeMeshExtractor;
  if (!extractor) {
    throw new Error(
      'Replicad tessellation instancing bindings are unavailable: ReplicadPrototypeMeshExtractor is missing',
    );
  }

  const raw = extractor.ExtractEdges(
    shapeHandle(shape),
    tessellation.linearTolerance,
    angularToleranceToRad(tessellation),
  );
  try {
    return {
      lines: readFloat64Array(oc, raw.getLinesPtr(), raw.getLinesSize()),
      edgeGroups: readEdgeGroups(oc, raw.getEdgeGroupsPtr(), raw.getEdgeGroupsSize()),
    };
  } finally {
    raw.delete();
  }
}

/**
 * Points placed by a location matrix, rounded once to single precision. The products are summed in the order OCCT's
 * `gp_Trsf` value matrix is applied, `((m0 x + m1 y) + m2 z) + m3`, so a placement gives the same values a world-space
 * mesh does; the loop allocates nothing per point.
 * @param values - Points as x, y, z triplets.
 * @param matrix - Row-major 3x4 (or 4x4) location matrix.
 * @returns The placed points.
 */
function transformPoints(values: ArrayLike<number>, matrix: readonly number[]): Float32Array {
  const [m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0, m9 = 0, m10 = 0, m11 = 0] = matrix;
  const transformed = new Float32Array(values.length - (values.length % 3));
  for (let index = 0; index < transformed.length; index += 3) {
    const x = values[index]!;
    const y = values[index + 1]!;
    const z = values[index + 2]!;
    transformed[index] = m0 * x + m1 * y + m2 * z + m3;
    transformed[index + 1] = m4 * x + m5 * y + m6 * z + m7;
    transformed[index + 2] = m8 * x + m9 * y + m10 * z + m11;
  }
  return transformed;
}

function normalMatrix(matrix: readonly number[]): readonly number[] {
  const a = matrix[0] ?? 0;
  const b = matrix[1] ?? 0;
  const c = matrix[2] ?? 0;
  const d = matrix[4] ?? 0;
  const center = matrix[5] ?? 0;
  const f = matrix[6] ?? 0;
  const g = matrix[8] ?? 0;
  const h = matrix[9] ?? 0;
  const i = matrix[10] ?? 0;
  const determinant = a * (center * i - f * h) - b * (d * i - f * g) + c * (d * h - center * g);
  if (Math.abs(determinant) < 1e-12) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  const inverseDeterminant = 1 / determinant;
  return [
    (center * i - f * h) * inverseDeterminant,
    (f * g - d * i) * inverseDeterminant,
    (d * h - center * g) * inverseDeterminant,
    (c * h - b * i) * inverseDeterminant,
    (a * i - c * g) * inverseDeterminant,
    (b * g - a * h) * inverseDeterminant,
    (b * f - c * center) * inverseDeterminant,
    (c * d - a * f) * inverseDeterminant,
    (a * center - b * d) * inverseDeterminant,
  ];
}

function transformVector(matrix: readonly number[], [x, y, z]: Point3): [number, number, number] {
  const nx = (matrix[0] ?? 0) * x + (matrix[1] ?? 0) * y + (matrix[2] ?? 0) * z;
  const ny = (matrix[3] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[5] ?? 0) * z;
  const nz = (matrix[6] ?? 0) * x + (matrix[7] ?? 0) * y + (matrix[8] ?? 0) * z;
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) {
    return [0, 0, 1];
  }
  return [nx / length, ny / length, nz / length];
}

/**
 * Unit vectors transformed by a 3x3 matrix and normalized, rounded once to single precision; a vector that vanishes
 * becomes +Z. The loop allocates nothing per vector.
 * @param values - Vectors as x, y, z triplets.
 * @param matrix - Row-major 3x3 matrix.
 * @returns The transformed vectors.
 */
function transformVectors(values: ArrayLike<number>, matrix: readonly number[]): Float32Array {
  const [m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0] = matrix;
  const transformed = new Float32Array(values.length - (values.length % 3));
  for (let index = 0; index < transformed.length; index += 3) {
    const x = values[index]!;
    const y = values[index + 1]!;
    const z = values[index + 2]!;
    const nx = m0 * x + m1 * y + m2 * z;
    const ny = m3 * x + m4 * y + m5 * z;
    const nz = m6 * x + m7 * y + m8 * z;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) {
      transformed[index] = 0;
      transformed[index + 1] = 0;
      transformed[index + 2] = 1;
      continue;
    }
    transformed[index] = nx / length;
    transformed[index + 1] = ny / length;
    transformed[index + 2] = nz / length;
  }
  return transformed;
}

function transformNormals(values: ArrayLike<number>, matrix: readonly number[]): Float32Array {
  const normals = normalMatrix(matrix);
  if (
    normals[0] === 1 &&
    normals[1] === 0 &&
    normals[2] === 0 &&
    normals[3] === 0 &&
    normals[4] === 1 &&
    normals[5] === 0 &&
    normals[6] === 0 &&
    normals[7] === 0 &&
    normals[8] === 1
  ) {
    return Float32Array.from(values);
  }

  return transformVectors(values, normals);
}

function transformTangents(values: number[] | undefined, instance: ReplicadTessellationInstance): number[] | undefined {
  if (!values) {
    return undefined;
  }
  const matrix = instance.locationMatrix;
  const linear = [matrix[0], matrix[1], matrix[2], matrix[4], matrix[5], matrix[6], matrix[8], matrix[9], matrix[10]];
  const output: number[] = [];
  for (let index = 0; index < values.length; index += 4) {
    output.push(
      ...transformVector(linear, [values[index]!, values[index + 1]!, values[index + 2]!]),
      values[index + 3]! * Math.sign(instance.determinant),
    );
  }
  return output;
}

function transformTriangles(triangles: Uint32Array, determinant: number): Uint32Array {
  const transformed = new Uint32Array(triangles);
  if (determinant < 0) {
    for (let index = 0; index + 2 < transformed.length; index += 3) {
      transformed[index + 1] = triangles[index + 2]!;
      transformed[index + 2] = triangles[index + 1]!;
    }
  }
  return transformed;
}

/**
 * One instance of a prototype: the prototype's mesh at the instance's placement. Face and edge groups are the
 * prototype's own (shared, never written downstream): the glTF packer numbers groups by index, so an instance needs no
 * labels of its own (catalogue N5).
 */
export function transformReplicadGeometryInstance({
  prototype,
  instance,
}: TransformReplicadGeometryInstanceOptions): GeometryReplicad {
  return {
    format: 'replicad',
    name: instance.name,
    color: instance.color,
    opacity: instance.opacity,
    metalness: instance.metalness,
    roughness: instance.roughness,
    material: instance.material,
    faces: {
      texCoords: prototype.faces.texCoords,
      tangents: transformTangents(prototype.faces.tangents, instance),
      vertices: transformPoints(prototype.faces.vertices, instance.locationMatrix),
      normals: transformNormals(prototype.faces.normals, instance.locationMatrix),
      triangles: transformTriangles(prototype.faces.triangles, instance.determinant),
      faceGroups: prototype.faces.faceGroups,
    },
    edges: {
      lines: transformPoints(prototype.edges.lines, instance.locationMatrix),
      edgeGroups: prototype.edges.edgeGroups,
    },
  };
}

/* oxlint-enable new-cap -- Restore constructor naming checks outside the OCJS embind bridge. */
