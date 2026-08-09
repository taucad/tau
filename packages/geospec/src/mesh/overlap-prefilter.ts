/**
 * R14-lite: conservative disjointness pre-filter for the interference sweep.
 *
 * On a pair-volume cache miss, PROVE the two components' intersection volume
 * is exactly 0 before paying the Manifold boolean. Every exit except a proof
 * falls through to the boolean — the proof of record is untouched, so the
 * filter can only skip work, never decide a verdict the boolean would not.
 *
 * The proof has two parts, both exact-conservative:
 *
 * 1. Surface separation (`disjointBeyondMargin`): a dual-BVH predicate
 *    recursion over the two world-frame soups. Node pairs whose box distance
 *    exceeds the margin are pruned (box distance lower-bounds any member
 *    point distance — sound); a leaf-leaf pair within the box margin runs the
 *    exact triangle-pair certificate (CR2 rung A): one triangle's supporting
 *    plane strictly clearing the other by the margin bounds every point-pair
 *    distance below by the margin (the base triangle lies in its plane), so
 *    fat diagonal leaf boxes no longer force near-miss fallthroughs. Pairs
 *    with mutually crossing planes certify nothing and abort to the boolean.
 *    A deterministic node-pair visit budget (a pure function of the pair's
 *    triangle counts) bounds pathological traversals.
 *
 * 2. Containment (`islandsOutside`): surfaces separated by more than the
 *    margin leave exactly two cases — disjoint, or one inside the other. A
 *    path-connected surface piece that never comes within the margin of the
 *    other solid's boundary has constant membership, so ONE exact generalized
 *    winding number per piece decides it. Pieces are vertex-connected
 *    triangle islands (exact-coordinate weld — conservative: unshared
 *    duplicates only split islands, adding probes, never removing them).
 *    Multi-island components are why per-island probing is mandatory: a named
 *    component whose second island penetrates the neighbour is the classic
 *    single-probe false positive.
 *
 * Margin: `max(1e-6, 6e-7 · maxAbsCoord)` — at least ~5 ulps of Float32 at
 * the pair's coordinate scale (soups are Float32 world frame), orders below
 * any modelling tolerance, so the margin never decides a near-touching pair:
 * anything within it falls through to the boolean.
 *
 * ponytail: leaf = 1 triangle and a subrange-sort build — a flat-array
 * median-split BVH.
 */

import { generalizedWindingNumber } from '#proofs/winding-number.js';
import type { WindingMesh } from '#proofs/winding-number.js';
import type { AabbMeters } from '#mesh/types.js';

type FlatBvh = {
  /** 6 per node: minX, minY, minZ, maxX, maxY, maxZ. */
  bounds: Float64Array;
  /** 2 per node: left/right child index, -1 for leaves. */
  children: Int32Array;
  /** 1 per node: the leaf's triangle index, -1 for internal nodes. */
  triangles: Int32Array;
  nodeCount: number;
  root: number;
};

type Island = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  probe: readonly [number, number, number];
};

/**
 * Per-component structures the pre-filter reuses across every pair the
 * component participates in (memoized on the prepared component for the
 * sweep's lifetime).
 *
 * @internal
 */
export type ComponentDisjointnessData = {
  bvh: FlatBvh;
  islands: Island[];
  winding: WindingMesh;
  triangleCount: number;
  /**
   * Every exact-weld edge is shared by exactly two triangles. Containment
   * reasoning needs surfaces that PARTITION space; an open or non-manifold
   * soup falls through to the boolean, which fail-closes on it — the
   * pre-filter must never skip that. Conservative: unshared duplicate
   * vertices read as open edges, which only forces the fallthrough.
   */
  closed: boolean;
  /**
   * `closed` AND consistently oriented: every directed weld edge appears
   * exactly once (each undirected edge once per direction). The pre-filter's
   * `|winding|` reading tolerates a flipped triangle, so it only needs
   * `closed` — but a divergence-theorem volume integral does not (CR2), so
   * the arrangement engine's rungs require this stronger flag.
   */
  orientedClosed: boolean;
};

