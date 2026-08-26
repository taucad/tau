/**
 * The glTF mesh analysis record.
 *
 * One pass over a document produces a *record* — flat positions, a flat
 * triangle index list and a per-triangle primitive id — and every mesh analysis
 * the substrate publishes is a pure function of that record. Two consequences
 * matter: nothing re-walks the document per question, and the record is a pure
 * function of the source bytes, so it round-trips through the evidence cache as
 * a JSON header plus **exactly three** binary sections (positions, triangles,
 * primitives). Multi-hundred-megabyte geometry must never round-trip JSON.
 *
 * @module
 */

import { WebIO } from '@gltf-transform/core';
import type { Document, Mesh, Node, Primitive } from '@gltf-transform/core';
import { decodeSections, encodeSections } from '#cache/section-codec.js';
import { weldFlatPositions } from '#mesh/_internal/spatial-welding.js';
import { sweepAxisByCentreVariance } from '#mesh/_internal/sweep-axis.js';
import type {
  ClusterGap,
  ClusterReport,
  ConnectedComponentsResult,
  GeometryStats,
  MeshQualityStats,
  MeshTriangle,
  PrimitiveRecord,
  Vec3,
  WatertightIrregularEdgeCluster,
  WatertightIrregularEdgeKind,
  WatertightPrimitiveBreakdown,
  WatertightResult,
} from '#mesh/types.js';

/** The glTF TRIANGLES primitive mode. */
const trianglesMode = 4;

/** Representative irregular edges kept per cluster. */
const clusterSampleLimit = 4;

/**
 * A document's geometry, flattened once.
 *
 * @public
 */
export type MeshAnalysisRecord = {
  /** `3 · vertexCount` world-space coordinates. */
  positions: Float64Array<ArrayBuffer>;
  /** `3 · triangleCount` vertex indices. */
  triangles: Int32Array<ArrayBuffer>;
  /** Owning primitive index per triangle. */
  trianglePrimitives: Int32Array<ArrayBuffer>;
  /** Primitive labels in document order, `name#primitiveIndex`. */
  primitives: Array<{ name: string; vertexStart: number; vertexCount: number }>;
};

/**
 * Strip the `#n` sub-piece suffix from a primitive label.
 *
 * A glTF node with several primitives contributes `part#0`, `part#1`, … — they
 * are one authored component, so component-level reporting groups them under
 * the base name.
 *
 * @param label - Primitive label.
 * @returns The authored component name.
 * @public
 */
