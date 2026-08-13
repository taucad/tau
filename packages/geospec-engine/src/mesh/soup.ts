/**
 * Triangle-soup mesh evidence.
 *
 * Turns the native `double[9 * n]` soup the kernel retains into the substrate's
 * {@link GeometryStats}. The soup is the only mesh substrate a STEP subject
 * has: one primitive, no vertex sharing across triangles, coordinates in
 * subject-frame millimetres.
 *
 * @module
 */

import { weldFlatPositions } from '#mesh/_internal/spatial-welding.js';
import type {
  ClusterGap,
  ClusterReport,
  ConnectedComponentsResult,
  GeometryStats,
  MeshQualityStats,
  MeshTriangle,
  PrimitiveRecord,
  WatertightResult,
} from '#mesh/types.js';

type Aabb = { min: [number, number, number]; max: [number, number, number] };

/** Axis order is fixed; a tuple index keeps the reads total. */
const axes = [0, 1, 2] as const;

const emptyAabb = (): Aabb => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

const expand = (aabb: Aabb, point: readonly [number, number, number]): void => {
  for (const axis of axes) {
    aabb.min[axis] = Math.min(aabb.min[axis], point[axis]);
    aabb.max[axis] = Math.max(aabb.max[axis], point[axis]);
  }
};

const finiteAabb = (aabb: Aabb): Aabb => (Number.isFinite(aabb.min[0]) ? aabb : { min: [0, 0, 0], max: [0, 0, 0] });

/**
 * Narrow a kernel soup to the mesh-buffer's single-precision positions.
 *
 * Mesh evidence is a `MeshBufferSource`, whose positions are `Float32Array` —
 * the same buffer a renderer or a mesh backend would receive. Narrowing here
 * rather than at each consumer keeps every mesh scalar, witness and digest
 * derived from *one* set of coordinates. Exact evidence never comes from this
 * buffer: BRep facts stay double-precision on the kernel side (§10).
 *
 * @param soup - Flat kernel coordinates.
 * @returns The same coordinates at mesh-buffer precision.
 * @public
 */
export const toMeshBufferPositions = (soup: ArrayLike<number>): Float32Array<ArrayBuffer> => Float32Array.from(soup);

/**
 * Build the triangle records a matcher observes.
 *
 * Field order is contract: the evidence-parity harness digests
 * `JSON.stringify(triangles)`, so a reordered literal is a byte change.
 *
 * @param soup - Flat `[ax,ay,az,bx,by,bz,cx,cy,cz]` triples.
 * @param triangleCount - Number of triangles in the soup.
 * @param primitive - Primitive label carried by every triangle.
 * @returns The triangle records.
 * @public
 */
export const buildSoupTriangles = (
  soup: ArrayLike<number>,
  triangleCount: number,
  primitive: string,
): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  for (let index = 0; index < triangleCount; index++) {
    const offset = index * 9;
    const a: [number, number, number] = [soup[offset]!, soup[offset + 1]!, soup[offset + 2]!];
    const b: [number, number, number] = [soup[offset + 3]!, soup[offset + 4]!, soup[offset + 5]!];
    const c: [number, number, number] = [soup[offset + 6]!, soup[offset + 7]!, soup[offset + 8]!];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    triangles.push({
      primitive,
      triangleIndex: index,
      a,
      b,
      c,
      center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      // oxlint-disable-next-line unicorn/prefer-modern-math-apis -- Byte contract: `Math.hypot` is more accurate but differs by an ULP on some triangles, and the parity harness digests every triangle's area.
      area: Math.sqrt(nx * nx + ny * ny + nz * nz) / 2,
    });
  }
  return triangles;
};

