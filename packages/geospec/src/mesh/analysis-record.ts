import type { Document, Mesh } from '@gltf-transform/core';
import { weldPositions } from '#mesh/_internal/spatial-welding.js';
import type {
  AabbMeters,
  BoundingBoxStats,
  ClusterGap,
  ClusterReport,
  ConnectedComponentsResult,
  GeometryStats,
  MeshQualityStats,
  MeshTriangle,
  PrimitiveRecord,
  Vec3,
  WatertightPrimitiveBreakdown,
  WatertightResult,
} from '#mesh/types.js';

type Vec3Mutable = [number, number, number];
type TriangleIndex = [number, number, number];

type MeshQualityBase = Omit<MeshQualityStats, 'triangles'>;

export type MeshAnalysisPrimitiveRecord = {
  index: number;
  name: string;
  componentName: string;
  color?: string;
  vertexStart: number;
  vertexCount: number;
  triangleStart: number;
  triangleCount: number;
  vertices: number;
  aabb: AabbMeters;
};

export type MeshAnalysisSubPiece = {
  index: number;
  name: string;
  color?: string;
  vertices: number;
  triangleIndices: Uint32Array<ArrayBuffer>;
  aabb: AabbMeters;
};

export type MeshAnalysisWeldedPositions = {
  positionTuples: Vec3Mutable[];
  welded: Int32Array<ArrayBuffer>;
};

export type MeshComponentRecord = {
  id: number;
  label: string;
  color?: string;
  triangleIndices: Uint32Array<ArrayBuffer>;
  triangleCount: number;
  aabb: AabbMeters;
};

export type MeshComponentPartition = {
  source: 'named' | 'connected';
  componentIds: Int32Array<ArrayBuffer>;
  components: MeshComponentRecord[];
};

export type MeshTopologySummary = {
  watertight: boolean;
  manifoldForSolidAnalysis: boolean;
  irregularEdges: number;
  openBoundaryEdges: number;
  nonManifoldEdges: number;
  totalEdges: number;
  irregularEdgeFraction: number;
  boundaryCentroid: Vec3;
};

export type MeshAnalysisRecord = {
  vertexCount: number;
  meshCount: number;
  triangleCount: number;
  positions: Float64Array<ArrayBuffer>;
  triangleIndices: Uint32Array<ArrayBuffer>;
  trianglePrimitiveIndices: Uint32Array<ArrayBuffer>;
  primitives: MeshAnalysisPrimitiveRecord[];
  quality: MeshQualityBase;
  boundingBox?: Omit<BoundingBoxStats, 'primitives'>;
  topologySummary: MeshTopologySummary;
  getWeldedPositions(): MeshAnalysisWeldedPositions;
  getTriangles(): MeshTriangle[];
  getConnectedPieces(): MeshAnalysisSubPiece[];
  getConnectedComponents(toleranceMm: number): ConnectedComponentsResult;
  getWatertightResult(): WatertightResult;
  getComponentPartition(): MeshComponentPartition | undefined;
};

type MeshAnalysisRecordOwner = {
  [meshAnalysisRecordSymbol]?: MeshAnalysisRecord;
};

export const meshAnalysisRecordSymbol: unique symbol = Symbol('geospec.meshAnalysisRecord');

const triangleAreaTolerance = 1e-12;
const duplicatePrecision = 1e9;
const irregularEdgeTolerance = 0.01;

const emptyAabb = (): AabbMeters => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

const cloneVec3 = (value: readonly [number, number, number]): Vec3Mutable => [value[0], value[1], value[2]];

const expandAabb = (aabb: AabbMeters, point: readonly [number, number, number]): void => {
  for (let axis = 0; axis < 3; axis++) {
    aabb.min[axis] = Math.min(aabb.min[axis]!, point[axis]!);
    aabb.max[axis] = Math.max(aabb.max[axis]!, point[axis]!);
  }
};

const centerOfAabb = (aabb: AabbMeters): Vec3Mutable => [
  (aabb.min[0] + aabb.max[0]) / 2,
  (aabb.min[1] + aabb.max[1]) / 2,
  (aabb.min[2] + aabb.max[2]) / 2,
];

const sizeOfAabb = (aabb: AabbMeters): Vec3Mutable => [
  aabb.max[0] - aabb.min[0],
  aabb.max[1] - aabb.min[1],
  aabb.max[2] - aabb.min[2],
];

const subtract = (a: Vec3, b: Vec3): Vec3Mutable => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: Vec3, b: Vec3): Vec3Mutable => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const magnitude = (a: Vec3): number => Math.sqrt(dot(a, a));

const centerOfTriangle = (a: Vec3, b: Vec3, c: Vec3): Vec3Mutable => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

const tetrahedronCentroid = (a: Vec3, b: Vec3, c: Vec3): Vec3Mutable => [
  (a[0] + b[0] + c[0]) / 4,
  (a[1] + b[1] + c[1]) / 4,
  (a[2] + b[2] + c[2]) / 4,
];

