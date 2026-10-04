import * as THREE from 'three';

const eyeDirection = new THREE.Vector3();
const eyeProjected = new THREE.Vector3();
const upProjected = new THREE.Vector3();
const crossProduct = new THREE.Vector3();

/**
 * Rotates a label around its arrow axis toward the camera and returns the
 * projected length of that axis (0 is edge-on, 1 is fully visible).
 * The caller owns the target quaternion so camera frames do not allocate.
 *
 * @param root0 - Camera-facing rotation inputs.
 * @param root0.axis - Normalized arrow axis in world space.
 * @param root0.position - Label position in world space.
 * @param root0.camera - Active viewer camera.
 * @param root0.referenceUp - Label normal before the axis rotation.
 * @param root0.target - Reusable output quaternion.
 * @returns Projected arrow-axis length as a fraction of its full length.
 */
export function computeAxisRotationForCamera({
  axis,
  position,
  camera,
  referenceUp,
  target,
}: {
  axis: THREE.Vector3;
  position: THREE.Vector3;
  camera: THREE.Camera;
  referenceUp: THREE.Vector3;
  target: THREE.Quaternion;
}): number {
  target.identity();
  if (axis.lengthSq() < 1e-12) {
    return 0;
  }

  if (camera instanceof THREE.OrthographicCamera) {
    camera.getWorldDirection(eyeDirection).negate();
  } else {
    camera.getWorldPosition(eyeDirection).sub(position);
  }
  if (eyeDirection.lengthSq() < 1e-12) {
    return 0;
  }
  eyeDirection.normalize();

  // An arrow pointed toward the eye has no readable screen-space length.
  eyeProjected.copy(eyeDirection).addScaledVector(axis, -eyeDirection.dot(axis));
  const projectedAxisLength = eyeProjected.length();
  if (projectedAxisLength < 1e-6) {
    return projectedAxisLength;
  }
  eyeProjected.multiplyScalar(1 / projectedAxisLength);

  upProjected.copy(referenceUp).addScaledVector(axis, -referenceUp.dot(axis));
  if (upProjected.lengthSq() < 1e-12) {
    // The caller's reference can coincide with the axis at a reversal.
    upProjected.set(Math.abs(axis.x) < 0.9 ? 1 : 0, Math.abs(axis.x) < 0.9 ? 0 : 1, 0);
    upProjected.addScaledVector(axis, -upProjected.dot(axis));
  }
  upProjected.normalize();

  const rotationAngle = Math.atan2(
    crossProduct.crossVectors(upProjected, eyeProjected).dot(axis),
    upProjected.dot(eyeProjected),
  );
  target.setFromAxisAngle(axis, rotationAngle);
  return projectedAxisLength;
}
