import * as THREE from 'three';
import {
  calculateFovFromAngle,
  calculateFovDistanceCompensation,
  tanEpsilon,
} from '#components/geometry/graphics/three/utils/math.utils.js';
import {
  resolveControlsTarget,
  syncCameraControlsUp,
  syncControlsLookAt,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

/**
 * Calculates a 3D position from spherical coordinates for an explicit up axis.
 * `horizontalAngle` is the right-handed azimuth around `up`; `verticalAngle`
 * is elevation from the plane perpendicular to `up`.
 */
export function calculatePositionFromSphericalCoordinates({
  distance,
  horizontalAngle,
  verticalAngle,
  up,
}: {
  distance: number;
  horizontalAngle: number;
  verticalAngle: number;
  up: THREE.Vector3;
}): THREE.Vector3 {
  const cosTheta = Math.cos(verticalAngle);
  const sinTheta = Math.sin(verticalAngle);

  const isXaxisUp = up.x === 1;
  const isYaxisUp = up.y === 1;

  if (isXaxisUp) {
    // X-up: X is the vertical axis, Y and Z are horizontal
    const x = distance * sinTheta;
    const y = distance * cosTheta * Math.cos(horizontalAngle);
    const z = distance * cosTheta * Math.sin(horizontalAngle);
    return new THREE.Vector3(x, y, z);
  }

  if (isYaxisUp) {
    // Y-up: Y is the vertical axis, X and Z are horizontal (Z negated to match coordinate handedness)
    const x = distance * cosTheta * Math.cos(horizontalAngle);
    const y = distance * sinTheta;
    const z = -distance * cosTheta * Math.sin(horizontalAngle);
    return new THREE.Vector3(x, y, z);
  }

  // Z-up: Z is the vertical axis, X and Y are horizontal
  const x = distance * cosTheta * Math.cos(horizontalAngle);
  const y = distance * cosTheta * Math.sin(horizontalAngle);
  const z = distance * sinTheta;
  return new THREE.Vector3(x, y, z);
}

/**
 * Computes the optimal zoom for a PerspectiveCamera so that the bounding box
 * tightly fills the frame in both horizontal and vertical dimensions.
 *
 * Uses **perspective-correct** angular extents: each bounding-box corner is
 * projected from the camera position, and the tangent of the angle from the
 * optical axis is computed per-corner (rightDist / forwardDistance). Corners that
 * are closer to the camera subtend a larger angle and therefore limit the zoom
 * more than corners further away. This prevents clipping that the simpler
 * orthographic approximation (constant `distance` divisor) would miss.
 *
 * Frustum visibility condition for a point at camera-relative (r, u, f):
 *   |r/f| <= aspect * tan(fov/2) / zoom   (horizontal)
 *   |u/f| <= tan(fov/2) / zoom             (vertical)
 *
 * @returns The zoom value to set on the camera. Always >= a small floor to
 *   prevent degenerate values.
 */
export function computeViewFittingZoom({
  cameraPosition,
  target,
  boundingBox,
  fovDeg,
  aspectRatio,
  up: worldUp,
  paddingFactor = 0.9,
}: {
  cameraPosition: THREE.Vector3;
  target: THREE.Vector3;
  boundingBox: THREE.Box3;
  fovDeg: number;
  aspectRatio: number;
  up: THREE.Vector3;
  paddingFactor?: number;
}): number {
  const distance = cameraPosition.distanceTo(target);
  if (
    !Number.isFinite(distance) ||
    distance < tanEpsilon ||
    !Number.isFinite(fovDeg) ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= tanEpsilon ||
    !Number.isFinite(paddingFactor) ||
    paddingFactor <= 0
  ) {
    return 1;
  }

  // Camera forward direction (from camera toward target)
  const forward = new THREE.Vector3().subVectors(target, cameraPosition).normalize();

  // Camera right = forward x worldUp (same pattern as computeHeadlampTransform)
  const right = new THREE.Vector3().crossVectors(forward, worldUp);

  // Handle degenerate case: camera looking along up axis (e.g. TOP/BOTTOM view)
  if (right.lengthSq() < 1e-6) {
    // Pick an arbitrary perpendicular — use the axis with the smallest
    // component of forward so the cross product is well-conditioned.
    const absX = Math.abs(forward.x);
    const absY = Math.abs(forward.y);
    const absZ = Math.abs(forward.z);
    const fallback =
      absX <= absY && absX <= absZ
        ? new THREE.Vector3(1, 0, 0)
        : absY <= absZ
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    right.crossVectors(forward, fallback);
  }

  right.normalize();

  // Camera up = right x forward
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const tanHalfFov = Math.tan((fovDeg / 2) * (Math.PI / 180));
  if (!Number.isFinite(tanHalfFov) || tanHalfFov < tanEpsilon) {
    return 1;
  }

  // Compute perspective-correct angular extents for each bounding-box corner.
  // For each corner we measure the tangent of the angle from the optical axis
  // (right/forward and up/forward ratios), which correctly accounts for corners
  // at different depths from the camera.
  const { min, max } = boundingBox;
  let maxRightTan = 0;
  let maxUpTan = 0;
  let validCorners = 0;

  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(
      // oxlint-disable-next-line no-bitwise -- bit mask selects min/max per axis
      i & 1 ? max.x : min.x,
      // oxlint-disable-next-line no-bitwise -- bit mask selects min/max per axis
      i & 2 ? max.y : min.y,
      // oxlint-disable-next-line no-bitwise -- bit mask selects min/max per axis
      i & 4 ? max.z : min.z,
    );

    // Vector from camera to this corner
    const toCorner = corner.sub(cameraPosition);
    const forwardDistance = toCorner.dot(forward);

    // Skip corners behind or at the camera plane
    if (forwardDistance <= tanEpsilon) {
      continue;
    }

    // Tangent of horizontal and vertical angles from the optical axis
    maxRightTan = Math.max(maxRightTan, Math.abs(toCorner.dot(right) / forwardDistance));
    maxUpTan = Math.max(maxUpTan, Math.abs(toCorner.dot(up) / forwardDistance));
    validCorners++;
  }

  // A degenerate projected axis is unconstrained. Only fall back when neither
  // axis can meaningfully constrain the frame.
  const hasHorizontalExtent = maxRightTan >= tanEpsilon;
  const hasVerticalExtent = maxUpTan >= tanEpsilon;
  if (validCorners === 0 || (!hasHorizontalExtent && !hasVerticalExtent)) {
    return 1;
  }

  // Max zoom that keeps every corner inside the frustum:
  //   zoom_v = tan(fov/2) / maxUpTan
  //   zoom_h = aspect * tan(fov/2) / maxRightTan
  const zoomVertical = hasVerticalExtent ? tanHalfFov / maxUpTan : Infinity;
  const zoomHorizontal = hasHorizontalExtent ? (aspectRatio * tanHalfFov) / maxRightTan : Infinity;

  // Tighter constraint wins (smaller zoom = less visible area)
  const tightZoom = Math.min(zoomVertical, zoomHorizontal) * paddingFactor;

  // Floor to prevent degenerate near-zero zoom
  return Math.max(tightZoom, tanEpsilon);
}

