/**
 * Pure math utilities for camera FOV calculations.
 */

// FOV mapping constants
const minFov = 0.1; // Very narrow FOV (nearly orthographic)
const maxFov = 90; // Very wide FOV (extreme perspective)
const fovRange = maxFov - minFov; // 89.9

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