const coordinateKey = (point: Vec3): string =>
  point.map((coordinate) => Math.round(coordinate * duplicatePrecision).toString()).join(',');

const triangleKey = (a: Vec3, b: Vec3, c: Vec3): string =>
  [coordinateKey(a), coordinateKey(b), coordinateKey(c)].sort().join('|');

const pointAt = (record: Pick<MeshAnalysisRecord, 'positions'>, vertexIndex: number): Vec3Mutable => {
  const offset = vertexIndex * 3;
  return [record.positions[offset]!, record.positions[offset + 1]!, record.positions[offset + 2]!];
};

const pointAtRaw = (positions: readonly number[], vertexIndex: number): Vec3Mutable => {
  const offset = vertexIndex * 3;
  return [positions[offset]!, positions[offset + 1]!, positions[offset + 2]!];
};

const triangleAt = (record: Pick<MeshAnalysisRecord, 'triangleIndices'>, triangleIndex: number): TriangleIndex => {
  const offset = triangleIndex * 3;
  return [record.triangleIndices[offset]!, record.triangleIndices[offset + 1]!, record.triangleIndices[offset + 2]!];
};

const baseColorToHex = (rgba: readonly number[] | undefined): string | undefined => {
  if (!rgba || rgba.length < 3) {
    return undefined;
  }
  const toByte = (c: number): number => Math.round(Math.min(255, Math.max(0, Math.floor(c <= 1 ? c * 255 : c))));
  const r = toByte(rgba[0]!);
  const g = toByte(rgba[1]!);
  const b = toByte(rgba[2]!);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

export const buildMeshNodeNameMap = (document: Document): Map<Mesh, string> => {
  const map = new Map<Mesh, string>();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const nodeName = node.getName().trim();
    if (mesh && nodeName && !map.has(mesh)) {
      map.set(mesh, nodeName);
    }
  }
  return map;
};

const meshDisplayBaseName = (
  mesh: Mesh,
  meshNodeNames: ReadonlyMap<Mesh, string>,
  meshOrdinal: number,
): { resolvedMeshName: string | undefined; fallbackName: string } => {
  const trimmedMeshName = mesh.getName().trim();
  if (trimmedMeshName !== '') {
    return { resolvedMeshName: trimmedMeshName, fallbackName: trimmedMeshName };
  }
  const nodeMappedName = meshNodeNames.get(mesh);
  if (nodeMappedName !== undefined && nodeMappedName !== '') {
    return { resolvedMeshName: nodeMappedName, fallbackName: nodeMappedName };
  }
  const fallbackName = `Shape_${meshOrdinal}`;
  return { resolvedMeshName: undefined, fallbackName };
};

const primitiveNames = (options: {
  resolvedMeshName: string | undefined;
  fallbackName: string;
  primitiveOrdinal: number;
}): { name: string; componentName: string } => {
  const qualityName = `${options.fallbackName}#${options.primitiveOrdinal}`;
  if (options.resolvedMeshName && options.resolvedMeshName.length > 0) {
    return { name: qualityName, componentName: options.resolvedMeshName };
  }
  return { name: qualityName, componentName: qualityName };
};

const makeEmptyTopologySummary = (): MeshTopologySummary => ({
  watertight: false,
  manifoldForSolidAnalysis: false,
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  totalEdges: 0,
  irregularEdgeFraction: 1,
  boundaryCentroid: [0, 0, 0],
});

const buildWeldedPositions = (positions: Float64Array<ArrayBuffer>): MeshAnalysisWeldedPositions => {
  const positionTuples: Vec3Mutable[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    positionTuples.push([positions[index]!, positions[index + 1]!, positions[index + 2]!]);
  }
  return {
    positionTuples,
    welded: new Int32Array(weldPositions(positionTuples)),
  };
};

