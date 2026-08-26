/**
 * Generalized winding numbers over raw triangle soup.
 *
 * This is the membership oracle the void and interference proofs are built on,
 * and its whole point is that it needs **no healing and no closed mesh**. The
 * per-triangle signed solid angle (Van Oosterom–Strackee 1983) is defined for
 * any triangle and any query point, so an OCCT tessellation with cracked seams
 * answers as well as a watertight one. It is also **additive over surfaces**:
 * the winding number of a union of shells is the sum of theirs, which is what
 * makes a per-shell sign vector a valid body identity (the V3 lesson —
 * `decompose()` returns shells, not bodies, and the dominant shell alone reads
 * two sealed cavities as one).
 *
 * Two evaluation strategies, with an explicit break-even:
 *
 * - **Direct** — exact, `O(triangles)` per query. The default for void claims,
 *   which probe a handful of points.
 * - **Barnes-Hut** ({@link buildWindingTree}, Barill 2018) — an area-weighted
 *   centroid and dipole per node, so a far-away cluster answers in one term.
 *   Building costs a full pass, so it only pays above ~40–50 queries
 *   ({@link windingTreeBreakEvenQueries}); a contact patch with hundreds of
 *   samples amortises it easily, a four-probe void claim never does.
 *
 * The first-order approximation is **only trusted far from the surface**. Near
 * it the dipole term is confidently wrong, so {@link fastWindingNumber}
 * recurses to exact triangles instead — and {@link isWithinSurface}, built on
 * the exact Voronoi-region point-to-triangle distance, is the guard a caller
 * uses before believing any approximate answer at all.
 *
 * @module
 */

import { sweepAxisByCentreVariance } from '#mesh/_internal/sweep-axis.js';
import type { Vec3 } from '#mesh/types.js';

/**
 * A triangle soup in the Manifold mesh layout: interleaved vertex properties,
 * a flat triangle index list, and the property stride.
 *
 * @public
 */
export type WindingMesh = {
  vertProperties: ArrayLike<number>;
  triVerts: ArrayLike<number>;
  /** Number of floats per vertex; the first three are the position. */
  stride: number;
};

/** Above this many queries against one mesh, the Barnes-Hut build pays for itself. */
export const windingTreeBreakEvenQueries = 45;

/**
 * Node radius multiplier below which the dipole term is not trusted.
 *
 * The approximation keeps only the dipole, so its error falls off with the
 * square of the separation; four node radii is where it stops mattering for a
 * membership decision. Lowering it trades accuracy for speed and must be
 * re-measured, never guessed.
 */
const farFieldFactor = 4;

/** Triangles per Barnes-Hut leaf. */
const leafTriangles = 8;

const fourPi = 4 * Math.PI;

type Corner = { x: number; y: number; z: number };

const corner = (mesh: WindingMesh, vertex: number): Corner => {
  const base = vertex * mesh.stride;
  return { x: mesh.vertProperties[base]!, y: mesh.vertProperties[base + 1]!, z: mesh.vertProperties[base + 2]! };
};

/**
 * Three corners, in winding order.
 *
 * @public
 */
export type Triangle = readonly [Vec3, Vec3, Vec3];

/**
 * Signed solid angle a triangle subtends at a point (Van Oosterom–Strackee).
 *
 * @param point - Query point.
 * @param triangle - The triangle's three corners.
 * @returns The signed solid angle in steradians; `0` when the point lies on a
 * corner, where the angle is undefined and the triangle cannot contribute.
 * @public
 */
export const signedSolidAngle = (point: Vec3, triangle: Triangle): number => {
  const [a, b, c] = triangle;
  const ax = a[0] - point[0];
  const ay = a[1] - point[1];
  const az = a[2] - point[2];
  const bx = b[0] - point[0];
  const by = b[1] - point[1];
  const bz = b[2] - point[2];
  const cx = c[0] - point[0];
  const cy = c[1] - point[1];
  const cz = c[2] - point[2];

  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  const lc = Math.hypot(cx, cy, cz);
  if (la === 0 || lb === 0 || lc === 0) {
    return 0;
  }

  const numerator = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  const denominator =
    la * lb * lc +
    (ax * bx + ay * by + az * bz) * lc +
    (ax * cx + ay * cy + az * cz) * lb +
    (bx * cx + by * cy + bz * cz) * la;
  return 2 * Math.atan2(numerator, denominator);
};

