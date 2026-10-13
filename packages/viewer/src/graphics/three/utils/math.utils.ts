/**
 * Pure math utilities for camera FOV calculations.
 */

const degToRad = Math.PI / 180;

// FOV mapping constants
const minFov = 0.1; // Very narrow FOV (nearly orthographic)
const maxFov = 90; // Very wide FOV (extreme perspective)
const fovRange = maxFov - minFov; // 89.9

// Epsilon below which a half-FOV tangent is considered degenerate (avoids Infinity/NaN)
export const tanEpsilon = 1e-9;

// ---------------------------------------------------------------------------
// Gizmo base constants (sourced from the three-viewport-gizmo library internals)
// See: node_modules/three-viewport-gizmo/dist/three-viewport-gizmo.js
//   -> `new PerspectiveCamera(26, 1, 5, 10)` with `position.set(0, 0, 7)`
// ---------------------------------------------------------------------------

/** Default FOV of the three-viewport-gizmo internal PerspectiveCamera (degrees). */
export const gizmoBaseFov = 26;
/** Default Z-distance of the three-viewport-gizmo internal camera from origin. */
export const gizmoBaseDistance = 7;
/** Depth margin around the gizmo origin for near/far plane calculation. */
export const gizmoDepthMargin = 3;

/**
 * Focus offset for gizmo distance compensation.
 *
 * Derived from `GIZMO_CUBE_LOCAL_HALF_SIZE (1.0) * GIZMO_SCALE (0.7)`.
 * The cube face centers sit at ±1.0 in the gizmo's local coordinate space;
 * after `gizmo.scale.multiplyScalar(0.7)` the front face is at z = 0.7 in
 * world space.  Focusing the distance compensation on this plane keeps the
 * front-facing cube face at a constant projected size regardless of FOV,
 * so only the perspective look/feel changes.
 */
export const gizmoFocusOffset = 0.7;

/**
 * Scale factor applied to the viewport FOV slider value before mapping it to
 * the gizmo's camera FOV.  A value of 0.5 halves the effective FOV so that at
 * the maximum slider position (90) the gizmo shows ~45° instead of 90°,
 * significantly reducing perspective warping on the small cube.
 */
export const gizmoFovScale = 0.5;

/**
 * Maps a slider angle (0-90) to an actual camera FOV in degrees (0.1-90).
 * Input is clamped to [0, 90].
 *
 * The mapping is linear: `0.1 + 89.9 * (angle / 90)`.
 *
 * @param cameraFovAngle - The slider value in the range [0, 90].
 * @returns The camera FOV in degrees in the range [0.1, 90].
 */
export function calculateFovFromAngle(cameraFovAngle: number): number {
  const clamped = Math.max(0, Math.min(maxFov, cameraFovAngle));
  return minFov + fovRange * (clamped / maxFov);
}

/**
 * Maps a slider angle (0-90) to a **dampened** FOV for the viewport gizmo.
 *
 * Applies {@link gizmoFovScale} to the slider value before the standard
 * linear mapping so that the gizmo never reaches extreme perspective angles.
 * At `GIZMO_FOV_SCALE = 0.5`:
 * - Slider 0  → 0.1°  (same as viewport)
 * - Slider 90 → ~45°  (half of viewport's 90°)
 *
 * @param cameraFovAngle - The slider value in the range [0, 90].
 * @returns The dampened gizmo FOV in degrees.
 */
export function calculateGizmoFovFromAngle(cameraFovAngle: number): number {
  return calculateFovFromAngle(cameraFovAngle * gizmoFovScale);
}

/**
 * Computes the new camera distance required to maintain perceived object size
 * when the FOV changes.
 *
 * **Without `focusOffset` (default 0):**
 *   `newDistance = currentDistance * tan(oldFov/2) / tan(newFov/2)`
 *   Keeps objects at the origin at constant projected size.
 *
 * **With `focusOffset > 0`:**
 *   `newDistance = focusOffset + (currentDistance - focusOffset) * tan(oldFov/2) / tan(newFov/2)`
 *   Keeps the plane at `z = focusOffset` (toward the camera) at constant
 *   projected size.  This is used for the viewport gizmo so that the cube's
 *   front face stays the same apparent size and only the perspective look/feel
 *   changes with FOV.
 *
 * Guards against degenerate inputs:
 * - If either half-FOV tangent is below epsilon, returns `currentDistance` unchanged.
 * - If any input is NaN, returns `currentDistance` unchanged.
 *
 * @param oldFovDeg - The previous FOV in degrees.
 * @param newFovDeg - The new FOV in degrees.
 * @param currentDistance - The current camera distance from the target.
 * @param focusOffset - Z-offset from the origin toward the camera whose projected
 *   size should remain constant.  Defaults to 0 (origin).
 * @returns The compensated distance that keeps the focus plane the same apparent size.
 */
// oxlint-disable-next-line max-params -- heavily used utility (30+ call sites); wrapping would add noise for simple numeric args
export function calculateFovDistanceCompensation(
  oldFovDeg: number,
  newFovDeg: number,
  currentDistance: number,
  focusOffset = 0,
): number {
  if (Number.isNaN(oldFovDeg) || Number.isNaN(newFovDeg) || Number.isNaN(currentDistance)) {
    return currentDistance;
  }

  const oldHalfRad = (oldFovDeg / 2) * degToRad;
  const newHalfRad = (newFovDeg / 2) * degToRad;

  const tanOld = Math.tan(oldHalfRad);
  const tanNew = Math.tan(newHalfRad);

  if (Math.abs(tanOld) < tanEpsilon || Math.abs(tanNew) < tanEpsilon) {
    return currentDistance;
  }

  const effectiveDistance = currentDistance - focusOffset;
  return focusOffset + effectiveDistance * (tanOld / tanNew);
}