const topologyFromTriangles = (options: {
  positions: Float64Array<ArrayBuffer>;
  triangleIndices: Uint32Array<ArrayBuffer>;
  triangleIndicesToClassify?: readonly number[];
  weldedPositions?: MeshAnalysisWeldedPositions;
}): MeshTopologySummary => {
  const triangleCount = options.triangleIndices.length / 3;
  const selected = options.triangleIndicesToClassify ?? Array.from({ length: triangleCount }, (_value, index) => index);
  if (selected.length === 0) {
    return makeEmptyTopologySummary();
  }

  const { positionTuples, welded } = options.weldedPositions ?? buildWeldedPositions(options.positions);
  const edgeCounts = new Map<string, number>();
  const addEdge = (leftRaw: number, rightRaw: number): void => {
    const left = welded[leftRaw]!;
    const right = welded[rightRaw]!;
    const key = left < right ? `${left},${right}` : `${right},${left}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  };

  for (const triangleIndex of selected) {
    const offset = triangleIndex * 3;
    const a = options.triangleIndices[offset]!;
    const b = options.triangleIndices[offset + 1]!;
    const c = options.triangleIndices[offset + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(a, c);
  }

  let irregularEdges = 0;
  let openBoundaryEdges = 0;
  let nonManifoldEdges = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const [key, count] of edgeCounts) {
    if (count !== 2) {
      irregularEdges += 1;
    }
    if (count === 1) {
      openBoundaryEdges += 1;
      const [left, right] = key.split(',').map((value) => Number.parseInt(value, 10));
      const a = positionTuples[left ?? 0] ?? [0, 0, 0];
      const b = positionTuples[right ?? 0] ?? [0, 0, 0];
      bx += (a[0] + b[0]) / 2;
      by += (a[1] + b[1]) / 2;
      bz += (a[2] + b[2]) / 2;
    } else if (count > 2) {
      nonManifoldEdges += 1;
    }
  }

  const totalEdges = edgeCounts.size;
  const irregularEdgeFraction = totalEdges > 0 ? irregularEdges / totalEdges : 0;
  return {
    watertight: irregularEdgeFraction <= irregularEdgeTolerance,
    manifoldForSolidAnalysis: irregularEdges === 0,
    irregularEdges,
    openBoundaryEdges,
    nonManifoldEdges,
    totalEdges,
    irregularEdgeFraction,
    boundaryCentroid:
      openBoundaryEdges > 0 ? [bx / openBoundaryEdges, by / openBoundaryEdges, bz / openBoundaryEdges] : [0, 0, 0],
  };
};

const buildPerPrimitiveBreakdowns = (record: MeshAnalysisRecord): WatertightPrimitiveBreakdown[] => {
  const perPrimitive = record.primitives.map((primitive) => {
    const triangleIndices = Array.from(
      { length: primitive.triangleCount },
      (_value, index) => primitive.triangleStart + index,
    );
    const summary = topologyFromTriangles({
      positions: record.positions,
      triangleIndices: record.triangleIndices,
      triangleIndicesToClassify: triangleIndices,
      weldedPositions: record.getWeldedPositions(),
    });
    return {
      name: primitive.componentName,
      boundaryEdges: summary.openBoundaryEdges,
      loopCentroid: cloneVec3(summary.boundaryCentroid),
    };
  });
  perPrimitive.sort((a, b) => b.boundaryEdges - a.boundaryEdges);
  return perPrimitive;
};

const buildMeshTriangles = (record: MeshAnalysisRecord): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  for (let triangleIndex = 0; triangleIndex < record.triangleCount; triangleIndex++) {
    const [ai, bi, ci] = triangleAt(record, triangleIndex);
    const a = pointAt(record, ai);
    const b = pointAt(record, bi);
    const c = pointAt(record, ci);
    const primitive = record.primitives[record.trianglePrimitiveIndices[triangleIndex]!]!;
    triangles.push({
      primitive: primitive.name,
      triangleIndex,
      a,
      b,
      c,
      center: centerOfTriangle(a, b, c),
      area: magnitude(cross(subtract(b, a), subtract(c, a))) / 2,
    });
  }
  return triangles;
};

const createMeshQualityStats = (record: MeshAnalysisRecord): MeshQualityStats => {
  const quality: MeshQualityStats = { ...record.quality, triangles: [] };
  Object.defineProperty(quality, 'triangles', {
    configurable: false,
    enumerable: true,
    get: () => record.getTriangles(),
  });
  return quality;
};

const toPrimitiveRecord = (primitive: MeshAnalysisPrimitiveRecord): PrimitiveRecord => ({
  name: primitive.componentName,
  color: primitive.color,
  vertices: primitive.vertices,
  aabb: { min: cloneVec3(primitive.aabb.min), max: cloneVec3(primitive.aabb.max) },
});

export const collectPrimitiveRecordsFromRecord = (record: MeshAnalysisRecord): PrimitiveRecord[] => {
  return record.primitives.map(toPrimitiveRecord);
};

export const collectConnectedPiecePrimitiveRecordsFromRecord = (record: MeshAnalysisRecord): PrimitiveRecord[] => {
  const pieces = record.getConnectedPieces();
  if (pieces.length > 0) {
    return pieces.map((piece) => ({
      name: piece.name,
      color: piece.color,
      vertices: piece.vertices,
      aabb: { min: cloneVec3(piece.aabb.min), max: cloneVec3(piece.aabb.max) },
    }));
  }
  return record.primitives.map(toPrimitiveRecord);
};

const createBoundingBoxStats = (record: MeshAnalysisRecord): BoundingBoxStats | undefined => {
  if (!record.boundingBox) {
    return undefined;
  }
  return {
    size: cloneVec3(record.boundingBox.size),
    center: cloneVec3(record.boundingBox.center),
    primitives: record.primitives.map(toPrimitiveRecord),
  };
};

const createWatertightResult = (record: MeshAnalysisRecord): WatertightResult => ({
  watertight: record.topologySummary.watertight,
  irregularEdges: record.topologySummary.irregularEdges,
  openBoundaryEdges: record.topologySummary.openBoundaryEdges,
  totalEdges: record.topologySummary.totalEdges,
  irregularEdgeFraction: record.topologySummary.irregularEdgeFraction,
  perPrimitive: buildPerPrimitiveBreakdowns(record),
});

const sortKeyForTriangles = (record: MeshAnalysisRecord, triangleIndices: readonly number[]): Vec3Mutable => {
  const min: Vec3Mutable = [Infinity, Infinity, Infinity];
  for (const triangleIndex of triangleIndices) {
    const tri = triangleAt(record, triangleIndex);
    for (const vertexIndex of tri) {
      const point = pointAt(record, vertexIndex);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!);
      }
    }
  }
  return min;
};

const buildSubPiecesForPrimitive = (
  record: MeshAnalysisRecord,
  primitive: MeshAnalysisPrimitiveRecord,
): MeshAnalysisSubPiece[] => {
  if (primitive.triangleCount === 0) {
    return [];
  }
  const { welded } = record.getWeldedPositions();
  const parent = new Uint32Array(primitive.triangleCount);
  for (let index = 0; index < primitive.triangleCount; index++) {
    parent[index] = index;
  }
  const find = (input: number): number => {
    let current = input;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[leftRoot] = rightRoot;
    }
  };
  const canonicalToLocalTriangles = new Map<number, number[]>();
  for (let localIndex = 0; localIndex < primitive.triangleCount; localIndex++) {
    const triangleIndex = primitive.triangleStart + localIndex;
    const tri = triangleAt(record, triangleIndex);
    for (const rawVertexIndex of tri) {
      const canonical = welded[rawVertexIndex]!;
      const list = canonicalToLocalTriangles.get(canonical) ?? [];
      list.push(localIndex);
      canonicalToLocalTriangles.set(canonical, list);
    }
  }
  for (const list of canonicalToLocalTriangles.values()) {
    for (let index = 1; index < list.length; index++) {
      union(list[0]!, list[index]!);
    }
  }

  const buckets = new Map<number, number[]>();
  for (let localIndex = 0; localIndex < primitive.triangleCount; localIndex++) {
    const root = find(localIndex);
    const list = buckets.get(root) ?? [];
    list.push(primitive.triangleStart + localIndex);
    buckets.set(root, list);
  }
  const groups = [...buckets.values()];
  groups.sort((left, right) => {
    const leftKey = sortKeyForTriangles(record, left);
    const rightKey = sortKeyForTriangles(record, right);
    for (let axis = 0; axis < 3; axis++) {
      if (leftKey[axis] !== rightKey[axis]) {
        return leftKey[axis]! - rightKey[axis]!;
      }
    }
    return 0;
  });

  return groups.map((triangleGroup, partIndex) => {
    const aabb = emptyAabb();
    const uniqueVertices = new Set<number>();
    for (const triangleIndex of triangleGroup) {
      const tri = triangleAt(record, triangleIndex);
      for (const rawVertexIndex of tri) {
        uniqueVertices.add(welded[rawVertexIndex]!);
        expandAabb(aabb, pointAt(record, rawVertexIndex));
      }
    }
    return {
      index: -1,
      name: groups.length === 1 ? primitive.componentName : `${primitive.componentName}#part${partIndex}`,
      color: primitive.color,
      vertices: uniqueVertices.size,
      triangleIndices: new Uint32Array(triangleGroup),
      aabb,
    };
  });
};

