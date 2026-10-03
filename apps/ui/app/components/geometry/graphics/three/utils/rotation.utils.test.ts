import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeAxisRotationForCamera } from '#components/geometry/graphics/three/utils/rotation.utils.js';

const axis = new THREE.Vector3(1, 0, 0);
const referenceUp = new THREE.Vector3(0, 0, 1);

function rotate(
  camera: THREE.Camera,
  position = new THREE.Vector3(),
): { projectedLength: number; normal: THREE.Vector3 } {
  const target = new THREE.Quaternion();
  const projectedLength = computeAxisRotationForCamera({ axis, position, camera, referenceUp, target });
  return { projectedLength, normal: referenceUp.clone().applyQuaternion(target) };
}

describe('computeAxisRotationForCamera', () => {
  it('should face a perspective camera from an off-centre label', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 10);
    camera.updateMatrixWorld();

    const { projectedLength, normal } = rotate(camera, new THREE.Vector3(0, 0, 2));
    const eye = camera.position
      .clone()
      .sub(new THREE.Vector3(0, 0, 2))
      .normalize();
    expect(projectedLength).toBeCloseTo(1);
    expect(normal.dot(eye)).toBeCloseTo(1);
  });

  it('should use parallel orthographic rays regardless of label position', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const near = rotate(camera);
    const farOffCentre = rotate(camera, new THREE.Vector3(500, 0, 0));
    const eye = camera.getWorldDirection(new THREE.Vector3()).negate();
    const projectedEye = eye.addScaledVector(axis, -eye.dot(axis)).normalize();
    expect(near.projectedLength).toBeCloseTo(farOffCentre.projectedLength);
    expect(near.normal.dot(projectedEye)).toBeCloseTo(1);
    expect(farOffCentre.normal.dot(projectedEye)).toBeCloseTo(1);
  });

  it('should reverse toward the opposite side without losing the arrow axis', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, -10);
    camera.updateMatrixWorld();

    const { projectedLength, normal } = rotate(camera);
    expect(projectedLength).toBeCloseTo(1);
    expect(normal.dot(new THREE.Vector3(0, 0, -1))).toBeCloseTo(1);
    expect(normal.dot(axis)).toBeCloseTo(0);
  });

  it('should return a finite identity rotation for singular axes and viewing directions', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 0, 0);
    camera.updateMatrixWorld();
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);

    expect(computeAxisRotationForCamera({ axis, position: new THREE.Vector3(), camera, referenceUp, target })).toBe(0);
    expect(target.equals(new THREE.Quaternion())).toBe(true);
    expect(
      computeAxisRotationForCamera({
        axis: new THREE.Vector3(),
        position: new THREE.Vector3(),
        camera,
        referenceUp,
        target,
      }),
    ).toBe(0);
    expect(target.equals(new THREE.Quaternion())).toBe(true);
  });
});
