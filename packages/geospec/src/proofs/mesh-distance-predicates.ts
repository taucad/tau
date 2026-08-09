/**
 * CR4 — certified mesh-distance threshold predicates over occurrence
 * tessellations.
 *
 * The extrema gate needs exactly two facts about the distance between two
 * occurrence meshes, never the distance itself:
 *
 * 1. `meshesFartherThan(T)` — a CERTIFIED "every point-pair distance exceeds
 *    T": the disjointness pre-filter's dual-BVH predicate recursion
 *    ({@link disjointBeyondMargin}) parameterized at T instead of the float
 *    margin. Box-pair distances lower-bound member distances and the
 *    plane-separation leaf certificate bounds every pair below by T — both
 *    exact-conservative, so `true` is a proof and `false` means only "cannot
 *    certify" (straddle → the exact evaluator).
 * 2. `meshWithinDistance(T)` — a REALIZABLE witness pair at distance ≤ T:
 *    subject mesh vertices descend the target's AABB tree and the first
 *    vertex→closest-point-on-triangle pair within T wins (index order —
 *    deterministic). Both points lie ON the meshes, so the found distance is
 *    an attained upper bound; missing a sub-T pair (e.g. an edge–edge
 *    minimum no vertex realizes) only forces the straddle path — sound.
 *
 * Claims translate their tolerance into thresholds widened by the achieved
 * tessellation deflections and the F4-measured safety factor before calling
 * these predicates; the predicates themselves know nothing about tolerances
 * (§17: a certified bound is a proof; nothing here samples).
 *
 * Termination is geometry-pure (§16): the farther-than budget lives in the
 * pre-filter recursion, and the within search bounds its leaf visits by a
 * pure function of the pair's triangle counts — exhaustion returns
 * `undefined`, which the gate treats as a straddle, never as a verdict.
 */

import { buildComponentDisjointnessData, disjointBeyondMargin } from '#mesh/overlap-prefilter.js';
import type { ComponentDisjointnessData } from '#mesh/overlap-prefilter.js';
import type { Vec3 } from '#mesh/types.js';

/** A realizable mesh point pair at distance ≤ the queried threshold. */
export type MeshWitnessPair = {
  subjectPoint: Vec3;
  targetPoint: Vec3;
  distance: number;
};

/**
 * Build the reusable per-mesh structures (AABB tree, islands, winding soup)
 * for the distance predicates from a whole-occurrence triangle soup.
 *
 * The occurrence-mesh family stores Float64 soups; the pre-filter structures
 * are Float32 — the downcast rounds each coordinate by at most half a
 * Float32 ulp, which the F4-measured slack absorbs (the deviation gate runs
 * through this exact path, so the rounding is inside what it measures).
 *
 * @param triangles - Whole-occurrence soup, 9 floats per triangle.
 * @returns Structures accepted by both predicates.
 * @internal
 */
export const buildMeshDistanceData = (triangles: Float64Array): ComponentDisjointnessData =>
  buildComponentDisjointnessData(new Float32Array(triangles));

/**
 * Certified "every point-pair distance between the two meshes exceeds
 * `threshold`". `false` means only that the proof was not found.
 *
 * @param left - One mesh's predicate structures.
 * @param right - The other mesh's predicate structures.
 * @param threshold - The distance to certify against, in model units.
 * @returns True only when the separation proof succeeded.
 * @internal
 */
export const meshesFartherThan = (
  left: ComponentDisjointnessData,
  right: ComponentDisjointnessData,
  threshold: number,
): boolean => disjointBeyondMargin(left, right, threshold) === true;

/**
 * Closest point on the triangle at `base` in `soup` to `point` (Ericson,
 * Real-Time Collision Detection §5.1.5 — Voronoi region classification).
 */