const buildConnectedPieces = (record: MeshAnalysisRecord): MeshAnalysisSubPiece[] => {
  const pieces: MeshAnalysisSubPiece[] = [];
  for (const primitive of record.primitives) {
    for (const piece of buildSubPiecesForPrimitive(record, primitive)) {
      pieces.push({ ...piece, index: pieces.length });
    }
  }
  return pieces;
};

const aabbsOverlapWithin = (left: AabbMeters, right: AabbMeters, tolerance: number): boolean => {
  for (let axis = 0; axis < 3; axis++) {
    if (left.max[axis]! + tolerance < right.min[axis]!) {
      return false;
    }
    if (right.max[axis]! + tolerance < left.min[axis]!) {
      return false;
    }
  }
  return true;
};

const linfSeparation = (left: AabbMeters, right: AabbMeters): { gapM: number; axis: 'x' | 'y' | 'z' } => {
  const axes = ['x', 'y', 'z'] as const;
  let maxGap = 0;
  let axis: 'x' | 'y' | 'z' = 'x';
  for (let index = 0; index < 3; index++) {
    const gap = Math.max(0, Math.max(right.min[index]! - left.max[index]!, left.min[index]! - right.max[index]!));
    if (gap > maxGap) {
      maxGap = gap;
      axis = axes[index]!;
    }
  }
  return { gapM: maxGap, axis };
};

const unionAabb = (pieces: readonly MeshAnalysisSubPiece[]): AabbMeters => {
  const aabb = emptyAabb();
  for (const piece of pieces) {
    expandAabb(aabb, piece.aabb.min);
    expandAabb(aabb, piece.aabb.max);
  }
  return aabb;
};

