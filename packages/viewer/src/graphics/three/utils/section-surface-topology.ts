import * as THREE from 'three';
import type { GeometryComponentManifest } from '@taucad/types';
import { INTERSECTED, NOT_INTERSECTED } from 'three-mesh-bvh';
import { ensureBvh, getBvh, getBvhStatus } from '#graphics/three/utils/bvh-cache.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';
import { getModelComponentId, getModelComponentOwnerInHierarchy } from '#graphics/three/utils/model-component-owner.js';
import type { ModelComponentOwner } from '#graphics/three/utils/model-component-owner.js';
import { hasSceneTag, hasSceneTagInHierarchy, sceneTag } from '#graphics/three/utils/scene-tags.js';
import { buildSectionTopologyRecipeInWorker } from '#graphics/three/utils/section-surface-topology-worker-client.js';

const float32Epsilon = 1.1920928955078125e-7;
const sectionCoordinatePrecision = 100_000_000;
const minimumNormalizedTopologyTolerance = 2 / sectionCoordinatePrecision;

export type SectionTopologyPath = 'extension' | 'fallback';

export type SectionTopologyFailure = Readonly<{
  code:
    | 'invalid-extension'
    | 'open-surface'
    | 'inconsistent-orientation'
    | 'ambiguous-seam'
    | 'collapsed-triangle'
    | 'degenerate-triangle'
    | 'missing-position'
    | 'non-finite-position'
    | 'non-manifold-vertex'
    | 'partial-visibility'
    | 'slice-invariant'
    | 'bvh-unavailable';
  message: string;
  sourceKey: string;
}>;

type SectionSurfaceParticipant = {
  readonly mesh: SectionSurfaceMesh;
  readonly localToSource: THREE.Matrix4;
  readonly order: number;
  readonly nodeIndex: number | undefined;
  readonly meshIndex: number | undefined;
  readonly primitiveIndex: number | undefined;
  /** The topology triangle of each geometry triangle, or -1; filled with the topology. */
  topologyTriangleByGeometryTriangle: Int32Array;
  /** The material orders of the triangles in `topologyTriangleByGeometryTriangle`, filled with it. */
  readonly usedMaterialOrders: Set<number>;
};

type SectionSurfaceMesh = THREE.Mesh;

type SurfaceComponent = Readonly<{
  triangles: Uint32Array;
  edges: Uint32Array;
}>;

/**
 * A certified surface kept as typed arrays (struct of arrays), about 90 B per triangle. Slices read vertices
 * out of `positions` and allocate vectors only for the edges they cut, so nothing here grows a JS object per
 * vertex, triangle or edge.
 */
export type SectionSurfaceTopology = Readonly<{
  path: SectionTopologyPath;
  sourceKey: string;
  /** The x, y and z of every vertex in the source frame. */
  positions: Float64Array;
  /** Three canonical (seam-representative) vertices per triangle. */
  triangleVertices: Uint32Array;
  /** Three canonical edges per triangle, in the order of its vertices. */
  triangleEdges: Int32Array;
  /** The index into `participants` of each triangle. */
  triangleParticipants: Uint32Array;
  /** The render material slot of each triangle in its participant's mesh. */
  triangleMaterialOrders: Uint32Array;
  participants: readonly SectionSurfaceParticipant[];
  /** Four entries per canonical edge: start vertex, end vertex and its two triangles. */
  edges: Int32Array;
  components: readonly SurfaceComponent[];
  /** The index into `components` of each topology triangle, built with the topology so slices only read it. */
  componentByTriangle: Int32Array;
  distanceTolerance: number;
  buildMilliseconds: number;
}>;

export type SectionSurfaceTopologyResult =
  | Readonly<{ status: 'ready'; topology: SectionSurfaceTopology }>
  | Readonly<{ status: 'unsupported'; failure: SectionTopologyFailure }>;

export type SectionSurfaceSource = Readonly<{
  key: string;
  root: THREE.Object3D;
  owner: ModelComponentOwner | undefined;
  participants: readonly SectionSurfaceParticipant[];
  topology: SectionSurfaceTopologyResult;
  revision: string;
}>;

export type VisibleSectionSurfaceSource = Readonly<{
  source: SectionSurfaceSource;
  visibility: 'complete' | 'partial';
}>;

export type GltfSectionTopologyTiming = Readonly<{
  submitMilliseconds: number;
  /** Aggregate topology build CPU, which may include main-thread fallback; not worker wall time. */
  workerMilliseconds: number;
  packMilliseconds: number;
  /** Sum of explicitly measured synchronous hydration, independent of overlapping worker wall time. */
  hydrateMilliseconds: number;
  resolveMilliseconds: number;
}>;

export type SectionSurfaceSlice = Readonly<{
  status: 'complete';
  closedContours: ReadonlyArray<readonly THREE.Vector3[]>;
  openPolylines: ReadonlyArray<readonly THREE.Vector3[]>;
  segmentCount: number;
  trueCutComponentCount: number;
  cappedTrueCutComponentCount: number;
  unresolvedTrueCutEdgeCount: 0;
  dominantMaterial: THREE.Material;
  candidateBroadphaseMilliseconds: number;
  topologySliceMilliseconds: number;
}>;

export type SectionSurfaceSliceResult =
  | SectionSurfaceSlice
  | Readonly<{
      status: 'unsupported' | 'failed';
      failure: SectionTopologyFailure;
    }>;

type TopologyBuildInput = Readonly<{
  sourceKey: string;
  path: SectionTopologyPath;
  /** The x, y and z of every vertex in the source frame. */
  positions: Float64Array;
  /** Three vertices per triangle; replaced in place by their seam representatives once the recipe is built. */
  triangleVertices: Uint32Array;
  triangleParticipants: Uint32Array;
  triangleMaterialOrders: Uint32Array;
  participants: readonly SectionSurfaceParticipant[];
  allowSeamFallback: boolean;
  onHydrate?: (milliseconds: number) => void;
  onPack?: (milliseconds: number) => void;
}>;

export type SectionCanonicalTopologyWorkerInput = Readonly<{
  sourceKey: string;
  positions: Float64Array;
  triangleVertices: Uint32Array;
  allowSeamFallback: boolean;
}>;

type CanonicalTopologyRecipe = Readonly<{
  status: 'ready';
  representativeVertices: Int32Array;
  triangleEdges: Int32Array;
  edges: Int32Array;
  components: ReadonlyArray<Readonly<{ triangles: Uint32Array; edges: Uint32Array }>>;
  buildMilliseconds: number;
}>;

export type SectionCanonicalTopologyWorkerResult =
  | CanonicalTopologyRecipe
  | Readonly<{ status: 'unsupported'; failure: SectionTopologyFailure }>;

type GltfAssociation = Readonly<{
  nodes?: number;
  meshes?: number;
  primitives?: number;
}>;

type GltfPrimitiveJson = Readonly<{
  attributes?: Readonly<Record<string, number>>;
  indices?: number;
  material?: number;
  mode?: number;
}>;

type GltfMeshJson = Readonly<{
  primitives?: readonly GltfPrimitiveJson[];
  extensions?: Readonly<Record<string, unknown>>;
}>;

type GltfAccessorJson = Readonly<{
  bufferView?: number;
  componentType?: number;
  count?: number;
  type?: string;
}>;

type GltfParserJson = Readonly<{
  meshes?: readonly GltfMeshJson[];
  accessors?: readonly GltfAccessorJson[];
}>;

export type SectionTopologyGltfParser = Readonly<{
  json: GltfParserJson;
  associations: ReadonlyMap<THREE.Object3D, GltfAssociation>;
  getDependency(type: 'accessor', index: number): Promise<unknown>;
}>;

type ManifoldPrimitiveJson = Readonly<{
  attributes?: Readonly<Record<string, number>>;
  indices?: number;
  mode?: number;
  material?: unknown;
  targets?: unknown;
}>;

type ManifoldExtensionJson = Readonly<{
  manifoldPrimitive?: ManifoldPrimitiveJson;
  mergeIndices?: number;
  mergeValues?: number;
}>;

class DisjointSet {
  private readonly parents: Int32Array;

  public constructor(size: number) {
    this.parents = Int32Array.from({ length: size }, (_, index) => index);
  }

  public representative(value: number): number {
    const parent = this.parents[value]!;
    if (parent !== value) {
      this.parents[value] = this.representative(parent);
    }
    return this.parents[value]!;
  }

  public union(left: number, right: number): void {
    const leftRoot = this.representative(left);
    const rightRoot = this.representative(right);
    if (leftRoot === rightRoot) {
      return;
    }
    this.parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  }
}

export type GltfSectionSurfaceRegistrationState = 'pending' | 'ready' | 'unsupported' | 'cancelled';

type SectionSourceRegistration =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'unsupported' }>
  | Readonly<{ status: 'cancelled' }>
  | Readonly<{ status: 'ready'; sources: readonly SectionSurfaceSource[] }>;

const sectionSourceRegistry = new WeakMap<THREE.Object3D, SectionSourceRegistration>();

/** Marks a loaded glTF root before its asynchronous topology registration begins. @internal */
export const setGltfSectionSurfaceRegistrationState = (
  scene: THREE.Group,
  status: Exclude<GltfSectionSurfaceRegistrationState, 'ready'>,
): void => {
  sectionSourceRegistry.set(scene, { status });
};
const standaloneSourceCache = new WeakMap<SectionSurfaceMesh, SectionSurfaceSource>();
const geometrySourceCache = new WeakMap<THREE.BufferGeometry, SectionSurfaceSource>();

const topologyFailure = (
  sourceKey: string,
  code: SectionTopologyFailure['code'],
  detail: string,
): Readonly<{ status: 'unsupported'; failure: SectionTopologyFailure }> => ({
  status: 'unsupported',
  failure: {
    sourceKey,
    code,
    message: `Section topology ${sourceKey}: ${detail}`,
  },
});

const orderedPair = (left: number, right: number): readonly [number, number] =>
  left <= right ? [left, right] : [right, left];

/** Half-edge `h` is slot `h % 3` of triangle `h / 3`: vertex slot → next slot, as `[v0,v1]`, `[v1,v2]`, `[v2,v0]`. */
const halfEdgeTriangle = (halfEdge: number): number => Math.floor(halfEdge / 3);