const buildBvh = (soup: Float32Array): FlatBvh => {
  const triangleCount = soup.length / 9;
  const triBounds = new Float64Array(triangleCount * 6);
  const centroids = new Float64Array(triangleCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 9;
    for (let axis = 0; axis < 3; axis += 1) {
      const a = soup[base + axis]!;
      const b = soup[base + 3 + axis]!;
      const c = soup[base + 6 + axis]!;
      const min = Math.min(a, b, c);
      const max = Math.max(a, b, c);
      triBounds[triangle * 6 + axis] = min;
      triBounds[triangle * 6 + 3 + axis] = max;
      centroids[triangle * 3 + axis] = (a + b + c) / 3;
    }
  }
  const maxNodes = Math.max(1, 2 * triangleCount - 1);
  const bounds = new Float64Array(maxNodes * 6);
  const children = new Int32Array(maxNodes * 2).fill(-1);
  const leafTriangles = new Int32Array(maxNodes).fill(-1);
  let nodeCount = 0;
  const indices = new Uint32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) {
    indices[index] = index;
  }
  const build = (lo: number, hi: number): number => {
    const node = nodeCount;
    nodeCount += 1;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = lo; index < hi; index += 1) {
      const triangle = indices[index]!;
      minX = Math.min(minX, triBounds[triangle * 6]!);
      minY = Math.min(minY, triBounds[triangle * 6 + 1]!);
      minZ = Math.min(minZ, triBounds[triangle * 6 + 2]!);
      maxX = Math.max(maxX, triBounds[triangle * 6 + 3]!);
      maxY = Math.max(maxY, triBounds[triangle * 6 + 4]!);
      maxZ = Math.max(maxZ, triBounds[triangle * 6 + 5]!);
    }
    bounds[node * 6] = minX;
    bounds[node * 6 + 1] = minY;
    bounds[node * 6 + 2] = minZ;
    bounds[node * 6 + 3] = maxX;
    bounds[node * 6 + 4] = maxY;
    bounds[node * 6 + 5] = maxZ;
    if (hi - lo <= 1) {
      leafTriangles[node] = indices[lo]!;
      return node;
    }
    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const extentZ = maxZ - minZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
    indices.subarray(lo, hi).sort((left, right) => centroids[left * 3 + axis]! - centroids[right * 3 + axis]!);
    const mid = lo + Math.floor((hi - lo) / 2);
    children[node * 2] = build(lo, mid);
    children[node * 2 + 1] = build(mid, hi);
    return node;
  };
  if (triangleCount > 0) {
    build(0, triangleCount);
  } else {
    nodeCount = 1;
    bounds.fill(0, 0, 6);
  }
  return { bounds, children, triangles: leafTriangles, nodeCount, root: 0 };
};