const clusterLabelsFromIndex = (index: number): string => String.fromCodePoint('A'.codePointAt(0)! + index);

const toClusterReport = (label: string, pieces: readonly MeshAnalysisSubPiece[]): ClusterReport => {
  const aabb = unionAabb(pieces);
  return {
    label,
    primitives: pieces.map((piece) => ({
      name: piece.name,
      color: piece.color,
      vertices: piece.vertices,
      aabb: { min: cloneVec3(piece.aabb.min), max: cloneVec3(piece.aabb.max) },
    })),
    aabb: { min: cloneVec3(aabb.min), max: cloneVec3(aabb.max) },
    centroid: centerOfAabb(aabb),
    totalVertices: pieces.reduce((sum, piece) => sum + piece.vertices, 0),
  };
};

const minimumSeparationAcrossPieces = (
  leftPieces: readonly MeshAnalysisSubPiece[],
  rightPieces: readonly MeshAnalysisSubPiece[],
): { gapM: number; axis: 'x' | 'y' | 'z'; fromPrimitive: string; toPrimitive: string } => {
  let bestGapM = Infinity;
  let bestAxis: 'x' | 'y' | 'z' = 'x';
  let bestFrom = leftPieces[0]?.name ?? '';
  let bestTo = rightPieces[0]?.name ?? '';
  for (const left of leftPieces) {
    for (const right of rightPieces) {
      const { axis, gapM } = linfSeparation(left.aabb, right.aabb);
      if (gapM < bestGapM) {
        bestGapM = gapM;
        bestAxis = axis;
        bestFrom = left.name;
        bestTo = right.name;
      }
    }
  }
  return { gapM: bestGapM, axis: bestAxis, fromPrimitive: bestFrom, toPrimitive: bestTo };
};

const createConnectedComponents = (record: MeshAnalysisRecord, toleranceMm: number): ConnectedComponentsResult => {
  const tolerance = toleranceMm / 1000;
  const pieces = record.getConnectedPieces();
  if (pieces.length === 0) {
    return { count: 0, clusters: [], gaps: [] };
  }
  const parent = pieces.map((_, index) => index);
  const find = (input: number): number => {
    let current = input;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[leftRoot] = rightRoot;
    }
  };

  const sorted = [...pieces].sort((left, right) => left.aabb.min[0] - right.aabb.min[0]);
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex++) {
    const left = sorted[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex++) {
      const right = sorted[rightIndex]!;
      if (right.aabb.min[0] > left.aabb.max[0] + tolerance) {
        break;
      }
      if (aabbsOverlapWithin(left.aabb, right.aabb, tolerance)) {
        union(left.index, right.index);
      }
    }
  }

  const buckets = new Map<number, MeshAnalysisSubPiece[]>();
  for (const piece of pieces) {
    const root = find(piece.index);
    const list = buckets.get(root) ?? [];
    list.push(piece);
    buckets.set(root, list);
  }
  const clusterPieces = [...buckets.values()];
  clusterPieces.sort((left, right) => {
    const leftVertices = left.reduce((sum, piece) => sum + piece.vertices, 0);
    const rightVertices = right.reduce((sum, piece) => sum + piece.vertices, 0);
    return rightVertices - leftVertices;
  });
  const clusters = clusterPieces.map((cluster, index) =>
    toClusterReport(
      clusterLabelsFromIndex(index),
      cluster.sort((left, right) => left.name.localeCompare(right.name)),
    ),
  );
  const gaps: ClusterGap[] = [];
  for (let leftIndex = 0; leftIndex < clusters.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex++) {
      const separation = minimumSeparationAcrossPieces(clusterPieces[leftIndex]!, clusterPieces[rightIndex]!);
      gaps.push({
        fromLabel: clusters[leftIndex]!.label,
        toLabel: clusters[rightIndex]!.label,
        axis: separation.axis,
        gapMm: separation.gapM * 1000,
        fromPrimitive: separation.fromPrimitive,
        toPrimitive: separation.toPrimitive,
      });
    }
  }
  gaps.sort((left, right) => left.gapMm - right.gapMm);
  return { count: clusters.length, clusters, gaps };
};

const buildNamedComponentPartition = (record: MeshAnalysisRecord): MeshComponentPartition | undefined => {
  const componentIds = new Int32Array(record.triangleCount);
  const labelToComponent = new Map<
    string,
    {
      id: number;
      label: string;
      color?: string;
      triangleIndices: number[];
      aabb: AabbMeters;
    }
  >();
  for (const primitive of record.primitives) {
    const label = primitive.componentName.trim();
    if (!label) {
      return undefined;
    }
    let component = labelToComponent.get(label);
    if (!component) {
      component = {
        id: labelToComponent.size,
        label,
        triangleIndices: [],
        aabb: emptyAabb(),
      };
      labelToComponent.set(label, component);
    }
    for (let offset = 0; offset < primitive.triangleCount; offset++) {
      const triangleIndex = primitive.triangleStart + offset;
      component.triangleIndices.push(triangleIndex);
      componentIds[triangleIndex] = component.id;
    }
    expandAabb(component.aabb, primitive.aabb.min);
    expandAabb(component.aabb, primitive.aabb.max);
    if (primitive.color) {
      component.color = primitive.color;
    }
  }
  if (labelToComponent.size < 2) {
    return undefined;
  }
  const components = [...labelToComponent.values()].map((component) => ({
    id: component.id,
    label: component.label,
    ...(component.color ? { color: component.color } : {}),
    triangleIndices: new Uint32Array(component.triangleIndices),
    triangleCount: component.triangleIndices.length,
    aabb: component.aabb,
  }));
  return { source: 'named', componentIds, components };
};

