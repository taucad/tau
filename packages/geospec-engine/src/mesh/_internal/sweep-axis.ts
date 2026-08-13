/**
 * The one sweep-axis choice.
 *
 * Every sweep-and-prune site in the engine — the interference sweep's candidate
 * pairs, the Barnes-Hut winding tree's median split — picks the axis of
 * greatest centre variance. A colinear stack (all boxes sharing one x-interval)
 * defeats an x-only sweep completely: every box is a candidate of every other
 * and the prune degrades to O(n²). Choosing by variance keeps the prune honest
 * whatever the assembly's layout.
 *
 * There is deliberately ONE implementation: two copies could drift, and a
 * sweep axis that differs between sites is a determinism hazard (§16).
 *
 * @module
 */

/** The three axis indices, as a total tuple domain. */
export type AxisIndex = 0 | 1 | 2;

/**
 * Pick the axis of greatest variance over a set of centres.
 *
 * Ties resolve `x ≥ y ≥ z`, so the choice is a pure function of the geometry
 * and never of iteration order.
 *
 * @param centres - Centre points; typically AABB centres or triangle centroids.
 * @returns The axis index to sweep along.
 * @public
 */
export const sweepAxisByCentreVariance = (centres: Iterable<readonly [number, number, number]>): AxisIndex => {
  let count = 0;
  const sums: [number, number, number] = [0, 0, 0];
  const squares: [number, number, number] = [0, 0, 0];
  for (const centre of centres) {
    count += 1;
    for (const axis of [0, 1, 2] as const) {
      sums[axis] += centre[axis];
      squares[axis] += centre[axis] * centre[axis];
    }
  }
  if (count === 0) {
    return 0;
  }
  // Population variance: E[x²] − E[x]². The count is shared by all three axes,
  // so it never changes the ranking — but it keeps the values comparable.
  const varianceX = squares[0] / count - (sums[0] / count) ** 2;
  const varianceY = squares[1] / count - (sums[1] / count) ** 2;
  const varianceZ = squares[2] / count - (sums[2] / count) ** 2;
  if (varianceX >= varianceY && varianceX >= varianceZ) {
    return 0;
  }
  return varianceY >= varianceZ ? 1 : 2;
};