const closestPointOnTriangle = (point: Vec3, soup: Float32Array, base: number): Vec3 => {
  const ax = soup[base]!;
  const ay = soup[base + 1]!;
  const az = soup[base + 2]!;
  const bx = soup[base + 3]!;
  const by = soup[base + 4]!;
  const bz = soup[base + 5]!;
  const cx = soup[base + 6]!;
  const cy = soup[base + 7]!;
  const cz = soup[base + 8]!;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = point[0] - ax;
  const apy = point[1] - ay;
  const apz = point[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return [ax, ay, az];
  }
  const bpx = point[0] - bx;
  const bpy = point[1] - by;
  const bpz = point[2] - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return [bx, by, bz];
  }
  // Edge-region denominators are squared edge lengths — zero only for
  // zero-length edges, where the division yields NaN coordinates whose NaN
  // distance compares false against any threshold: a conservative skip.
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return [ax + t * abx, ay + t * aby, az + t * abz];
  }
  const cpx = point[0] - cx;
  const cpy = point[1] - cy;
  const cpz = point[2] - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return [cx, cy, cz];
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return [ax + t * acx, ay + t * acy, az + t * acz];
  }
  const va = d3 * d6 - d5 * d4;
  const d43 = d4 - d3;
  const d56 = d5 - d6;
  if (va <= 0 && d43 >= 0 && d56 >= 0) {
    const t = d43 / (d43 + d56);
    return [bx + t * (cx - bx), by + t * (cy - by), bz + t * (cz - bz)];
  }
  // Degenerate triangles never reach here (the vertex/edge regions above
  // cover colinear geometry); an FP-zero denominator yields NaN coordinates,
  // whose NaN distance compares false against any threshold — a conservative
  // skip, never a wrong witness.
  const denominator = va + vb + vc;
  const v = vb / denominator;
  const w = vc / denominator;
  return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
};

const distanceSquaredTo = (point: Vec3, other: Vec3): number => {
  const dx = point[0] - other[0];
  const dy = point[1] - other[1];
  const dz = point[2] - other[2];
  return dx * dx + dy * dy + dz * dz;
};

const pointBoxDistanceSquared = (point: Vec3, bounds: Float64Array, node: number): number => {
  let sum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const gap = Math.max(0, bounds[node * 6 + axis]! - point[axis]!, point[axis]! - bounds[node * 6 + 3 + axis]!);
    sum += gap * gap;
  }
  return sum;
};

/**
 * Find a realizable subject→target point pair within `threshold`, or
 * `undefined` when none was found inside the deterministic visit budget.
 * Subject vertices are scanned in index order and the first qualifying pair
 * wins, so the witness is a pure function of the two meshes and the
 * threshold.
 *
 * @param subject - The mesh whose vertices probe the target.
 * @param target - The mesh answering closest-point queries.
 * @param threshold - The distance to realize, in model units.
 * @returns The first realizable pair at distance ≤ threshold, or `undefined`.
 * @internal
 */
export const meshWithinDistance = (
  subject: ComponentDisjointnessData,
  target: ComponentDisjointnessData,
  threshold: number,
): MeshWitnessPair | undefined => {
  if (subject.triangleCount === 0 || target.triangleCount === 0) {
    return undefined;
  }
  const subjectSoup = subject.winding.vertProperties as Float32Array;
  const targetSoup = target.winding.vertProperties as Float32Array;
  const thresholdSquared = threshold * threshold;
  const { bvh } = target;
  // Geometry-pure visit budget (§16): pathological descent aborts to the
  // straddle path instead of burning the sweep.
  let budget = 64 * (subject.triangleCount + target.triangleCount);
  const stack: number[] = [];
  for (let vertex = 0; vertex < subjectSoup.length / 3; vertex += 1) {
    const point: Vec3 = [subjectSoup[vertex * 3]!, subjectSoup[vertex * 3 + 1]!, subjectSoup[vertex * 3 + 2]!];
    stack.length = 0;
    stack.push(bvh.root);
    while (stack.length > 0) {
      const node = stack.pop()!;
      budget -= 1;
      if (budget < 0) {
        return undefined;
      }
      if (pointBoxDistanceSquared(point, bvh.bounds, node) > thresholdSquared) {
        continue;
      }
      const leafTriangle = bvh.triangles[node]!;
      if (leafTriangle !== -1) {
        const targetPoint = closestPointOnTriangle(point, targetSoup, leafTriangle * 9);
        const distanceSquared = distanceSquaredTo(point, targetPoint);
        if (distanceSquared <= thresholdSquared) {
          return { subjectPoint: point, targetPoint, distance: Math.sqrt(distanceSquared) };
        }
        continue;
      }
      stack.push(bvh.children[node * 2]!, bvh.children[node * 2 + 1]!);
    }
  }
  return undefined;
};