const buildConnectedComponentPartition = (record: MeshAnalysisRecord): MeshComponentPartition | undefined => {
  const pieces = record.getConnectedPieces();
  if (pieces.length < 2) {
    return undefined;
  }
  const componentIds = new Int32Array(record.triangleCount);
  const components = pieces.map((piece, id) => {
    for (const triangleIndex of piece.triangleIndices) {
      componentIds[triangleIndex] = id;
    }
    return {
      id,
      label: `connected-component-${id}`,
      color: piece.color,
      triangleIndices: piece.triangleIndices,
      triangleCount: piece.triangleIndices.length,
      aabb: piece.aabb,
    };
  });
  return { source: 'connected', componentIds, components };
};

const createRecord = (options: {
  vertexCount: number;
  meshCount: number;
  positions: Float64Array<ArrayBuffer>;
  triangleIndices: Uint32Array<ArrayBuffer>;
  trianglePrimitiveIndices: Uint32Array<ArrayBuffer>;
  primitives: MeshAnalysisPrimitiveRecord[];
  quality: MeshQualityBase;
  boundingBox?: Omit<BoundingBoxStats, 'primitives'>;
}): MeshAnalysisRecord => {
  let trianglesCache: MeshTriangle[] | undefined;
  let weldedPositionsCache: MeshAnalysisWeldedPositions | undefined;
  let connectedPiecesCache: MeshAnalysisSubPiece[] | undefined;
  let watertightCache: WatertightResult | undefined;
  let partitionCache: MeshComponentPartition | undefined;
  const connectedComponentsCache = new Map<number, ConnectedComponentsResult>();
  const getWeldedPositions = (): MeshAnalysisWeldedPositions => {
    weldedPositionsCache ??= buildWeldedPositions(options.positions);
    return weldedPositionsCache;
  };
  const topologySummary = topologyFromTriangles({
    positions: options.positions,
    triangleIndices: options.triangleIndices,
    weldedPositions: getWeldedPositions(),
  });
  const record: MeshAnalysisRecord = {
    vertexCount: options.vertexCount,
    meshCount: options.meshCount,
    triangleCount: options.triangleIndices.length / 3,
    positions: options.positions,
    triangleIndices: options.triangleIndices,
    trianglePrimitiveIndices: options.trianglePrimitiveIndices,
    primitives: options.primitives,
    quality: options.quality,
    boundingBox: options.boundingBox,
    topologySummary,
    getWeldedPositions,
    getTriangles: () => {
      trianglesCache ??= buildMeshTriangles(record);
      return trianglesCache;
    },
    getConnectedPieces: () => {
      connectedPiecesCache ??= buildConnectedPieces(record);
      return connectedPiecesCache;
    },
    getConnectedComponents: (toleranceMm) => {
      const cached = connectedComponentsCache.get(toleranceMm);
      if (cached) {
        return cached;
      }
      const value = createConnectedComponents(record, toleranceMm);
      connectedComponentsCache.set(toleranceMm, value);
      return value;
    },
    getWatertightResult: () => {
      watertightCache ??= createWatertightResult(record);
      return watertightCache;
    },
    getComponentPartition: () => {
      partitionCache ??= buildNamedComponentPartition(record) ?? buildConnectedComponentPartition(record);
      return partitionCache;
    },
  };
  return record;
};