export const baseComponentLabel = (label: string): string => label.replace(/#\d+$/, '');

/**
 * Map every mesh in a glTF document to its owning node's name.
 *
 * @param document - Parsed glTF document.
 * @returns Mesh-to-node-name map.
 * @public
 */
export const buildMeshNodeNameMap = (document: Document): Map<Mesh, string> => {
  const names = new Map<Mesh, string>();
  for (const [index, node] of document.getRoot().listNodes().entries()) {
    const mesh = node.getMesh();
    if (!mesh || names.has(mesh)) {
      continue;
    }
    names.set(mesh, node.getName() || mesh.getName() || `Shape ${index + 1}`);
  }
  return names;
};

const primitivePositions = (
  primitive: Primitive,
  node: Node,
  scale: number,
): { positions: number[]; count: number } => {
  const attribute = primitive.getAttribute('POSITION');
  if (!attribute) {
    return { positions: [], count: 0 };
  }
  const matrix = node.getWorldMatrix();
  const count = attribute.getCount();
  const positions: number[] = [];
  const element: number[] = [0, 0, 0];
  for (let index = 0; index < count; index++) {
    attribute.getElement(index, element);
    const [x, y, z] = element as [number, number, number];
    positions.push(
      (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * scale,
      (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * scale,
      (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * scale,
    );
  }
  return { positions, count };
};

/**
 * Flatten a document into its analysis record.
 *
 * @param document - Parsed glTF document.
 * @param scale - Uniform coordinate scale applied while flattening.
 * @returns The record.
 * @public
 */
export const buildMeshAnalysisRecord = (document: Document, scale = 1): MeshAnalysisRecord => {
  const names = buildMeshNodeNameMap(document);
  const positions: number[] = [];
  const triangles: number[] = [];
  const trianglePrimitives: number[] = [];
  const primitives: MeshAnalysisRecord['primitives'] = [];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) {
      continue;
    }
    // `buildMeshNodeNameMap` walks the same node list, so every mesh reached
    // here is already named.
    const name = names.get(mesh)!;
    for (const [index, primitive] of mesh.listPrimitives().entries()) {
      if (primitive.getMode() !== trianglesMode) {
        continue;
      }
      const vertexStart = positions.length / 3;
      const { positions: flat, count } = primitivePositions(primitive, node, scale);
      if (count === 0) {
        continue;
      }
      // Never `push(...flat)`: a spread of a multi-hundred-thousand-element
      // primitive is a stack overflow, and a real assembly has those.
      for (const value of flat) {
        positions.push(value);
      }
      const primitiveIndex = primitives.length;
      primitives.push({ name: `${name}#${index}`, vertexStart, vertexCount: count });
      const indices = primitive.getIndices();
      const indexCount = indices ? indices.getCount() : count;
      for (let offset = 0; offset + 2 < indexCount; offset += 3) {
        for (let corner = 0; corner < 3; corner++) {
          triangles.push(vertexStart + (indices ? indices.getScalar(offset + corner) : offset + corner));
        }
        trianglePrimitives.push(primitiveIndex);
      }
    }
  }
  return {
    positions: Float64Array.from(positions),
    triangles: Int32Array.from(triangles),
    trianglePrimitives: Int32Array.from(trianglePrimitives),
    primitives,
  };
};

const int32Section = (values: Int32Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values.buffer, values.byteOffset, values.byteLength);

/**
 * Frame a record as a JSON header plus exactly three binary sections.
 *
 * @param record - The record.
 * @returns The framed payload.
 * @public
 */
export const encodeMeshAnalysisRecord = (record: MeshAnalysisRecord): Uint8Array<ArrayBuffer> =>
  encodeSections({ version: 1, primitives: record.primitives }, [
    new Uint8Array(record.positions.buffer, record.positions.byteOffset, record.positions.byteLength),
    int32Section(record.triangles),
    int32Section(record.trianglePrimitives),
  ]);

/**
 * Rehydrate a framed record.
 *
 * @param bytes - The framed payload.
 * @returns The record, or `undefined` when the frame is not a mesh record —
 * a section count other than three is a foreign payload, never a partial read.
 * @public
 */
export const decodeMeshAnalysisRecord = (bytes: Uint8Array<ArrayBuffer>): MeshAnalysisRecord | undefined => {
  const decoded = decodeSections(bytes);
  if (decoded?.sections.length !== 3) {
    return undefined;
  }
  const header = decoded.header as { version?: number; primitives?: MeshAnalysisRecord['primitives'] };
  if (header.version !== 1 || !header.primitives) {
    return undefined;
  }
  const [positions, triangles, trianglePrimitives] = decoded.sections as [
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>,
  ];
  return {
    positions: new Float64Array(positions.buffer, positions.byteOffset, positions.byteLength / 8),
    triangles: new Int32Array(triangles.buffer, triangles.byteOffset, triangles.byteLength / 4),
    trianglePrimitives: new Int32Array(
      trianglePrimitives.buffer,
      trianglePrimitives.byteOffset,
      trianglePrimitives.byteLength / 4,
    ),
    primitives: header.primitives,
  };
};

const vertex = (record: MeshAnalysisRecord, index: number): [number, number, number] => [
  record.positions[index * 3]!,
  record.positions[index * 3 + 1]!,
  record.positions[index * 3 + 2]!,
];

/**
 * Triangle records for a document, one per triangle in record order.
 *
 * @param record - The analysis record.
 * @returns Triangle records labelled by primitive.
 * @public
 */
export const recordTriangles = (record: MeshAnalysisRecord): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  const triangleCount = record.trianglePrimitives.length;
  for (let index = 0; index < triangleCount; index++) {
    const a = vertex(record, record.triangles[index * 3]!);
    const b = vertex(record, record.triangles[index * 3 + 1]!);
    const c = vertex(record, record.triangles[index * 3 + 2]!);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    triangles.push({
      primitive: record.primitives[record.trianglePrimitives[index]!]!.name,
      triangleIndex: index,
      a,
      b,
      c,
      center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      area: Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2,
    });
  }
  return triangles;
};

/**
 * Mesh-quality statistics for a record.
 *
 * @param record - The analysis record.
 * @returns Triangle quality and scalar metrics.
 * @public
 */
export const recordMeshQuality = (record: MeshAnalysisRecord): MeshQualityStats => {
  const triangles = recordTriangles(record);
  const nonFiniteVertices: MeshQualityStats['nonFiniteVertices'] = [];
  const degenerateTriangles: MeshQualityStats['degenerateTriangles'] = [];
  let surfaceArea = 0;
  let signedVolume = 0;
  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;
  for (const triangle of triangles) {
    surfaceArea += triangle.area;
    const { a, b, c } = triangle;
    const contribution =
      (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    signedVolume += contribution;
    centroidX += (contribution * (a[0] + b[0] + c[0])) / 4;
    centroidY += (contribution * (a[1] + b[1] + c[1])) / 4;
    centroidZ += (contribution * (a[2] + b[2] + c[2])) / 4;
    for (const [corner, position] of [a, b, c].entries()) {
      if (!position.every((value) => Number.isFinite(value))) {
        nonFiniteVertices.push({
          primitive: triangle.primitive,
          vertexIndex: triangle.triangleIndex * 3 + corner,
          position,
        });
      }
    }
    if (triangle.area === 0) {
      degenerateTriangles.push({
        primitive: triangle.primitive,
        triangleIndex: triangle.triangleIndex,
        area: 0,
        center: triangle.center,
      });
    }
  }

  // Duplicate faces are the expensive third of this record — a weld over every
  // vertex of the assembly plus a keyed map entry per triangle — and only
  // `toHaveMeshIntegrity` with a `duplicateFaces` expectation ever reads them,
  // while `triangles`/`surfaceArea`/`signedVolume` above are read by the
  // interference sweep and the distance matchers on every assembly. Splitting
  // them off keeps the common path off the weld. Memoized, so a consumer that
  // does ask sees one build.
  let duplicateFacesCache: MeshQualityStats['duplicateFaces'] | undefined;
  const duplicateFaces = (): MeshQualityStats['duplicateFaces'] => {
    if (!duplicateFacesCache) {
      const canonical = weldFlatPositions(record.positions, record.positions.length / 3);
      const found: MeshQualityStats['duplicateFaces'] = [];
      const seen = new Map<string, number>();
      for (const [index, triangle] of triangles.entries()) {
        // A numeric key would need `n³` for `n` welded vertices, which leaves
        // the safe-integer range on a real assembly; the string stays.
        const key = [
          canonical[record.triangles[index * 3]!]!,
          canonical[record.triangles[index * 3 + 1]!]!,
          canonical[record.triangles[index * 3 + 2]!]!,
        ]
          .sort((left, right) => left - right)
          .join(':');
        const first = seen.get(key);
        if (first === undefined) {
          seen.set(key, index);
        } else {
          found.push({ primitive: triangle.primitive, triangleIndex: index, firstTriangleIndex: first });
        }
      }
      duplicateFacesCache = found;
    }
    return duplicateFacesCache;
  };

  return {
    triangleCount: triangles.length,
    nonFiniteVertices,
    degenerateTriangles,
    get duplicateFaces(): MeshQualityStats['duplicateFaces'] {
      return duplicateFaces();
    },
    triangles,
    surfaceArea,
    signedVolume,
    // A centre of mass only exists for a soup that encloses a finite volume:
    // an open shell or a non-finite vertex has none, and reporting NaN would be
    // worse than reporting nothing.
    ...(Number.isFinite(signedVolume) && signedVolume !== 0
      ? { centerOfMass: [centroidX / signedVolume, centroidY / signedVolume, centroidZ / signedVolume] as Vec3 }
      : {}),
  };
};

type EdgeRecord = {
  from: number;
  to: number;
  incidentTriangleCount: number;
  primitives: Set<number>;
};

/**
 * A triangle whose welded corners are not three distinct vertices.
 *
 * It contributes NO edges. Skipping only its collapsed edge is not enough: its
 * other two edges are then the *same* edge traversed twice, which adds two
 * incidences to a perfectly regular edge and reports it as non-manifold. A UV
 * sphere has one such triangle fan at each pole, which is why a closed sphere
 * used to read as two non-manifold edges out of 22,524. A zero-area triangle is
 * not a piece of surface; it is already reported on its own as
 * `meshQuality.degenerateTriangles`.
 */
const isDegenerate = (corners: readonly number[]): boolean =>
  corners[0] === corners[1] || corners[1] === corners[2] || corners[0] === corners[2];

const edgeIndex = (record: MeshAnalysisRecord, canonical: Int32Array): Map<string, EdgeRecord> => {
  const edges = new Map<string, EdgeRecord>();
  const triangleCount = record.trianglePrimitives.length;
  for (let index = 0; index < triangleCount; index++) {
    const corners = [
      canonical[record.triangles[index * 3]!]!,
      canonical[record.triangles[index * 3 + 1]!]!,
      canonical[record.triangles[index * 3 + 2]!]!,
    ];
    if (isDegenerate(corners)) {
      continue;
    }
    for (let corner = 0; corner < 3; corner++) {
      const from = corners[corner]!;
      const to = corners[(corner + 1) % 3]!;
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const existing = edges.get(key);
      if (existing) {
        existing.incidentTriangleCount += 1;
        existing.primitives.add(record.trianglePrimitives[index]!);
        continue;
      }
      edges.set(key, {
        from: Math.min(from, to),
        to: Math.max(from, to),
        incidentTriangleCount: 1,
        primitives: new Set([record.trianglePrimitives[index]!]),
      });
    }
  }
  return edges;
};

const clusterIrregularEdges = (
  record: MeshAnalysisRecord,
  edges: readonly EdgeRecord[],
  kind: WatertightIrregularEdgeKind,
): WatertightIrregularEdgeCluster[] => {
  const parent = Int32Array.from({ length: edges.length }, (_unused, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current]! !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const owner = new Map<number, number>();
  for (const [index, edge] of edges.entries()) {
    for (const endpoint of [edge.from, edge.to]) {
      const existing = owner.get(endpoint);
      if (existing === undefined) {
        owner.set(endpoint, index);
        continue;
      }
      const left = find(existing);
      const right = find(index);
      if (left !== right) {
        parent[left] = right;
      }
    }
  }
  const groups = new Map<number, EdgeRecord[]>();
  for (const [index, edge] of edges.entries()) {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(edge);
    } else {
      groups.set(root, [edge]);
    }
  }

  const clusters = [...groups.values()].map((group): WatertightIrregularEdgeCluster => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const edge of group) {
      for (const endpoint of [vertex(record, edge.from), vertex(record, edge.to)]) {
        for (const axis of [0, 1, 2] as const) {
          min[axis] = Math.min(min[axis], endpoint[axis]);
          max[axis] = Math.max(max[axis], endpoint[axis]);
        }
      }
    }
    const ordered = [...group].sort((left, right) => left.from - right.from || left.to - right.to);
    return {
      kind,
      edgeCount: group.length,
      aabb: {
        min,
        max,
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      },
      samples: ordered.slice(0, clusterSampleLimit).map((edge) => {
        const start = vertex(record, edge.from);
        const end = vertex(record, edge.to);
        return {
          start,
          end,
          center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2] as Vec3,
          incidentTriangleCount: edge.incidentTriangleCount,
          primitives: [...edge.primitives]
            .sort((left, right) => left - right)
            .map((index) => record.primitives[index]!.name),
        };
      }),
    };
  });
  clusters.sort((left, right) => right.edgeCount - left.edgeCount || left.aabb.min[0] - right.aabb.min[0]);
  return clusters;
};

