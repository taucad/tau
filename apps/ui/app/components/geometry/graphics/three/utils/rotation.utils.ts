import * as THREE from 'three';

/**
 * Computes a quaternion that rotates an object around a given axis to face the camera.
 * This creates a billboard effect constrained to rotation around a single axis.
 *
 * @param axis - The axis to rotate around (should be normalized)
 * @param position - The position of the object in world space
 * @param camera - The camera to face towards
 * @param referenceUp - Optional reference "up" vector perpendicular to the axis (default: best perpendicular to axis)
 * @returns Quaternion representing the rotation around the axis
 */
export function computeAxisRotationForCamera(
  axis: THREE.Vector3,
  position: THREE.Vector3,
  camera: THREE.Camera,
  referenceUp?: THREE.Vector3,
): THREE.Quaternion {
  // Calculate direction from object to camera
  const eyeDirection = new THREE.Vector3();
  eyeDirection.subVectors(camera.position, position).normalize();

  // Project the camera direction onto the plane perpendicular to the axis
  // This gives us the direction towards the camera, constrained to rotation around the axis
  const eyeProjected = new THREE.Vector3()
    .copy(eyeDirection)
    .addScaledVector(axis, -eyeDirection.dot(axis))
    .normalize();

  // Get a reference "up" vector perpendicular to the axis
  // If not provided, choose the best perpendicular vector
  let upVector: THREE.Vector3;
  if (referenceUp) {
    upVector = referenceUp.clone();
  } else {
    // Choose a reference vector that's not parallel to the axis
    const absX = Math.abs(axis.x);
    const absY = Math.abs(axis.y);
    const absZ = Math.abs(axis.z);

    if (absX < absY && absX < absZ) {
      upVector = new THREE.Vector3(1, 0, 0);
    } else if (absY < absZ) {
      upVector = new THREE.Vector3(0, 1, 0);
    } else {
      upVector = new THREE.Vector3(0, 0, 1);
    }
  }

  // Project the reference up vector onto the same plane perpendicular to the axis
  const upProjected = new THREE.Vector3().copy(upVector).addScaledVector(axis, -upVector.dot(axis)).normalize();

  // Calculate the signed angle between the projected vectors
  const cosAngle = upProjected.dot(eyeProjected);
  const crossProduct = new THREE.Vector3().crossVectors(upProjected, eyeProjected);
  const sinAngle = crossProduct.dot(axis);
  const rotationAngle = Math.atan2(sinAngle, cosAngle);

  // Create quaternion from axis-angle
  const quaternion = new THREE.Quaternion();
  quaternion.setFromAxisAngle(axis, rotationAngle);

  return quaternion;
}
