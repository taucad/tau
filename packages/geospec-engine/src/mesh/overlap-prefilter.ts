/**
 * The interference disjointness pre-filter (R14-lite / CR2-A).
 *
 * An exact boolean is the only thing allowed to *decide* a component pair. The
 * pre-filter exists solely to skip booleans it can prove would answer zero, so
 * every exit except a proof falls through — a filter that could decide
 * something the boolean would not is a soundness bug, not an optimization.
 *
 * The proof has two rungs:
 *
 * 1. **Surfaces beyond the margin.** A dual-BVH recursion over two flat
 *    median-split trees (one triangle per leaf). A box-to-box distance
 *    lower-bounds the distance between the triangles inside, so a box gap of at
 *    least the margin prunes the whole subtree pair soundly. Leaf pairs that
 *    survive get the CR2-A plane-separation certificate; mutually crossing
 *    planes certify NOTHING. The recursion carries a visit budget that is a
 *    pure function of the two triangle counts, and exhausting it returns
 *    "cannot certify", never a verdict.
 * 2. **Neither body contains the other.** Separated surfaces still permit
 *    nesting, so each island of each side is probed against the *whole* other
 *    soup with the generalized winding number. Rung 1's margin is what makes
 *    the probe unconditionally trustworthy: the probe point is at least the
 *    margin from the other surface, so it is never in the confidently-wrong
 *    near-field band. Probing per island (not once per component) is mandatory:
 *    a two-island bracket with one island inside a neighbour is the classic
 *    single-probe false positive.
 *
 * @module
 */

import { sweepAxisByCentreVariance } from '#mesh/_internal/sweep-axis.js';
import { generalizedWindingNumber } from '#proofs/winding-number.js';
import type { WindingMesh } from '#proofs/winding-number.js';
import type { Vec3 } from '#mesh/types.js';

/**
 * Separation margin for a pair, sized so it can never decide a near-touching
 * pair: `max(1e-6, 6e-7 · maxAbsCoord)`. Below it the pre-filter abstains and
 * the boolean answers.
 *
 * @param maxAbsCoord - Largest absolute coordinate across both components.
 * @returns The margin in subject units.
 * @public
 */
export const disjointnessMargin = (maxAbsCoord: number): number => Math.max(1e-6, 6e-7 * maxAbsCoord);

/** A flat median-split BVH: float64 bounds, int32 topology, one triangle per leaf. */
type FlatBvh = {
  /** Triangle indices in leaf order. */
  order: Int32Array;
  /** `[minX,minY,minZ,maxX,maxY,maxZ]` per node. */
  bounds: Float64Array;
  /** `[start, count, leftChild]` per node; `leftChild < 0` marks a leaf. */
  topology: Int32Array;
};

/** One connected shell of a component, welded on exact coordinates. */
type Island = {
  triangles: Int32Array;
  /** Every undirected edge shared by exactly two triangles. */
  closed: boolean;
  /** No directed edge repeated — the orientation is consistent. */
  orientedClosed: boolean;
  /** A vertex of the island, used as the containment probe. */
  probe: Vec3;
  /** Divergence-theorem volume of this shell alone. */
  signedVolume: number;
};

/**
 * A component prepared for pre-filtering: its soup, its BVH and its islands.
 *
 * @public
 */
export type PrefilterComponent = {
  positions: Float64Array<ArrayBuffer>;
  triangleCount: number;
  maxAbsCoord: number;
  bvh: FlatBvh;
  islands: Island[];
  /** Whether every island is a closed, consistently oriented shell. */
  trustworthy: boolean;
  windingMesh: WindingMesh;
};

const triangleCentroid = (positions: ArrayLike<number>, triangle: number): [number, number, number] => {
  const base = triangle * 9;
  return [
    (positions[base]! + positions[base + 3]! + positions[base + 6]!) / 3,
    (positions[base + 1]! + positions[base + 4]! + positions[base + 7]!) / 3,
    (positions[base + 2]! + positions[base + 5]! + positions[base + 8]!) / 3,
  ];
};