/**
 * Watertightness of a record, with its irregular-edge breakdown.
 *
 * @param record - The analysis record.
 * @returns The verdict with evidence.
 * @public
 */
export const recordWatertight = (record: MeshAnalysisRecord): WatertightResult => {
  const canonical = weldFlatPositions(record.positions, record.positions.length / 3);
  const edges = edgeIndex(record, canonical);
  const open: EdgeRecord[] = [];
  const nonManifold: EdgeRecord[] = [];
  for (const edge of edges.values()) {
    if (edge.incidentTriangleCount === 1) {
      open.push(edge);
    } else if (edge.incidentTriangleCount > 2) {
      nonManifold.push(edge);
    }
  }
  const irregularEdges = open.length + nonManifold.length;
  const totalEdges = edges.size;
  // A mesh with no surface is not a closed solid. Answering `true` here is a
  // vacuous pass — the one answer a fail-closed evidence layer must never give.
  const watertight = totalEdges > 0 && irregularEdges === 0;

  const perPrimitive: WatertightPrimitiveBreakdown[] = record.primitives.map((primitive, index) => {
    const owned = open.filter((edge) => edge.primitives.has(index));
    let x = 0;
    let y = 0;
    let z = 0;
    for (const edge of owned) {
      const start = vertex(record, edge.from);
      const end = vertex(record, edge.to);
      x += (start[0] + end[0]) / 2;
      y += (start[1] + end[1]) / 2;
      z += (start[2] + end[2]) / 2;
    }
    const count = Math.max(1, owned.length);
    return {
      name: primitive.name,
      boundaryEdges: owned.length,
      loopCentroid: [x / count, y / count, z / count],
    };
  });

  return {
    watertight,
    irregularEdges,
    openBoundaryEdges: open.length,
    nonManifoldEdges: nonManifold.length,
    irregularEdgeKindCounts: { openBoundary: open.length, nonManifold: nonManifold.length },
    irregularEdgeClusters: [
      ...clusterIrregularEdges(record, open, 'open-boundary'),
      ...clusterIrregularEdges(record, nonManifold, 'non-manifold'),
    ],
    totalEdges,
    irregularEdgeFraction: totalEdges === 0 ? 0 : irregularEdges / totalEdges,
    perPrimitive,
  };
};

