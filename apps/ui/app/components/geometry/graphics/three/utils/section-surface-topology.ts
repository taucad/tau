import * as THREE from 'three';
import type { GeometryComponentManifest } from '@taucad/types';
import { INTERSECTED, NOT_INTERSECTED } from 'three-mesh-bvh';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import {
  getModelComponentId,
  getModelComponentOwnerInHierarchy,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import type { ModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

const float32Epsilon = 1.192_092_895_507_812_5e-7;
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
    | 'slice-invariant';
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
  readonly topologyTrianglesByGeometryTriangle: Map<number, number[]>;
};

type SectionSurfaceMesh = THREE.Mesh;

type TopologyTriangle = {
  readonly vertices: readonly [number, number, number];
  points: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  readonly participant: SectionSurfaceParticipant;
  readonly participantTriangleIndex: number;
  readonly material: THREE.Material;
  readonly materialOrder: number;
  edges: [number, number, number];
};

type HalfEdge = Readonly<{
  triangle: number;
  slot: number;
  start: number;
  end: number;
}>;

type PendingEdge = Readonly<{ first: number; second: number }>;

type CanonicalEdge = Readonly<{
  start: THREE.Vector3;
  end: THREE.Vector3;
  triangles: readonly [number, number];
}>;

type SurfaceComponent = Readonly<{
  triangles: readonly number[];
  edges: readonly number[];
}>;

export type SectionSurfaceTopology = Readonly<{
  path: SectionTopologyPath;
  sourceKey: string;
  triangles: readonly TopologyTriangle[];
  edges: readonly CanonicalEdge[];
  components: readonly SurfaceComponent[];
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
  | Readonly<{ status: 'unsupported' | 'failed'; failure: SectionTopologyFailure }>;

type TopologyBuildInput = Readonly<{
  sourceKey: string;
  path: SectionTopologyPath;
  positions: readonly THREE.Vector3[];
  triangles: TopologyTriangle[];
  allowSeamFallback: boolean;
}>;

type TopologyTriangleVertices = Readonly<{ vertices: readonly [number, number, number] }>;

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

const sectionSourceRegistry = new WeakMap<THREE.Object3D, readonly SectionSurfaceSource[]>();
const standaloneSourceCache = new WeakMap<SectionSurfaceMesh, SectionSurfaceSource>();
const geometrySourceCache = new WeakMap<THREE.BufferGeometry, SectionSurfaceSource>();

const topologyFailure = (
  sourceKey: string,
  code: SectionTopologyFailure['code'],
  detail: string,
): Readonly<{ status: 'unsupported'; failure: SectionTopologyFailure }> => ({
  status: 'unsupported',
  failure: { sourceKey, code, message: `Section topology ${sourceKey}: ${detail}` },
});

const orderedPair = (left: number, right: number): readonly [number, number] =>
  left <= right ? [left, right] : [right, left];

const halfEdgeCompare = (left: HalfEdge, right: HalfEdge): number => {
  const [leftA, leftB] = orderedPair(left.start, left.end);
  const [rightA, rightB] = orderedPair(right.start, right.end);
  return leftA - rightA || leftB - rightB || left.start - right.start || left.end - right.end;
};

const sameUndirectedEdge = (left: HalfEdge, right: HalfEdge): boolean => {
  const [leftA, leftB] = orderedPair(left.start, left.end);
  const [rightA, rightB] = orderedPair(right.start, right.end);
  return leftA === rightA && leftB === rightB;
};

const comparePosition = (left: THREE.Vector3, right: THREE.Vector3): number =>
  left.x - right.x || left.y - right.y || left.z - right.z;

const topologyExtent = (positions: readonly THREE.Vector3[]): number =>
  new THREE.Box3()
    .setFromPoints(positions as THREE.Vector3[])
    .getSize(new THREE.Vector3())
    .length();

const normalizeTopologyPositions = (positions: readonly THREE.Vector3[]): THREE.Vector3[] => {
  const bounds = new THREE.Box3().setFromPoints(positions as THREE.Vector3[]);
  const origin = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3()).length();
  if (!(extent > 0)) {
    return positions.map(() => new THREE.Vector3());
  }
  return positions.map((position) => position.clone().sub(origin).divideScalar(extent));
};

const spatialCellKey = (position: THREE.Vector3, epsilon: number): string =>
  `${Math.floor(position.x / epsilon)},${Math.floor(position.y / epsilon)},${Math.floor(position.z / epsilon)}`;

const spatialClusters = (
  vertices: readonly number[],
  positions: readonly THREE.Vector3[],
  epsilon: number,
): Int32Array => {
  const sorted = [...vertices].sort(
    (left, right) => comparePosition(positions[left]!, positions[right]!) || left - right,
  );
  const sets = new DisjointSet(sorted.length);
  const cells = new Map<string, number[]>();

  for (const [index, vertex] of sorted.entries()) {
    const position = positions[vertex]!;
    const cellX = Math.floor(position.x / epsilon);
    const cellY = Math.floor(position.y / epsilon);
    const cellZ = Math.floor(position.z / epsilon);
    for (let x = cellX - 1; x <= cellX + 1; x++) {
      for (let y = cellY - 1; y <= cellY + 1; y++) {
        for (let z = cellZ - 1; z <= cellZ + 1; z++) {
          for (const candidate of cells.get(`${x},${y},${z}`) ?? []) {
            if (position.distanceToSquared(positions[sorted[candidate]!]!) <= epsilon * epsilon) {
              sets.union(index, candidate);
            }
          }
        }
      }
    }
    const key = spatialCellKey(position, epsilon);
    const entries = cells.get(key) ?? [];
    entries.push(index);
    cells.set(key, entries);
  }

  const clusters = new Int32Array(positions.length).fill(-1);
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
  halfEdges: readonly HalfEdge[];
  patches: Int32Array;
  affinities: ReadonlyMap<string, number>;
}): Array<readonly [number, number]> | undefined => {
  const { halfEdges, patches, affinities } = options;
  const score = (left: number, right: number): number =>
    affinities.get(pairKey(patches[halfEdges[left]!.triangle]!, patches[halfEdges[right]!.triangle]!)) ?? 0;
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
  triangles: readonly TopologyTriangleVertices[];
  halfEdges: readonly HalfEdge[];
  pairs: readonly PendingEdge[];
  vertexCount: number;
}): SectionTopologyFailure | undefined => {
  const { sourceKey, triangles, halfEdges, pairs, vertexCount } = options;
  const canonical = new DisjointSet(vertexCount);
  for (const pair of pairs) {
    const first = halfEdges[pair.first]!;
    const second = halfEdges[pair.second]!;
    canonical.union(first.start, second.end);
    canonical.union(first.end, second.start);
  }
  const roots = Int32Array.from({ length: vertexCount }, (_, vertex) => canonical.representative(vertex));
  const trianglesAt = new Map<number, number[]>();
  for (const [triangleIndex, triangle] of triangles.entries()) {
    for (const vertex of triangle.vertices) {
      const root = roots[vertex]!;
      const entries = trianglesAt.get(root) ?? [];
      entries.push(triangleIndex);
      trianglesAt.set(root, entries);
    }
  }
  const linkEdges = new Map<number, Array<readonly [number, number]>>();
  for (const pair of pairs) {
    const first = halfEdges[pair.first]!;
    const second = halfEdges[pair.second]!;
    for (const vertex of [first.start, first.end]) {
      const root = roots[vertex]!;
      const entries = linkEdges.get(root) ?? [];
      entries.push([first.triangle, second.triangle]);
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
    if ([...degrees].some((degree) => degree !== 2)) {
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
  positions: readonly THREE.Vector3[];
  triangles: readonly TopologyTriangleVertices[];
  allowSeamFallback: boolean;
}): SectionCanonicalTopologyWorkerResult => {
  const startedAt = performance.now();
  const { sourceKey, positions, triangles } = input;
  if (triangles.length === 0) {
    return topologyFailure(sourceKey, 'degenerate-triangle', 'contains no non-degenerate triangles');
  }

  const halfEdges: HalfEdge[] = [];
  for (const [triangle, value] of triangles.entries()) {
    const triangleEdges: ReadonlyArray<readonly [number, number]> = [
      [value.vertices[0], value.vertices[1]],
      [value.vertices[1], value.vertices[2]],
      [value.vertices[2], value.vertices[0]],
    ];
    for (const [slot, [start, end]] of triangleEdges.entries()) {
      halfEdges.push({ triangle, slot, start, end });
    }
  }

  const indexed = [...halfEdges.keys()].sort((left, right) => halfEdgeCompare(halfEdges[left]!, halfEdges[right]!));
  const pairs: PendingEdge[] = [];
  const unmatched: number[] = [];
  for (let offset = 0; offset < indexed.length; ) {
    const firstOffset = offset;
    offset++;
    while (
      offset < indexed.length &&
      sameUndirectedEdge(halfEdges[indexed[firstOffset]!]!, halfEdges[indexed[offset]!]!)
    ) {
      offset++;
    }
    const group = indexed.slice(firstOffset, offset);
    const first = halfEdges[group[0]!]!;
    if (group.length === 1) {
      unmatched.push(group[0]!);
    } else if (
      group.length === 2 &&
      first.start === halfEdges[group[1]!]!.end &&
      first.end === halfEdges[group[1]!]!.start
    ) {
      pairs.push({ first: group[0]!, second: group[1]! });
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

  const normalizedPositions = normalizeTopologyPositions(positions);
  let maximumCoordinate = Number.MIN_VALUE;
  for (const position of normalizedPositions) {
    maximumCoordinate = Math.max(maximumCoordinate, Math.abs(position.x), Math.abs(position.y), Math.abs(position.z));
  }
  const epsilon = 1e-6;
  const matchRadius = Math.min(
    Math.max(maximumCoordinate * float32Epsilon * 4, minimumNormalizedTopologyTolerance),
    epsilon,
  );
  const representativeVertices = Int32Array.from({ length: positions.length }, (_, vertex) => vertex);

  if (unmatched.length > 0) {
    const seamVertices = [...new Set(unmatched.flatMap((edge) => [halfEdges[edge]!.start, halfEdges[edge]!.end]))].sort(
      (left, right) => left - right,
    );
    const clusters = spatialClusters(seamVertices, normalizedPositions, matchRadius);
    const bySeam = new Map<string, number[]>();
    for (const edgeIndex of unmatched) {
      const edge = halfEdges[edgeIndex]!;
      const key = pairKey(clusters[edge.start]!, clusters[edge.end]!);
      const entries = bySeam.get(key) ?? [];
      entries.push(edgeIndex);
      bySeam.set(key, entries);
    }

    const patchSets = new DisjointSet(triangles.length);
    for (const pair of pairs) {
      patchSets.union(halfEdges[pair.first]!.triangle, halfEdges[pair.second]!.triangle);
    }
    const patches = Int32Array.from({ length: triangles.length }, (_, triangle) => patchSets.representative(triangle));
    const affinities = new Map<string, number>();
    for (const edges of bySeam.values()) {
      const first = halfEdges[edges[0]!]!;
      const firstStart = clusters[first.start]!;
      const firstEnd = clusters[first.end]!;
      const [low, high] = orderedPair(firstStart, firstEnd);
      const forward = edges.filter((edgeIndex) => {
        const edge = halfEdges[edgeIndex]!;
        return clusters[edge.start] === low && clusters[edge.end] === high;
      });
      const reverse = edges.filter((edgeIndex) => !forward.includes(edgeIndex));
      for (const left of forward) {
        for (const right of reverse) {
          const key = pairKey(patches[halfEdges[left]!.triangle]!, patches[halfEdges[right]!.triangle]!);
          affinities.set(key, (affinities.get(key) ?? 0) + 1);
        }
      }
    }

    for (const edges of bySeam.values()) {
      const first = halfEdges[edges[0]!]!;
      const [low, high] = orderedPair(clusters[first.start]!, clusters[first.end]!);
      if (low === high) {
        return topologyFailure(sourceKey, 'collapsed-triangle', 'has a seam edge collapsed by topology tolerance');
      }
      const forward = edges.filter((edgeIndex) => {
        const edge = halfEdges[edgeIndex]!;
        return clusters[edge.start] === low && clusters[edge.end] === high;
      });
      const reverse = edges.filter((edgeIndex) => !forward.includes(edgeIndex));
      if (edges.length === 1) {
        return topologyFailure(sourceKey, 'open-surface', 'has an open material seam');
      }
      if (forward.length !== reverse.length || forward.length === 0) {
        return topologyFailure(sourceKey, 'inconsistent-orientation', 'has an inconsistently oriented material seam');
      }
      const resolved =
        forward.length === 1
          ? ([[forward[0]!, reverse[0]!]] as const)
          : uniquelyPairSeams({ forward, reverse, halfEdges, patches, affinities });
      if (!resolved) {
        return topologyFailure(sourceKey, 'ambiguous-seam', 'has an ambiguous material seam');
      }
      for (const [firstEdge, secondEdge] of resolved) {
        pairs.push({ first: firstEdge, second: secondEdge });
      }
    }

    const representativeByCluster = new Map<number, number>();
    for (const vertex of seamVertices) {
      const cluster = clusters[vertex]!;
      const current = representativeByCluster.get(cluster);
      if (current === undefined || comparePosition(positions[vertex]!, positions[current]!) < 0) {
        representativeByCluster.set(cluster, vertex);
      }
    }
    for (const vertex of seamVertices) {
      representativeVertices[vertex] = representativeByCluster.get(clusters[vertex]!)!;
    }
  }

  const vertexLinkFailure = validateVertexLinks({
    sourceKey,
    triangles,
    halfEdges,
    pairs,
    vertexCount: positions.length,
  });
  if (vertexLinkFailure) {
    return { status: 'unsupported', failure: vertexLinkFailure };
  }

  const triangleEdges = new Int32Array(triangles.length * 3).fill(-1);
  const edges: number[] = [];
  for (const pair of pairs) {
    const first = halfEdges[pair.first]!;
    const second = halfEdges[pair.second]!;
    const edgeIndex = edges.length / 4;
    triangleEdges[first.triangle * 3 + first.slot] = edgeIndex;
    triangleEdges[second.triangle * 3 + second.slot] = edgeIndex;
    edges.push(
      representativeVertices[first.start]!,
      representativeVertices[first.end]!,
      first.triangle,
      second.triangle,
    );
  }
  if (triangleEdges.some((edge) => edge < 0)) {
    return topologyFailure(sourceKey, 'open-surface', 'has an unpaired surface edge');
  }

  const componentSets = new DisjointSet(triangles.length);
  for (let offset = 0; offset < edges.length; offset += 4) {
    componentSets.union(edges[offset + 2]!, edges[offset + 3]!);
  }
  const componentsByRoot = new Map<number, number[]>();
  for (const triangle of triangles.keys()) {
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
    edges: Int32Array.from(edges),
    components,
    buildMilliseconds: performance.now() - startedAt,
  };
};

const hydrateCanonicalTopology = (
  input: TopologyBuildInput,
  recipe: SectionCanonicalTopologyWorkerResult,
): SectionSurfaceTopologyResult => {
  if (recipe.status === 'unsupported') {
    return recipe;
  }
  for (const [triangleIndex, triangle] of input.triangles.entries()) {
    const edgeOffset = triangleIndex * 3;
    triangle.edges = [
      recipe.triangleEdges[edgeOffset]!,
      recipe.triangleEdges[edgeOffset + 1]!,
      recipe.triangleEdges[edgeOffset + 2]!,
    ];
    triangle.points = triangle.vertices.map((vertex) => input.positions[recipe.representativeVertices[vertex]!]!) as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ];
  }
  const edges: CanonicalEdge[] = [];
  for (let offset = 0; offset < recipe.edges.length; offset += 4) {
    edges.push({
      start: input.positions[recipe.edges[offset]!]!,
      end: input.positions[recipe.edges[offset + 1]!]!,
      triangles: [recipe.edges[offset + 2]!, recipe.edges[offset + 3]!],
    });
  }
  return {
    status: 'ready',
    topology: {
      path: input.path,
      sourceKey: input.sourceKey,
      triangles: input.triangles,
      edges,
      components: recipe.components.map((component) => ({
        triangles: [...component.triangles],
        edges: [...component.edges],
      })),
      distanceTolerance: sourceTopologyEpsilon(input.positions),
      buildMilliseconds: recipe.buildMilliseconds,
    },
  };
};

const buildCanonicalTopology = (input: TopologyBuildInput): SectionSurfaceTopologyResult =>
  hydrateCanonicalTopology(input, buildCanonicalTopologyRecipe(input));

export const buildSectionCanonicalTopologyWorkerResult = (
  input: SectionCanonicalTopologyWorkerInput,
): SectionCanonicalTopologyWorkerResult => {
  const positions = Array.from(
    { length: input.positions.length / 3 },
    (_, vertex) =>
      new THREE.Vector3(input.positions[vertex * 3], input.positions[vertex * 3 + 1], input.positions[vertex * 3 + 2]),
  );
  const triangles = Array.from({ length: input.triangleVertices.length / 3 }, (_, triangle) => ({
    vertices: [
      input.triangleVertices[triangle * 3]!,
      input.triangleVertices[triangle * 3 + 1]!,
      input.triangleVertices[triangle * 3 + 2]!,
    ] as const,
  }));
  return buildCanonicalTopologyRecipe({ ...input, positions, triangles });
};

let topologyWorker: Worker | undefined;
let topologyWorkerSequence = 0;
const topologyWorkerRequests = new Map<
  number,
  Readonly<{
    resolve: (result: SectionCanonicalTopologyWorkerResult) => void;
    reject: (error: Error) => void;
  }>
>();

const getTopologyWorker = (): Worker | undefined => {
  if (topologyWorker !== undefined || typeof Worker === 'undefined' || import.meta.env.MODE === 'test') {
    return topologyWorker;
  }
  try {
    topologyWorker = new Worker(new URL('section-surface-topology.worker.ts', import.meta.url), { type: 'module' });
    topologyWorker.addEventListener(
      'message',
      (event: MessageEvent<Readonly<{ id: number; result: SectionCanonicalTopologyWorkerResult }>>) => {
        const request = topologyWorkerRequests.get(event.data.id);
        topologyWorkerRequests.delete(event.data.id);
        request?.resolve(event.data.result);
      },
    );
    topologyWorker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Section topology worker failed');
      for (const request of topologyWorkerRequests.values()) {
        request.reject(error);
      }
      topologyWorkerRequests.clear();
      topologyWorker?.terminate();
      topologyWorker = undefined;
    });
  } catch {
    topologyWorker = undefined;
  }
  return topologyWorker;
};

const buildCanonicalTopologyAsync = async (input: TopologyBuildInput): Promise<SectionSurfaceTopologyResult> => {
  const worker = getTopologyWorker();
  if (!worker) {
    return buildCanonicalTopology(input);
  }
  const positions = new Float64Array(input.positions.length * 3);
  for (const [vertex, position] of input.positions.entries()) {
    positions[vertex * 3] = position.x;
    positions[vertex * 3 + 1] = position.y;
    positions[vertex * 3 + 2] = position.z;
  }
  const triangleVertices = new Uint32Array(input.triangles.length * 3);
  for (const [triangleIndex, triangle] of input.triangles.entries()) {
    triangleVertices.set(triangle.vertices, triangleIndex * 3);
  }
  const request: SectionCanonicalTopologyWorkerInput = {
    sourceKey: input.sourceKey,
    positions,
    triangleVertices,
    allowSeamFallback: input.allowSeamFallback,
  };
  const id = ++topologyWorkerSequence;
  try {
    const result = await new Promise<SectionCanonicalTopologyWorkerResult>((resolve, reject) => {
      topologyWorkerRequests.set(id, { resolve, reject });
      worker.postMessage({ id, input: request }, [positions.buffer, triangleVertices.buffer]);
    });
    return hydrateCanonicalTopology(input, result);
  } catch {
    return buildCanonicalTopology(input);
  }
};

const materialAtTriangle = (mesh: SectionSurfaceMesh, triangleIndex: number): readonly [THREE.Material, number] => {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const indexOffset = triangleIndex * 3;
  const group = mesh.geometry.groups.find(
    (candidate) => indexOffset >= candidate.start && indexOffset < candidate.start + candidate.count,
  );
  const materialIndex = group?.materialIndex ?? 0;
  return [materials[materialIndex] ?? materials[0]!, materialIndex];
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

const sourceTopologyEpsilon = (positions: readonly THREE.Vector3[]): number => topologyExtent(positions) * 1e-6;

const createFallbackTopologyInput = (options: {
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): TopologyBuildInput | SectionSurfaceTopologyResult => {
  const positions: THREE.Vector3[] = [];
  const triangles: TopologyTriangle[] = [];
  let sawDegenerateTriangle = false;
  const vertexBaseByParticipant = new Map<SectionSurfaceParticipant, number>();

  for (const participant of options.participants) {
    participant.topologyTrianglesByGeometryTriangle.clear();
    const { position } = participant.mesh.geometry.attributes;
    if (!position || position.itemSize < 3) {
      return topologyFailure(options.sourceKey, 'missing-position', 'is missing a VEC3 position attribute');
    }
    vertexBaseByParticipant.set(participant, positions.length);
    for (let vertex = 0; vertex < position.count; vertex++) {
      const point = new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).applyMatrix4(
        participant.localToSource,
      );
      if (![point.x, point.y, point.z].every((value) => Number.isFinite(value))) {
        return topologyFailure(options.sourceKey, 'non-finite-position', 'contains a non-finite position');
      }
      positions.push(point);
    }
  }

  const epsilon = sourceTopologyEpsilon(positions);
  for (const participant of options.participants) {
    const position = participant.mesh.geometry.attributes['position']!;
    const vertexBase = vertexBaseByParticipant.get(participant)!;

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
    for (let offset = drawStart; offset < drawEnd; offset += 3) {
      const localVertices = [
        index ? index.getX(offset) : offset,
        index ? index.getX(offset + 1) : offset + 1,
        index ? index.getX(offset + 2) : offset + 2,
      ] as const;
      if (localVertices.some((vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= position.count)) {
        return topologyFailure(options.sourceKey, 'missing-position', 'references a missing vertex');
      }
      if (
        localVertices[0] === localVertices[1] ||
        localVertices[1] === localVertices[2] ||
        localVertices[2] === localVertices[0]
      ) {
        return topologyFailure(options.sourceKey, 'collapsed-triangle', 'contains a collapsed triangle');
      }
      const vertices = localVertices.map((vertex) => vertexBase + vertex) as [number, number, number];
      const points = vertices.map((vertex) => positions[vertex]!) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      const areaSquared = new THREE.Vector3()
        .subVectors(points[1], points[0])
        .cross(new THREE.Vector3().subVectors(points[2], points[0]))
        .lengthSq();
      if (areaSquared <= epsilon ** 4) {
        sawDegenerateTriangle = true;
        continue;
      }
      const participantTriangleIndex = Math.floor(offset / 3);
      const [material, materialOrder] = materialAtTriangle(participant.mesh, participantTriangleIndex);
      const topologyTriangleIndex = triangles.length;
      triangles.push({
        vertices,
        points,
        participant,
        participantTriangleIndex,
        material,
        materialOrder,
        edges: [-1, -1, -1],
      });
      const mapped = participant.topologyTrianglesByGeometryTriangle.get(participantTriangleIndex) ?? [];
      mapped.push(topologyTriangleIndex);
      participant.topologyTrianglesByGeometryTriangle.set(participantTriangleIndex, mapped);
    }
  }

  if (triangles.length === 0 && sawDegenerateTriangle) {
    return topologyFailure(options.sourceKey, 'degenerate-triangle', 'contains only degenerate triangles');
  }
  return {
    sourceKey: options.sourceKey,
    path: 'fallback',
    positions,
    triangles,
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
  sourceKey: string;
  participants: readonly SectionSurfaceParticipant[];
}): Promise<SectionSurfaceTopologyResult> => {
  const input = createFallbackTopologyInput(options);
  return 'status' in input ? input : buildCanonicalTopologyAsync(input);
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
  const usedMaterialOrders = new Set<number>();
  for (const triangle of participant.topologyTrianglesByGeometryTriangle.keys()) {
    usedMaterialOrders.add(materialAtTriangle(participant.mesh, triangle)[1]);
  }
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
  root: THREE.Object3D;
  order: number;
  association?: GltfAssociation;
}): SectionSurfaceParticipant => {
  getOrBuildBvh(options.mesh.geometry);
  options.root.updateWorldMatrix(true, true);
  options.mesh.updateWorldMatrix(true, false);
  const rootInverse = new THREE.Matrix4().copy(options.root.matrixWorld).invert();
  return {
    mesh: options.mesh,
    localToSource: new THREE.Matrix4().multiplyMatrices(rootInverse, options.mesh.matrixWorld),
    order: options.order,
    nodeIndex: options.association?.nodes,
    meshIndex: options.association?.meshes,
    primitiveIndex: options.association?.primitives,
    topologyTrianglesByGeometryTriangle: new Map(),
  };
};

const createStandaloneSource = (mesh: SectionSurfaceMesh): SectionSurfaceSource => {
  const revision = geometryRevision(mesh.geometry);
  const cached = standaloneSourceCache.get(mesh);
  if (cached?.revision === revision) {
    return cached;
  }
  const participant = createParticipant({ mesh, root: mesh, order: 0 });
  const builtRevision = geometryRevision(mesh.geometry);
  const source: SectionSurfaceSource = {
    key: mesh.uuid,
    root: mesh,
    owner: getModelComponentOwnerInHierarchy(mesh),
    participants: [participant],
    topology: buildFallbackTopology({ sourceKey: mesh.uuid, participants: [participant] }),
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

const readUnsignedAccessor = async (
  parser: SectionTopologyGltfParser,
  accessorIndex: number,
): Promise<readonly number[]> => {
  const descriptor = parser.json.accessors?.[accessorIndex];
  if (descriptor?.type !== 'SCALAR' || ![5121, 5123, 5125].includes(descriptor.componentType ?? -1)) {
    throw new Error(`accessor ${accessorIndex} must be an unsigned SCALAR accessor`);
  }
  const accessor = asAccessor(await parser.getDependency('accessor', accessorIndex));
  if (accessor?.itemSize !== 1 || accessor.count !== descriptor.count) {
    throw new Error(`accessor ${accessorIndex} could not be decoded as SCALAR`);
  }
  const values = Array.from({ length: accessor.count }, (_, index) => accessor.getX(index));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 0xff_ff_ff_ff)) {
    throw new Error(`accessor ${accessorIndex} contains an invalid unsigned index`);
  }
  return values;
};

const decodeManifoldTopology = async (options: {
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
    const original = originalByPrimitive.flat();
    const manifoldIndices = await readUnsignedAccessor(parser, manifold.indices);
    if (manifoldIndices.length !== original.length) {
      return fail('manifold and render index streams must have equal length');
    }
    const changed = original.flatMap((before, offset) =>
      before === manifoldIndices[offset] ? [] : [[offset, manifoldIndices[offset]!] as const],
    );
    if (extension.mergeIndices === undefined && extension.mergeValues === undefined) {
      if (changed.length > 0) {
        return fail('changed manifold indices require mergeIndices and mergeValues');
      }
    } else if (extension.mergeIndices === undefined || extension.mergeValues === undefined) {
      return fail('mergeIndices and mergeValues must be defined together');
    } else {
      const mergeIndices = await readUnsignedAccessor(parser, extension.mergeIndices);
      const mergeValues = await readUnsignedAccessor(parser, extension.mergeValues);
      const described = mergeIndices.map((offset, index) => [offset, mergeValues[index]!] as const);
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
    const positions = Array.from({ length: position.count }, (_, vertex) =>
      new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).applyMatrix4(
        representative.localToSource,
      ),
    );
    if (positions.some((point) => ![point.x, point.y, point.z].every((value) => Number.isFinite(value)))) {
      return fail('contains a non-finite position');
    }
    const epsilon = sourceTopologyEpsilon(positions);
    const participantByPrimitive = new Map(
      participants.map((participant) => [participant.primitiveIndex ?? 0, participant] as const),
    );
    const triangles: TopologyTriangle[] = [];
    let sawDegenerateTriangle = false;
    let indexOffset = 0;
    for (const [primitiveIndex, primitiveIndices] of originalByPrimitive.entries()) {
      const participant = participantByPrimitive.get(primitiveIndex);
      if (!participant) {
        return fail(`primitive ${primitiveIndex} has no loaded render participant`);
      }
      participant.topologyTrianglesByGeometryTriangle.clear();
      for (let primitiveOffset = 0; primitiveOffset < primitiveIndices.length; primitiveOffset += 3) {
        const vertices = manifoldIndices.slice(indexOffset + primitiveOffset, indexOffset + primitiveOffset + 3) as [
          number,
          number,
          number,
        ];
        if (vertices.some((vertex) => vertex < 0 || vertex >= position.count)) {
          return fail('manifold primitive index out of range');
        }
        if (vertices[0] === vertices[1] || vertices[1] === vertices[2] || vertices[2] === vertices[0]) {
          return fail('manifold primitive contains a collapsed triangle');
        }
        const points = vertices.map((vertex) => positions[vertex]!) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        if (
          new THREE.Vector3()
            .subVectors(points[1], points[0])
            .cross(new THREE.Vector3().subVectors(points[2], points[0]))
            .lengthSq() <=
          epsilon ** 4
        ) {
          sawDegenerateTriangle = true;
          continue;
        }
        const participantTriangleIndex = primitiveOffset / 3;
        const [material, materialOrder] = materialAtTriangle(participant.mesh, participantTriangleIndex);
        const topologyTriangleIndex = triangles.length;
        triangles.push({
          vertices,
          points,
          participant,
          participantTriangleIndex,
          material,
          materialOrder,
          edges: [-1, -1, -1],
        });
        const mapped = participant.topologyTrianglesByGeometryTriangle.get(participantTriangleIndex) ?? [];
        mapped.push(topologyTriangleIndex);
        participant.topologyTrianglesByGeometryTriangle.set(participantTriangleIndex, mapped);
      }
      indexOffset += primitiveIndices.length;
    }
    if (triangles.length === 0 && sawDegenerateTriangle) {
      return fail('contains only degenerate triangles');
    }
    return await buildCanonicalTopologyAsync({
      sourceKey,
      path: 'extension',
      positions,
      triangles,
      allowSeamFallback: false,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

const combineExactTopologies = (
  sourceKey: string,
  topologies: readonly SectionSurfaceTopology[],
): SectionSurfaceTopologyResult => {
  const triangles: TopologyTriangle[] = [];
  const edges: CanonicalEdge[] = [];
  const components: SurfaceComponent[] = [];
  let buildMilliseconds = 0;
  for (const topology of topologies) {
    buildMilliseconds += topology.buildMilliseconds;
    const triangleOffset = triangles.length;
    const edgeOffset = edges.length;
    for (const triangle of topology.triangles) {
      triangles.push({
        ...triangle,
        edges: triangle.edges.map((edge) => edge + edgeOffset) as [number, number, number],
      });
    }
    for (const edge of topology.edges) {
      edges.push({
        ...edge,
        triangles: [edge.triangles[0] + triangleOffset, edge.triangles[1] + triangleOffset],
      });
    }
    for (const component of topology.components) {
      components.push({
        triangles: component.triangles.map((triangle) => triangle + triangleOffset),
        edges: component.edges.map((edge) => edge + edgeOffset),
      });
    }
    for (const participant of new Set(topology.triangles.map((triangle) => triangle.participant))) {
      for (const [geometryTriangle, mapped] of participant.topologyTrianglesByGeometryTriangle) {
        participant.topologyTrianglesByGeometryTriangle.set(
          geometryTriangle,
          mapped.map((value) => value + triangleOffset),
        );
      }
    }
  }
  return {
    status: 'ready',
    topology: {
      path: 'extension',
      sourceKey,
      triangles,
      edges,
      components,
      distanceTolerance: Math.max(...topologies.map((topology) => topology.distanceTolerance)),
      buildMilliseconds,
    },
  };
};

const isSectionSurfaceMesh = (object: THREE.Object3D): object is SectionSurfaceMesh => object instanceof THREE.Mesh;

const hasPositionAttribute = (geometry: THREE.BufferGeometry): boolean =>
  Object.hasOwn(geometry.attributes, 'position');

const createRegisteredSource = async (options: {
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
      : await buildFallbackTopologyAsync({ sourceKey: options.key, participants: options.participants }));
  return {
    key: options.key,
    root: options.root,
    owner: options.owner,
    participants: options.participants,
    topology,
    revision: options.participants.map((participant) => geometryRevision(participant.mesh.geometry)).join('|'),
  };
};

/** Builds and registers the private topology owned by one loaded glTF scene. @internal */
export const registerGltfSectionSurfaceSources = async (options: {
  scene: THREE.Group;
  manifest: GeometryComponentManifest;
  unitId: string;
  parser: SectionTopologyGltfParser;
}): Promise<readonly SectionSurfaceSource[]> => {
  const meshes: SectionSurfaceMesh[] = [];
  options.scene.updateMatrixWorld(true);
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
      root: options.scene,
      order,
      association: getAssociation(mesh, options.parser.associations),
    }),
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

  const sources = await Promise.all(
    sourceInputs.map(async (input) =>
      createRegisteredSource({
        parser: options.parser,
        key: input.key,
        root: options.scene,
        owner: input.owner,
        participants: input.participants,
      }),
    ),
  );
  sectionSourceRegistry.set(options.scene, sources);
  return sources;
};

/** Collects registered glTF sources plus topology-certified standalone meshes. @internal */
export const collectSectionSurfaceSources = (root: THREE.Group): VisibleSectionSurfaceSource[] => {
  const registered: SectionSurfaceSource[] = [];
  const coveredMeshes = new Set<SectionSurfaceMesh>();
  root.traverse((object) => {
    const sources = sectionSourceRegistry.get(object);
    if (!sources) {
      return;
    }
    registered.push(...sources);
    for (const source of sources) {
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
      hasPositionAttribute(object.geometry) &&
      !hasSceneTag(object, sceneTag.sectionViewHelper)
    ) {
      standalone.push(createStandaloneSource(object));
    }
  });

  return [...registered, ...standalone].flatMap((source) => {
    const states = source.participants.map((participant) => participantVisibility(participant));
    if (states.every((state) => state === 'hidden')) {
      return [];
    }
    return [{ source, visibility: states.every((state) => state === 'visible') ? 'complete' : 'partial' } as const];
  });
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

const halfOpenHit = (options: { edge: CanonicalEdge; plane: THREE.Plane }): THREE.Vector3 | undefined => {
  const start = options.plane.distanceToPoint(options.edge.start);
  const end = options.plane.distanceToPoint(options.edge.end);
  if (start > 0 === end > 0) {
    return undefined;
  }
  if (start === 0) {
    return options.edge.start.clone();
  }
  if (end === 0) {
    return options.edge.end.clone();
  }
  return options.edge.start.clone().lerp(options.edge.end, start / (start - end));
};

const candidateTopologyTriangles = (source: SectionSurfaceSource, worldPlane: THREE.Plane): Set<number> => {
  const candidates = new Set<number>();
  const localPlane = new THREE.Plane();
  const inverse = new THREE.Matrix4();
  for (const participant of source.participants) {
    participant.mesh.updateWorldMatrix(true, false);
    inverse.copy(participant.mesh.matrixWorld).invert();
    localPlane.copy(worldPlane).applyMatrix4(inverse);
    const bvh = getOrBuildBvh(participant.mesh.geometry);
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
        for (const topologyTriangle of participant.topologyTrianglesByGeometryTriangle.get(triangleIndex) ?? []) {
          candidates.add(topologyTriangle);
        }
        return false;
      },
    });
  }
  return candidates;
};

/** Slices one admitted logical source through paired halfedge adjacency. @internal */
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
  source.root.updateWorldMatrix(true, true);
  const sourcePlane = options.worldPlane
    .clone()
    .applyMatrix4(new THREE.Matrix4().copy(source.root.matrixWorld).invert());
  const broadphaseStartedAt = performance.now();
  const candidates = candidateTopologyTriangles(source, options.worldPlane);
  const candidateBroadphaseMilliseconds = performance.now() - broadphaseStartedAt;
  const candidateEdges = new Set<number>();
  for (const triangle of candidates) {
    for (const edge of topology.triangles[triangle]!.edges) {
      candidateEdges.add(edge);
    }
  }
  const hits = new Map<number, THREE.Vector3>();
  const openPolylines: THREE.Vector3[][] = [];
  for (const edge of candidateEdges) {
    const canonicalEdge = topology.edges[edge]!;
    const startDistance = sourcePlane.distanceToPoint(canonicalEdge.start);
    const endDistance = sourcePlane.distanceToPoint(canonicalEdge.end);
    if (
      Math.abs(startDistance) <= topology.distanceTolerance &&
      Math.abs(endDistance) <= topology.distanceTolerance &&
      !canonicalEdge.triangles.every((triangle) =>
        topology.triangles[triangle]!.points.every(
          (point) => Math.abs(sourcePlane.distanceToPoint(point)) <= topology.distanceTolerance,
        ),
      )
    ) {
      const [start, end] =
        comparePosition(canonicalEdge.start, canonicalEdge.end) <= 0
          ? [canonicalEdge.start, canonicalEdge.end]
          : [canonicalEdge.end, canonicalEdge.start];
      openPolylines.push([start.clone(), end.clone()]);
    }
    const hit = halfOpenHit({ edge: canonicalEdge, plane: sourcePlane });
    if (hit) {
      hits.set(edge, hit);
    }
  }
  const cutEdges = new Map<number, [number, number]>();
  const edgeLists = new Map<number, number[]>();
  for (const edge of hits.keys()) {
    for (const triangle of topology.edges[edge]!.triangles) {
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
  const componentByTriangle = new Int32Array(topology.triangles.length);
  for (const [componentIndex, component] of topology.components.entries()) {
    for (const triangle of component.triangles) {
      componentByTriangle[triangle] = componentIndex;
    }
  }
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
      const triangleValue = topology.triangles[triangle]!;
      const liveMaterials = Array.isArray(triangleValue.participant.mesh.material)
        ? triangleValue.participant.mesh.material
        : [triangleValue.participant.mesh.material];
      const material = liveMaterials[triangleValue.materialOrder] ?? liveMaterials[0] ?? triangleValue.material;
      const contribution = materialLengths.get(material) ?? {
        length: 0,
        order: triangleValue.participant.order * 1_000_000 + triangleValue.materialOrder,
      };
      contribution.length += point.distanceTo(outgoingPoint);
      materialLengths.set(material, contribution);
      const [left, right] = topology.edges[outgoing]!.triangles;
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
      cutComponents.add(componentByTriangle[start]!);
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
