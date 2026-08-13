/**
 * Certified mesh distance predicates (CR4's measurement layer).
 *
 * Two predicates, deliberately asymmetric, because a tessellation can only
 * ever certify one side of a threshold on its own:
 *
 * - {@link fartherThan} answers `true` only when a **proof** exists that the
 *   two soups stay at least `distance` apart. `false` means "cannot certify",
 *   never "closer than".
 * - {@link withinDistance} answers with a **realizable witness**: two points,
 *   one on each soup, whose separation attains the reported value. Because a
 *   point of a soup is a point of the solid it tessellates, the witness is an
 *   upper bound on the exact BRep distance with no slack at all.
 *
 * The far direction is the one that needs slack: a soup is inscribed in its
 * solid, so a mesh gap over-states the BRep gap by at most the tessellation
 * deflection on each side. The F4 certified slack (`k · (δ_subject +
 * δ_target)`, k = 2 measured) is applied by the caller, not here — this module
 * only ever answers about the soups it was handed.
 *
 * Both predicates run under a visit budget that is a **pure function of the
 * triangle counts**, so the same pair costs the same on every machine, and
 * exhaustion returns "cannot certify" — never a verdict.
 *
 * @module
 */

import { disjointBeyondMargin, disjointVisitBudget } from '#mesh/overlap-prefilter.js';
import { closestPointOnTriangle } from '#proofs/winding-number.js';
import type { PrefilterComponent } from '#mesh/overlap-prefilter.js';
import type { Vec3 } from '#mesh/types.js';

/**
 * A realizable closest-pair witness: both points lie on their own soup.
 *
 * @public
 */
export type MeshDistanceWitness = {
  /** The attained separation — an upper bound on the exact distance. */
  distance: number;
  /** The witness point on the left soup. */
  left: Vec3;
  /** The witness point on the right soup. */
  right: Vec3;
};

/**
 * Prove that two soups stay at least `distance` apart.
 *
 * @param left - Left prepared component.
 * @param right - Right prepared component.
 * @param distance - The separation to certify, in subject millimetres.
 * @returns `true` only for a proof; `false` for "cannot certify" (a closer
 * pair was found, or the visit budget ran out).
 * @public
 */
export const fartherThan = (left: PrefilterComponent, right: PrefilterComponent, distance: number): boolean =>
  distance <= 0 ? false : disjointBeyondMargin(left, right, { margin: distance }) === true;

const corners = (positions: ArrayLike<number>, triangle: number): [Vec3, Vec3, Vec3] => {
  const base = triangle * 9;
  return [
    [positions[base]!, positions[base + 1]!, positions[base + 2]!],
    [positions[base + 3]!, positions[base + 4]!, positions[base + 5]!],
    [positions[base + 6]!, positions[base + 7]!, positions[base + 8]!],
  ];
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

const squaredDistance = (a: Vec3, b: Vec3): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The closest realizable vertex-to-triangle pair between two triangles.
 *
 * Vertex-to-face pairs are always realizable (the vertex is on one soup, the
 * foot is on the other) and their minimum is an upper bound on the true
 * triangle-pair distance — exactly the direction {@link withinDistance} needs.
 *
 * @param leftCorners - Left triangle corners.
 * @param rightCorners - Right triangle corners.
 * @returns The best realizable pair between the two triangles.
 */
const trianglePairWitness = (
  leftCorners: [Vec3, Vec3, Vec3],
  rightCorners: [Vec3, Vec3, Vec3],
): MeshDistanceWitness => {
  let best: MeshDistanceWitness | undefined;
  for (const vertex of leftCorners) {
    const foot = closestPointOnTriangle(vertex, rightCorners);
    const squared = squaredDistance(vertex, foot);
    if (!best || squared < best.distance) {
      best = { distance: squared, left: vertex, right: foot };
    }
  }
  for (const vertex of rightCorners) {
    const foot = closestPointOnTriangle(vertex, leftCorners);
    const squared = squaredDistance(vertex, foot);
    if (squared < best!.distance) {
      best = { distance: squared, left: foot, right: vertex };
    }
  }
  return { ...best!, distance: Math.sqrt(best!.distance) };
};

/**
 * Find a realizable witness pair no farther apart than `limit`.
 *
 * Determinism: leaf pairs are visited in index order and a tie never replaces
 * the incumbent, so the witness is a pure function of the two soups and the
 * limit — never of traversal timing.
 *
 * @param left - Left prepared component.
 * @param right - Right prepared component.
 * @param options - `limit` is the separation the witness must attain, in
 * subject millimetres; `budget` overrides the pure-function-of-triangle-counts
 * visit budget.
 * @returns The witness, or `undefined` when none was found within the limit or
 * the budget ran out — "cannot certify", never a verdict.
 * @public
 */
export const withinDistance = (
  left: PrefilterComponent,
  right: PrefilterComponent,
  options: { limit: number; budget?: number },
): MeshDistanceWitness | undefined => {
  const { limit } = options;
  if (left.triangleCount === 0 || right.triangleCount === 0 || limit < 0) {
    return undefined;
  }
  let budget = options.budget ?? disjointVisitBudget(left.triangleCount, right.triangleCount);
  let best: MeshDistanceWitness | undefined;
  const stack: Array<[number, number]> = [[0, 0]];
  while (stack.length > 0) {
    budget -= 1;
    if (budget < 0) {
      return undefined;
    }
    const [leftNode, rightNode] = stack.pop()!;
    const bound = boxDistance(left.bvh.bounds, right.bvh.bounds, [leftNode, rightNode]);
    if (bound > limit || (best !== undefined && bound >= best.distance)) {
      continue;
    }
    const leftChild = left.bvh.topology[leftNode * 3 + 2]!;
    const rightChild = right.bvh.topology[rightNode * 3 + 2]!;
    if (leftChild < 0 && rightChild < 0) {
      const leftTriangle = left.bvh.order[left.bvh.topology[leftNode * 3]!]!;
      const rightTriangle = right.bvh.order[right.bvh.topology[rightNode * 3]!]!;
      const witness = trianglePairWitness(
        corners(left.positions, leftTriangle),
        corners(right.positions, rightTriangle),
      );
      if (witness.distance <= limit && (best === undefined || witness.distance < best.distance)) {
        best = witness;
      }
      continue;
    }
    const leftCount = left.bvh.topology[leftNode * 3 + 1]!;
    const rightCount = right.bvh.topology[rightNode * 3 + 1]!;
    if (rightChild < 0 || (leftChild >= 0 && leftCount >= rightCount)) {
      stack.push([leftChild + 1, rightNode], [leftChild, rightNode]);
    } else {
      stack.push([leftNode, rightChild + 1], [leftNode, rightChild]);
    }
  }
  return best;
};
