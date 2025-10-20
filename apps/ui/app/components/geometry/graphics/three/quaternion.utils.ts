import * as THREE from 'three';

// Calculate quaternion for arrow controls HTML to stay perpendicular to the clipping plane
export function calculateCameraQuaternion(
  normal: THREE.Vector3,
  camera: THREE.Camera,
  position: THREE.Vector3,
): THREE.Quaternion {
  // Get the direction from position to camera
  const toCamera = camera.position.clone().sub(position).normalize();

  // Project toCamera onto the plane (remove component along normal)
  const projectedToCamera = toCamera
    .clone()
    .sub(normal.clone().multiplyScalar(toCamera.dot(normal)))
    .normalize();

  // If the projected vector is too small, use a fallback
  if (projectedToCamera.lengthSq() < 0.01) {
    // Camera is looking directly along the normal, use any perpendicular vector
    const perpendicular = new THREE.Vector3();
    if (Math.abs(normal.x) < 0.9) {
      perpendicular.set(1, 0, 0);
    } else {
      perpendicular.set(0, 1, 0);
    }

    perpendicular.cross(normal).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), perpendicular);
  }

  // Create quaternion that orients +X axis along projectedToCamera and +Y along normal
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();

  // Right vector (along projectedToCamera)
  const right = projectedToCamera;
  // Up vector (along normal)
  const up = normal.clone();
  // Forward vector (perpendicular to both)
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();

  matrix.makeBasis(right, up, forward);
  quaternion.setFromRotationMatrix(matrix);

  return quaternion;
}