const buildIslands = (soup: Float32Array): { islands: Island[]; closed: boolean; orientedClosed: boolean } => {
  const triangleCount = soup.length / 9;
  if (triangleCount === 0) {
    return { islands: [], closed: false, orientedClosed: false };
  }
  // Exact-coordinate weld: triangles gathered from one record share bit-equal
  // vertex coordinates, so an exact key connects them; numerically distinct
  // duplicates only split islands further (more probes — conservative).
  const weldIds = new Map<string, number>();
  const parent = new Int32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) {
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
  const vertexFirstTriangle: number[] = [];
  const cornerWeldIds = new Uint32Array(triangleCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const base = triangle * 9 + corner * 3;
      const key = `${soup[base]}|${soup[base + 1]}|${soup[base + 2]}`;
      let weldId = weldIds.get(key);
      if (weldId === undefined) {
        weldId = vertexFirstTriangle.length;
        weldIds.set(key, weldId);
        vertexFirstTriangle.push(triangle);
      } else {
        union(triangle, vertexFirstTriangle[weldId]!);
      }
      cornerWeldIds[triangle * 3 + corner] = weldId;
    }
  }
  // Closedness: every undirected welded edge appears exactly twice.
  // Orientation (F-c): every DIRECTED welded edge appears exactly once — a
  // closed soup with one flipped triangle repeats a directed edge.
  const edgeCounts = new Map<number, number>();
  const directedEdges = new Set<number>();
  const weldCount = vertexFirstTriangle.length;
  let closed = true;
  let orientedClosed = true;
  for (let triangle = 0; triangle < triangleCount && closed; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const a = cornerWeldIds[triangle * 3 + corner]!;
      const b = cornerWeldIds[triangle * 3 + ((corner + 1) % 3)]!;
      if (a === b) {
        closed = false;
        break;
      }
      const directed = a * weldCount + b;
      if (directedEdges.has(directed)) {
        orientedClosed = false;
      }
      directedEdges.add(directed);
      const edge = a < b ? a * weldCount + b : b * weldCount + a;
      const count = (edgeCounts.get(edge) ?? 0) + 1;
      if (count > 2) {
        closed = false;
        break;
      }
      edgeCounts.set(edge, count);
    }
  }
  if (closed) {
    for (const count of edgeCounts.values()) {
      if (count !== 2) {
        closed = false;
        break;
      }
    }
  }
  const islandsByRoot = new Map<
    number,
    { min: [number, number, number]; max: [number, number, number]; probe: [number, number, number] }
  >();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle);
    let island = islandsByRoot.get(root);
    if (!island) {
      const base = triangle * 9;
      island = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
        probe: [soup[base]!, soup[base + 1]!, soup[base + 2]!],
      };
      islandsByRoot.set(root, island);
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const base = triangle * 9 + corner * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = soup[base + axis]!;
        island.min[axis] = Math.min(island.min[axis]!, value);
        island.max[axis] = Math.max(island.max[axis]!, value);
      }
    }
  }
  return { islands: [...islandsByRoot.values()], closed, orientedClosed: closed && orientedClosed };
};

/**
 * Build (once per component per sweep) the structures the disjointness proof
 * queries: a flat AABB-BVH, vertex-connected islands, and the winding mesh.
 *
 * @internal
 */
export const buildComponentDisjointnessData = (soup: Float32Array): ComponentDisjointnessData => {
  const triangleCount = soup.length / 9;
  const triVerts = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < triVerts.length; index += 1) {
    triVerts[index] = index;
  }
  const { islands, closed, orientedClosed } = buildIslands(soup);
  return {
    bvh: buildBvh(soup),
    islands,
    winding: { vertProperties: soup, triVerts, stride: 3 },
    triangleCount,
    closed,
    orientedClosed,
  };
};

/**
 * The separation margin for one pair: at least ~5 ulps of Float32 at the
 * pair's coordinate scale, so float rounding can never fake a separation —
 * and orders below any modelling tolerance, so it never decides a
 * near-touching pair (those fall through to the boolean).
 *
 * @internal
 */
export const disjointnessMargin = (left: AabbMeters, right: AabbMeters): number => {
  let maxAbs = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    maxAbs = Math.max(
      maxAbs,
      Math.abs(left.min[axis]!),
      Math.abs(left.max[axis]!),
      Math.abs(right.min[axis]!),
      Math.abs(right.max[axis]!),
    );
  }
  return Math.max(1e-6, 6e-7 * maxAbs);
};

/**
 * Whether every vertex of triangle `other` (at `otherBase` in its soup) lies
 * strictly on one side of triangle `base`'s supporting plane, cleared by
 * `margin` (scaled by the unnormalized normal length). Because the base
 * triangle lies IN its plane, this certifies every point-pair distance
 * between the two triangles exceeds the margin — the half-space bound.
 * Degenerate planes certify nothing.
 */
