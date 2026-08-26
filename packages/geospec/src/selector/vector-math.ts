/**
 * Internal vector and transform helpers for the selector layer.
 *
 * Transforms follow {@link import('#step/types.js').XdeOccurrence.transform}:
 * 4x4 row-major placement matrices mapping part-local frames into the subject
 * frame.
 *
 * @module
 */

import type { Vec3 } from '#mesh/types.js';

const degreesPerRadian = 180 / Math.PI;

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a: Vec3, factor: number): Vec3 => [a[0] * factor, a[1] * factor, a[2] * factor];

export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const distance = (a: Vec3, b: Vec3): number => length(subtract(a, b));

export const normalize = (a: Vec3): Vec3 | undefined => {
  const magnitude = length(a);
  return magnitude > 0 ? scale(a, 1 / magnitude) : undefined;
};

/**
 * Angle between two directions in degrees, orientation-sensitive.
 * Returns undefined when either vector is degenerate.
 */
export const angleBetweenDegrees = (a: Vec3, b: Vec3): number | undefined => {
  const unitA = normalize(a);
  const unitB = normalize(b);
  if (!unitA || !unitB) {
    return undefined;
  }
  const cosine = Math.max(-1, Math.min(1, dot(unitA, unitB)));
  return Math.acos(cosine) * degreesPerRadian;
};

/**
 * Angle between two axes in degrees, orientation-insensitive (an axis and its
 * reverse denote the same line).
 */
export const axisAngleBetweenDegrees = (a: Vec3, b: Vec3): number | undefined => {
  const angle = angleBetweenDegrees(a, b);
  return angle === undefined ? undefined : Math.min(angle, 180 - angle);
};

const matrixEntry = (transform: number[], index: number): number => transform[index] ?? 0;

/** Map a part-local point into the subject frame through a 4x4 row-major transform. */
export const transformPoint = (transform: number[], point: Vec3): Vec3 => [
  matrixEntry(transform, 0) * point[0] +
    matrixEntry(transform, 1) * point[1] +
    matrixEntry(transform, 2) * point[2] +
    matrixEntry(transform, 3),
  matrixEntry(transform, 4) * point[0] +
    matrixEntry(transform, 5) * point[1] +
    matrixEntry(transform, 6) * point[2] +
    matrixEntry(transform, 7),
  matrixEntry(transform, 8) * point[0] +
    matrixEntry(transform, 9) * point[1] +
    matrixEntry(transform, 10) * point[2] +
    matrixEntry(transform, 11),
];

/** Map a part-local direction into the subject frame (rotation only). */
export const transformDirection = (transform: number[], direction: Vec3): Vec3 => [
  matrixEntry(transform, 0) * direction[0] +
    matrixEntry(transform, 1) * direction[1] +
    matrixEntry(transform, 2) * direction[2],
  matrixEntry(transform, 4) * direction[0] +
    matrixEntry(transform, 5) * direction[1] +
    matrixEntry(transform, 6) * direction[2],
  matrixEntry(transform, 8) * direction[0] +
    matrixEntry(transform, 9) * direction[1] +
    matrixEntry(transform, 10) * direction[2],
];