const analyseWatertightFromWeld = (triangles: readonly MeshTriangle[], canonical: Int32Array): WatertightResult => {
  const incidence = new Map<string, number>();
  for (const [index] of triangles.entries()) {
    const corners = [canonical[index * 3]!, canonical[index * 3 + 1]!, canonical[index * 3 + 2]!];
    for (let corner = 0; corner < 3; corner++) {
      const from = corners[corner]!;
      const to = corners[(corner + 1) % 3]!;
      // A collapsed edge contributes nothing. NOTE the asymmetry with the glTF
      // reader (`analysis-record.ts`), which drops a degenerate triangle
      // WHOLE: on this path the byte-locked STEP corpus pins the older
      // reading, in which a degenerate triangle's two surviving edges are still
      // counted (five NIST fixtures read `watertight: false` because of it).
      // The two readings are pinned by two different oracles and must not be
      // unified without an operator decision — see the PE2.f report.
      if (from === to) {
        continue;
      }
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      incidence.set(key, (incidence.get(key) ?? 0) + 1);
    }
  }
  let openBoundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of incidence.values()) {
    if (count === 1) {
      openBoundaryEdges++;
    } else if (count > 2) {
      nonManifoldEdges++;
    }
  }
  const irregularEdges = openBoundaryEdges + nonManifoldEdges;
  const totalEdges = incidence.size;
  return {
    watertight: irregularEdges === 0,
    irregularEdges,
    openBoundaryEdges,
    nonManifoldEdges,
    irregularEdgeKindCounts: { openBoundary: openBoundaryEdges, nonManifold: nonManifoldEdges },
    // Ponytail: the localized irregular-edge clusters (union-find over incident
    // edges with representative samples) are diagnostic payload, not a verdict
    // input, and land with the mesh-oracle sub-wave that owns their corpus.
    irregularEdgeClusters: [],
    totalEdges,
    irregularEdgeFraction: totalEdges === 0 ? 0 : irregularEdges / totalEdges,
    perPrimitive: [],
  };
};

