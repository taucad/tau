import type { Accessor, Document, Mesh, Primitive } from '@gltf-transform/core';
import type { ClusterGap, ClusterReport, ConnectedComponentsResult, PrimitiveRecord } from '#mesh/types.js';
import { weldPositions } from '#mesh/_internal/spatial-welding.js';

type InternalAabb = { min: [number, number, number]; max: [number, number, number] };

type TaggedPrimitive = {
  index: number;
  name: string;
  color?: string;
  vertices: number;
  aabb: InternalAabb;
};

type SubMeshPiece = {
  name: string;
  color?: string;
  vertices: number;
  aabb: InternalAabb;
};

const collectPositionTuples = (pos: Accessor): Array<[number, number, number]> => {
  const vertexCount = pos.getCount();
  const scratch: [number, number, number] = [0, 0, 0];
  const positions: Array<[number, number, number]> = [];
  for (let index = 0; index < vertexCount; index++) {
    pos.getElement(index, scratch);
    positions.push([scratch[0], scratch[1], scratch[2]]);
  }
  return positions;
};

/**
 * Triangle corner indices (into the POSITION accessor) for each triangle.
 *
 * @param primitive - glTF primitive carrying POSITION (and optional indices).
 * @returns One `[i,j,k]` triple per triangle, or `undefined` when topology is invalid.
 */
const readTriangleVertexIndices = (primitive: Primitive): Array<[number, number, number]> | undefined => {
  const pos = primitive.getAttribute('POSITION');
  if (!pos) {
    return undefined;
  }
  const indices = primitive.getIndices();
  if (indices) {
    const indexCount = indices.getCount();
    if (indexCount < 3 || indexCount % 3 !== 0) {
      return undefined;
    }
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < indexCount; i += 3) {
      out.push([indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)]);
    }
    return out;
  }
  const vertexCount = pos.getCount();
  if (vertexCount < 3 || vertexCount % 3 !== 0) {
    return undefined;
  }
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < vertexCount; i += 3) {
    out.push([i, i + 1, i + 2]);
  }
  return out;
};

const computeAabbForTriangleSet = (
  positions: ReadonlyArray<[number, number, number]>,
  triangles: ReadonlyArray<[number, number, number]>,
  triangleIndices: readonly number[],
): InternalAabb | undefined => {
  let hasCorner = false;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const triangleIndex of triangleIndices) {
    const tri = triangles[triangleIndex];
    if (!tri) {
      continue;
    }
    for (const vertexIndex of tri) {
      const p = positions[vertexIndex];
      if (!p) {
        continue;
      }
      const [x, y, z] = p;
      if (!hasCorner) {
        min[0] = x;
        max[0] = x;
        min[1] = y;
        max[1] = y;
        min[2] = z;
        max[2] = z;
        hasCorner = true;
        continue;
      }
      if (x < min[0]) {
        min[0] = x;
      }
      if (y < min[1]) {
        min[1] = y;
      }
      if (z < min[2]) {
        min[2] = z;
      }
      if (x > max[0]) {
        max[0] = x;
      }
      if (y > max[1]) {
        max[1] = y;
      }
      if (z > max[2]) {
        max[2] = z;
      }
    }
  }
  return hasCorner ? { min, max } : undefined;
};

const componentSortKey = (
  positions: ReadonlyArray<[number, number, number]>,
  triangles: ReadonlyArray<[number, number, number]>,
  componentTriangleIndices: readonly number[],
): [number, number, number] => {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  for (const triangleIndex of componentTriangleIndices) {
    const tri = triangles[triangleIndex];
    if (!tri) {
      continue;
    }
    for (const vertexIndex of tri) {
      const p = positions[vertexIndex];
      if (!p) {
        continue;
      }
      const [x, y, z] = p;
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (z < minZ) {
        minZ = z;
      }
    }
  }
  return [minX, minY, minZ];
};

/**
 * Splits one glTF TRIANGLES primitive into spatially disjoint sub-meshes using
 * welded vertex coincidence + triangle adjacency (handles per-triangle
 * unwelded indices from color-binned OpenSCAD export).
 *
 * @param primitive - Source TRIANGLES primitive.
 * @param primName - Display name prefix for emitted pieces.
 * @param color - Optional CSS hex material tint inherited from the primitive.
 * @returns One record per welded connected component inside the primitive.
 */
