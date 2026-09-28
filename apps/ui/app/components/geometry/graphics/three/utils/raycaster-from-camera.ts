import { Vector3 } from 'three';
import type { Camera, Raycaster, Vector2 } from 'three';

const cameraPosition = new Vector3();
const offset = new Vector3();

/**
 * Sets `raycaster` from pointer NDC and `camera` in either depth convention.
 *
 * Three r184 places an orthographic ray's origin at NDC z `(near + far) / (near - far)`, which is the camera plane
 * only under WebGL's depth range. With WebGPU's coordinate system and reversed depth that origin lands beyond the
 * scene and the ray misses everything. This moves the origin back along the ray onto the plane through the camera,
 * which is a no-op under WebGL and for perspective cameras.
 *
 * @param raycaster - Raycaster to set.
 * @param coords - Pointer in normalized device coordinates.
 * @param camera - Camera whose world matrix and projection are current.
 */
export function setRaycasterFromCamera(raycaster: Raycaster, coords: Vector2, camera: Camera): void {
  raycaster.setFromCamera(coords, camera);
  const { origin, direction } = raycaster.ray;
  cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  const distanceFromCameraPlane = offset.subVectors(origin, cameraPosition).dot(direction);
  origin.addScaledVector(direction, -distanceFromCameraPlane);
}
