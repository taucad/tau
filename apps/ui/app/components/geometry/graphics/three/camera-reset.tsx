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
  setCurrentZoom,
  setSceneRadius,
  invalidate,
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
  setCurrentZoom: (zoom: number) => void;
  setSceneRadius: (radius: number) => void;
  invalidate: () => void;
}): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    console.error('resetCamera requires PerspectiveCamera');
    return;
  }

  // Reset zoom tracking state using the appropriate configured zoom level
  setCurrentZoom(perspective.zoomLevel);

  // Get the FOV of the perspective camera
  const { fov } = camera;

  // Calculate a FOV-adjusted distance factor to maintain consistent framing
  // Standard FOV for 3D views is often around 50-60 degrees
  const standardFov = 60;
  const fovAdjustmentFactor =
    Math.tan(THREE.MathUtils.degToRad(standardFov / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));

  // Adjust the offsetRatio based on the FOV to maintain consistent visual size
  const adjustedOffsetRatio = perspective.offsetRatio * fovAdjustmentFactor;

  // Compute camera position using spherical coordinates
  const [x, y] = getPositionOnCircle(shapeRadius * adjustedOffsetRatio, rotation.side);
  const [, z] = getPositionOnCircle(shapeRadius * adjustedOffsetRatio, rotation.vertical);

  camera.position.set(x, y, z);
  camera.zoom = perspective.zoomLevel;
  camera.near = perspective.nearPlane;
  camera.far = Math.max(perspective.minimumFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);

  // Aim the camera at the center of the scene
  camera.lookAt(0, 0, 0);

  // Update the scene radius
  setSceneRadius(shapeRadius);

  camera.updateProjectionMatrix();
  invalidate();
}

/**
 * Get the position on the circumference of a circle given the radius and angle in radians.
 * @param radius - The radius of the circle.
 * @param angleInRadians - The angle in radians.
 * @returns The position on the circle.
 */
function getPositionOnCircle(radius: number, angleInRadians: number): [number, number] {
  return [radius * Math.cos(angleInRadians), radius * Math.sin(angleInRadians)];
}
