import type { AnyShape } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { SetRequired } from 'type-fest';
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
export type Meshable = SetRequired<AnyShape, 'mesh' | 'meshEdges'>;

/**
 */
export type ReplicadShapeIdentityInfo = {
  prototypeHash: string;
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
 */
export type ReplicadTessellationInstance = {
  name: string;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  locationMatrix: ReplicadShapeIdentityInfo['locationMatrix'];
  determinant: number;
  faceIds?: number[];
  edgeIds?: number[];
};

type ReplicadInstancingOc = OpenCascadeInstance & {
  wasmMemory: WebAssembly.Memory;
};

/* eslint-disable @typescript-eslint/naming-convention -- OCJS embind mirrors C++ PascalCase method names. */
type ReplicadInstancingBindings = {
  ReplicadShapeIdentity?: {
    Inspect(shape: unknown): NativeShapeIdentity;
  };
  ReplicadPrototypeMeshExtractor?: {
    ExtractFaces(shape: unknown, tolerance: number, angularTolerance: number, skipNormals: boolean): NativeFaceMesh;
    ExtractEdges(shape: unknown, tolerance: number, angularTolerance: number): NativeEdgeMesh;
    ExtractFaceIds(shape: unknown): NativeIdArray;
    ExtractEdgeIds(shape: unknown, tolerance: number, angularTolerance: number): NativeIdArray;
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

type NativeIdArray = {
  getIdsPtr(): number;
  getIdsSize(): number;
  delete(): void;
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

type ExtractTopologyIdsOptions = {
  openCascade: OpenCascadeInstance;
  shape: Meshable;
  tessellation?: Tessellation;
};

type TransformReplicadGeometryInstanceOptions = {
  prototype: GeometryReplicad;
  instance: ReplicadTessellationInstance;
};

type Point3 = readonly [number, number, number];
type MatrixTransform = (matrix: readonly number[], point: Point3) => [number, number, number];

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

function readFloat64Array(openCascade: ReplicadInstancingOc, pointer: number, size: number): number[] {
  if (size === 0) {
    return [];
  }

  const heap = new Float64Array(openCascade.wasmMemory.buffer);
  return [...heap.subarray(pointer / 8, pointer / 8 + size)];
}

function readUint32Array(openCascade: ReplicadInstancingOc, pointer: number, size: number): number[] {
  if (size === 0) {
    return [];
  }

  const heap = new Uint32Array(openCascade.wasmMemory.buffer);
  return [...heap.subarray(pointer / 4, pointer / 4 + size)];
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
 */
export function extractInstanceFaceIds({ openCascade, shape }: ExtractTopologyIdsOptions): number[] {
  const oc = asInstancingOc(openCascade);
  const extractor = asInstancingBindings(openCascade).ReplicadPrototypeMeshExtractor;
  if (!extractor) {
    throw new Error(
      'Replicad tessellation instancing bindings are unavailable: ReplicadPrototypeMeshExtractor is missing',
    );
  }

  const raw = extractor.ExtractFaceIds(shapeHandle(shape));
  try {
    return readInt32Array(oc, raw.getIdsPtr(), raw.getIdsSize());
  } finally {
    raw.delete();
  }
}

/**
 */
export function extractInstanceEdgeIds({ openCascade, shape, tessellation }: ExtractTopologyIdsOptions): number[] {
  if (!tessellation) {
    return [];
  }

  const oc = asInstancingOc(openCascade);
  const extractor = asInstancingBindings(openCascade).ReplicadPrototypeMeshExtractor;
  if (!extractor) {
    throw new Error(
      'Replicad tessellation instancing bindings are unavailable: ReplicadPrototypeMeshExtractor is missing',
    );
  }

  const raw = extractor.ExtractEdgeIds(
    shapeHandle(shape),
    tessellation.linearTolerance,
    angularToleranceToRad(tessellation),
  );
  try {
    return readInt32Array(oc, raw.getIdsPtr(), raw.getIdsSize());
  } finally {
    raw.delete();
  }
}

function transformPoint(matrix: readonly number[], [x, y, z]: Point3): [number, number, number] {
  return [
    (matrix[0] ?? 0) * x + (matrix[1] ?? 0) * y + (matrix[2] ?? 0) * z + (matrix[3] ?? 0),
    (matrix[4] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[6] ?? 0) * z + (matrix[7] ?? 0),
    (matrix[8] ?? 0) * x + (matrix[9] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[11] ?? 0),
  ];
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

function transformTriplets(values: number[], matrix: readonly number[], transform: MatrixTransform): number[] {
  const transformed: number[] = [];
  for (let index = 0; index < values.length; index += 3) {
    const [x, y, z] = transform(matrix, [values[index] ?? 0, values[index + 1] ?? 0, values[index + 2] ?? 0]);
    transformed.push(Math.fround(x), Math.fround(y), Math.fround(z));
  }
  return transformed;
}

function transformNormals(values: number[], matrix: readonly number[]): number[] {
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
    return values.map((value) => Math.fround(value));
  }

  return transformTriplets(values, normals, transformVector);
}

function transformTriangles(triangles: number[], determinant: number): number[] {
  if (determinant >= 0) {
    return [...triangles];
  }

  const transformed: number[] = [];
  for (let index = 0; index < triangles.length; index += 3) {
    transformed.push(triangles[index] ?? 0, triangles[index + 2] ?? 0, triangles[index + 1] ?? 0);
  }
  return transformed;
}

function applyFaceIds(
  groups: GeometryReplicad['faces']['faceGroups'],
  ids: number[] | undefined,
): GeometryReplicad['faces']['faceGroups'] {
  if (!ids) {
    return groups.map((group) => ({ ...group }));
  }

  if (ids.length !== groups.length) {
    throw new Error(
      `Replicad tessellation instancing face ID count mismatch: expected ${groups.length}, received ${ids.length}`,
    );
  }

  return groups.map((group, index) => ({
    ...group,
    faceId: ids[index]!,
  }));
}

function applyEdgeIds(
  groups: GeometryReplicad['edges']['edgeGroups'],
  ids: number[] | undefined,
): GeometryReplicad['edges']['edgeGroups'] {
  if (!ids) {
    return groups.map((group) => ({ ...group }));
  }

  if (ids.length !== groups.length) {
    throw new Error(
      `Replicad tessellation instancing edge ID count mismatch: expected ${groups.length}, received ${ids.length}`,
    );
  }

  return groups.map((group, index) => ({
    ...group,
    edgeId: ids[index]!,
  }));
}

/**
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
    faces: {
      vertices: transformTriplets(prototype.faces.vertices, instance.locationMatrix, transformPoint),
      normals: transformNormals(prototype.faces.normals, instance.locationMatrix),
      triangles: transformTriangles(prototype.faces.triangles, instance.determinant),
      faceGroups: applyFaceIds(prototype.faces.faceGroups, instance.faceIds),
    },
    edges: {
      lines: transformTriplets(prototype.edges.lines, instance.locationMatrix, transformPoint),
      edgeGroups: applyEdgeIds(prototype.edges.edgeGroups, instance.edgeIds),
    },
  };
}

/* oxlint-enable new-cap -- Restore constructor naming checks outside the OCJS embind bridge. */