/**
 * The generalized winding number of a point with respect to a triangle soup.
 *
 * @param point - Query point.
 * @param mesh - The soup. No closure, orientation repair or welding required.
 * @returns The winding number: ~1 strictly inside a closed positively oriented
 * surface, ~0 outside, fractional near an open boundary.
 * @public
 */
export const generalizedWindingNumber = (point: Vec3, mesh: WindingMesh): number => {
  let total = 0;
  // Index order is fixed, so the accumulation order — and therefore the last
  // bit of the result — is a pure function of the mesh (§16).
  for (let triangle = 0; triangle + 2 < mesh.triVerts.length; triangle += 3) {
    const a = corner(mesh, mesh.triVerts[triangle]!);
    const b = corner(mesh, mesh.triVerts[triangle + 1]!);
    const c = corner(mesh, mesh.triVerts[triangle + 2]!);
    total += signedSolidAngle(point, [
      [a.x, a.y, a.z],
      [b.x, b.y, b.z],
      [c.x, c.y, c.z],
    ]);
  }
  return total / fourPi;
};

/**
 * Exact squared distance from a point to a triangle (Ericson §5.1.5).
 *
 * The Voronoi-region form, not a plane projection: an under-estimate would let
 * a near-surface point be declared far away, which is exactly the case the
 * first-order winding approximation gets confidently wrong.
 *
 * @param point - Query point.
 * @param triangle - The triangle's three corners.
 * @returns The squared distance.
 * @public
 */
export const triangleDistanceSquared = (point: Vec3, triangle: Triangle): number => {
  const [x, y, z] = closestPointOffset(point, triangle);
  return squaredLength(x, y, z);
};

/**
 * The point of a triangle closest to a query point.
 *
 * The witness half of {@link triangleDistanceSquared}: both read the same
 * Voronoi ladder, so a distance and the point that realizes it can never
 * disagree.
 *
 * @param point - Query point.
 * @param triangle - The triangle's three corners.
 * @returns The closest point on the triangle.
 * @public
 */
export const closestPointOnTriangle = (point: Vec3, triangle: Triangle): Vec3 => {
  const [x, y, z] = closestPointOffset(point, triangle);
  return [point[0] - x, point[1] - y, point[2] - z];
};

/**
 * The vector from the triangle's closest point to the query point (Ericson
 * §5.1.5, Voronoi-region form).
 *
 * @param point - Query point.
 * @param triangle - The triangle's three corners.
 * @returns `point − closestPoint`, component-wise.
 */
const closestPointOffset = (point: Vec3, triangle: Triangle): [number, number, number] => {
  const [a, b, c] = triangle;
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const apx = point[0] - a[0];
  const apy = point[1] - a[1];
  const apz = point[2] - a[2];

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return [apx, apy, apz];
  }

  const bpx = point[0] - b[0];
  const bpy = point[1] - b[1];
  const bpz = point[2] - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return [bpx, bpy, bpz];
  }

  const cpx = point[0] - c[0];
  const cpy = point[1] - c[1];
  const cpz = point[2] - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return [cpx, cpy, cpz];
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return [apx - abx * t, apy - aby * t, apz - abz * t];
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return [apx - acx * t, apy - acy * t, apz - acz * t];
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [bpx - (c[0] - b[0]) * t, bpy - (c[1] - b[1]) * t, bpz - (c[2] - b[2]) * t];
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return [apx - (abx * v + acx * w), apy - (aby * v + acy * w), apz - (abz * v + acz * w)];
};

const squaredLength = (x: number, y: number, z: number): number => x * x + y * y + z * z;

/**
 * Whether a point lies within a distance of the soup's surface.
 *
 * The guard on every approximate membership answer: near the surface the
 * first-order winding term is confidently wrong, so a caller that cannot
 * tolerate that must fall back to the exact evaluation (or refuse the claim).
 *
 * @param point - Query point.
 * @param mesh - The soup.
 * @param distance - Distance threshold, in subject units.
 * @returns True when some triangle is within `distance` of the point.
 * @public
 */
export const isWithinSurface = (point: Vec3, mesh: WindingMesh, distance: number): boolean => {
  const limit = distance * distance;
  for (let triangle = 0; triangle + 2 < mesh.triVerts.length; triangle += 3) {
    const a = corner(mesh, mesh.triVerts[triangle]!);
    const b = corner(mesh, mesh.triVerts[triangle + 1]!);
    const c = corner(mesh, mesh.triVerts[triangle + 2]!);
    if (
      triangleDistanceSquared(point, [
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
        [c.x, c.y, c.z],
      ]) <= limit
    ) {
      return true;
    }
  }
  return false;
};