const halfEdgeStart = (triangleVertices: Uint32Array, halfEdge: number): number => triangleVertices[halfEdge]!;

const halfEdgeEnd = (triangleVertices: Uint32Array, halfEdge: number): number =>
  triangleVertices[halfEdge % 3 === 2 ? halfEdge - 2 : halfEdge + 1]!;

const comparePosition = (left: THREE.Vector3, right: THREE.Vector3): number =>
  left.x - right.x || left.y - right.y || left.z - right.z;

/** `comparePosition` for two vertices of a packed xyz array. */
const comparePositionAt = (positions: Float64Array, left: number, right: number): number =>
  positions[left * 3]! - positions[right * 3]! ||
  positions[left * 3 + 1]! - positions[right * 3 + 1]! ||
  positions[left * 3 + 2]! - positions[right * 3 + 2]!;

const positionBounds = (positions: Float64Array): THREE.Box3 => {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let offset = 0; offset < positions.length; offset += 3) {
    bounds.expandByPoint(point.fromArray(positions, offset));
  }
  return bounds;
};

const topologyExtent = (positions: Float64Array): number =>
  positionBounds(positions).getSize(new THREE.Vector3()).length();

const normalizeTopologyPositions = (positions: Float64Array): Float64Array => {
  const bounds = positionBounds(positions);
  const origin = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3()).length();
  const normalized = new Float64Array(positions.length);
  if (!(extent > 0)) {
    return normalized;
  }
  // Matches `Vector3.divideScalar`, which multiplies by the reciprocal.
  const scale = 1 / extent;
  for (let offset = 0; offset < positions.length; offset += 3) {
    normalized[offset] = (positions[offset]! - origin.x) * scale;
    normalized[offset + 1] = (positions[offset + 1]! - origin.y) * scale;
    normalized[offset + 2] = (positions[offset + 2]! - origin.z) * scale;
  }
  return normalized;
};

const spatialCellKey = (positions: Float64Array, vertex: number, epsilon: number): string =>
  `${Math.floor(positions[vertex * 3]! / epsilon)},${Math.floor(positions[vertex * 3 + 1]! / epsilon)},${Math.floor(positions[vertex * 3 + 2]! / epsilon)}`;

const distanceSquaredAt = (positions: Float64Array, left: number, right: number): number => {
  const dx = positions[left * 3]! - positions[right * 3]!;
  const dy = positions[left * 3 + 1]! - positions[right * 3 + 1]!;
  const dz = positions[left * 3 + 2]! - positions[right * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
};

const spatialClusters = (vertices: readonly number[], positions: Float64Array, epsilon: number): Int32Array => {
  const sorted = [...vertices].sort((left, right) => comparePositionAt(positions, left, right) || left - right);
  const sets = new DisjointSet(sorted.length);
  const cells = new Map<string, number[]>();

  for (const [index, vertex] of sorted.entries()) {
    const cellX = Math.floor(positions[vertex * 3]! / epsilon);
    const cellY = Math.floor(positions[vertex * 3 + 1]! / epsilon);
    const cellZ = Math.floor(positions[vertex * 3 + 2]! / epsilon);
    for (let x = cellX - 1; x <= cellX + 1; x++) {
      for (let y = cellY - 1; y <= cellY + 1; y++) {
        for (let z = cellZ - 1; z <= cellZ + 1; z++) {
          for (const candidate of cells.get(`${x},${y},${z}`) ?? []) {
            if (distanceSquaredAt(positions, vertex, sorted[candidate]!) <= epsilon * epsilon) {
              sets.union(index, candidate);
            }
          }
        }
      }
    }
    const key = spatialCellKey(positions, vertex, epsilon);
    const entries = cells.get(key) ?? [];
    entries.push(index);
    cells.set(key, entries);
  }

  const clusters = new Int32Array(positions.length / 3).fill(-1);
  for (const [index, vertex] of sorted.entries()) {
    clusters[vertex] = sets.representative(index);
  }
  return clusters;
};

const pairKey = (left: number, right: number): string => {
  const [first, second] = orderedPair(left, right);
  return `${first}:${second}`;
};

const uniquelyPairSeams = (options: {
  forward: readonly number[];
  reverse: readonly number[];
  patches: Int32Array;
  affinities: ReadonlyMap<string, number>;
}): Array<readonly [number, number]> | undefined => {
  const { patches, affinities } = options;
  const score = (left: number, right: number): number =>
    affinities.get(pairKey(patches[halfEdgeTriangle(left)]!, patches[halfEdgeTriangle(right)]!)) ?? 0;
  const uniqueBest = (edge: number, candidates: readonly number[]): number | undefined => {
    let bestScore = Number.NEGATIVE_INFINITY;
    let best: number | undefined;
    let ties = 0;
    for (const candidate of candidates) {
      const candidateScore = score(edge, candidate);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        best = candidate;
        ties = 1;
      } else if (candidateScore === bestScore) {
        ties++;
      }
    }
    return ties === 1 ? best : undefined;
  };

  const forward = [...options.forward];
  const reverse = [...options.reverse];
  const result: Array<readonly [number, number]> = [];
  while (forward.length > 0) {
    if (forward.length === 1) {
      result.push([forward[0]!, reverse[0]!]);
      break;
    }
    const pair = forward
      .map((first) => {
        const second = uniqueBest(first, reverse);
        return second !== undefined && uniqueBest(second, forward) === first ? ([first, second] as const) : undefined;
      })
      .find((candidate) => candidate !== undefined);
    if (!pair) {
      return undefined;
    }
    forward.splice(forward.indexOf(pair[0]), 1);
    reverse.splice(reverse.indexOf(pair[1]), 1);
    result.push(pair);
  }
  return result;
};

const validateVertexLinks = (options: {
  sourceKey: string;
  triangleVertices: Uint32Array;
  /** Paired half-edges, two entries per pair. */
  pairs: readonly number[];
  vertexCount: number;
}): SectionTopologyFailure | undefined => {
  const { sourceKey, triangleVertices, pairs, vertexCount } = options;
  const canonical = new DisjointSet(vertexCount);
  for (let offset = 0; offset < pairs.length; offset += 2) {
    const first = pairs[offset]!;
    const second = pairs[offset + 1]!;
    canonical.union(halfEdgeStart(triangleVertices, first), halfEdgeEnd(triangleVertices, second));
    canonical.union(halfEdgeEnd(triangleVertices, first), halfEdgeStart(triangleVertices, second));
  }
  const roots = Int32Array.from({ length: vertexCount }, (_, vertex) => canonical.representative(vertex));
  const trianglesAt = new Map<number, number[]>();
  for (const [corner, vertex] of triangleVertices.entries()) {
    const root = roots[vertex]!;
    const entries = trianglesAt.get(root) ?? [];
    entries.push(halfEdgeTriangle(corner));
    trianglesAt.set(root, entries);
  }
  const linkEdges = new Map<number, Array<readonly [number, number]>>();
  for (let offset = 0; offset < pairs.length; offset += 2) {
    const first = pairs[offset]!;
    const second = pairs[offset + 1]!;
    for (const vertex of [halfEdgeStart(triangleVertices, first), halfEdgeEnd(triangleVertices, first)]) {
      const root = roots[vertex]!;
      const entries = linkEdges.get(root) ?? [];
      entries.push([halfEdgeTriangle(first), halfEdgeTriangle(second)]);
      linkEdges.set(root, entries);
    }
  }

  for (const [root, incidentEntries] of trianglesAt) {
    const incident = [...new Set(incidentEntries)].sort((left, right) => left - right);
    if (incident.length === 0) {
      continue;
    }
    const localIndex = new Map(incident.map((triangle, index) => [triangle, index] as const));
    const degrees = new Uint32Array(incident.length);
    const connected = new DisjointSet(incident.length);
    for (const [leftTriangle, rightTriangle] of linkEdges.get(root) ?? []) {
      const left = localIndex.get(leftTriangle);
      const right = localIndex.get(rightTriangle);
      if (left === undefined || right === undefined) {
        continue;
      }
      degrees[left]! += 1;
      degrees[right]! += 1;
      connected.union(left, right);
    }
    if (degrees.some((degree) => degree !== 2)) {
      return {
        sourceKey,
        code: 'non-manifold-vertex',
        message: `Section topology ${sourceKey}: has a non-manifold vertex link`,
      };
    }
    const first = connected.representative(0);
    if (incident.slice(1).some((_, index) => connected.representative(index + 1) !== first)) {
      return {
        sourceKey,
        code: 'non-manifold-vertex',
        message: `Section topology ${sourceKey}: has a disconnected vertex link`,
      };
    }
  }
  return undefined;
};