/**
 * Updates only the camera FOV based on angle, adjusting distance to maintain perceived size.
 * Does NOT reset camera position or viewing angle - preserves user's current view.
 */
export function updateCameraFov({
  camera,
  cameraFovAngle,
  invalidate,
  controls,
}: {
  camera: THREE.Camera;
  cameraFovAngle: number;
  invalidate: () => void;
  controls?: unknown;
}): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    console.error('updateCameraFov requires PerspectiveCamera');
    return;
  }

  // Store old FOV before changing
  const oldFov = camera.fov;

  // Calculate and apply the new FOV
  const newFov = calculateFovFromAngle(cameraFovAngle);
  camera.fov = newFov;

  // Adjust camera distance to maintain perceived size.
  // This keeps objects the same apparent size when FOV changes.
  const target = resolveControlsTarget({ camera, controls });
  const offset = camera.position.clone().sub(target);

  if (offset.lengthSq() >= tanEpsilon) {
    const currentDistance = offset.length();
    const newDistance = calculateFovDistanceCompensation(oldFov, newFov, currentDistance);

    if (newDistance !== currentDistance) {
      const direction = offset.normalize();
      camera.position.copy(target).add(direction.multiplyScalar(newDistance));
      camera.lookAt(target);
    }
  }

  camera.updateProjectionMatrix();
  syncControlsLookAt({ camera, controls, target, transition: false });
  invalidate();
}

/**
 * Resets the camera to a standard position and orientation based on geometry dimensions
 * Adjusts for FOV to maintain consistent framing regardless of perspective setting
 */