const buildBvh = (positions: Float64Array<ArrayBuffer>, triangleCount: number): FlatBvh => {
  const order = Int32Array.from({ length: triangleCount }, (_unused, index) => index);
  // A binary tree with one triangle per leaf has exactly 2n−1 nodes.
  const nodeCapacity = Math.max(1, triangleCount * 2 - 1);
  const bounds = new Float64Array(nodeCapacity * 6);
  const topology = new Int32Array(nodeCapacity * 3);
  // Node 0 is the root; every other node is allocated in SIBLING PAIRS, so a
  // node's right child is always `leftChild + 1`. A depth-first allocator would
  // put the right child after the whole left subtree, and every dual-tree
  // recursion here descends by `leftChild + 1` — it must be the sibling.
  let nextNode = 1;

  const build = (node: number, start: number, end: number): void => {
    const base = node * 6;
    bounds[base] = Infinity;
    bounds[base + 1] = Infinity;
    bounds[base + 2] = Infinity;
    bounds[base + 3] = -Infinity;
    bounds[base + 4] = -Infinity;
    bounds[base + 5] = -Infinity;
    for (let index = start; index < end; index++) {
      const triangleBase = order[index]! * 9;
      for (let corner = 0; corner < 3; corner++) {
        for (let axis = 0; axis < 3; axis++) {
          const value = positions[triangleBase + corner * 3 + axis]!;
          bounds[base + axis] = Math.min(bounds[base + axis]!, value);
          bounds[base + 3 + axis] = Math.max(bounds[base + 3 + axis]!, value);
        }
      }
    }
    topology[node * 3] = start;
    topology[node * 3 + 1] = end - start;
    if (end - start <= 1) {
      topology[node * 3 + 2] = -1;
      return;
    }
    const axis = sweepAxisByCentreVariance(
      (function* centroids() {
        for (let index = start; index < end; index++) {
          yield triangleCentroid(positions, order[index]!);
        }
      })(),
    );
    // Subrange sort, so the build is a pure function of the geometry.
    const slice = [...order.subarray(start, end)].sort(
      (left, right) =>
        triangleCentroid(positions, left)[axis] - triangleCentroid(positions, right)[axis] || left - right,
    );
    order.set(slice, start);
    const middle = start + Math.floor((end - start) / 2);
    const left = nextNode;
    nextNode += 2;
    topology[node * 3 + 2] = left;
    build(left, start, middle);
    build(left + 1, middle, end);
  };

  if (triangleCount > 0) {
    build(0, 0, triangleCount);
  }
  return { order, bounds, topology };
};

const vertexKey = (positions: ArrayLike<number>, offset: number): string =>
  `${positions[offset]!},${positions[offset + 1]!},${positions[offset + 2]!}`;