/**
 * One Barnes-Hut node: a triangle range plus the aggregate dipole that stands
 * in for it when the query point is far enough away.
 *
 * @public
 */
export type WindingTreeNode = {
  /** Index range into the tree's triangle-order array. */
  start: number;
  end: number;
  /** Area-weighted centroid of the node's triangles. */
  centre: Vec3;
  /** Area-weighted normal sum — the dipole moment. */
  dipole: Vec3;
  /** Distance from `centre` to the furthest vertex the node owns. */
  radius: number;
  children?: [WindingTreeNode, WindingTreeNode];
};

/**
 * A built Barnes-Hut winding tree.
 *
 * @public
 */
export type WindingTree = {
  mesh: WindingMesh;
  /** Triangle indices in tree order. */
  order: Int32Array;
  root: WindingTreeNode;
};

type TriangleFacts = {
  centroid: Vec3;
  normal: Vec3;
  area: number;
};

const triangleFacts = (mesh: WindingMesh, triangle: number): TriangleFacts => {
  const a = corner(mesh, mesh.triVerts[triangle * 3]!);
  const b = corner(mesh, mesh.triVerts[triangle * 3 + 1]!);
  const c = corner(mesh, mesh.triVerts[triangle * 3 + 2]!);
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  // Half the cross product: an area-weighted normal, which is exactly the
  // dipole contribution — no normalization, so degenerate triangles simply
  // contribute nothing.
  const nx = (uy * vz - uz * vy) / 2;
  const ny = (uz * vx - ux * vz) / 2;
  const nz = (ux * vy - uy * vx) / 2;
  return {
    centroid: [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3],
    normal: [nx, ny, nz],
    area: Math.hypot(nx, ny, nz),
  };
};

type BuildContext = {
  mesh: WindingMesh;
  facts: readonly TriangleFacts[];
  order: Int32Array;
};

const buildNode = (context: BuildContext, start: number, end: number): WindingTreeNode => {
  const { mesh, facts, order } = context;
  let areaSum = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  for (let index = start; index < end; index++) {
    const fact = facts[order[index]!]!;
    areaSum += fact.area;
    cx += fact.centroid[0] * fact.area;
    cy += fact.centroid[1] * fact.area;
    cz += fact.centroid[2] * fact.area;
    dx += fact.normal[0];
    dy += fact.normal[1];
    dz += fact.normal[2];
  }
  // A node of only degenerate triangles has no area to weight by; its plain
  // centroid still bounds it correctly and its dipole is zero.
  const centre: Vec3 =
    areaSum === 0 ? averageCentroid(context, start, end) : [cx / areaSum, cy / areaSum, cz / areaSum];

  let radius = 0;
  for (let index = start; index < end; index++) {
    const triangle = order[index]!;
    for (let vertex = 0; vertex < 3; vertex++) {
      const point = corner(mesh, mesh.triVerts[triangle * 3 + vertex]!);
      radius = Math.max(radius, Math.hypot(point.x - centre[0], point.y - centre[1], point.z - centre[2]));
    }
  }

  const node: WindingTreeNode = { start, end, centre, dipole: [dx, dy, dz], radius };
  if (end - start <= leafTriangles) {
    return node;
  }

  // Median split on the axis of greatest centroid variance — literally the same
  // helper the interference sweep uses, so a colinear stack never degrades
  // either site to O(n²) and the two choices cannot drift.
  const axis = sweepAxisByCentreVariance(subrangeCentroids(context, start, end));
  const slice = [...order.subarray(start, end)].sort(
    (left, right) => facts[left]!.centroid[axis] - facts[right]!.centroid[axis] || left - right,
  );
  order.set(slice, start);
  const middle = start + Math.floor((end - start) / 2);
  node.children = [buildNode(context, start, middle), buildNode(context, middle, end)];
  return node;
};

const averageCentroid = ({ facts, order }: BuildContext, start: number, end: number): Vec3 => {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let index = start; index < end; index++) {
    const fact = facts[order[index]!]!;
    cx += fact.centroid[0];
    cy += fact.centroid[1];
    cz += fact.centroid[2];
  }
  const count = end - start;
  return [cx / count, cy / count, cz / count];
};

function* subrangeCentroids(
  { facts, order }: BuildContext,
  start: number,
  end: number,
): Generator<readonly [number, number, number]> {
  for (let index = start; index < end; index++) {
    yield facts[order[index]!]!.centroid;
  }
}