const buildCanonicalTopologyRecipe = (input: {
  sourceKey: string;
  positions: Float64Array;
  triangleVertices: Uint32Array;
  allowSeamFallback: boolean;
}): SectionCanonicalTopologyWorkerResult => {
  const startedAt = performance.now();
  const { sourceKey, positions, triangleVertices } = input;
  const triangleCount = triangleVertices.length / 3;
  const vertexCount = positions.length / 3;
  if (triangleCount === 0) {
    return topologyFailure(sourceKey, 'degenerate-triangle', 'contains no non-degenerate triangles');
  }

  const start = (halfEdge: number): number => halfEdgeStart(triangleVertices, halfEdge);
  const end = (halfEdge: number): number => halfEdgeEnd(triangleVertices, halfEdge);
  const low = (halfEdge: number): number => Math.min(start(halfEdge), end(halfEdge));
  const high = (halfEdge: number): number => Math.max(start(halfEdge), end(halfEdge));
  const sameUndirectedEdge = (left: number, right: number): boolean =>
    low(left) === low(right) && high(left) === high(right);

  const indexed = Uint32Array.from({ length: triangleVertices.length }, (_, halfEdge) => halfEdge);
  // The index tie-break keeps the order of the stable sort over half-edge records this replaced.
  indexed.sort(
    (left, right) =>
      low(left) - low(right) ||
      high(left) - high(right) ||
      start(left) - start(right) ||
      end(left) - end(right) ||
      left - right,
  );
  /** Paired half-edges, two entries per pair. */
  const pairs: number[] = [];
  const unmatched: number[] = [];
  for (let offset = 0; offset < indexed.length; ) {
    const firstOffset = offset;
    offset++;
    while (offset < indexed.length && sameUndirectedEdge(indexed[firstOffset]!, indexed[offset]!)) {
      offset++;
    }
    const first = indexed[firstOffset]!;
    const groupLength = offset - firstOffset;
    if (groupLength === 1) {
      unmatched.push(first);
    } else if (
      groupLength === 2 &&
      start(first) === end(indexed[firstOffset + 1]!) &&
      end(first) === start(indexed[firstOffset + 1]!)
    ) {
      pairs.push(first, indexed[firstOffset + 1]!);
    } else {
      return topologyFailure(
        sourceKey,
        'inconsistent-orientation',
        'has a non-manifold or inconsistently oriented indexed edge',
      );
    }
  }

  if (unmatched.length > 0 && !input.allowSeamFallback) {
    return topologyFailure(sourceKey, 'open-surface', 'has an open edge in authoritative manifold topology');
  }

  const representativeVertices = Int32Array.from({ length: vertexCount }, (_, vertex) => vertex);

  if (unmatched.length > 0) {
    const normalizedPositions = normalizeTopologyPositions(positions);
    let maximumCoordinate = Number.MIN_VALUE;
    for (const coordinate of normalizedPositions) {
      maximumCoordinate = Math.max(maximumCoordinate, Math.abs(coordinate));
    }
    const epsilon = 1e-6;
    const matchRadius = Math.min(
      Math.max(maximumCoordinate * float32Epsilon * 4, minimumNormalizedTopologyTolerance),
      epsilon,
    );
    const seamVertices = [...new Set(unmatched.flatMap((edge) => [start(edge), end(edge)]))].sort(
      (left, right) => left - right,
    );
    const clusters = spatialClusters(seamVertices, normalizedPositions, matchRadius);
    const bySeam = new Map<string, number[]>();
    for (const edge of unmatched) {
      const key = pairKey(clusters[start(edge)]!, clusters[end(edge)]!);
      const entries = bySeam.get(key) ?? [];
      entries.push(edge);
      bySeam.set(key, entries);
    }

    const patchSets = new DisjointSet(triangleCount);
    for (let offset = 0; offset < pairs.length; offset += 2) {
      patchSets.union(halfEdgeTriangle(pairs[offset]!), halfEdgeTriangle(pairs[offset + 1]!));
    }
    const patches = Int32Array.from({ length: triangleCount }, (_, triangle) => patchSets.representative(triangle));
    const affinities = new Map<string, number>();
    for (const edges of bySeam.values()) {
      const first = edges[0]!;
      const [lowCluster, highCluster] = orderedPair(clusters[start(first)]!, clusters[end(first)]!);
      const forward = edges.filter(
        (edge) => clusters[start(edge)] === lowCluster && clusters[end(edge)] === highCluster,
      );
      const reverse = edges.filter((edge) => !forward.includes(edge));
      for (const left of forward) {
        for (const right of reverse) {
          const key = pairKey(patches[halfEdgeTriangle(left)]!, patches[halfEdgeTriangle(right)]!);
          affinities.set(key, (affinities.get(key) ?? 0) + 1);
        }
      }
    }

    for (const edges of bySeam.values()) {
      const first = edges[0]!;
      const [lowCluster, highCluster] = orderedPair(clusters[start(first)]!, clusters[end(first)]!);
      if (lowCluster === highCluster) {
        return topologyFailure(sourceKey, 'collapsed-triangle', 'has a seam edge collapsed by topology tolerance');
      }
      const forward = edges.filter(
        (edge) => clusters[start(edge)] === lowCluster && clusters[end(edge)] === highCluster,
      );
      const reverse = edges.filter((edge) => !forward.includes(edge));
      if (edges.length === 1) {
        return topologyFailure(sourceKey, 'open-surface', 'has an open material seam');
      }
      if (forward.length !== reverse.length || forward.length === 0) {
        return topologyFailure(sourceKey, 'inconsistent-orientation', 'has an inconsistently oriented material seam');
      }
      const resolved =
        forward.length === 1
          ? ([[forward[0]!, reverse[0]!]] as const)
          : uniquelyPairSeams({ forward, reverse, patches, affinities });
      if (!resolved) {
        return topologyFailure(sourceKey, 'ambiguous-seam', 'has an ambiguous material seam');
      }
      for (const [firstEdge, secondEdge] of resolved) {
        pairs.push(firstEdge, secondEdge);
      }
    }

    const representativeByCluster = new Map<number, number>();
    for (const vertex of seamVertices) {
      const cluster = clusters[vertex]!;
      const current = representativeByCluster.get(cluster);
      if (current === undefined || comparePositionAt(positions, vertex, current) < 0) {
        representativeByCluster.set(cluster, vertex);
      }
    }
    for (const vertex of seamVertices) {
      representativeVertices[vertex] = representativeByCluster.get(clusters[vertex]!)!;
    }
  }

  const vertexLinkFailure = validateVertexLinks({ sourceKey, triangleVertices, pairs, vertexCount });
  if (vertexLinkFailure) {
    return { status: 'unsupported', failure: vertexLinkFailure };
  }

  const triangleEdges = new Int32Array(triangleCount * 3).fill(-1);
  const edges = new Int32Array(pairs.length * 2);
  for (let offset = 0; offset < pairs.length; offset += 2) {
    const first = pairs[offset]!;
    const second = pairs[offset + 1]!;
    const edgeIndex = offset / 2;
    triangleEdges[first] = edgeIndex;
    triangleEdges[second] = edgeIndex;
    edges[edgeIndex * 4] = representativeVertices[start(first)]!;
    edges[edgeIndex * 4 + 1] = representativeVertices[end(first)]!;
    edges[edgeIndex * 4 + 2] = halfEdgeTriangle(first);
    edges[edgeIndex * 4 + 3] = halfEdgeTriangle(second);
  }
  if (triangleEdges.some((edge) => edge < 0)) {
    return topologyFailure(sourceKey, 'open-surface', 'has an unpaired surface edge');
  }

  const componentSets = new DisjointSet(triangleCount);
  for (let offset = 0; offset < edges.length; offset += 4) {
    componentSets.union(edges[offset + 2]!, edges[offset + 3]!);
  }
  const componentsByRoot = new Map<number, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const root = componentSets.representative(triangle);
    const entries = componentsByRoot.get(root) ?? [];
    entries.push(triangle);
    componentsByRoot.set(root, entries);
  }
  const components = [...componentsByRoot.values()]
    .sort((left, right) => left[0]! - right[0]!)
    .map((componentTriangles) => {
      const componentEdges = new Set<number>();
      for (const triangle of componentTriangles) {
        for (const edge of triangleEdges.subarray(triangle * 3, triangle * 3 + 3)) {
          componentEdges.add(edge);
        }
      }
      return {
        triangles: Uint32Array.from(componentTriangles),
        edges: Uint32Array.from([...componentEdges].sort((left, right) => left - right)),
      };
    });

  return {
    status: 'ready',
    representativeVertices,
    triangleEdges,
    edges,
    components,
    buildMilliseconds: performance.now() - startedAt,
  };
};

const indexComponentsByTriangle = (triangleCount: number, components: readonly SurfaceComponent[]): Int32Array => {
  const componentByTriangle = new Int32Array(triangleCount);
  for (const [componentIndex, component] of components.entries()) {
    for (const triangle of component.triangles) {
      componentByTriangle[triangle] = componentIndex;
    }
  }
  return componentByTriangle;
};

/** Keeps the recipe's typed arrays as the topology; only triangle vertices are rewritten, in place. */
const assembleCanonicalTopology = (
  input: TopologyBuildInput,
  recipe: SectionCanonicalTopologyWorkerResult,
): SectionSurfaceTopologyResult => {
  const startedAt = performance.now();
  if (recipe.status === 'unsupported') {
    input.onHydrate?.(performance.now() - startedAt);
    return recipe;
  }
  const { triangleVertices } = input;
  for (let corner = 0; corner < triangleVertices.length; corner++) {
    triangleVertices[corner] = recipe.representativeVertices[triangleVertices[corner]!]!;
  }
  const triangleCount = triangleVertices.length / 3;
  const result: SectionSurfaceTopologyResult = {
    status: 'ready',
    topology: {
      path: input.path,
      sourceKey: input.sourceKey,
      positions: input.positions,
      triangleVertices,
      triangleEdges: recipe.triangleEdges,
      triangleParticipants: input.triangleParticipants,
      triangleMaterialOrders: input.triangleMaterialOrders,
      participants: input.participants,
      edges: recipe.edges,
      components: recipe.components,
      componentByTriangle: indexComponentsByTriangle(triangleCount, recipe.components),
      distanceTolerance: sourceTopologyEpsilon(input.positions),
      buildMilliseconds: recipe.buildMilliseconds,
    },
  };
  input.onHydrate?.(performance.now() - startedAt);
  return result;
};

const buildCanonicalTopology = (input: TopologyBuildInput): SectionSurfaceTopologyResult =>
  assembleCanonicalTopology(input, buildCanonicalTopologyRecipe(input));

export const buildSectionCanonicalTopologyWorkerResult = (
  input: SectionCanonicalTopologyWorkerInput,
): SectionCanonicalTopologyWorkerResult => buildCanonicalTopologyRecipe(input);

const buildCanonicalTopologyAsync = async (input: TopologyBuildInput): Promise<SectionSurfaceTopologyResult> => {
  const packStartedAt = performance.now();
  const request: SectionCanonicalTopologyWorkerInput = {
    sourceKey: input.sourceKey,
    positions: input.positions,
    triangleVertices: input.triangleVertices,
    allowSeamFallback: input.allowSeamFallback,
  };
  const pending = buildSectionTopologyRecipeInWorker(request);
  if (!pending) {
    return buildCanonicalTopology(input);
  }
  input.onPack?.(performance.now() - packStartedAt);
  try {
    return assembleCanonicalTopology(input, await pending);
  } catch {
    return buildCanonicalTopology(input);
  }
};

/** The render material slot of one geometry triangle, from the geometry's groups. */
const materialOrderAtTriangle = (mesh: SectionSurfaceMesh, triangleIndex: number): number => {
  const indexOffset = triangleIndex * 3;
  const group = mesh.geometry.groups.find(
    (candidate) => indexOffset >= candidate.start && indexOffset < candidate.start + candidate.count,
  );
  return group?.materialIndex ?? 0;
};

