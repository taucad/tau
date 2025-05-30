import * as THREE from 'three';

/**
 * Resets the camera to a standard position and orientation based on shape dimensions
 * Adjusts for FOV to maintain consistent framing regardless of perspective setting
 */
export function resetCamera({
  camera,
  shapeRadius,
  rotation,
  perspective,
  setSceneRadius,
  invalidate,
  withConfiguredAngles,
}: {
  camera: THREE.Camera;
  shapeRadius: number;
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
  withConfiguredAngles?: boolean;
}): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    console.error('resetCamera requires PerspectiveCamera');
    return;
  }

  // If the shape radius is less than or requal to 0, we didn't get an object to render.
  // Leaving it at 0 or less results in undefined camera behavior, so we set it to 1000.
  const adjustedShapeRadius = shapeRadius <= 0 ? 1000 : shapeRadius;

  const useConfiguredAngles = withConfiguredAngles ?? true;

  // Calculate the effective FOV that will be active after this reset, due to perspective.zoomLevel
  // camera.fov is the FOV when zoom = 1.
  let effectiveFovForAdjustment = camera.fov;
  if (useConfiguredAngles) {
    effectiveFovForAdjustment =
      THREE.MathUtils.RAD2DEG *
      2 *
      Math.atan(Math.tan((THREE.MathUtils.DEG2RAD * camera.fov) / 2) / perspective.zoomLevel);
  }

  const standardFov = 60;
  const fovAdjustmentFactor =
    Math.tan(THREE.MathUtils.degToRad(standardFov / 2)) /
    Math.tan(THREE.MathUtils.degToRad(effectiveFovForAdjustment / 2));

  const adjustedOffsetRatio = perspective.offsetRatio * fovAdjustmentFactor;
  const newDistance = adjustedShapeRadius * adjustedOffsetRatio;

  if (useConfiguredAngles) {
    // Use configured rotation angles (side and vertical) for positioning
    const r = newDistance;
    const phi = rotation.side;
    const theta = rotation.vertical;
    const cosTheta = Math.cos(theta);
    const x = r * cosTheta * Math.cos(phi);
    const y = r * cosTheta * Math.sin(phi);
    const z = r * Math.sin(theta);
    camera.position.set(x, y, z);
  } else if (camera.position.lengthSq() >= 1e-9) {
    // Maintain current viewing direction if not at origin, only adjust distance
    const currentDirection = camera.position.clone().normalize();
    camera.position.copy(currentDirection.multiplyScalar(newDistance));
  } else {
    // Fallback for non-configured angle mode: If at origin or too close, use configured angles to set an initial safe direction.
    const r = newDistance;
    const phi = rotation.side;
    const theta = rotation.vertical;
    const cosTheta = Math.cos(theta);
    const x = r * cosTheta * Math.cos(phi);
    const y = r * cosTheta * Math.sin(phi);
    const z = r * Math.sin(theta);
    camera.position.set(x, y, z);
  }

  camera.zoom = perspective.zoomLevel;
  camera.near = perspective.nearPlane;
  camera.far = Math.max(perspective.minimumFarPlane, adjustedShapeRadius * perspective.farPlaneRadiusMultiplier);

  // Aim the camera at the center of the scene
  camera.lookAt(0, 0, 0);

  // Update the scene radius
  setSceneRadius(shapeRadius);

  camera.updateProjectionMatrix();
  invalidate();
}