export function resetCamera({
  camera,
  geometryRadius,
  geometryCenter,
  geometryBounds,
  rotation,
  perspective,
  fitMargin,
  setSceneRadius,
  invalidate,
  enableConfiguredAngles,
  cameraFovAngle,
  controls,
  viewportAspect,
}: {
  camera: THREE.Camera;
  geometryRadius: number;
  /**
   * The center of the geometry's bounding box. The camera will orbit around
   * and look at this point rather than the world origin, allowing geometry
   * to remain at its absolute coordinates.
   */
  geometryCenter: THREE.Vector3;
  geometryBounds: THREE.Box3;
  rotation: { side: number; vertical: number };
  perspective: {
    offsetRatio: number;
    zoomLevel: number;
    nearPlane: number;
    minimumFarPlane: number;
    farPlaneRadiusMultiplier: number;
  };
  fitMargin: number;
  setSceneRadius: (radius: number) => void;
  invalidate: () => void;
  enableConfiguredAngles?: boolean;
  cameraFovAngle: number;
  controls?: unknown;
  /** The viewport width / height ratio used by projected-corner fitting. */
  viewportAspect?: number;
}): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    console.error('resetCamera requires PerspectiveCamera');
    return;
  }

  // If the geometry radius is less than or requal to 0, we didn't get an object to render.
  // Leaving it at 0 or less results in undefined camera behavior, so we set it to 1000.
  const adjustedGeometryRadius = geometryRadius <= 0 ? 1000 : geometryRadius;

  const useConfiguredAngles = enableConfiguredAngles ?? true;

  // Calculate and apply the FOV
  const calculatedFov = calculateFovFromAngle(cameraFovAngle);
  camera.fov = calculatedFov;

  // Calculate the effective FOV that will be active after this reset, due to perspective.zoomLevel
  const effectiveFovForAdjustment =
    THREE.MathUtils.RAD2DEG *
    2 *
    Math.atan(Math.tan((THREE.MathUtils.DEG2RAD * calculatedFov) / 2) / perspective.zoomLevel);

  const standardFov = 60;
  // Distance compensation ratio: pass distance=1 to get the pure tan(std/2)/tan(eff/2) ratio
  const adjustedOffsetRatio =
    perspective.offsetRatio * calculateFovDistanceCompensation(standardFov, effectiveFovForAdjustment, 1);
  const newDistance = adjustedGeometryRadius * adjustedOffsetRatio;

  if (useConfiguredAngles) {
    // Use configured rotation angles (side and vertical) for positioning
    // Offset from the geometry center so the camera orbits around it
    const offset = calculatePositionFromSphericalCoordinates({
      distance: newDistance,
      horizontalAngle: rotation.side,
      verticalAngle: rotation.vertical,
      up: camera.up,
    });
    camera.position.copy(geometryCenter).add(offset);
  } else if (camera.position.distanceToSquared(geometryCenter) >= 1e-9) {
    // Maintain current viewing direction if not at center, only adjust distance
    const currentDirection = camera.position.clone().sub(geometryCenter).normalize();
    camera.position.copy(geometryCenter).add(currentDirection.multiplyScalar(newDistance));
  } else {
    // Fallback for non-configured angle mode: If at center or too close, use configured angles to set an initial safe direction.
    const offset = calculatePositionFromSphericalCoordinates({
      distance: newDistance,
      horizontalAngle: rotation.side,
      verticalAngle: rotation.vertical,
      up: camera.up,
    });
    camera.position.copy(geometryCenter).add(offset);
  }

  camera.zoom = geometryBounds.isEmpty()
    ? perspective.zoomLevel
    : computeViewFittingZoom({
        cameraPosition: camera.position,
        target: geometryCenter,
        boundingBox: geometryBounds,
        fovDeg: camera.fov,
        aspectRatio: viewportAspect ?? camera.aspect,
        up: camera.up,
        paddingFactor: 1 - THREE.MathUtils.clamp(fitMargin, 0, 0.5),
      });
  camera.near = perspective.nearPlane;
  camera.far = Math.max(perspective.minimumFarPlane, adjustedGeometryRadius * perspective.farPlaneRadiusMultiplier);

  // Aim the camera at the geometry center
  camera.lookAt(geometryCenter);

  // Sync controls after the camera up vector and look-at target are settled so
  // CameraControls stores the same target-relative spherical state the camera shows.
  syncCameraControlsUp({ camera, controls, up: camera.up });
  syncControlsLookAt({ camera, controls, target: geometryCenter, transition: false });

  // Update the scene radius
  setSceneRadius(geometryRadius);

  camera.updateProjectionMatrix();
  invalidate();
}