const geometryRevision = (geometry: THREE.BufferGeometry): string => {
  const { position } = geometry.attributes;
  const index = geometry.getIndex();
  const positionVersion = position && 'version' in position ? position.version : position?.data.version;
  return [
    geometry.uuid,
    positionVersion ?? 0,
    position?.count ?? 0,
    index?.version ?? 0,
    index?.count ?? 0,
    geometry.drawRange.start,
    geometry.drawRange.count,
  ].join(':');
};

const sourceTopologyEpsilon = (positions: Float64Array): number => topologyExtent(positions) * 1e-6;

/**
 * The squared length of the cross product of a triangle's edges (twice its area, squared), as `Vector3.cross`
 * computes it, for the three vertices at `offset` in `triangleVertices`.
 */
const triangleAreaSquared = (() => {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  return (positions: Float64Array, triangleVertices: Uint32Array, offset: number): number => {
    a.fromArray(positions, triangleVertices[offset]! * 3);
    b.fromArray(positions, triangleVertices[offset + 1]! * 3).sub(a);
    c.fromArray(positions, triangleVertices[offset + 2]! * 3).sub(a);
    return b.cross(c).lengthSq();
  };
})();

/** Writes every vertex of `position`, moved by `matrix`, into `target` from vertex `base`; false on a non-finite one. */
const writeSourcePositions = (options: {
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  matrix: THREE.Matrix4;
  target: Float64Array;
  base: number;
}): boolean => {
  const { position, matrix, target, base } = options;
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.set(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).applyMatrix4(matrix);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      return false;
    }
    point.toArray(target, (base + vertex) * 3);
  }
  return true;
};

/**
 * Triangle columns sized for `capacity`, trimmed to the triangles actually kept. A triangle is staged first, so
 * it can be tested in place, and kept only when committed.
 */
const createTriangleColumns = (capacity: number) => {
  const vertices = new Uint32Array(capacity * 3);
  const participants = new Uint32Array(capacity);
  const materialOrders = new Uint32Array(capacity);
  let count = 0;
  return {
    get count() {
      return count;
    },
    stage(first: number, second: number, third: number): void {
      vertices[count * 3] = first;
      vertices[count * 3 + 1] = second;
      vertices[count * 3 + 2] = third;
    },
    stagedAreaSquared: (positions: Float64Array): number => triangleAreaSquared(positions, vertices, count * 3),
    /** Keeps the staged triangle and returns its topology index. */
    commit(participant: number, materialOrder: number): number {
      participants[count] = participant;
      materialOrders[count] = materialOrder;
      return count++;
    },
    finish: () =>
      count === capacity
        ? { triangleVertices: vertices, triangleParticipants: participants, triangleMaterialOrders: materialOrders }
        : {
            triangleVertices: vertices.slice(0, count * 3),
            triangleParticipants: participants.slice(0, count),
            triangleMaterialOrders: materialOrders.slice(0, count),
          },
  };
};