const componentPartition = (triangles: readonly MeshTriangle[], canonical: Int32Array): number[][] => {
  const parent = new Int32Array(triangles.length);
  for (let index = 0; index < triangles.length; index++) {
    parent[index] = index;
  }
  const find = (value: number): number => {
    let current = value;
    while (parent[current]! !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const vertexOwner = new Map<number, number>();
  for (let index = 0; index < triangles.length; index++) {
    for (let corner = 0; corner < 3; corner++) {
      const vertex = canonical[index * 3 + corner]!;
      const owner = vertexOwner.get(vertex);
      if (owner === undefined) {
        vertexOwner.set(vertex, index);
        continue;
      }
      const left = find(owner);
      const right = find(index);
      if (left !== right) {
        parent[left] = right;
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let index = 0; index < triangles.length; index++) {
    const root = find(index);
    const group = groups.get(root);
    if (group) {
      group.push(index);
    } else {
      groups.set(root, [index]);
    }
  }
  return [...groups.values()];
};

const overlapsWithin = (left: Aabb, right: Aabb, tolerance: number): boolean => {
  for (const axis of axes) {
    if (left.min[axis] > right.max[axis] + tolerance || right.min[axis] > left.max[axis] + tolerance) {
      return false;
    }
  }
  return true;
};

const axisNames = ['x', 'y', 'z'] as const;

const axisGap = (left: Aabb, right: Aabb): { axis: 'x' | 'y' | 'z'; gap: number } => {
  let best: { axis: 'x' | 'y' | 'z'; gap: number } = { axis: 'x', gap: -Infinity };
  for (const axis of axes) {
    const gap = Math.max(right.min[axis] - left.max[axis], left.min[axis] - right.max[axis]);
    if (gap > best.gap) {
      best = { axis: axisNames[axis], gap };
    }
  }
  return best;
};

type ClusterInput = {
  triangles: readonly MeshTriangle[];
  partition: readonly number[][];
  primitive: string;
  toleranceMm: number;
};

const buildClusters = ({ triangles, partition, primitive, toleranceMm }: ClusterInput): ConnectedComponentsResult => {
  const pieces = partition.map((indexes) => {
    const aabb = emptyAabb();
    for (const index of indexes) {
      const triangle = triangles[index]!;
      expand(aabb, triangle.a);
      expand(aabb, triangle.b);
      expand(aabb, triangle.c);
    }
    return { indexes, aabb: finiteAabb(aabb) };
  });

  // Union pieces whose AABBs overlap within the tolerance on all three axes —
  // the test is axis-independent, so a colinear stack never degrades it.
  const parent = Int32Array.from(pieces, (_, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current]! !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  for (let left = 0; left < pieces.length; left++) {
    for (let right = left + 1; right < pieces.length; right++) {
      if (!overlapsWithin(pieces[left]!.aabb, pieces[right]!.aabb, toleranceMm)) {
        continue;
      }
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) {
        parent[leftRoot] = rightRoot;
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

  const clusters: ClusterReport[] = [...merged.values()].map((group) => {
    const aabb = emptyAabb();
    let totalVertices = 0;
    for (const pieceIndex of group) {
      const piece = pieces[pieceIndex]!;
      expand(aabb, piece.aabb.min);
      expand(aabb, piece.aabb.max);
      totalVertices += piece.indexes.length * 3;
    }
    const box = finiteAabb(aabb);
    const record: PrimitiveRecord = { name: primitive, vertices: totalVertices, aabb: box };
    return {
      label: primitive,
      primitives: [record],
      aabb: box,
      centroid: [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2],
      totalVertices,
    };
  });

  // Canonical ordering: heaviest cluster first, then label — never insertion order.
  clusters.sort((left, right) => right.totalVertices - left.totalVertices || left.label.localeCompare(right.label));

  const gaps: ClusterGap[] = [];
  for (let left = 0; left < clusters.length; left++) {
    for (let right = left + 1; right < clusters.length; right++) {
      const from = clusters[left]!;
      const to = clusters[right]!;
      const { axis, gap } = axisGap(from.aabb, to.aabb);
      gaps.push({
        fromLabel: from.label,
        toLabel: to.label,
        axis,
        gapMm: gap,
        fromPrimitive: from.label,
        toPrimitive: to.label,
      });
    }
  }
  gaps.sort((left, right) => left.gapMm - right.gapMm);

  return { count: clusters.length, clusters, gaps };
};

/**
 * Build the mesh statistics of a retained triangle soup.
 *
 * @param soup - Flat coordinate triples.
 * @param triangleCount - Number of triangles.
 * @param primitive - Primitive label carried by every triangle.
 * @returns The substrate's geometry statistics.
 * @public
 */
export const buildSoupStats = (soup: ArrayLike<number>, triangleCount: number, primitive: string): GeometryStats => {
  const positions = toMeshBufferPositions(soup);
  const triangles = buildSoupTriangles(positions, triangleCount, primitive);

  let surfaceArea = 0;
  let signedVolume = 0;
  const nonFiniteVertices: MeshQualityStats['nonFiniteVertices'] = [];
  const degenerateTriangles: MeshQualityStats['degenerateTriangles'] = [];
  const boundingBox = emptyAabb();
  for (const triangle of triangles) {
    surfaceArea += triangle.area;
    const { a, b, c } = triangle;
    signedVolume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    expand(boundingBox, a);
    expand(boundingBox, b);
    expand(boundingBox, c);
    for (const [corner, position] of [a, b, c].entries()) {
      if (!position.every((value) => Number.isFinite(value))) {
        nonFiniteVertices.push({
          primitive,
          vertexIndex: triangle.triangleIndex * 3 + corner,
          position,
        });
      }
    }
    if (triangle.area === 0) {
      degenerateTriangles.push({
        primitive,
        triangleIndex: triangle.triangleIndex,
        area: 0,
        center: triangle.center,
      });
    }
  }

  const canonical = weldFlatPositions(positions, triangleCount * 3);
  const watertight = analyseWatertightFromWeld(triangles, canonical);

  const duplicateFaces: MeshQualityStats['duplicateFaces'] = [];
  const seenFaces = new Map<string, number>();
  for (const [index] of triangles.entries()) {
    const key = [canonical[index * 3]!, canonical[index * 3 + 1]!, canonical[index * 3 + 2]!]
      .sort((left, right) => left - right)
      .join(':');
    const first = seenFaces.get(key);
    if (first === undefined) {
      seenFaces.set(key, index);
    } else {
      duplicateFaces.push({ primitive, triangleIndex: index, firstTriangleIndex: first });
    }
  }

  let partition: number[][] | undefined;
  const componentCache = new Map<number, ConnectedComponentsResult>();
  const analyseConnectedComponents = (toleranceMm: number): ConnectedComponentsResult => {
    const cached = componentCache.get(toleranceMm);
    if (cached) {
      return cached;
    }
    partition ??= componentPartition(triangles, canonical);
    const result = buildClusters({ triangles, partition, primitive, toleranceMm });
    componentCache.set(toleranceMm, result);
    return result;
  };

  const box = finiteAabb(boundingBox);
  return {
    vertexCount: triangleCount * 3,
    meshCount: triangleCount === 0 ? 0 : 1,
    triangleCount,
    meshQuality: {
      triangleCount,
      nonFiniteVertices,
      degenerateTriangles,
      duplicateFaces,
      triangles,
      surfaceArea,
      signedVolume,
    },
    connectedComponents: (toleranceMm: number) => analyseConnectedComponents(toleranceMm).count,
    analyseConnectedComponents,
    watertight: watertight.watertight,
    analyseWatertight: () => watertight,
    boundingBox: {
      size: [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]],
      center: [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2],
      primitives: triangleCount === 0 ? [] : [{ name: primitive, vertices: triangleCount * 3, aabb: box }],
    },
  };
};