export const buildMeshAnalysisRecord = (document: Document): MeshAnalysisRecord => {
  const meshNodeNames = buildMeshNodeNameMap(document);
  const positions: number[] = [];
  const triangleIndices: number[] = [];
  const trianglePrimitiveIndices: number[] = [];
  const primitives: MeshAnalysisPrimitiveRecord[] = [];
  const seenFaces = new Map<string, number>();
  const quality: MeshQualityBase = {
    triangleCount: 0,
    nonFiniteVertices: [],
    degenerateTriangles: [],
    duplicateFaces: [],
    surfaceArea: 0,
    signedVolume: 0,
  };
  const centerOfMassNumerator: Vec3Mutable = [0, 0, 0];
  const globalAabb = emptyAabb();
  let hasVertex = false;
  let vertexCount = 0;
  const meshes = document.getRoot().listMeshes();

  for (const [meshOrdinal, mesh] of meshes.entries()) {
    const { fallbackName, resolvedMeshName } = meshDisplayBaseName(mesh, meshNodeNames, meshOrdinal);
    let primitiveOrdinal = 0;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const positionAccessor = primitive.getAttribute('POSITION');
      if (!positionAccessor) {
        continue;
      }
      const indexAccessor = primitive.getIndices();
      const indexCount = indexAccessor?.getCount() ?? positionAccessor.getCount();
      const { componentName, name } = primitiveNames({ resolvedMeshName, fallbackName, primitiveOrdinal });
      primitiveOrdinal += 1;
      const vertexStart = vertexCount;
      const localVertexCount = positionAccessor.getCount();
      const primitiveAabb = emptyAabb();
      const color = baseColorToHex(primitive.getMaterial()?.getBaseColorFactor());

      for (let localVertexIndex = 0; localVertexIndex < localVertexCount; localVertexIndex++) {
        const position = positionAccessor.getElement(localVertexIndex, [0, 0, 0]);
        const point: Vec3Mutable = [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0];
        positions.push(point[0], point[1], point[2]);
        vertexCount += 1;
        expandAabb(primitiveAabb, point);
        expandAabb(globalAabb, point);
        hasVertex = true;
        if (!point.every((coordinate) => Number.isFinite(coordinate))) {
          quality.nonFiniteVertices.push({ primitive: name, vertexIndex: localVertexIndex, position: point });
        }
      }

      const primitiveIndex = primitives.length;
      const triangleStart = quality.triangleCount;
      for (let index = 0; index + 2 < indexCount; index += 3) {
        const aIndex = vertexStart + (indexAccessor?.getScalar(index) ?? index);
        const bIndex = vertexStart + (indexAccessor?.getScalar(index + 1) ?? index + 1);
        const cIndex = vertexStart + (indexAccessor?.getScalar(index + 2) ?? index + 2);
        const triangleIndex = quality.triangleCount;
        triangleIndices.push(aIndex, bIndex, cIndex);
        trianglePrimitiveIndices.push(primitiveIndex);
        quality.triangleCount += 1;

        const a = pointAtRaw(positions, aIndex);
        const b = pointAtRaw(positions, bIndex);
        const c = pointAtRaw(positions, cIndex);
        const area = magnitude(cross(subtract(b, a), subtract(c, a))) / 2;
        const center = centerOfTriangle(a, b, c);
        const signedVolume = dot(a, cross(b, c)) / 6;
        quality.surfaceArea += area;
        quality.signedVolume += signedVolume;
        const centroid = tetrahedronCentroid(a, b, c);
        centerOfMassNumerator[0] += centroid[0] * signedVolume;
        centerOfMassNumerator[1] += centroid[1] * signedVolume;
        centerOfMassNumerator[2] += centroid[2] * signedVolume;

        if (area <= triangleAreaTolerance) {
          quality.degenerateTriangles.push({ primitive: name, triangleIndex, area, center });
        }
        const key = triangleKey(a, b, c);
        const firstTriangleIndex = seenFaces.get(key);
        if (firstTriangleIndex === undefined) {
          seenFaces.set(key, triangleIndex);
        } else {
          quality.duplicateFaces.push({ primitive: name, triangleIndex, firstTriangleIndex });
        }
      }

      primitives.push({
        index: primitiveIndex,
        name,
        componentName,
        color,
        vertexStart,
        vertexCount: localVertexCount,
        triangleStart,
        triangleCount: quality.triangleCount - triangleStart,
        vertices: localVertexCount,
        aabb: primitiveAabb,
      });
    }
  }

  if (Math.abs(quality.signedVolume) > triangleAreaTolerance) {
    quality.centerOfMass = [
      centerOfMassNumerator[0] / quality.signedVolume,
      centerOfMassNumerator[1] / quality.signedVolume,
      centerOfMassNumerator[2] / quality.signedVolume,
    ];
  }

  return createRecord({
    vertexCount,
    meshCount: meshes.length,
    positions: new Float64Array(positions),
    triangleIndices: new Uint32Array(triangleIndices),
    trianglePrimitiveIndices: new Uint32Array(trianglePrimitiveIndices),
    primitives,
    quality,
    boundingBox: hasVertex ? { size: sizeOfAabb(globalAabb), center: centerOfAabb(globalAabb) } : undefined,
  });
};

