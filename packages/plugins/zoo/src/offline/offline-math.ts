/**
 * Plain vector and frame math for the offline engine. Everything here is in millimetres in the global Z-up frame
 * kcl-lib uses, and has no libcascade dependency so frame bookkeeping stays cheap.
 */

/** Three-component vector or point. */
export type Vec3 = { x: number; y: number; z: number };

/** Two-component point in a sketch plane's local frame. */
export type Vec2 = { x: number; y: number };

/** Right-handed orthonormal frame: a sketch plane, a face plane, or a transform pivot. */
export type Frame = { origin: Vec3; x: Vec3; y: Vec3; z: Vec3 };

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/**
 * Unit vector along `a`, or `fallback` when `a` is degenerate.
 *
 * @param a - vector to normalise
 * @param fallback - returned when `a` has no length
 * @returns unit vector
 */
export function normalize(a: Vec3, fallback: Vec3 = vec3(0, 0, 1)): Vec3 {
  const l = length(a);
  return l < 1e-12 ? fallback : scale(a, 1 / l);
}

/**
 * Any unit vector perpendicular to `n`.
 *
 * @param n - unit normal
 * @returns a unit vector orthogonal to `n`
 */
export function perpendicular(n: Vec3): Vec3 {
  const helper = Math.abs(n.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  return normalize(cross(helper, n));
}

/**
 * Builds a frame from an origin, an x direction and a y direction, re-orthogonalising y.
 *
 * @param origin - frame origin
 * @param xAxis - x direction (need not be unit)
 * @param yAxis - approximate y direction
 * @returns orthonormal frame
 */
export function frameFromAxes(origin: Vec3, xAxis: Vec3, yAxis: Vec3): Frame {
  const x = normalize(xAxis, vec3(1, 0, 0));
  const z = normalize(cross(x, yAxis), perpendicular(x));
  const y = cross(z, x);
  return { origin, x, y, z };
}

/**
 * Maps a sketch-local point into the global frame.
 *
 * @param frame - sketch frame
 * @param u - local x
 * @param v - local y
 * @returns global point
 */
export function toGlobal(frame: Frame, u: number, v: number): Vec3 {
  return add(frame.origin, add(scale(frame.x, u), scale(frame.y, v)));
}

/**
 * Maps a sketch-local direction into the global frame.
 *
 * @param frame - sketch frame
 * @param u - local x
 * @param v - local y
 * @returns global direction
 */
export function directionToGlobal(frame: Frame, u: number, v: number): Vec3 {
  return add(scale(frame.x, u), scale(frame.y, v));
}

/**
 * Maps a global point into a frame's local (u, v, w) coordinates.
 *
 * @param frame - frame
 * @param p - global point
 * @returns local coordinates
 */
export function toLocal(frame: Frame, p: Vec3): Vec3 {
  const d = sub(p, frame.origin);
  return vec3(dot(d, frame.x), dot(d, frame.y), dot(d, frame.z));
}

/** The global XY frame. */
export const globalFrame: Frame = { origin: vec3(0, 0, 0), x: vec3(1, 0, 0), y: vec3(0, 1, 0), z: vec3(0, 0, 1) };
