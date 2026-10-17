type Point = readonly [number, number, number];

/**
 * Recover the canonical XY ring's circle from three widely separated outer surface vertices.
 * A tessellated circle need not have opposite extrema, so its AABB midpoint is not its center.
 * @param points - Actual rendered triangle vertices in physical metres, including current placement.
 * @returns Geometric circle center, axial midpoint and radius without consulting joint frames.
 */
export const renderedXyCircle = (points: readonly Point[]): { center: Point; radius: number } => {
  const first = points[0];
  if (first === undefined) {
    throw new Error('Cannot measure a circle without surface vertices');
  }
  let right = first;
  let left = first;
  let top = first;
  let minZ = first[2];
  let maxZ = first[2];
  for (const point of points) {
    if (point[0] > right[0]) {
      right = point;
    }
    if (point[0] < left[0]) {
      left = point;
    }
    if (point[1] > top[1]) {
      top = point;
    }
    minZ = Math.min(minZ, point[2]);
    maxZ = Math.max(maxZ, point[2]);
  }
  const bx = left[0] - right[0];
  const by = left[1] - right[1];
  const cx = top[0] - right[0];
  const cy = top[1] - right[1];
  const determinant = 2 * (bx * cy - by * cx);
  if (Math.abs(determinant) < 1e-16) {
    throw new Error('Circle support vertices are degenerate');
  }
  const bSquared = bx * bx + by * by;
  const cSquared = cx * cx + cy * cy;
  const dx = (cy * bSquared - by * cSquared) / determinant;
  const dy = (bx * cSquared - cx * bSquared) / determinant;
  return {
    center: [right[0] + dx, right[1] + dy, (minZ + maxZ) / 2],
    radius: Math.hypot(dx, dy),
  };
};