const expandPrimitiveToSubMeshPieces = (
  primitive: Primitive,
  primName: string,
  color: string | undefined,
): SubMeshPiece[] => {
  const positionAccessor = primitive.getAttribute('POSITION');
  if (!positionAccessor) {
    return [];
  }
  const triangles = readTriangleVertexIndices(primitive);
  if (!triangles || triangles.length === 0) {
    return [];
  }
  const positions = collectPositionTuples(positionAccessor);
  const weldMap = weldPositions(positions);
  const triangleCount = triangles.length;
  const parent = new Uint32Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) {
    parent[i] = i;
  }
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootA] = rootB;
    }
  };

  const canonicalToTriangles = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    const tri = triangles[t]!;
    for (const rawIndex of tri) {
      const canonical = weldMap[rawIndex]!;
      const list = canonicalToTriangles.get(canonical) ?? [];
      list.push(t);
      canonicalToTriangles.set(canonical, list);
    }
  }
  for (const list of canonicalToTriangles.values()) {
    for (let k = 1; k < list.length; k++) {
      union(list[0]!, list[k]!);
    }
  }

  const buckets = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    const root = find(t);
    const list = buckets.get(root) ?? [];
    list.push(t);
    buckets.set(root, list);
  }
  const components = [...buckets.values()];
  components.sort((a, b) => {
    const keyA = componentSortKey(positions, triangles, a);
    const keyB = componentSortKey(positions, triangles, b);
    for (let axis = 0; axis < 3; axis++) {
      if (keyA[axis] !== keyB[axis]) {
        return keyA[axis]! - keyB[axis]!;
      }
    }
    return 0;
  });

  const pieces: SubMeshPiece[] = [];
  for (let partIndex = 0; partIndex < components.length; partIndex++) {
    const componentTris = components[partIndex]!;
    const aabb = computeAabbForTriangleSet(positions, triangles, componentTris);
    if (!aabb) {
      continue;
    }
    const uniqueWelded = new Set<number>();
    for (const t of componentTris) {
      const tri = triangles[t];
      if (!tri) {
        continue;
      }
      for (const rawIndex of tri) {
        uniqueWelded.add(weldMap[rawIndex]!);
      }
    }
    const displayName = components.length === 1 ? primName : `${primName}#part${partIndex}`;
    pieces.push({
      name: displayName,
      color,
      vertices: uniqueWelded.size,
      aabb,
    });
  }
  return pieces;
};

const aabbsOverlapWithin = (a: InternalAabb, b: InternalAabb, toleranceMeters: number): boolean => {
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis]! + toleranceMeters < b.min[axis]!) {
      return false;
    }
    if (b.max[axis]! + toleranceMeters < a.min[axis]!) {
      return false;
    }
  }
  return true;
};

const baseColorToHex = (rgba: readonly number[] | undefined): string | undefined => {
  if (!rgba || rgba.length < 3) {
    return undefined;
  }
  const toByte = (c: number) => Math.round(Math.min(255, Math.max(0, Math.floor(c <= 1 ? c * 255 : c))));
  const r = toByte(rgba[0]!);
  const g = toByte(rgba[1]!);
  const b = toByte(rgba[2]!);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/** L-infinity AABB separation in meters; 0 if overlapping or touching.
 *
 * @param a - First axis-aligned bounds (meters).
 * @param b - Second axis-aligned bounds (meters).
 * @returns Gap magnitude on the worst-separated axis plus axis id.
 */
const linfSeparation = (a: InternalAabb, b: InternalAabb): { gapM: number; axis: 'x' | 'y' | 'z' } => {
  const axes = ['x', 'y', 'z'] as const;
  let maxGap = 0;
  let axis: 'x' | 'y' | 'z' = 'x';
  for (let i = 0; i < 3; i++) {
    const gap = Math.max(0, Math.max(b.min[i]! - a.max[i]!, a.min[i]! - b.max[i]!));
    if (gap > maxGap) {
      maxGap = gap;
      axis = axes[i]!;
    }
  }
  return { gapM: maxGap, axis };
};

const unionAabb = (prims: readonly TaggedPrimitive[]): InternalAabb => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    for (let i = 0; i < 3; i++) {
      if (p.aabb.min[i]! < min[i]!) {
        min[i] = p.aabb.min[i]!;
      }
      if (p.aabb.max[i]! > max[i]!) {
        max[i] = p.aabb.max[i]!;
      }
    }
  }
  return { min, max };
};

