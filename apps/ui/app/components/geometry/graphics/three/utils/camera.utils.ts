import * as THREE from 'three';

/**
 * Calculates the field of view (FOV) in degrees from a camera FOV angle parameter.
 * Maps the input angle (0-90) to a FOV range (0.1-90 degrees).
 */
function calculateFovFromAngle(cameraFovAngle: number): number {
  const minFov = 0.1; // Very narrow FOV at 0 degrees (nearly orthographic)
  const maxFov = 90; // Very wide FOV at 90 degrees (extreme perspective)
  return minFov + (maxFov - minFov) * (cameraFovAngle / maxFov);
}

/**
 * Calculates a 3D position from spherical coordinates.
 * Converts distance (radius), horizontal angle (phi), and vertical angle (theta) into x, y, z coordinates.
 */
function calculatePositionFromSphericalCoordinates({
  distance,
  horizontalAngle,
  verticalAngle,
}: {
  distance: number;
  horizontalAngle: number;
  verticalAngle: number;
}): THREE.Vector3 {
  const cosTheta = Math.cos(verticalAngle);
  const x = distance * cosTheta * Math.cos(horizontalAngle);
  const y = distance * cosTheta * Math.sin(horizontalAngle);
  const z = distance * Math.sin(verticalAngle);
  return new THREE.Vector3(x, y, z);
}

/**
 * Updates only the camera FOV based on angle, adjusting distance to maintain perceived size.
 * Does NOT reset camera position or viewing angle - preserves user's current view.
 */
export function updateCameraFov({
  camera,
  cameraFovAngle,
  invalidate,
}: {
  camera: THREE.Camera;
  cameraFovAngle: number;
  invalidate: () => void;
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

  // Adjust camera distance to maintain perceived size
  // The formula is: d2 = d1 * (tan(fov1/2) / tan(fov2/2))
  // This keeps objects the same apparent size when FOV changes
  const oldHalfFovRad = THREE.MathUtils.degToRad(oldFov / 2);
  const newHalfFovRad = THREE.MathUtils.degToRad(newFov / 2);

  if (oldHalfFovRad !== 0 && newHalfFovRad !== 0 && camera.position.lengthSq() >= 1e-9) {
    // Direction from camera to target
    const direction = camera.position.clone().normalize();

    // Calculate the adjustment ratio
    // When FOV decreases, we need to move camera farther away
    const distanceRatio = Math.tan(oldHalfFovRad) / Math.tan(newHalfFovRad);

    // Apply distance adjustment preserving direction
    const currentDistance = camera.position.length();
    const newDistance = currentDistance * distanceRatio;

    camera.position.copy(direction.multiplyScalar(newDistance));
  }

  camera.updateProjectionMatrix();
  invalidate();
}

/**
 * Resets the camera to a standard position and orientation based on geometry dimensions
 * Adjusts for FOV to maintain consistent framing regardless of perspective setting
 */
export function resetCamera({
  camera,
  geometryRadius,
  rotation,
  perspective,
  setSceneRadius,
  invalidate,
  enableConfiguredAngles,
  cameraFovAngle,
}: {
  camera: THREE.Camera;
  geometryRadius: number;
  rotation: { side: number; vertical: number };
  perspective: {
    offsetRatio: number;
    zoomLevel: number;
    nearPlane: number;
    minimumFarPlane: number;
    farPlaneRadiusMultiplier: number;
  };
  setSceneRadius: (radius: number) => void;
  invalidate: () => void;
  enableConfiguredAngles?: boolean;
  cameraFovAngle: number;
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
  let effectiveFovForAdjustment = calculatedFov;
  if (useConfiguredAngles) {
    effectiveFovForAdjustment =
      THREE.MathUtils.RAD2DEG *
      2 *
      Math.atan(Math.tan((THREE.MathUtils.DEG2RAD * calculatedFov) / 2) / perspective.zoomLevel);
  }

  const standardFov = 60;
  const fovAdjustmentFactor =
    Math.tan(THREE.MathUtils.degToRad(standardFov / 2)) /
    Math.tan(THREE.MathUtils.degToRad(effectiveFovForAdjustment / 2));

  const adjustedOffsetRatio = perspective.offsetRatio * fovAdjustmentFactor;
  const newDistance = adjustedGeometryRadius * adjustedOffsetRatio;

  if (useConfiguredAngles) {
    // Use configured rotation angles (side and vertical) for positioning
    const position = calculatePositionFromSphericalCoordinates({
      distance: newDistance,
      horizontalAngle: rotation.side,
      verticalAngle: rotation.vertical,
    });
    camera.position.copy(position);
  } else if (camera.position.lengthSq() >= 1e-9) {
    // Maintain current viewing direction if not at origin, only adjust distance
    const currentDirection = camera.position.clone().normalize();
    camera.position.copy(currentDirection.multiplyScalar(newDistance));
  } else {
    // Fallback for non-configured angle mode: If at origin or too close, use configured angles to set an initial safe direction.
    const position = calculatePositionFromSphericalCoordinates({
      distance: newDistance,
      horizontalAngle: rotation.side,
      verticalAngle: rotation.vertical,
    });
    camera.position.copy(position);
  }

  camera.zoom = perspective.zoomLevel;
  camera.near = perspective.nearPlane;
  camera.far = Math.max(perspective.minimumFarPlane, adjustedGeometryRadius * perspective.farPlaneRadiusMultiplier);

  // Aim the camera at the center of the scene
  camera.lookAt(0, 0, 0);

  // Update the scene radius
  setSceneRadius(geometryRadius);

  camera.updateProjectionMatrix();
  invalidate();
}