type Aabb = { min: [number, number, number]; max: [number, number, number] };

const emptyAabb = (): Aabb => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });

const expand = (aabb: Aabb, point: readonly [number, number, number]): void => {
  for (const axis of [0, 1, 2] as const) {
    aabb.min[axis] = Math.min(aabb.min[axis], point[axis]);
    aabb.max[axis] = Math.max(aabb.max[axis], point[axis]);
  }
};

const finiteAabb = (aabb: Aabb): Aabb => (Number.isFinite(aabb.min[0]) ? aabb : { min: [0, 0, 0], max: [0, 0, 0] });

/**
 * One record per drawable primitive.
 *
 * @param record - The analysis record.
 * @returns Primitive records in document order.
 * @public
 */
export const recordPrimitives = (record: MeshAnalysisRecord): PrimitiveRecord[] =>
  record.primitives.map((primitive) => {
    const aabb = emptyAabb();
    for (let index = primitive.vertexStart; index < primitive.vertexStart + primitive.vertexCount; index++) {
      expand(aabb, vertex(record, index));
    }
    return { name: primitive.name, vertices: primitive.vertexCount, aabb: finiteAabb(aabb) };
  });

type Piece = {
  /** Vertices contributed per primitive; a welded piece may span several. */
  primitiveVertices: Map<number, number>;
  aabb: Aabb;
  vertices: number;
};

