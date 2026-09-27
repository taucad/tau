import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';

/**
 * Apply a column-major rigid transform to a point.
 *
 * @param matrix - Column-major 4×4 matrix.
 * @param point - Point to transform.
 * @returns The transformed point.
 */
export const transformPoint = (matrix: SpatialMatrix, point: SpatialVector): SpatialVector => [
  matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
  matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
  matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
];

/**
 * Column-major rotation about +Z through a pivot, the analytic reference for revolute joints.
 *
 * @param degrees - Rotation angle in degrees.
 * @param pivot - Point on the rotation axis.
 * @returns The rigid transform.
 */
export const rotationAboutZ = (degrees: number, pivot: SpatialVector = [0, 0, 0]): SpatialMatrix => {
  const cosine = Math.cos((degrees * Math.PI) / 180);
  const sine = Math.sin((degrees * Math.PI) / 180);
  return [
    cosine,
    sine,
    0,
    0,
    -sine,
    cosine,
    0,
    0,
    0,
    0,
    1,
    0,
    pivot[0] - cosine * pivot[0] + sine * pivot[1],
    pivot[1] - sine * pivot[0] - cosine * pivot[1],
    pivot[2],
    1,
  ];
};

/** Column-major 4×4 identity. */
export const identityMatrix: SpatialMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Largest absolute entry-wise difference between two matrices or vectors.
 *
 * @param actual - Computed values.
 * @param expected - Reference values.
 * @returns The maximum absolute difference.
 */
export const maxDifference = (actual: readonly number[], expected: readonly number[]): number =>
  Math.max(...actual.map((value, index) => Math.abs(value - expected[index]!)));