const toClusterReport = (label: string, prims: readonly TaggedPrimitive[]): ClusterReport => {
  const aabb = unionAabb(prims);
  const primitives: PrimitiveRecord[] = prims.map((p) => ({
    name: p.name,
    color: p.color,
    vertices: p.vertices,
    aabb: { min: [...p.aabb.min] as [number, number, number], max: [...p.aabb.max] as [number, number, number] },
  }));
  const totalVertices = prims.reduce((s, p) => s + p.vertices, 0);
  const centroid: [number, number, number] = [
    (aabb.min[0] + aabb.max[0]) / 2,
    (aabb.min[1] + aabb.max[1]) / 2,
    (aabb.min[2] + aabb.max[2]) / 2,
  ];
  return {
    label,
    primitives,
    aabb: { min: [...aabb.min] as [number, number, number], max: [...aabb.max] as [number, number, number] },
    centroid,
    totalVertices,
  };
};

const clusterLabelsFromIndex = (i: number): string => String.fromCodePoint('A'.codePointAt(0)! + i);

/**
 * The glTF format often puts human-facing identifiers on {@link Node} entries while leaving
 * {@link Mesh} names empty. ShapeConfig / XCAF names therefore resolve from the
 * first parent node that references each mesh.
 *
 * @param document - Parsed glTF document.
 * @returns Map from mesh instances to a human-readable node label.
 * @public
 */