const buildRecordFromTriangles = (triangles: readonly MeshTriangle[]): MeshAnalysisRecord => {
  const positions: number[] = [];
  const triangleIndices: number[] = [];
  const trianglePrimitiveIndices: number[] = [];
  const primitiveMap = new Map<string, MeshAnalysisPrimitiveRecord>();
  const quality: MeshQualityBase = {
    triangleCount: triangles.length,
    nonFiniteVertices: [],
    degenerateTriangles: [],
    duplicateFaces: [],
    surfaceArea: 0,
    signedVolume: 0,
  };
  const globalAabb = emptyAabb();
  let hasVertex = false;
  for (const triangle of triangles) {
    const label = triangle.primitive || `Shape_0#${primitiveMap.size}`;
    let primitive = primitiveMap.get(label);
    if (!primitive) {
      primitive = {
        index: primitiveMap.size,
        name: label,
        componentName: label,
        vertexStart: positions.length / 3,
        vertexCount: 0,
        triangleStart: triangle.triangleIndex,
        triangleCount: 0,
        vertices: 0,
        aabb: emptyAabb(),
      };
      primitiveMap.set(label, primitive);
    }
    const firstVertex = positions.length / 3;
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions.push(point[0], point[1], point[2]);
      expandAabb(primitive.aabb, point);
      expandAabb(globalAabb, point);
      hasVertex = true;
      primitive.vertexCount += 1;
      primitive.vertices += 1;
    }
    triangleIndices.push(firstVertex, firstVertex + 1, firstVertex + 2);
    trianglePrimitiveIndices.push(primitive.index);
    primitive.triangleCount += 1;
    quality.surfaceArea += triangle.area;
  }
  const primitives = [...primitiveMap.values()];
  primitives.sort((left, right) => left.index - right.index);
  return createRecord({
    vertexCount: positions.length / 3,
    meshCount: primitives.length,
    positions: new Float64Array(positions),
    triangleIndices: new Uint32Array(triangleIndices),
    trianglePrimitiveIndices: new Uint32Array(trianglePrimitiveIndices),
    primitives,
    quality,
    boundingBox: hasVertex ? { size: sizeOfAabb(globalAabb), center: centerOfAabb(globalAabb) } : undefined,
  });
};

export const createGeometryStatsFromRecord = (record: MeshAnalysisRecord): GeometryStats => {
  const stats: GeometryStats = {
    vertexCount: record.vertexCount,
    meshCount: record.meshCount,
    triangleCount: record.triangleCount,
    meshQuality: createMeshQualityStats(record),
    connectedComponents: (toleranceMm) => record.getConnectedComponents(toleranceMm).count,
    analyseConnectedComponents: (toleranceMm) => record.getConnectedComponents(toleranceMm),
    watertight: record.topologySummary.watertight,
    analyseWatertight: () => record.getWatertightResult(),
    boundingBox: createBoundingBoxStats(record),
  };
  attachMeshAnalysisRecord(stats, record);
  return stats;
};

export const attachMeshAnalysisRecord = (stats: GeometryStats, record: MeshAnalysisRecord): GeometryStats => {
  Object.defineProperty(stats, meshAnalysisRecordSymbol, {
    configurable: false,
    enumerable: false,
    value: record,
  });
  return stats;
};

export const getMeshAnalysisRecord = (stats: GeometryStats): MeshAnalysisRecord => {
  const owner = stats as GeometryStats & MeshAnalysisRecordOwner;
  owner[meshAnalysisRecordSymbol] ??= buildRecordFromTriangles(stats.meshQuality.triangles);
  return owner[meshAnalysisRecordSymbol];
};

const scaleVec3 = (value: readonly [number, number, number], factor: number): Vec3Mutable => [
  value[0] * factor,
  value[1] * factor,
  value[2] * factor,
];

const scaleAabb = (aabb: AabbMeters, factor: number): AabbMeters => ({
  min: scaleVec3(aabb.min, factor),
  max: scaleVec3(aabb.max, factor),
});

export const scaleMeshAnalysisRecord = (record: MeshAnalysisRecord, factor: number): MeshAnalysisRecord => {
  if (factor === 1) {
    return record;
  }
  const positions = new Float64Array(record.positions.length);
  for (let index = 0; index < record.positions.length; index++) {
    positions[index] = record.positions[index]! * factor;
  }
  const quality: MeshQualityBase = {
    ...record.quality,
    surfaceArea: record.quality.surfaceArea * factor ** 2,
    signedVolume: record.quality.signedVolume * factor ** 3,
    nonFiniteVertices: record.quality.nonFiniteVertices.map((vertex) => ({
      ...vertex,
      position: scaleVec3(vertex.position, factor),
    })),
    degenerateTriangles: record.quality.degenerateTriangles.map((triangle) => ({
      ...triangle,
      area: triangle.area * factor ** 2,
      center: scaleVec3(triangle.center, factor),
    })),
  };
  if (record.quality.centerOfMass) {
    quality.centerOfMass = scaleVec3(record.quality.centerOfMass, factor);
  }
  return createRecord({
    vertexCount: record.vertexCount,
    meshCount: record.meshCount,
    positions,
    triangleIndices: new Uint32Array(record.triangleIndices),
    trianglePrimitiveIndices: new Uint32Array(record.trianglePrimitiveIndices),
    primitives: record.primitives.map((primitive) => ({
      ...primitive,
      aabb: scaleAabb(primitive.aabb, factor),
    })),
    quality,
    boundingBox: record.boundingBox
      ? {
          size: scaleVec3(record.boundingBox.size, factor),
          center: scaleVec3(record.boundingBox.center, factor),
        }
      : undefined,
  });
};