/** Split every primitive into vertex-connected sub-meshes. */
const subMeshes = (record: MeshAnalysisRecord, canonical: Int32Array): Piece[] => {
  const triangleCount = record.trianglePrimitives.length;
  const parent = Int32Array.from({ length: triangleCount }, (_unused, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current]! !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const owner = new Map<number, number>();
  for (let index = 0; index < triangleCount; index++) {
    for (let corner = 0; corner < 3; corner++) {
      const canonicalVertex = canonical[record.triangles[index * 3 + corner]!]!;
      const existing = owner.get(canonicalVertex);
      if (existing === undefined) {
        owner.set(canonicalVertex, index);
        continue;
      }
      const left = find(existing);
      const right = find(index);
      if (left !== right) {
        parent[left] = right;
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let index = 0; index < triangleCount; index++) {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(index);
    } else {
      groups.set(root, [index]);
    }
  }
  return [...groups.values()].map((members) => {
    const aabb = emptyAabb();
    const primitiveVertices = new Map<number, number>();
    for (const triangle of members) {
      for (let corner = 0; corner < 3; corner++) {
        expand(aabb, vertex(record, record.triangles[triangle * 3 + corner]!));
      }
      const primitive = record.trianglePrimitives[triangle]!;
      primitiveVertices.set(primitive, (primitiveVertices.get(primitive) ?? 0) + 3);
    }
    return { primitiveVertices, aabb: finiteAabb(aabb), vertices: members.length * 3 };
  });
};

const overlapsWithin = (left: Aabb, right: Aabb, tolerance: number): boolean => {
  for (const axis of [0, 1, 2] as const) {
    if (left.min[axis] > right.max[axis] + tolerance || right.min[axis] > left.max[axis] + tolerance) {
      return false;
    }
  }
  return true;
};

const axisNames = ['x', 'y', 'z'] as const;

const dominantGap = (left: Aabb, right: Aabb): { axis: 'x' | 'y' | 'z'; gap: number } => {
  let best: { axis: 'x' | 'y' | 'z'; gap: number } = { axis: 'x', gap: -Infinity };
  for (const axis of [0, 1, 2] as const) {
    const gap = Math.max(right.min[axis] - left.max[axis], left.min[axis] - right.max[axis]);
    if (gap > best.gap) {
      best = { axis: axisNames[axis], gap };
    }
  }
  return best;
};

/**
 * Partition a record into spatial clusters at one tolerance.
 *
 * The union is the 3-axis AABB overlap test, so the partition is
 * axis-independent — a colinear stack cannot be split by an axis choice. The
 * sweep axis only orders the candidate scan.
 *
 * @param record - The analysis record.
 * @param toleranceMm - Connection tolerance.
 * @returns The clusters with the full inter-cluster gap matrix.
 * @public
 */
/**
 * Document units per millimetre for a RAW glTF document.
 *
 * glTF coordinates are metres (`AabbMeters`), and every tolerance in the
 * GeoSpec vocabulary is millimetres. The direct document-level analysers are
 * the one place the two meet.
 *
 * @public
 */
export const metresPerMillimetre = 0.001;

export const recordConnectedComponents = (
  record: MeshAnalysisRecord,
  toleranceMm: number,
  unitsPerMm = 1,
): ConnectedComponentsResult => {
  // The tolerance is millimetres by contract; the record's positions are in
  // whatever unit its builder scaled them to. A raw glTF document is METRES
  // (`AabbMeters`), so comparing a 0.1 mm tolerance against it directly reads
  // 0.1 m and merges two boxes 40 mm apart into one component. A loaded
  // subject's record is already in the subject's unit, so its factor is 1.
  const tolerance = toleranceMm * unitsPerMm;
  const canonical = weldFlatPositions(record.positions, record.positions.length / 3);
  const pieces = subMeshes(record, canonical);
  const parent = Int32Array.from({ length: pieces.length }, (_unused, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current]! !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const axis = sweepAxisByCentreVariance(
    pieces.map((piece) => [
      (piece.aabb.min[0] + piece.aabb.max[0]) / 2,
      (piece.aabb.min[1] + piece.aabb.max[1]) / 2,
      (piece.aabb.min[2] + piece.aabb.max[2]) / 2,
    ]),
  );
  const order = pieces
    .map((_unused, index) => index)
    .sort((left, right) => {
      const gap = pieces[left]!.aabb.min[axis] - pieces[right]!.aabb.min[axis];
      return gap === 0 ? left - right : gap;
    });
  for (let index = 0; index < order.length; index++) {
    const current = pieces[order[index]!]!;
    for (let next = index + 1; next < order.length; next++) {
      const candidate = pieces[order[next]!]!;
      if (candidate.aabb.min[axis] > current.aabb.max[axis] + tolerance) {
        break;
      }
      if (!overlapsWithin(current.aabb, candidate.aabb, tolerance)) {
        continue;
      }
      const left = find(order[index]!);
      const right = find(order[next]!);
      if (left !== right) {
        parent[left] = right;
      }
    }
  }

  const merged = new Map<number, number[]>();
  for (let index = 0; index < pieces.length; index++) {
    const root = find(index);
    const group = merged.get(root);
    if (group) {
      group.push(index);
    } else {
      merged.set(root, [index]);
    }
  }

  const primitiveRecords = recordPrimitives(record);
  const draft = [...merged.values()].map((group) => {
    const aabb = emptyAabb();
    let totalVertices = 0;
    const members = new Map<number, { vertices: number; aabb: Aabb }>();
    for (const pieceIndex of group) {
      const piece = pieces[pieceIndex]!;
      expand(aabb, piece.aabb.min);
      expand(aabb, piece.aabb.max);
      totalVertices += piece.vertices;
      for (const [primitive, vertices] of piece.primitiveVertices) {
        const member = members.get(primitive) ?? { vertices: 0, aabb: emptyAabb() };
        member.vertices += vertices;
        expand(member.aabb, piece.aabb.min);
        expand(member.aabb, piece.aabb.max);
        members.set(primitive, member);
      }
    }
    const box = finiteAabb(aabb);
    const heaviest = [...members.entries()].sort(
      (left, right) => right[1].vertices - left[1].vertices || left[0] - right[0],
    )[0]![0];
    return {
      label: baseComponentLabel(record.primitives[heaviest]!.name),
      members,
      aabb: box,
      centroid: [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2] as [
        number,
        number,
        number,
      ],
      totalVertices,
    };
  });

  // One glTF primitive can hold several disconnected chunks (an OpenSCAD
  // color bin is one primitive per colour, not per solid). Reporting the whole
  // primitive's AABB in each cluster it lands in would make two 40 mm-apart
  // cubes witness a NEGATIVE gap — the shared parent box overlaps itself. A
  // split primitive therefore contributes a per-cluster `#partN` record with
  // that chunk's own bounds; a primitive that stayed whole keeps its own name.
  const clusterCountByPrimitive = new Map<number, number>();
  for (const cluster of draft) {
    for (const primitive of cluster.members.keys()) {
      clusterCountByPrimitive.set(primitive, (clusterCountByPrimitive.get(primitive) ?? 0) + 1);
    }
  }
  const partOrdinals = new Map<number, number>();
  const clusters: ClusterReport[] = draft.map((cluster) => ({
    label: cluster.label,
    primitives: [...cluster.members.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([primitive, member]) => {
        const whole = primitiveRecords[primitive]!;
        // A CLUSTER reports the authored label, not the reader's per-mesh
        // ordinal: the name here is what an agent reads back out of a failure
        // payload and matches against the `ShapeConfig.name` it wrote.
        // `collectPrimitiveRecords` keeps the `#index` form — that surface is
        // the reader's inventory, not the author's vocabulary.
        const label = baseComponentLabel(whole.name);
        if (clusterCountByPrimitive.get(primitive)! < 2) {
          return { ...whole, name: label };
        }
        const ordinal = partOrdinals.get(primitive) ?? 0;
        partOrdinals.set(primitive, ordinal + 1);
        return {
          ...whole,
          name: `${label}#part${ordinal}`,
          vertices: member.vertices,
          aabb: finiteAabb(member.aabb),
        };
      }),
    aabb: cluster.aabb,
    centroid: cluster.centroid,
    totalVertices: cluster.totalVertices,
  }));
  // Canonical ordering: heaviest first, then label — never insertion order.
  clusters.sort((left, right) => right.totalVertices - left.totalVertices || left.label.localeCompare(right.label));

  const gaps: ClusterGap[] = [];
  for (let left = 0; left < clusters.length; left++) {
    for (let right = left + 1; right < clusters.length; right++) {
      const from = clusters[left]!;
      const to = clusters[right]!;
      // Witness: the closest primitive pair realizing the cluster gap.
      let best: ClusterGap | undefined;
      for (const fromPrimitive of from.primitives) {
        for (const toPrimitive of to.primitives) {
          const { axis: gapAxis, gap } = dominantGap(fromPrimitive.aabb, toPrimitive.aabb);
          if (!best || gap / unitsPerMm < best.gapMm) {
            best = {
              fromLabel: from.label,
              toLabel: to.label,
              axis: gapAxis,
              gapMm: gap / unitsPerMm,
              fromPrimitive: fromPrimitive.name,
              toPrimitive: toPrimitive.name,
            };
          }
        }
      }
      gaps.push(best!);
    }
  }
  gaps.sort(
    (left, right) =>
      left.gapMm - right.gapMm ||
      left.fromLabel.localeCompare(right.fromLabel) ||
      left.toLabel.localeCompare(right.toLabel),
  );

  return { count: clusters.length, clusters, gaps };
};

/**
 * Geometry statistics for a record.
 *
 * @param record - The analysis record.
 * @param unitsPerMm - Record units per millimetre: `1` for a record already
 * scaled to the subject's millimetre unit, {@link metresPerMillimetre} for a
 * raw glTF document. Only the tolerance-bearing analyses read it.
 * @returns The substrate's geometry statistics, with memoized analyses.
 * @public
 */
export const recordGeometryStats = (record: MeshAnalysisRecord, unitsPerMm = 1): GeometryStats => {
  // Lazy facets. `recordMeshQuality` materializes one `MeshTriangle` object per
  // triangle, welds every vertex and keys a duplicate-face map by a per-triangle
  // string; `boundingBox` walks every vertex twice (once for the box, once per
  // primitive). On the 650-part assembly that is tens of seconds and gigabytes
  // paid by EVERY subject load, whether or not the file's claims ever read a
  // mesh facet — and the subject lives for the whole run, so the cost is also
  // retained. Both are memoized on first read, so a consumer that does want
  // them sees the identical object it saw before.
  let meshQualityCache: MeshQualityStats | undefined;
  const meshQuality = (): MeshQualityStats => {
    meshQualityCache ??= recordMeshQuality(record);
    return meshQualityCache;
  };
  let boundingBoxCache: GeometryStats['boundingBox'];
  const boundingBox = (): GeometryStats['boundingBox'] => {
    if (!boundingBoxCache) {
      const box = emptyAabb();
      for (let index = 0; index < record.positions.length / 3; index++) {
        expand(box, vertex(record, index));
      }
      const bounds = finiteAabb(box);
      boundingBoxCache = {
        size: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]],
        center: [
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2,
        ],
        primitives: recordPrimitives(record),
      };
    }
    return boundingBoxCache;
  };
  let watertight: WatertightResult | undefined;
  const analyseWatertight = (): WatertightResult => {
    watertight ??= recordWatertight(record);
    return watertight;
  };
  const components = new Map<number, ConnectedComponentsResult>();
  const analyseConnectedComponents = (toleranceMm: number): ConnectedComponentsResult => {
    const cached = components.get(toleranceMm);
    if (cached) {
      return cached;
    }
    const result = recordConnectedComponents(record, toleranceMm, unitsPerMm);
    components.set(toleranceMm, result);
    return result;
  };

  return {
    vertexCount: record.positions.length / 3,
    meshCount: record.primitives.length,
    // One triangle per index triple — the same count `recordMeshQuality`
    // reports, without materializing the triangles to count them.
    triangleCount: record.trianglePrimitives.length,
    get meshQuality(): MeshQualityStats {
      return meshQuality();
    },
    connectedComponents: (toleranceMm: number) => analyseConnectedComponents(toleranceMm).count,
    analyseConnectedComponents,
    get watertight(): boolean {
      return analyseWatertight().watertight;
    },
    analyseWatertight,
    get boundingBox(): GeometryStats['boundingBox'] {
      return boundingBox();
    },
  };
};

/**
 * Analyze a parsed glTF document.
 *
 * @param document - Parsed glTF document.
 * @returns Geometry statistics in document units.
 * @public
 */
export const analyzeGltfDocument = (document: Document): GeometryStats =>
  recordGeometryStats(buildMeshAnalysisRecord(document), metresPerMillimetre);

/**
 * Read GLB bytes into a glTF document.
 *
 * @param glb - GLB bytes.
 * @returns The parsed document.
 * @public
 */
export const readGlbDocument = async (glb: Uint8Array<ArrayBuffer>): Promise<Document> =>
  // The reader casts the header to a `Uint32Array`, which throws outright on a
  // view whose byte offset is not 4-aligned. A GLB that arrived over a socket
  // routinely is not, so a misaligned view is copied into its own buffer first
  // — the alternative is a `RangeError` from deep inside the parser.
  new WebIO().readBinary(glb.byteOffset % 4 === 0 ? glb : new Uint8Array(glb));

/**
 * Analyze GLB bytes.
 *
 * @param glb - GLB bytes.
 * @returns Geometry statistics.
 * @public
 */
export const analyzeGlb = async (glb: Uint8Array<ArrayBuffer>): Promise<GeometryStats> =>
  analyzeGltfDocument(await readGlbDocument(glb));

/**
 * Mesh-quality statistics for a document.
 *
 * @param document - Parsed glTF document.
 * @returns Mesh-quality statistics.
 * @public
 */
export const analyzeMeshQuality = (document: Document): MeshQualityStats =>
  recordMeshQuality(buildMeshAnalysisRecord(document));

/**
 * Watertightness of a document.
 *
 * @param document - Parsed glTF document.
 * @returns The verdict with evidence.
 * @public
 */
export const analyseWatertight = (document: Document): WatertightResult =>
  recordWatertight(buildMeshAnalysisRecord(document));

/**
 * Whether a document is watertight.
 *
 * @param document - Parsed glTF document.
 * @returns True when no irregular edge exists.
 * @public
 */
export const isWatertight = (document: Document): boolean => analyseWatertight(document).watertight;

/**
 * Primitive records for a document.
 *
 * @param document - Parsed glTF document.
 * @returns Primitive records in document order.
 * @public
 */
export const collectPrimitiveRecords = (document: Document): PrimitiveRecord[] =>
  recordPrimitives(buildMeshAnalysisRecord(document));

/**
 * Connected-component partition of a document.
 *
 * @param document - Parsed glTF document.
 * @param toleranceMm - Connection tolerance.
 * @returns The partition with its gap matrix.
 * @public
 */
export const analyseConnectedComponents = (document: Document, toleranceMm: number): ConnectedComponentsResult =>
  recordConnectedComponents(buildMeshAnalysisRecord(document), toleranceMm, metresPerMillimetre);

/**
 * Connected-component count of a document.
 *
 * @param document - Parsed glTF document.
 * @param toleranceMm - Connection tolerance.
 * @returns The component count.
 * @public
 */
export const countConnectedComponents = (document: Document, toleranceMm: number): number =>
  analyseConnectedComponents(document, toleranceMm).count;