/**
 * Build the Barnes-Hut winding tree for a soup.
 *
 * @param mesh - The soup.
 * @returns The tree.
 * @public
 */
export const buildWindingTree = (mesh: WindingMesh): WindingTree => {
  const triangleCount = Math.floor(mesh.triVerts.length / 3);
  const facts: TriangleFacts[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    facts.push(triangleFacts(mesh, triangle));
  }
  const order = Int32Array.from({ length: triangleCount }, (_unused, index) => index);
  return { mesh, order, root: buildNode({ mesh, facts, order }, 0, triangleCount) };
};

/**
 * Evaluate the winding number through the Barnes-Hut tree.
 *
 * Nodes further than `farField × radius` from the query answer with their
 * dipole term; everything closer is expanded, and leaves are evaluated
 * exactly. The result therefore approaches the direct evaluation as the query
 * approaches the surface — which is the only regime where the difference
 * matters.
 *
 * @param tree - The built tree.
 * @param point - Query point.
 * @returns The winding number.
 * @public
 */
export const fastWindingNumber = (tree: WindingTree, point: Vec3): number => {
  const stack: WindingTreeNode[] = [tree.root];
  let total = 0;
  while (stack.length > 0) {
    const node = stack.pop()!;
    const distance = Math.hypot(point[0] - node.centre[0], point[1] - node.centre[1], point[2] - node.centre[2]);
    if (node.children && distance > farFieldFactor * node.radius) {
      // First-order term only: trusted precisely because we are far away.
      const cube = distance * distance * distance;
      total +=
        (node.dipole[0] * (node.centre[0] - point[0]) +
          node.dipole[1] * (node.centre[1] - point[1]) +
          node.dipole[2] * (node.centre[2] - point[2])) /
        (fourPi * cube);
      continue;
    }
    if (node.children) {
      stack.push(node.children[0], node.children[1]);
      continue;
    }
    for (let index = node.start; index < node.end; index++) {
      const triangle = tree.order[index]!;
      const a = corner(tree.mesh, tree.mesh.triVerts[triangle * 3]!);
      const b = corner(tree.mesh, tree.mesh.triVerts[triangle * 3 + 1]!);
      const c = corner(tree.mesh, tree.mesh.triVerts[triangle * 3 + 2]!);
      total +=
        signedSolidAngle(point, [
          [a.x, a.y, a.z],
          [b.x, b.y, b.z],
          [c.x, c.y, c.z],
        ]) / fourPi;
    }
  }
  return total;
};

/**
 * Choose the winding strategy for a known query budget.
 *
 * Building the tree costs a full pass over the soup, so it only pays above
 * {@link windingTreeBreakEvenQueries}. A void claim probing four points must
 * stay direct; a contact patch sampling hundreds must not.
 *
 * @param mesh - The soup.
 * @param queryCount - How many points the caller will evaluate.
 * @returns A winding-number function.
 * @public
 */
export const createWindingOracle = (mesh: WindingMesh, queryCount: number): ((point: Vec3) => number) => {
  if (queryCount <= windingTreeBreakEvenQueries) {
    return (point) => generalizedWindingNumber(point, mesh);
  }
  return (point) => fastWindingNumber(cachedWindingTree(mesh), point);
};

/**
 * Trees memoized by the vertex buffer they were built from.
 *
 * A void claim asks about the same occurrence tessellation once per material
 * per claim, and a spec file makes several claims over the same material set —
 * so the same soup was being re-split, re-summed and re-dipoled from scratch
 * every time. The tree is a pure function of the soup, so reusing it is
 * result-identical by construction; keying on the vertex buffer itself makes
 * that structural (a different tessellation is a different buffer), and a
 * `WeakMap` means the tree dies with the soup rather than with the run.
 */
const windingTrees = new WeakMap<ArrayLike<number>, WindingTree>();

/**
 * The Barnes-Hut tree for a soup, built at most once per vertex buffer.
 *
 * @param mesh - The soup.
 * @returns The tree.
 * @public
 */
export const cachedWindingTree = (mesh: WindingMesh): WindingTree => {
  // Every `ArrayLike` — typed array or plain array — is an object, so the
  // buffer is always a usable WeakMap key.
  const identity = mesh.vertProperties;
  const cached = windingTrees.get(identity);
  if (cached) {
    return cached;
  }
  const tree = buildWindingTree(mesh);
  windingTrees.set(identity, tree);
  return tree;
};