const createFallbackTopologyInput = (options: {
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): TopologyBuildInput | SectionSurfaceTopologyResult => {
  let vertexCount = 0;
  let triangleCapacity = 0;
  const vertexBaseByParticipant: number[] = [];
  for (const participant of options.participants) {
    participant.topologyTriangleByGeometryTriangle = new Int32Array(0);
    participant.usedMaterialOrders.clear();
    const { position } = participant.mesh.geometry.attributes;
    if (!position || position.itemSize < 3) {
      return topologyFailure(options.sourceKey, 'missing-position', 'is missing a VEC3 position attribute');
    }
    vertexBaseByParticipant.push(vertexCount);
    vertexCount += position.count;
    triangleCapacity += Math.floor((participant.mesh.geometry.getIndex()?.count ?? position.count) / 3);
  }
  const positions = new Float64Array(vertexCount * 3);
  for (const [participantIndex, participant] of options.participants.entries()) {
    const position = participant.mesh.geometry.attributes['position']!;
    if (
      !writeSourcePositions({
        position,
        matrix: participant.localToSource,
        target: positions,
        base: vertexBaseByParticipant[participantIndex]!,
      })
    ) {
      return topologyFailure(options.sourceKey, 'non-finite-position', 'contains a non-finite position');
    }
  }

  const epsilon = sourceTopologyEpsilon(positions);
  const triangles = createTriangleColumns(triangleCapacity);
  let sawDegenerateTriangle = false;
  for (const [participantIndex, participant] of options.participants.entries()) {
    const position = participant.mesh.geometry.attributes['position']!;
    const vertexBase = vertexBaseByParticipant[participantIndex]!;

    const index = participant.mesh.geometry.getIndex();
    const indexCount = index?.count ?? position.count;
    const drawStart = Math.max(0, participant.mesh.geometry.drawRange.start);
    const requestedCount = participant.mesh.geometry.drawRange.count;
    const drawEnd = Math.min(
      indexCount,
      requestedCount === Number.POSITIVE_INFINITY ? indexCount : drawStart + requestedCount,
    );
    if ((drawEnd - drawStart) % 3 !== 0) {
      return topologyFailure(options.sourceKey, 'collapsed-triangle', 'has an incomplete triangle index list');
    }
    const topologyTriangleByGeometryTriangle = new Int32Array(Math.ceil(indexCount / 3)).fill(-1);
    participant.topologyTriangleByGeometryTriangle = topologyTriangleByGeometryTriangle;
    const isVertex = (vertex: number): boolean => Number.isInteger(vertex) && vertex >= 0 && vertex < position.count;
    for (let offset = drawStart; offset < drawEnd; offset += 3) {
      const first = index ? index.getX(offset) : offset;
      const second = index ? index.getX(offset + 1) : offset + 1;
      const third = index ? index.getX(offset + 2) : offset + 2;
      if (!isVertex(first) || !isVertex(second) || !isVertex(third)) {
        return topologyFailure(options.sourceKey, 'missing-position', 'references a missing vertex');
      }
      if (first === second || second === third || third === first) {
        return topologyFailure(options.sourceKey, 'collapsed-triangle', 'contains a collapsed triangle');
      }
      triangles.stage(vertexBase + first, vertexBase + second, vertexBase + third);
      if (triangles.stagedAreaSquared(positions) <= epsilon ** 4) {
        sawDegenerateTriangle = true;
        continue;
      }
      const participantTriangleIndex = Math.floor(offset / 3);
      const materialOrder = materialOrderAtTriangle(participant.mesh, participantTriangleIndex);
      participant.usedMaterialOrders.add(materialOrder);
      topologyTriangleByGeometryTriangle[participantTriangleIndex] = triangles.commit(participantIndex, materialOrder);
    }
  }

  if (triangles.count === 0 && sawDegenerateTriangle) {
    return topologyFailure(options.sourceKey, 'degenerate-triangle', 'contains only degenerate triangles');
  }
  return {
    sourceKey: options.sourceKey,
    path: 'fallback',
    positions,
    ...triangles.finish(),
    participants: options.participants,
    allowSeamFallback: true,
  };
};

const buildFallbackTopology = (options: {
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): SectionSurfaceTopologyResult => {
  const input = createFallbackTopologyInput(options);
  return 'status' in input ? input : buildCanonicalTopology(input);
};

const buildFallbackTopologyAsync = async (options: {
  onHydrate?: (milliseconds: number) => void;
  onPack?: (milliseconds: number) => void;
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): Promise<SectionSurfaceTopologyResult> => {
  const input = createFallbackTopologyInput(options);
  return 'status' in input
    ? input
    : buildCanonicalTopologyAsync({ ...input, onHydrate: options.onHydrate, onPack: options.onPack });
};

const isMaterialVisible = (material: THREE.Material): boolean =>
  material.visible && (!('opacity' in material) || typeof material.opacity !== 'number' || material.opacity > 0);

const isVisibleInHierarchy = (object: THREE.Object3D): boolean => {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent ?? undefined;
  }
  return true;
};

const participantVisibility = (participant: SectionSurfaceParticipant): 'visible' | 'hidden' | 'partial' => {
  if (!isVisibleInHierarchy(participant.mesh)) {
    return 'hidden';
  }
  const materials = Array.isArray(participant.mesh.material) ? participant.mesh.material : [participant.mesh.material];
  const { usedMaterialOrders } = participant;
  const usedMaterials =
    usedMaterialOrders.size > 0
      ? [...usedMaterialOrders].map((order) => materials[order] ?? materials[0]!)
      : [materials[0]!];
  const visibleCount = usedMaterials.filter((material) => isMaterialVisible(material)).length;
  if (visibleCount === 0) {
    return 'hidden';
  }
  return visibleCount === usedMaterials.length ? 'visible' : 'partial';
};

const createParticipant = (options: {
  mesh: SectionSurfaceMesh;
  rootInverse: THREE.Matrix4;
  order: number;
  association?: GltfAssociation;
}): SectionSurfaceParticipant => {
  return {
    mesh: options.mesh,
    localToSource: new THREE.Matrix4().multiplyMatrices(options.rootInverse, options.mesh.matrixWorld),
    order: options.order,
    nodeIndex: options.association?.nodes,
    meshIndex: options.association?.meshes,
    primitiveIndex: options.association?.primitives,
    topologyTriangleByGeometryTriangle: new Int32Array(0),
    usedMaterialOrders: new Set(),
  };
};

const createStandaloneSource = (mesh: SectionSurfaceMesh): SectionSurfaceSource => {
  const revision = geometryRevision(mesh.geometry);
  const cached = standaloneSourceCache.get(mesh);
  if (cached?.revision === revision) {
    return cached;
  }
  mesh.updateWorldMatrix(true, true);
  const participant = createParticipant({
    mesh,
    rootInverse: new THREE.Matrix4().copy(mesh.matrixWorld).invert(),
    order: 0,
  });
  const builtRevision = geometryRevision(mesh.geometry);
  const source: SectionSurfaceSource = {
    key: mesh.uuid,
    root: mesh,
    owner: getModelComponentOwnerInHierarchy(mesh),
    participants: [participant],
    topology: buildFallbackTopology({
      sourceKey: mesh.uuid,
      participants: [participant],
    }),
    revision: builtRevision,
  };
  standaloneSourceCache.set(mesh, source);
  return source;
};

/** @internal */
export const buildSectionSurfaceTopologyForGeometry = (
  geometry: THREE.BufferGeometry,
): SectionSurfaceTopologyResult => {
  return getGeometrySource(geometry).topology;
};

const getGeometrySource = (geometry: THREE.BufferGeometry): SectionSurfaceSource => {
  const revision = geometryRevision(geometry);
  const cached = geometrySourceCache.get(geometry);
  if (cached?.revision === revision) {
    return cached;
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const source = createStandaloneSource(mesh);
  geometrySourceCache.set(geometry, source);
  return source;
};

const getAssociation = (
  object: THREE.Object3D,
  associations: ReadonlyMap<THREE.Object3D, GltfAssociation>,
): GltfAssociation | undefined => {
  const direct = associations.get(object);
  let nodeIndex = direct?.nodes;
  let current = object.parent;
  while (nodeIndex === undefined && current) {
    nodeIndex = associations.get(current)?.nodes;
    current = current.parent;
  }
  if (!direct && nodeIndex === undefined) {
    return undefined;
  }
  return { ...direct, nodes: nodeIndex };
};

const asAccessor = (value: unknown): (THREE.BufferAttribute | THREE.InterleavedBufferAttribute) | undefined => {
  if (
    value &&
    typeof value === 'object' &&
    'count' in value &&
    'itemSize' in value &&
    'getX' in value &&
    typeof (value as { getX?: unknown }).getX === 'function'
  ) {
    return value as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  }
  return undefined;
};

const readUnsignedAccessor = async (parser: SectionTopologyGltfParser, accessorIndex: number): Promise<Uint32Array> => {
  const descriptor = parser.json.accessors?.[accessorIndex];
  if (descriptor?.type !== 'SCALAR' || ![5121, 5123, 5125].includes(descriptor.componentType ?? -1)) {
    throw new Error(`accessor ${accessorIndex} must be an unsigned SCALAR accessor`);
  }
  const accessor = asAccessor(await parser.getDependency('accessor', accessorIndex));
  if (accessor?.itemSize !== 1 || accessor.count !== descriptor.count) {
    throw new Error(`accessor ${accessorIndex} could not be decoded as SCALAR`);
  }
  const values = new Uint32Array(accessor.count);
  for (let index = 0; index < accessor.count; index++) {
    const value = accessor.getX(index);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xff_ff_ff_ff) {
      throw new Error(`accessor ${accessorIndex} contains an invalid unsigned index`);
    }
    values[index] = value;
  }
  return values;
};

const decodeManifoldTopology = async (options: {
  onHydrate?: (milliseconds: number) => void;
  onPack?: (milliseconds: number) => void;
  parser: SectionTopologyGltfParser;
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
  meshIndex: number;
}): Promise<SectionSurfaceTopologyResult | undefined> => {
  const { parser, sourceKey, participants, meshIndex } = options;
  const meshJson = parser.json.meshes?.[meshIndex];
  const rawExtension = meshJson?.extensions?.['EXT_mesh_manifold'];
  if (rawExtension === undefined) {
    return undefined;
  }
  const fail = (detail: string): SectionSurfaceTopologyResult =>
    topologyFailure(sourceKey, 'invalid-extension', `EXT_mesh_manifold mesh ${meshIndex}: ${detail}`);

  try {
    if (!rawExtension || typeof rawExtension !== 'object') {
      return fail('extension must be an object');
    }
    const extension = rawExtension as ManifoldExtensionJson;
    const manifold = extension.manifoldPrimitive;
    if (!manifold || typeof manifold.indices !== 'number') {
      return fail('manifoldPrimitive and its indices accessor are required');
    }
    if ((manifold.mode ?? 4) !== 4) {
      return fail('manifoldPrimitive must use TRIANGLES mode');
    }
    if (manifold.material !== undefined || manifold.targets !== undefined) {
      return fail('manifoldPrimitive must not define material or morph targets');
    }
    const primitiveJson = meshJson.primitives ?? [];
    if (primitiveJson.length === 0 || primitiveJson.some((primitive) => (primitive.mode ?? 4) !== 4)) {
      return fail('annotated mesh may contain only TRIANGLES primitives');
    }
    const firstAttributes = primitiveJson[0]!.attributes;
    if (
      !firstAttributes ||
      primitiveJson.some((primitive) => JSON.stringify(primitive.attributes) !== JSON.stringify(firstAttributes))
    ) {
      return fail('all render primitives must share the same attribute accessors');
    }
    if (
      !manifold.attributes ||
      Object.keys(manifold.attributes).length !== 1 ||
      manifold.attributes['POSITION'] !== firstAttributes['POSITION']
    ) {
      return fail('manifoldPrimitive must define and share only the render POSITION accessor');
    }
    const indexAccessors = primitiveJson.map((primitive) => primitive.indices);
    if (indexAccessors.some((index) => typeof index !== 'number')) {
      return fail('all render primitives must be indexed');
    }
    const indexViews = indexAccessors.map((index) => parser.json.accessors?.[index!]?.bufferView);
    if (indexViews.some((view) => view === undefined) || new Set(indexViews).size !== 1) {
      return fail('all render index accessors must share one bufferView');
    }

    const originalByPrimitive = await Promise.all(
      indexAccessors.map(async (index) => readUnsignedAccessor(parser, index!)),
    );
    const original = new Uint32Array(originalByPrimitive.reduce((total, indices) => total + indices.length, 0));
    let originalOffset = 0;
    for (const indices of originalByPrimitive) {
      original.set(indices, originalOffset);
      originalOffset += indices.length;
    }
    const manifoldIndices = await readUnsignedAccessor(parser, manifold.indices);
    if (manifoldIndices.length !== original.length) {
      return fail('manifold and render index streams must have equal length');
    }
    const changed: Array<readonly [number, number]> = [];
    for (const [offset, before] of original.entries()) {
      if (before !== manifoldIndices[offset]) {
        changed.push([offset, manifoldIndices[offset]!]);
      }
    }
    if (extension.mergeIndices === undefined && extension.mergeValues === undefined) {
      if (changed.length > 0) {
        return fail('changed manifold indices require mergeIndices and mergeValues');
      }
    } else if (extension.mergeIndices === undefined || extension.mergeValues === undefined) {
      return fail('mergeIndices and mergeValues must be defined together');
    } else {
      const mergeIndices = await readUnsignedAccessor(parser, extension.mergeIndices);
      const mergeValues = await readUnsignedAccessor(parser, extension.mergeValues);
      const described = Array.from(mergeIndices, (offset, index) => [offset, mergeValues[index]] as const);
      if (JSON.stringify(described) !== JSON.stringify(changed)) {
        return fail('mergeIndices/mergeValues do not describe the manifold index changes');
      }
    }

    const positionAccessorIndex = firstAttributes['POSITION'];
    if (positionAccessorIndex === undefined) {
      return fail('render primitives must define POSITION');
    }
    const positionDescriptor = parser.json.accessors?.[positionAccessorIndex];
    if (positionDescriptor?.type !== 'VEC3' || positionDescriptor.componentType !== 5126) {
      return fail('POSITION accessor must be a floating-point VEC3 accessor');
    }
    const position = asAccessor(await parser.getDependency('accessor', positionAccessorIndex));
    if (position?.itemSize !== 3 || position.count !== positionDescriptor.count) {
      return fail('POSITION accessor could not be decoded as VEC3');
    }
    if (manifoldIndices.length % 3 !== 0) {
      return fail('manifold index count must be divisible by 3');
    }
    if (manifoldIndices.some((vertex) => vertex >= position.count)) {
      return fail('manifold primitive index out of range');
    }
    for (let offset = 0; offset < manifoldIndices.length; offset += 3) {
      const a = manifoldIndices[offset]!;
      const b = manifoldIndices[offset + 1]!;
      const c = manifoldIndices[offset + 2]!;
      if (a === b || b === c || c === a) {
        return fail('manifold primitive contains a collapsed triangle');
      }
    }
    for (const [offset, after] of changed) {
      const before = original[offset]!;
      if (
        position.getX(before) !== position.getX(after) ||
        position.getY(before) !== position.getY(after) ||
        position.getZ(before) !== position.getZ(after)
      ) {
        return fail('merged vertices must have identical POSITION values');
      }
    }

    const representative = participants[0];
    if (!representative) {
      return fail('has no loaded render participant');
    }
    if (
      participants.some((participant) =>
        participant.localToSource.elements.some(
          (value, index) => Math.abs(value - representative.localToSource.elements[index]!) > Number.EPSILON,
        ),
      )
    ) {
      return fail('render primitives do not share one source transform');
    }
    const positions = new Float64Array(position.count * 3);
    if (!writeSourcePositions({ position, matrix: representative.localToSource, target: positions, base: 0 })) {
      return fail('contains a non-finite position');
    }
    const epsilon = sourceTopologyEpsilon(positions);
    const participantIndexByPrimitive = new Map(
      participants.map((participant, index) => [participant.primitiveIndex ?? 0, index] as const),
    );
    const triangles = createTriangleColumns(manifoldIndices.length / 3);
    let sawDegenerateTriangle = false;
    let indexOffset = 0;
    for (const [primitiveIndex, primitiveIndices] of originalByPrimitive.entries()) {
      const participantIndex = participantIndexByPrimitive.get(primitiveIndex);
      const participant = participantIndex === undefined ? undefined : participants[participantIndex];
      if (participantIndex === undefined || !participant) {
        return fail(`primitive ${primitiveIndex} has no loaded render participant`);
      }
      const topologyTriangleByGeometryTriangle = new Int32Array(primitiveIndices.length / 3).fill(-1);
      participant.topologyTriangleByGeometryTriangle = topologyTriangleByGeometryTriangle;
      participant.usedMaterialOrders.clear();
      for (let primitiveOffset = 0; primitiveOffset < primitiveIndices.length; primitiveOffset += 3) {
        const first = manifoldIndices[indexOffset + primitiveOffset]!;
        const second = manifoldIndices[indexOffset + primitiveOffset + 1]!;
        const third = manifoldIndices[indexOffset + primitiveOffset + 2]!;
        if (first >= position.count || second >= position.count || third >= position.count) {
          return fail('manifold primitive index out of range');
        }
        if (first === second || second === third || third === first) {
          return fail('manifold primitive contains a collapsed triangle');
        }
        triangles.stage(first, second, third);
        if (triangles.stagedAreaSquared(positions) <= epsilon ** 4) {
          sawDegenerateTriangle = true;
          continue;
        }
        const participantTriangleIndex = primitiveOffset / 3;
        const materialOrder = materialOrderAtTriangle(participant.mesh, participantTriangleIndex);
        participant.usedMaterialOrders.add(materialOrder);
        topologyTriangleByGeometryTriangle[participantTriangleIndex] = triangles.commit(
          participantIndex,
          materialOrder,
        );
      }
      indexOffset += primitiveIndices.length;
    }
    if (triangles.count === 0 && sawDegenerateTriangle) {
      return fail('contains only degenerate triangles');
    }
    return await buildCanonicalTopologyAsync({
      sourceKey,
      path: 'extension',
      positions,
      ...triangles.finish(),
      participants,
      allowSeamFallback: false,
      onHydrate: options.onHydrate,
      onPack: options.onPack,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

const offsetComponents = (
  components: readonly SurfaceComponent[],
  triangleOffset: number,
  edgeOffset: number,
): SurfaceComponent[] =>
  components.map((component) => ({
    triangles: component.triangles.map((triangle) => triangle + triangleOffset),
    edges: component.edges.map((edge) => edge + edgeOffset),
  }));

const combineExactTopologies = (
  sourceKey: string,
  topologies: readonly SectionSurfaceTopology[],
): SectionSurfaceTopologyResult => {
  let vertexCount = 0;
  let triangleCount = 0;
  let edgeCount = 0;
  for (const topology of topologies) {
    vertexCount += topology.positions.length / 3;
    triangleCount += topology.triangleParticipants.length;
    edgeCount += topology.edges.length / 4;
  }
  const positions = new Float64Array(vertexCount * 3);
  const triangleVertices = new Uint32Array(triangleCount * 3);
  const triangleEdges = new Int32Array(triangleCount * 3);
  const triangleParticipants = new Uint32Array(triangleCount);
  const triangleMaterialOrders = new Uint32Array(triangleCount);
  const edges = new Int32Array(edgeCount * 4);
  const participants: SectionSurfaceParticipant[] = [];
  const participantIndices = new Map<SectionSurfaceParticipant, number>();
  const components: SurfaceComponent[] = [];
  let vertexOffset = 0;
  let triangleOffset = 0;
  let edgeOffset = 0;
  let buildMilliseconds = 0;
  for (const topology of topologies) {
    buildMilliseconds += topology.buildMilliseconds;
    positions.set(topology.positions, vertexOffset * 3);
    for (const [corner, vertex] of topology.triangleVertices.entries()) {
      triangleVertices[triangleOffset * 3 + corner] = vertex + vertexOffset;
      triangleEdges[triangleOffset * 3 + corner] = topology.triangleEdges[corner]! + edgeOffset;
    }
    const participantRemap = topology.participants.map((participant) => {
      const existing = participantIndices.get(participant);
      if (existing !== undefined) {
        return existing;
      }
      participantIndices.set(participant, participants.length);
      participants.push(participant);
      return participants.length - 1;
    });
    for (const [triangle, participant] of topology.triangleParticipants.entries()) {
      triangleParticipants[triangleOffset + triangle] = participantRemap[participant]!;
    }
    triangleMaterialOrders.set(topology.triangleMaterialOrders, triangleOffset);
    for (let offset = 0; offset < topology.edges.length; offset += 4) {
      const target = edgeOffset * 4 + offset;
      edges[target] = topology.edges[offset]! + vertexOffset;
      edges[target + 1] = topology.edges[offset + 1]! + vertexOffset;
      edges[target + 2] = topology.edges[offset + 2]! + triangleOffset;
      edges[target + 3] = topology.edges[offset + 3]! + triangleOffset;
    }
    components.push(...offsetComponents(topology.components, triangleOffset, edgeOffset));
    for (const participant of topology.participants) {
      const mapped = participant.topologyTriangleByGeometryTriangle;
      for (const [geometryTriangle, topologyTriangle] of mapped.entries()) {
        if (topologyTriangle >= 0) {
          mapped[geometryTriangle] = topologyTriangle + triangleOffset;
        }
      }
    }
    vertexOffset += topology.positions.length / 3;
    triangleOffset += topology.triangleParticipants.length;
    edgeOffset += topology.edges.length / 4;
  }
  return {
    status: 'ready',
    topology: {
      path: 'extension',
      sourceKey,
      positions,
      triangleVertices,
      triangleEdges,
      triangleParticipants,
      triangleMaterialOrders,
      participants,
      edges,
      components,
      componentByTriangle: indexComponentsByTriangle(triangleCount, components),
      distanceTolerance: Math.max(...topologies.map((topology) => topology.distanceTolerance)),
      buildMilliseconds,
    },
  };
};

const presentationSceneTags = new Set([sceneTag.gltfSurfacePresentation]);

const isSectionSurfaceMesh = (object: THREE.Object3D): object is SectionSurfaceMesh =>
  object instanceof THREE.Mesh && !hasSceneTagInHierarchy(object, presentationSceneTags);

const hasPositionAttribute = (geometry: THREE.BufferGeometry): boolean =>
  Object.hasOwn(geometry.attributes, 'position');

const createRegisteredSource = async (options: {
  onHydrate?: (milliseconds: number) => void;
  onPack?: (milliseconds: number) => void;
  parser: SectionTopologyGltfParser;
  key: string;
  root: THREE.Object3D;
  owner: ModelComponentOwner | undefined;
  participants: readonly SectionSurfaceParticipant[];
}): Promise<SectionSurfaceSource> => {
  const meshIdentities = new Map<string, SectionSurfaceParticipant[]>();
  for (const participant of options.participants) {
    if (participant.nodeIndex === undefined || participant.meshIndex === undefined) {
      continue;
    }
    const identity = `${participant.nodeIndex}:${participant.meshIndex}`;
    const entries = meshIdentities.get(identity) ?? [];
    entries.push(participant);
    meshIdentities.set(identity, entries);
  }

  const decodedTopologies = await Promise.all(
    [...meshIdentities.values()].map(async (participants) =>
      decodeManifoldTopology({
        parser: options.parser,
        sourceKey: options.key,
        participants,
        meshIndex: participants[0]!.meshIndex!,
        onHydrate: options.onHydrate,
        onPack: options.onPack,
      }),
    ),
  );
  const exactTopologies: SectionSurfaceTopology[] = [];
  let allIdentitiesExact = meshIdentities.size > 0;
  let invalid: SectionSurfaceTopologyResult | undefined;
  for (const decoded of decodedTopologies) {
    if (decoded?.status === 'unsupported') {
      invalid = decoded;
      break;
    }
    if (decoded?.status === 'ready') {
      exactTopologies.push(decoded.topology);
    } else {
      allIdentitiesExact = false;
    }
  }
  if ([...meshIdentities.values()].flat().length !== options.participants.length) {
    allIdentitiesExact = false;
  }
  const topology =
    invalid ??
    (allIdentitiesExact
      ? combineExactTopologies(options.key, exactTopologies)
      : await buildFallbackTopologyAsync({
          sourceKey: options.key,
          onHydrate: options.onHydrate,
          onPack: options.onPack,
          participants: options.participants,
        }));
  return {
    key: options.key,
    root: options.root,
    owner: options.owner,
    participants: options.participants,
    topology,
    revision: options.participants.map((participant) => geometryRevision(participant.mesh.geometry)).join('|'),
  };
};

/** Standalone geometries whose failed tree was already reported: collection runs every frame, the span once. */
const reportedStandaloneTreeFailures = new WeakSet<THREE.BufferGeometry>();

const recordSourceUnsupported = (sourceKey: string, reason: string): void => {
  recordRendererSpan('renderer.section-source-unsupported', {
    startTime: performance.now(),
    duration: 0,
    attributes: { sourceKey, code: 'bvh-unavailable', reason },
  });
};

/**
 * A source whose participant has no tree cannot be sliced: the BVH worker failed for it. It resolves unsupported,
 * which section views skip, so a span records it.
 */
const withoutMissingTrees = (
  source: SectionSurfaceSource,
  missingTrees: ReadonlySet<THREE.BufferGeometry>,
): SectionSurfaceSource => {
  const missing = source.participants.find(({ mesh }) => missingTrees.has(mesh.geometry));
  if (!missing) {
    return source;
  }
  const status = getBvhStatus(missing.mesh.geometry);
  const reason = status.status === 'failed' ? status.reason : 'its tree is unavailable';
  recordSourceUnsupported(source.key, reason);
  return { ...source, topology: topologyFailure(source.key, 'bvh-unavailable', `no BVH (${reason})`) };
};

/** Builds and registers the private topology owned by one loaded glTF scene. @internal */
export const registerGltfSectionSurfaceSources = async (options: {
  scene: THREE.Group;
  manifest: GeometryComponentManifest;
  unitId: string;
  parser: SectionTopologyGltfParser;
  onTiming?: (timing: GltfSectionTopologyTiming) => void;
  isCancelled?: () => boolean;
}): Promise<readonly SectionSurfaceSource[]> => {
  const startedAt = performance.now();
  setGltfSectionSurfaceRegistrationState(options.scene, 'pending');
  const meshes: SectionSurfaceMesh[] = [];
  options.scene.updateWorldMatrix(true, true);
  const rootInverse = new THREE.Matrix4().copy(options.scene.matrixWorld).invert();
  options.scene.traverse((object) => {
    if (
      isSectionSurfaceMesh(object) &&
      object.type !== 'LineSegments2' &&
      hasPositionAttribute(object.geometry) &&
      !hasSceneTag(object, sceneTag.sectionViewHelper)
    ) {
      meshes.push(object);
    }
  });
  const participants = meshes.map((mesh, order) =>
    createParticipant({
      mesh,
      rootInverse,
      order,
      association: getAssociation(mesh, options.parser.associations),
    }),
  );
  // Slicing needs every participant's tree. The ones above the synchronous threshold build in the BVH worker
  // while the topology recipes build in theirs; registration stays pending until both land.
  const trees = new Map(
    [...new Set(meshes.map((mesh) => mesh.geometry))].map((geometry) => [geometry, ensureBvh(geometry)] as const),
  );
  const participantsByComponent = new Map<string, SectionSurfaceParticipant[]>();
  for (const participant of participants) {
    const componentId = getModelComponentId(participant.mesh);
    if (!componentId) {
      continue;
    }
    const entries = participantsByComponent.get(componentId) ?? [];
    entries.push(participant);
    participantsByComponent.set(componentId, entries);
  }

  const claimed = new Set<SectionSurfaceParticipant>();
  const sourceInputs: Array<{
    key: string;
    owner: ModelComponentOwner | undefined;
    participants: readonly SectionSurfaceParticipant[];
  }> = [];
  for (const componentId of options.manifest.nodeOrder) {
    const component = options.manifest.nodesById[componentId];
    if (component?.kind !== 'body' || component.childIds.length === 0) {
      continue;
    }
    const bodyParticipants = component.childIds.flatMap((childId) => participantsByComponent.get(childId) ?? []);
    if (bodyParticipants.length < 2) {
      continue;
    }
    for (const participant of bodyParticipants) {
      claimed.add(participant);
    }
    sourceInputs.push({
      key: `${options.unitId}:${componentId}`,
      owner: { unitId: options.unitId, componentId },
      participants: bodyParticipants,
    });
  }

  const remainingByIdentity = new Map<string, SectionSurfaceParticipant[]>();
  for (const participant of participants) {
    if (claimed.has(participant)) {
      continue;
    }
    const identity =
      participant.nodeIndex !== undefined && participant.meshIndex !== undefined
        ? `${participant.nodeIndex}:${participant.meshIndex}`
        : participant.mesh.uuid;
    const entries = remainingByIdentity.get(identity) ?? [];
    entries.push(participant);
    remainingByIdentity.set(identity, entries);
  }
  for (const [identity, sourceParticipants] of remainingByIdentity) {
    const owner = getModelComponentOwnerInHierarchy(sourceParticipants[0]!.mesh);
    sourceInputs.push({
      key: owner ? `${owner.unitId}:${owner.componentId}:${identity}` : `${options.unitId}:${identity}`,
      owner,
      participants: sourceParticipants,
    });
  }

  const submittedAt = performance.now();
  let submitMilliseconds = submittedAt - startedAt;
  let hydrateMilliseconds = 0;
  let packMilliseconds = 0;
  const onHydrate = (milliseconds: number): void => {
    hydrateMilliseconds += milliseconds;
  };
  const onPack = (milliseconds: number): void => {
    packMilliseconds += milliseconds;
  };
  const pending: Array<Promise<SectionSurfaceSource>> = [];
  let sliceStartedAt = performance.now();
  for (const input of sourceInputs) {
    if (options.isCancelled?.()) {
      // Already submitted workers retain their inputs until hydration finishes.
      // oxlint-disable-next-line no-await-in-loop -- Retain submitted participants until every worker has released them.
      await Promise.allSettled(pending);
      throw new DOMException('Section preparation superseded', 'AbortError');
    }
    const sourceStartedAt = performance.now();
    pending.push(
      createRegisteredSource({
        parser: options.parser,
        onHydrate,
        onPack,
        key: input.key,
        root: options.scene,
        owner: input.owner,
        participants: input.participants,
      }),
    );
    submitMilliseconds += performance.now() - sourceStartedAt;
    if (performance.now() - sliceStartedAt >= 16) {
      // oxlint-disable-next-line no-await-in-loop -- Bound main-thread submission slices while keeping workers concurrent.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      sliceStartedAt = performance.now();
    }
  }
  const built = await Promise.all(pending);
  const landed = await Promise.all([...trees].map(async ([geometry, tree]) => ({ geometry, tree: await tree })));
  const missingTrees = new Set(landed.filter(({ tree }) => !tree).map(({ geometry }) => geometry));
  if (options.isCancelled?.()) {
    throw new DOMException('Section preparation superseded', 'AbortError');
  }
  const sources = built.map((source) => withoutMissingTrees(source, missingTrees));
  sectionSourceRegistry.set(options.scene, { status: 'ready', sources });
  const completedAt = performance.now();
  const workerMilliseconds = sources.reduce(
    (total, source) => total + (source.topology.status === 'ready' ? source.topology.topology.buildMilliseconds : 0),
    0,
  );
  options.onTiming?.({
    submitMilliseconds,
    packMilliseconds,
    workerMilliseconds,
    hydrateMilliseconds,
    resolveMilliseconds: completedAt - submittedAt,
  });
  return sources;
};

/** Collects registered glTF sources plus topology-certified standalone meshes. @internal */
export const collectSectionSurfaceSources = (
  root: THREE.Group,
  onBlocked?: (ready?: Promise<unknown>) => void,
): VisibleSectionSurfaceSource[] => {
  const registered: SectionSurfaceSource[] = [];
  const coveredMeshes = new Set<SectionSurfaceMesh>();
  const blockedRoots = new Set<THREE.Object3D>();
  root.traverse((object) => {
    const registration = sectionSourceRegistry.get(object);
    if (!registration) {
      return;
    }
    if (registration.status === 'pending' || registration.status === 'cancelled') {
      blockedRoots.add(object);
      onBlocked?.();
      return;
    }
    if (registration.status === 'unsupported') {
      return;
    }
    registered.push(...registration.sources);
    for (const source of registration.sources) {
      for (const participant of source.participants) {
        coveredMeshes.add(participant.mesh);
      }
    }
  });
  const standalone: SectionSurfaceSource[] = [];
  root.traverse((object) => {
    if (
      isSectionSurfaceMesh(object) &&
      object.type !== 'LineSegments2' &&
      !coveredMeshes.has(object) &&
      !hasAncestorInSet(object, blockedRoots) &&
      hasPositionAttribute(object.geometry) &&
      !hasSceneTag(object, sceneTag.sectionViewHelper)
    ) {
      // A standalone surface above the synchronous threshold has no cut until its worker tree lands.
      if (getBvh(object.geometry)) {
        standalone.push(createStandaloneSource(object));
        return;
      }
      const tree = getBvhStatus(object.geometry);
      if (tree.status === 'failed') {
        const source = createStandaloneSource(object);
        if (!reportedStandaloneTreeFailures.has(object.geometry)) {
          reportedStandaloneTreeFailures.add(object.geometry);
          recordSourceUnsupported(source.key, tree.reason);
        }
        standalone.push({
          ...source,
          topology: topologyFailure(source.key, 'bvh-unavailable', `no BVH (${tree.reason})`),
        });
        return;
      }
      onBlocked?.(ensureBvh(object.geometry));
    }
  });

  return [...registered, ...standalone].flatMap((source) => {
    const states = source.participants.map((participant) => participantVisibility(participant));
    if (states.every((state) => state === 'hidden')) {
      return [];
    }
    return [
      {
        source,
        visibility: states.every((state) => state === 'visible') ? 'complete' : 'partial',
      } as const,
    ];
  });
};

const hasAncestorInSet = (object: THREE.Object3D, candidates: ReadonlySet<THREE.Object3D>): boolean => {
  let current: THREE.Object3D | undefined = object;
  while (current) {
    if (candidates.has(current)) {
      return true;
    }
    current = current.parent ?? undefined;
  }
  return false;
};

const planeBasis = (normal: THREE.Vector3): readonly [THREE.Vector3, THREE.Vector3] => {
  const arbitrary = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(arbitrary, normal).normalize();
  return [u, new THREE.Vector3().crossVectors(normal, u).normalize()];
};

const canonicalizeRing = (ring: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] => {
  const deduped = ring.filter((point, index) => index === 0 || !point.equals(ring[index - 1]!));
  if (deduped.length > 1 && deduped[0]!.equals(deduped.at(-1)!)) {
    deduped.pop();
  }
  if (deduped.length < 3) {
    return [];
  }
  const [u, v] = planeBasis(normal);
  let twiceArea = 0;
  for (let index = 0; index < deduped.length; index++) {
    const current = deduped[index]!;
    const next = deduped[(index + 1) % deduped.length]!;
    twiceArea += current.dot(u) * next.dot(v) - next.dot(u) * current.dot(v);
  }
  if (twiceArea < 0) {
    deduped.reverse();
  }
  let start = 0;
  for (let index = 1; index < deduped.length; index++) {
    if (comparePosition(deduped[index]!, deduped[start]!) < 0) {
      start = index;
    }
  }
  return [...deduped.slice(start), ...deduped.slice(0, start)];
};

/** `Plane.distanceToPoint` for one vertex of a packed xyz array. */
const planeDistanceAt = (plane: THREE.Plane, positions: Float64Array, vertex: number): number =>
  plane.normal.x * positions[vertex * 3]! +
  plane.normal.y * positions[vertex * 3 + 1]! +
  plane.normal.z * positions[vertex * 3 + 2]! +
  plane.constant;

const vertexAt = (positions: Float64Array, vertex: number): THREE.Vector3 =>
  new THREE.Vector3().fromArray(positions, vertex * 3);

const halfOpenHit = (options: {
  positions: Float64Array;
  startVertex: number;
  endVertex: number;
  plane: THREE.Plane;
}): THREE.Vector3 | undefined => {
  const { positions, startVertex, endVertex, plane } = options;
  const start = planeDistanceAt(plane, positions, startVertex);
  const end = planeDistanceAt(plane, positions, endVertex);
  if (start > 0 === end > 0) {
    return undefined;
  }
  if (start === 0) {
    return vertexAt(positions, startVertex);
  }
  if (end === 0) {
    return vertexAt(positions, endVertex);
  }
  return vertexAt(positions, startVertex).lerp(vertexAt(positions, endVertex), start / (start - end));
};

/** The topology triangles whose bounds the plane crosses, through each participant's ready tree; never builds one. */
const candidateTopologyTriangles = (source: SectionSurfaceSource, worldPlane: THREE.Plane): Set<number> | undefined => {
  const candidates = new Set<number>();
  const localPlane = new THREE.Plane();
  const inverse = new THREE.Matrix4();
  for (const participant of source.participants) {
    inverse.copy(participant.mesh.matrixWorld).invert();
    localPlane.copy(worldPlane).applyMatrix4(inverse);
    const bvh = getBvh(participant.mesh.geometry);
    if (!bvh) {
      return undefined;
    }
    const meshBounds = bvh.getBoundingBox(new THREE.Box3());
    const planeCandidateDistanceToleranceMeshUnits =
      meshBounds.getSize(new THREE.Vector3()).length() * float32Epsilon * 8;
    const expandedBounds = new THREE.Box3();
    bvh.shapecast({
      intersectsBounds(box) {
        expandedBounds.copy(box).expandByScalar(planeCandidateDistanceToleranceMeshUnits);
        return localPlane.intersectsBox(expandedBounds) ? INTERSECTED : NOT_INTERSECTED;
      },
      intersectsTriangle(_triangle, triangleIndex) {
        const topologyTriangle = participant.topologyTriangleByGeometryTriangle[triangleIndex];
        if (topologyTriangle !== undefined && topologyTriangle >= 0) {
          candidates.add(topologyTriangle);
        }
        return false;
      },
    });
  }
  return candidates;
};

/**
 * Where the source frame sits in the world now. Topology positions were fixed through each participant's
 * registration-time `localToSource`, and posing moves participant meshes without moving the source root, so
 * the frame follows a participant: `matrixWorld × localToSource⁻¹` (the root's `matrixWorld` while unposed).
 * Like the slice, it reads the participant's matrix as the caller last updated it.
 * @internal
 */
export const getSectionSourceWorldMatrix = (
  source: SectionSurfaceSource,
  target = new THREE.Matrix4(),
): THREE.Matrix4 => {
  // ponytail: one rigid placement per source, from its first participant; a body posed apart across kinematic
  // links would need per-participant slicing.
  const participant = source.participants[0]!;
  return target.copy(participant.localToSource).invert().premultiply(participant.mesh.matrixWorld);
};

/**
 * Slices one admitted logical source through paired halfedge adjacency.
 *
 * Callers update each source root and its descendants' world matrices before slicing, once per frame.
 * The slice reads the matrices of the root and its participant meshes as they are and updates no
 * scene node, instead of walking the scene for every source.
 *
 * @internal
 */
export const sliceSectionSurfaceSource = (options: {
  visibleSource: VisibleSectionSurfaceSource;
  worldPlane: THREE.Plane;
}): SectionSurfaceSliceResult => {
  const sliceStartedAt = performance.now();
  const { source, visibility } = options.visibleSource;
  if (visibility === 'partial') {
    return {
      status: 'unsupported',
      failure: {
        sourceKey: source.key,
        code: 'partial-visibility',
        message: `Section topology ${source.key}: visible selection opens a certified surface`,
      },
    };
  }
  if (source.topology.status === 'unsupported') {
    return source.topology;
  }
  const { topology } = source.topology;
  const sourcePlane = options.worldPlane.clone().applyMatrix4(getSectionSourceWorldMatrix(source).invert());
  const broadphaseStartedAt = performance.now();
  const candidates = candidateTopologyTriangles(source, options.worldPlane);
  if (!candidates) {
    return topologyFailure(source.key, 'bvh-unavailable', 'a participant has no ready tree');
  }
  const candidateBroadphaseMilliseconds = performance.now() - broadphaseStartedAt;
  const { positions, triangleVertices, triangleEdges, edges, distanceTolerance } = topology;
  const onPlane = (vertex: number): boolean =>
    Math.abs(planeDistanceAt(sourcePlane, positions, vertex)) <= distanceTolerance;
  const triangleOnPlane = (triangle: number): boolean =>
    onPlane(triangleVertices[triangle * 3]!) &&
    onPlane(triangleVertices[triangle * 3 + 1]!) &&
    onPlane(triangleVertices[triangle * 3 + 2]!);
  const candidateEdges = new Set<number>();
  for (const triangle of candidates) {
    candidateEdges.add(triangleEdges[triangle * 3]!);
    candidateEdges.add(triangleEdges[triangle * 3 + 1]!);
    candidateEdges.add(triangleEdges[triangle * 3 + 2]!);
  }
  const hits = new Map<number, THREE.Vector3>();
  const openPolylines: THREE.Vector3[][] = [];
  for (const edge of candidateEdges) {
    const startVertex = edges[edge * 4]!;
    const endVertex = edges[edge * 4 + 1]!;
    if (
      onPlane(startVertex) &&
      onPlane(endVertex) &&
      !(triangleOnPlane(edges[edge * 4 + 2]!) && triangleOnPlane(edges[edge * 4 + 3]!))
    ) {
      const [start, end] =
        comparePositionAt(positions, startVertex, endVertex) <= 0 ? [startVertex, endVertex] : [endVertex, startVertex];
      openPolylines.push([vertexAt(positions, start), vertexAt(positions, end)]);
    }
    const hit = halfOpenHit({ positions, startVertex, endVertex, plane: sourcePlane });
    if (hit) {
      hits.set(edge, hit);
    }
  }
  const cutEdges = new Map<number, [number, number]>();
  const edgeLists = new Map<number, number[]>();
  for (const edge of hits.keys()) {
    for (const triangle of [edges[edge * 4 + 2]!, edges[edge * 4 + 3]!]) {
      const entries = edgeLists.get(triangle) ?? [];
      entries.push(edge);
      edgeLists.set(triangle, entries);
    }
  }
  for (const [triangle, entries] of edgeLists) {
    const unique = [...new Set(entries)].sort((left, right) => left - right);
    if (unique.length !== 2) {
      return {
        status: 'failed',
        failure: {
          sourceKey: source.key,
          code: 'slice-invariant',
          message: `Section topology ${source.key}: triangle ${triangle} produced ${unique.length} half-open edges`,
        },
      };
    }
    cutEdges.set(triangle, [unique[0]!, unique[1]!]);
  }

  const unseen = new Set([...cutEdges.keys()].sort((left, right) => left - right));
  const contours: THREE.Vector3[][] = [];
  const cutComponents = new Set<number>();
  const materialLengths = new Map<THREE.Material, { length: number; order: number }>();
  while (unseen.size > 0) {
    const start = unseen.values().next().value;
    if (start === undefined) {
      break;
    }
    unseen.delete(start);
    let triangle = start;
    let incoming = cutEdges.get(start)![0];
    const ring: THREE.Vector3[] = [];
    let steps = 0;
    for (;;) {
      if (++steps > cutEdges.size + 1) {
        return {
          status: 'failed',
          failure: {
            sourceKey: source.key,
            code: 'slice-invariant',
            message: `Section topology ${source.key}: cut traversal did not close`,
          },
        };
      }
      if (triangle !== start && !unseen.delete(triangle)) {
        return {
          status: 'failed',
          failure: {
            sourceKey: source.key,
            code: 'slice-invariant',
            message: `Section topology ${source.key}: cut revisited another ring`,
          },
        };
      }
      const point = hits.get(incoming);
      const triangleEdges = cutEdges.get(triangle);
      if (!point || !triangleEdges || (incoming !== triangleEdges[0] && incoming !== triangleEdges[1])) {
        return {
          status: 'failed',
          failure: {
            sourceKey: source.key,
            code: 'slice-invariant',
            message: `Section topology ${source.key}: cut lost halfedge continuity`,
          },
        };
      }
      ring.push(point);
      const outgoing = incoming === triangleEdges[0] ? triangleEdges[1] : triangleEdges[0];
      const outgoingPoint = hits.get(outgoing)!;
      const participant = topology.participants[topology.triangleParticipants[triangle]!]!;
      const materialOrder = topology.triangleMaterialOrders[triangle]!;
      const liveMaterials = Array.isArray(participant.mesh.material)
        ? participant.mesh.material
        : [participant.mesh.material];
      const material = liveMaterials[materialOrder] ?? liveMaterials[0];
      if (material) {
        const contribution = materialLengths.get(material) ?? {
          length: 0,
          order: participant.order * 1_000_000 + materialOrder,
        };
        contribution.length += point.distanceTo(outgoingPoint);
        materialLengths.set(material, contribution);
      }
      const left = edges[outgoing * 4 + 2]!;
      const right = edges[outgoing * 4 + 3]!;
      const next: number | undefined = triangle === left ? right : triangle === right ? left : undefined;
      if (next === undefined) {
        return {
          status: 'failed',
          failure: {
            sourceKey: source.key,
            code: 'slice-invariant',
            message: `Section topology ${source.key}: cut edge lost its source triangle`,
          },
        };
      }
      if (next === start) {
        break;
      }
      incoming = outgoing;
      triangle = next;
    }
    const canonical = canonicalizeRing(ring, sourcePlane.normal);
    if (canonical.length >= 3) {
      contours.push(canonical);
      cutComponents.add(topology.componentByTriangle[start]!);
    }
  }
  contours.sort((left, right) => comparePosition(left[0]!, right[0]!));
  openPolylines.sort((left, right) => comparePosition(left[0]!, right[0]!));
  const dominantMaterial =
    [...materialLengths.entries()].sort(
      (left, right) => right[1].length - left[1].length || left[1].order - right[1].order,
    )[0]?.[0] ??
    (Array.isArray(source.participants[0]!.mesh.material)
      ? source.participants[0]!.mesh.material[0]!
      : source.participants[0]!.mesh.material);
  let segmentCount = openPolylines.length;
  for (const contour of contours) {
    segmentCount += contour.length;
  }
  const trueCutComponentCount = cutComponents.size;
  return {
    status: 'complete',
    closedContours: contours,
    openPolylines,
    segmentCount,
    trueCutComponentCount,
    cappedTrueCutComponentCount: trueCutComponentCount,
    unresolvedTrueCutEdgeCount: 0,
    dominantMaterial,
    candidateBroadphaseMilliseconds,
    topologySliceMilliseconds: performance.now() - sliceStartedAt - candidateBroadphaseMilliseconds,
  };
};

/** Topology-backed compatibility entry for existing geometry callers. @internal */
export const sliceSectionSurfaceTopologyForGeometry = (options: {
  geometry: THREE.BufferGeometry;
  worldPlane: THREE.Plane;
  meshWorldMatrix: THREE.Matrix4;
}): SectionSurfaceSliceResult => {
  const source = getGeometrySource(options.geometry);
  source.root.matrixAutoUpdate = false;
  source.root.matrix.copy(options.meshWorldMatrix);
  source.root.matrixWorld.copy(options.meshWorldMatrix);
  return sliceSectionSurfaceSource({
    visibleSource: { source, visibility: 'complete' },
    worldPlane: options.worldPlane,
  });
};