const planeSeparatesTriangles = (options: {
  soup: Float32Array;
  base: number;
  otherSoup: Float32Array;
  otherBase: number;
  margin: number;
}): boolean => {
  const { soup, base, otherSoup, otherBase, margin } = options;
  const ax = soup[base]!;
  const ay = soup[base + 1]!;
  const az = soup[base + 2]!;
  const edge1X = soup[base + 3]! - ax;
  const edge1Y = soup[base + 4]! - ay;
  const edge1Z = soup[base + 5]! - az;
  const edge2X = soup[base + 6]! - ax;
  const edge2Y = soup[base + 7]! - ay;
  const edge2Z = soup[base + 8]! - az;
  const nx = edge1Y * edge2Z - edge1Z * edge2Y;
  const ny = edge1Z * edge2X - edge1X * edge2Z;
  const nz = edge1X * edge2Y - edge1Y * edge2X;
  const normalLength = Math.hypot(nx, ny, nz);
  if (normalLength === 0) {
    return false;
  }
  const band = margin * normalLength;
  let positive = 0;
  let negative = 0;
  for (let corner = 0; corner < 3; corner += 1) {
    const offset = otherBase + corner * 3;
    const distance =
      nx * (otherSoup[offset]! - ax) + ny * (otherSoup[offset + 1]! - ay) + nz * (otherSoup[offset + 2]! - az);
    if (distance > band) {
      positive += 1;
    } else if (distance < -band) {
      negative += 1;
    }
  }
  return positive === 3 || negative === 3;
};

/**
 * Exact triangle-pair separation certificate (CR2 rung A): true only when one
 * triangle's supporting plane strictly separates it from the other by more
 * than the margin, in either direction — which bounds EVERY point-pair
 * distance below by the margin (see {@link planeSeparatesTriangles}). Skew
 * pairs whose planes mutually cross certify nothing and fall through.
 *
 * @internal
 */
export const trianglePairSeparated = (options: {
  left: ComponentDisjointnessData;
  leftTriangle: number;
  right: ComponentDisjointnessData;
  rightTriangle: number;
  margin: number;
}): boolean => {
  const leftSoup = options.left.winding.vertProperties as Float32Array;
  const rightSoup = options.right.winding.vertProperties as Float32Array;
  const leftBase = options.leftTriangle * 9;
  const rightBase = options.rightTriangle * 9;
  return (
    planeSeparatesTriangles({
      soup: leftSoup,
      base: leftBase,
      otherSoup: rightSoup,
      otherBase: rightBase,
      margin: options.margin,
    }) ||
    planeSeparatesTriangles({
      soup: rightSoup,
      base: rightBase,
      otherSoup: leftSoup,
      otherBase: leftBase,
      margin: options.margin,
    })
  );
};

const nodeDiagonalSquared = (bounds: Float64Array, node: number): number => {
  let sum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const extent = bounds[node * 6 + 3 + axis]! - bounds[node * 6 + axis]!;
    sum += extent * extent;
  }
  return sum;
};

/**
 * Prove the two surfaces never come within `margin` of each other (dual-BVH
 * predicate recursion; see the module doc). Exported for the arrangement
 * engine (CR2 rung B), whose containment volumes are sound only when the
 * surfaces provably do not touch — which also pre-certifies every island
 * probe as margin-clear of the other surface (the F-b guard, for free).
 *
 * @internal
 */