const buildIslands = (positions: Float64Array<ArrayBuffer>, triangleCount: number): Island[] => {
  const parent = Int32Array.from({ length: triangleCount }, (_unused, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parent[current]! !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const owner = new Map<string, number>();
  const canonical = new Int32Array(triangleCount * 3);
  let nextVertex = 0;
  const vertexIds = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const key = vertexKey(positions, triangle * 9 + corner * 3);
      let id = vertexIds.get(key);
      if (id === undefined) {
        id = nextVertex++;
        vertexIds.set(key, id);
      }
      canonical[triangle * 3 + corner] = id;
      const existing = owner.get(key);
      if (existing === undefined) {
        owner.set(key, triangle);
        continue;
      }
      const left = find(existing);
      const right = find(triangle);
      if (left !== right) {
        parent[left] = right;
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const root = find(triangle);
    const group = groups.get(root);
    if (group) {
      group.push(triangle);
    } else {
      groups.set(root, [triangle]);
    }
  }

  // Edges key on the welded vertex pair. `from * stride + to` is a bijection on
  // that pair for `stride = nextVertex` (every id is < stride), so it indexes
  // exactly what a `"from:to"` string did — but without allocating five strings
  // per triangle, which on a 648-component assembly is the difference between
  // ~12 s and ~36 s of pre-filter build. `nextVertex` is at most 3 · triangles,
  // so the product stays far inside the safe-integer range.
  const stride = nextVertex;
  return [...groups.values()].map((members) => {
    const undirected = new Map<number, number>();
    const directed = new Set<number>();
    let orientedClosed = true;
    let signedVolume = 0;
    for (const triangle of members) {
      const corners = [canonical[triangle * 3]!, canonical[triangle * 3 + 1]!, canonical[triangle * 3 + 2]!];
      for (let corner = 0; corner < 3; corner++) {
        const from = corners[corner]!;
        const to = corners[(corner + 1) % 3]!;
        const key = from < to ? from * stride + to : to * stride + from;
        undirected.set(key, (undirected.get(key) ?? 0) + 1);
        const directedKey = from * stride + to;
        if (directed.has(directedKey)) {
          // A repeated directed edge means a duplicated or inconsistently
          // oriented face: the winding number over this shell is not a
          // membership oracle, so the probe must not be trusted.
          orientedClosed = false;
        }
        directed.add(directedKey);
      }
      const base = triangle * 9;
      const ax = positions[base]!;
      const ay = positions[base + 1]!;
      const az = positions[base + 2]!;
      const bx = positions[base + 3]!;
      const by = positions[base + 4]!;
      const bz = positions[base + 5]!;
      const cx = positions[base + 6]!;
      const cy = positions[base + 7]!;
      const cz = positions[base + 8]!;
      signedVolume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    let closed = true;
    for (const count of undirected.values()) {
      if (count !== 2) {
        closed = false;
      }
    }
    const first = members[0]! * 9;
    return {
      triangles: Int32Array.from(members),
      closed,
      orientedClosed,
      probe: [positions[first]!, positions[first + 1]!, positions[first + 2]!] as Vec3,
      signedVolume,
    };
  });
};

/**
 * Prepare a component's pre-filter structures.
 *
 * @param positions - Flat `9 · n` triangle coordinates.
 * @param triangleCount - Number of triangles.
 * @returns The prepared component.
 * @public
 */
export const preparePrefilterComponent = (
  positions: Float64Array<ArrayBuffer>,
  triangleCount: number,
): PrefilterComponent => {
  let maxAbsCoord = 0;
  for (const value of positions) {
    maxAbsCoord = Math.max(maxAbsCoord, Math.abs(value));
  }
  const islands = buildIslands(positions, triangleCount);
  return {
    positions,
    triangleCount,
    maxAbsCoord,
    bvh: buildBvh(positions, triangleCount),
    islands,
    trustworthy: islands.length > 0 && islands.every((island) => island.closed && island.orientedClosed),
    windingMesh: {
      vertProperties: positions,
      triVerts: Int32Array.from({ length: triangleCount * 3 }, (_unused, index) => index),
      stride: 3,
    },
  };
};

const boxDistance = (left: Float64Array, right: Float64Array, nodes: readonly [number, number]): number => {
  const a = nodes[0] * 6;
  const b = nodes[1] * 6;
  let total = 0;
  for (let axis = 0; axis < 3; axis++) {
    const gap = Math.max(left[a + axis]! - right[b + 3 + axis]!, right[b + axis]! - left[a + 3 + axis]!, 0);
    total += gap * gap;
  }
  return Math.sqrt(total);
};

const corners = (positions: ArrayLike<number>, triangle: number): [Vec3, Vec3, Vec3] => {
  const base = triangle * 9;
  return [
    [positions[base]!, positions[base + 1]!, positions[base + 2]!],
    [positions[base + 3]!, positions[base + 4]!, positions[base + 5]!],
    [positions[base + 6]!, positions[base + 7]!, positions[base + 8]!],
  ];
};

/**
 * Whether one triangle's plane separates it from another by at least `margin`.
 *
 * @param plane - Triangle whose supporting plane is tested.
 * @param other - Triangle whose corners are measured against it.
 * @param margin - Required clearance.
 * @returns True when every corner of `other` clears the plane on one side.
 */
const planeSeparates = (plane: [Vec3, Vec3, Vec3], other: [Vec3, Vec3, Vec3], margin: number): boolean => {
  const [a, b, c] = plane;
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) {
    // A degenerate triangle has no plane; it certifies nothing.
    return false;
  }
  let positive = true;
  let negative = true;
  for (const point of other) {
    const distance = ((point[0] - a[0]) * nx + (point[1] - a[1]) * ny + (point[2] - a[2]) * nz) / length;
    if (distance < margin) {
      positive = false;
    }
    if (distance > -margin) {
      negative = false;
    }
  }
  return positive || negative;
};

/**
 * CR2-A: certify that two triangles are at least `margin` apart.
 *
 * Either triangle's supporting plane may act as the separator. Mutually
 * crossing planes certify NOTHING — the pair falls through to the boolean.
 *
 * @param left - Left triangle corners.
 * @param right - Right triangle corners.
 * @param margin - Required clearance.
 * @returns True when a separating plane was found.
 * @public
 */
export const certifyTrianglesApart = (left: [Vec3, Vec3, Vec3], right: [Vec3, Vec3, Vec3], margin: number): boolean =>
  planeSeparates(left, right, margin) || planeSeparates(right, left, margin);

/**
 * Visit budget for the dual-BVH recursion: a pure function of the triangle
 * counts, so the same pair costs the same on every machine.
 *
 * @param leftTriangles - Left triangle count.
 * @param rightTriangles - Right triangle count.
 * @returns The maximum number of node pairs the recursion may visit.
 * @public
 */
export const disjointVisitBudget = (leftTriangles: number, rightTriangles: number): number =>
  1024 + 256 * (leftTriangles + rightTriangles);

/**
 * Dual-BVH proof that two components' surfaces stay at least `margin` apart.
 *
 * @param left - Left component.
 * @param right - Right component.
 * @param options - `margin` is the required clearance; `budget` overrides
 * {@link disjointVisitBudget}, the pure function of the triangle counts that is
 * otherwise used.
 * @returns `true` when proven apart, `false` when a pair was found closer, and
 * `undefined` when the visit budget ran out — never a verdict.
 * @public
 */
export const disjointBeyondMargin = (
  left: PrefilterComponent,
  right: PrefilterComponent,
  options: { margin: number; budget?: number },
): boolean | undefined => {
  const { margin } = options;
  if (left.triangleCount === 0 || right.triangleCount === 0) {
    // Nothing to be close to. The empty tree has no root bounds to test, so the
    // recursion must never be entered with one.
    return true;
  }
  let budget = options.budget ?? disjointVisitBudget(left.triangleCount, right.triangleCount);
  const stack: Array<[number, number]> = [[0, 0]];
  while (stack.length > 0) {
    budget -= 1;
    if (budget < 0) {
      return undefined;
    }
    const [leftNode, rightNode] = stack.pop()!;
    if (boxDistance(left.bvh.bounds, right.bvh.bounds, [leftNode, rightNode]) >= margin) {
      continue;
    }
    const leftChild = left.bvh.topology[leftNode * 3 + 2]!;
    const rightChild = right.bvh.topology[rightNode * 3 + 2]!;
    if (leftChild < 0 && rightChild < 0) {
      const leftTriangle = left.bvh.order[left.bvh.topology[leftNode * 3]!]!;
      const rightTriangle = right.bvh.order[right.bvh.topology[rightNode * 3]!]!;
      if (
        certifyTrianglesApart(corners(left.positions, leftTriangle), corners(right.positions, rightTriangle), margin)
      ) {
        continue;
      }
      return false;
    }
    // Descend the side with more triangles below it — the balanced choice, and
    // a pure function of the trees.
    const leftCount = left.bvh.topology[leftNode * 3 + 1]!;
    const rightCount = right.bvh.topology[rightNode * 3 + 1]!;
    if (rightChild < 0 || (leftChild >= 0 && leftCount >= rightCount)) {
      stack.push([leftChild, rightNode], [leftChild + 1, rightNode]);
    } else {
      stack.push([leftNode, rightChild], [leftNode, rightChild + 1]);
    }
  }
  return true;
};

/**
 * Which of a component's islands sit inside the other component's material.
 *
 * Only meaningful once rung 1 has proven the surfaces at least `margin` apart:
 * that is what keeps every probe out of the near-surface band where the
 * generalized winding number is confidently wrong.
 *
 * @param probed - Component whose islands are probed.
 * @param against - Component whose whole soup answers the probe.
 * @returns One flag per island of `probed`.
 * @public
 */
export const classifyIslands = (probed: PrefilterComponent, against: PrefilterComponent): boolean[] =>
  probed.islands.map((island) => Math.abs(generalizedWindingNumber(island.probe, against.windingMesh)) > 0.5);

/**
 * Prove that a component pair cannot intersect.
 *
 * @param left - Left component.
 * @param right - Right component.
 * @returns The proof outcome. `surfacesApart` is `undefined` when the budget
 * ran out; `proven` is only ever true for a genuine proof.
 * @public
 */
export const provePairDisjoint = (
  left: PrefilterComponent,
  right: PrefilterComponent,
): {
  proven: boolean;
  surfacesApart: boolean | undefined;
  trustworthy: boolean;
  leftInsideRight: boolean[];
  rightInsideLeft: boolean[];
} => {
  const margin = disjointnessMargin(Math.max(left.maxAbsCoord, right.maxAbsCoord));
  const surfacesApart = disjointBeyondMargin(left, right, { margin });
  const trustworthy = left.trustworthy && right.trustworthy;
  if (surfacesApart !== true || !trustworthy) {
    return { proven: false, surfacesApart, trustworthy, leftInsideRight: [], rightInsideLeft: [] };
  }
  const leftInsideRight = classifyIslands(left, right);
  const rightInsideLeft = classifyIslands(right, left);
  return {
    proven: !leftInsideRight.includes(true) && !rightInsideLeft.includes(true),
    surfacesApart,
    trustworthy,
    leftInsideRight,
    rightInsideLeft,
  };
};

/**
 * Total signed volume of a component's shells (divergence theorem).
 *
 * @param component - The prepared component.
 * @returns The signed volume; negative for an inward-oriented soup.
 * @public
 */
export const signedSoupVolume = (component: PrefilterComponent): number =>
  component.islands.reduce((total, island) => total + island.signedVolume, 0);