export const buildMeshNodeNameMap = (document: Document): Map<Mesh, string> => {
  const map = new Map<Mesh, string>();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const nodeName = node.getName().trim();
    if (mesh && nodeName && nodeName.length > 0 && !map.has(mesh)) {
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

/**
 * Lists every TRIANGLES primitive with AABB and display metadata (no clustering).
 *
 * @param document - Parsed glTF document whose meshes should be enumerated.
 * @returns Primitive catalogue entries suitable for clustering overlays.
 * @public
 */
export const collectPrimitiveRecords = (document: Document): PrimitiveRecord[] => {
  const tagged: TaggedPrimitive[] = [];
  const meshNodeNames = buildMeshNodeNameMap(document);
  let meshOrdinal = 0;

  for (const mesh of document.getRoot().listMeshes()) {
    const { resolvedMeshName, fallbackName } = meshDisplayBaseName(mesh, meshNodeNames, meshOrdinal);
    meshOrdinal += 1;
    let primOrdinal = 0;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const pos = primitive.getAttribute('POSITION');
      if (!pos) {
        continue;
      }
      const mat = primitive.getMaterial();
      const base = mat?.getBaseColorFactor();
      const color = baseColorToHex(base);
      const primName =
        resolvedMeshName && resolvedMeshName.length > 0 ? resolvedMeshName : `${fallbackName}#${primOrdinal}`;
      primOrdinal += 1;
      const pieces = expandPrimitiveToSubMeshPieces(primitive, primName, color);
      for (const piece of pieces) {
        tagged.push({
          index: tagged.length,
          name: piece.name,
          color: piece.color,
          vertices: piece.vertices,
          aabb: piece.aabb,
        });
      }
    }
  }

  return tagged.map((p) => ({
    name: p.name,
    color: p.color,
    vertices: p.vertices,
    aabb: { min: [...p.aabb.min] as [number, number, number], max: [...p.aabb.max] as [number, number, number] },
  }));
};

const minimumSeparationAcrossPrimitiveLists = (
  primsI: readonly TaggedPrimitive[],
  primsJ: readonly TaggedPrimitive[],
): { gapM: number; axis: 'x' | 'y' | 'z'; fromPrimitive: string; toPrimitive: string } => {
  let bestGapM = Infinity;
  let bestAxis: 'x' | 'y' | 'z' = 'x';
  let bestFrom = primsI[0]!.name;
  let bestTo = primsJ[0]!.name;
  for (const pi of primsI) {
    for (const pj of primsJ) {
      const { gapM, axis } = linfSeparation(pi.aabb, pj.aabb);
      if (gapM < bestGapM) {
        bestGapM = gapM;
        bestAxis = axis;
        bestFrom = pi.name;
        bestTo = pj.name;
      }
    }
  }
  return { gapM: bestGapM, axis: bestAxis, fromPrimitive: bestFrom, toPrimitive: bestTo };
};

/**
 * Full cluster decomposition at `toleranceMm`.
 *
 * @param document - Parsed glTF document.
 * @param toleranceMm - Maximum separation (mm) that still merges adjacent clusters.
 * @returns Disjoint spatial clusters, labels, per-cluster primitives, and sorted pairwise gaps.
 * @public
 */
export const analyseConnectedComponents = (document: Document, toleranceMm: number): ConnectedComponentsResult => {
  const toleranceMeters = toleranceMm / 1000;
  const tagged: TaggedPrimitive[] = [];
  const meshNodeNames = buildMeshNodeNameMap(document);
  let meshOrdinal = 0;

  for (const mesh of document.getRoot().listMeshes()) {
    const { resolvedMeshName, fallbackName } = meshDisplayBaseName(mesh, meshNodeNames, meshOrdinal);
    meshOrdinal += 1;
    let primOrdinal = 0;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const pos = primitive.getAttribute('POSITION');
      if (!pos) {
        continue;
      }
      const mat = primitive.getMaterial();
      const base = mat?.getBaseColorFactor();
      const color = baseColorToHex(base);
      const primName =
        resolvedMeshName && resolvedMeshName.length > 0 ? resolvedMeshName : `${fallbackName}#${primOrdinal}`;
      primOrdinal += 1;
      const pieces = expandPrimitiveToSubMeshPieces(primitive, primName, color);
      for (const piece of pieces) {
        tagged.push({
          index: tagged.length,
          name: piece.name,
          color: piece.color,
          vertices: piece.vertices,
          aabb: piece.aabb,
        });
      }
    }
  }

  if (tagged.length === 0) {
    return { count: 0, clusters: [], gaps: [] };
  }

  const parent = tagged.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i]! !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  };

  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      if (aabbsOverlapWithin(tagged[i]!.aabb, tagged[j]!.aabb, toleranceMeters)) {
        union(i, j);
      }
    }
  }

  const buckets = new Map<number, TaggedPrimitive[]>();
  for (const p of tagged) {
    const r = find(p.index);
    const list = buckets.get(r) ?? [];
    list.push(p);
    buckets.set(r, list);
  }

  const clusterArrays = [...buckets.values()];
  clusterArrays.sort((a, b) => {
    const va = a.reduce((s, x) => s + x.vertices, 0);
    const vb = b.reduce((s, x) => s + x.vertices, 0);
    return vb - va;
  });

  const clusters: ClusterReport[] = clusterArrays.map((prims, i) =>
    toClusterReport(
      clusterLabelsFromIndex(i),
      prims.sort((x, y) => x.name.localeCompare(y.name)),
    ),
  );

  const gaps: ClusterGap[] = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const labelI = clusters[i]!.label;
      const labelJ = clusters[j]!.label;
      const primsI = clusterArrays[i]!;
      const primsJ = clusterArrays[j]!;
      const { gapM, axis, fromPrimitive, toPrimitive } = minimumSeparationAcrossPrimitiveLists(primsI, primsJ);
      gaps.push({
        fromLabel: labelI,
        toLabel: labelJ,
        axis,
        gapMm: gapM * 1000,
        fromPrimitive,
        toPrimitive,
      });
    }
  }
  gaps.sort((a, b) => a.gapMm - b.gapMm);

  return {
    count: clusters.length,
    clusters,
    gaps,
  };
};

/**
 * Counts spatially-disjoint chunks: each TRIANGLES primitive is first split
 * into connected sub-meshes via welded vertex coincidence and triangle
 * adjacency (so color-binned OpenSCAD export still separates disjoint lumps),
 * then sub-mesh AABBs are clustered when they overlap within `toleranceMm`.
 * Operates purely on glTF positions and indices — no kernel `extras` or scene
 * metadata.
 *
 * @param document - A glTF-Transform Document (positions are in glTF meter units)
 * @param toleranceMm - Maximum gap (mm) between two primitive AABBs that
 *   still counts as connected. Use a tight value (e.g. 0.1) to detect
 *   visibly-disjoint chunks; raise it (e.g. 50) when intentional small gaps
 *   between touching parts must collapse into one cluster.
 * @returns The number of distinct spatial clusters
 * @public
 */
export const countConnectedComponents = (document: Document, toleranceMm: number): number => {
  return analyseConnectedComponents(document, toleranceMm).count;
};