export const disjointBeyondMargin = (
  left: ComponentDisjointnessData,
  right: ComponentDisjointnessData,
  margin: number,
): boolean | 'exhausted' => {
  if (left.triangleCount === 0 || right.triangleCount === 0) {
    return true;
  }
  const marginSquared = margin * margin;
  // Deterministic pure-function budget: pathological interlocks abort to the
  // boolean instead of burning the sweep.
  const budget = 32 * (left.triangleCount + right.triangleCount);
  let visits = 0;
  const stack: number[] = [left.bvh.root, right.bvh.root];
  while (stack.length > 0) {
    const rightNode = stack.pop()!;
    const leftNode = stack.pop()!;
    visits += 1;
    if (visits > budget) {
      return 'exhausted';
    }
    // Box-pair L2 distance lower-bounds any member-point distance — prune
    // pairs already separated beyond the margin.
    let boxDistanceSquared = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const gap = Math.max(
        0,
        right.bvh.bounds[rightNode * 6 + axis]! - left.bvh.bounds[leftNode * 6 + 3 + axis]!,
        left.bvh.bounds[leftNode * 6 + axis]! - right.bvh.bounds[rightNode * 6 + 3 + axis]!,
      );
      boxDistanceSquared += gap * gap;
    }
    if (boxDistanceSquared > marginSquared) {
      continue;
    }
    const leftIsLeaf = left.bvh.children[leftNode * 2] === -1;
    const rightIsLeaf = right.bvh.children[rightNode * 2] === -1;
    if (leftIsLeaf && rightIsLeaf) {
      // Two triangles within the BOX margin (a lower bound only): the exact
      // plane-separation certificate decides. No certificate ⇒ fall through
      // to the boolean.
      if (
        !trianglePairSeparated({
          left,
          leftTriangle: left.bvh.triangles[leftNode]!,
          right,
          rightTriangle: right.bvh.triangles[rightNode]!,
          margin,
        })
      ) {
        return false;
      }
      continue;
    }
    const splitLeft =
      !leftIsLeaf &&
      (rightIsLeaf ||
        nodeDiagonalSquared(left.bvh.bounds, leftNode) >= nodeDiagonalSquared(right.bvh.bounds, rightNode));
    if (splitLeft) {
      stack.push(left.bvh.children[leftNode * 2]!, rightNode, left.bvh.children[leftNode * 2 + 1]!, rightNode);
    } else {
      stack.push(leftNode, right.bvh.children[rightNode * 2]!, leftNode, right.bvh.children[rightNode * 2 + 1]!);
    }
  }
  return true;
};

const aabbContains = (outer: AabbMeters, island: Island): boolean =>
  island.min[0] >= outer.min[0] &&
  island.min[1] >= outer.min[1] &&
  island.min[2] >= outer.min[2] &&
  island.max[0] <= outer.max[0] &&
  island.max[1] <= outer.max[1] &&
  island.max[2] <= outer.max[2];

const islandsOutside = (
  subject: ComponentDisjointnessData,
  otherAabb: AabbMeters,
  other: ComponentDisjointnessData,
): boolean => {
  for (const island of subject.islands) {
    // A point set inside the other solid has its AABB inside the other's AABB
    // exactly — islands that escape the box are provably outside.
    if (!aabbContains(otherAabb, island)) {
      continue;
    }
    // One exact winding number per surface-separated island decides its whole
    // membership (never the Barnes-Hut approximation — this is a proof). The
    // magnitude test also treats inverted-orientation shells as containment
    // risk instead of misreading them as outside.
    const winding = generalizedWindingNumber([island.probe[0], island.probe[1], island.probe[2]], other.winding);
    if (Math.abs(winding) >= 0.5) {
      return false;
    }
  }
  return true;
};

/**
 * Try to PROVE the pair's intersection volume is exactly 0.
 *
 * @returns `'disjoint'` only when separation AND both containment directions
 *   are proven; `'unknown'` falls through to the exact boolean.
 * @internal
 */
export const provePairDisjoint = (options: {
  leftAabb: AabbMeters;
  rightAabb: AabbMeters;
  left: ComponentDisjointnessData;
  right: ComponentDisjointnessData;
}): 'disjoint' | 'unknown' => {
  // Containment reasoning needs closed surfaces; open/non-manifold soups fall
  // through so the boolean path keeps its fail-closed invalid-component
  // diagnostics.
  if (!options.left.closed || !options.right.closed) {
    return 'unknown';
  }
  const margin = disjointnessMargin(options.leftAabb, options.rightAabb);
  const separated = disjointBeyondMargin(options.left, options.right, margin);
  if (separated !== true) {
    return 'unknown';
  }
  if (!islandsOutside(options.left, options.rightAabb, options.right)) {
    return 'unknown';
  }
  if (!islandsOutside(options.right, options.leftAabb, options.left)) {
    return 'unknown';
  }
  return 'disjoint';
};
