import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { setRaycasterFromCamera } from '#components/geometry/graphics/three/utils/raycaster-from-camera.js';

/** An orthographic camera at z 6 looking down −z, as the section plane picker builds its own. */
function orthographicCamera(depth: 'webgl' | 'webgpu-reversed'): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 20);
  if (depth === 'webgpu-reversed') {
    // What the WebGPU renderer (`reversedDepthBuffer: true`) leaves on a camera it draws with.
    camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
    Object.assign(camera, { _reversedDepth: true });
  }
  camera.position.set(0, 0, 6);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Distance to the nearest face of a unit box at the origin, or `undefined` when the ray misses it. */
function firstHitDistance(raycaster: THREE.Raycaster): number | undefined {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  box.updateMatrixWorld();
  return raycaster.intersectObject(box)[0]?.distance;
}

const center = new THREE.Vector2(0, 0);

describe('setRaycasterFromCamera', () => {
  it("should reproduce three's orthographic miss under WebGPU reversed depth", () => {
    const raycaster = new THREE.Raycaster();

    raycaster.setFromCamera(center, orthographicCamera('webgl'));
    expect(firstHitDistance(raycaster)).toBeCloseTo(5.5);

    raycaster.setFromCamera(center, orthographicCamera('webgpu-reversed'));
    expect(firstHitDistance(raycaster)).toBeUndefined();
  });

  it('should hit a box in front of an orthographic camera under WebGPU reversed depth', () => {
    const raycaster = new THREE.Raycaster();

    setRaycasterFromCamera(raycaster, center, orthographicCamera('webgpu-reversed'));

    expect(raycaster.ray.origin.z).toBeCloseTo(6);
    expect(firstHitDistance(raycaster)).toBeCloseTo(5.5);
  });

  it("should leave three's ray unchanged under WebGL depth and for perspective cameras", () => {
    const pointer = new THREE.Vector2(0.4, -0.3);
    const perspective = new THREE.PerspectiveCamera(50, 1, 0.1, 20);
    perspective.position.set(1, 2, 6);
    perspective.lookAt(0, 0, 0);
    perspective.updateMatrixWorld();

    for (const camera of [orthographicCamera('webgl'), perspective]) {
      const expected = new THREE.Raycaster();
      expected.setFromCamera(pointer, camera);
      const actual = new THREE.Raycaster();

      setRaycasterFromCamera(actual, pointer, camera);

      expect(actual.ray.origin.distanceTo(expected.ray.origin)).toBeCloseTo(0);
      expect(actual.ray.direction.distanceTo(expected.ray.direction)).toBeCloseTo(0);
    }
  });

  it('should keep the pointer offset on the camera plane of a turned orthographic camera', () => {
    const camera = orthographicCamera('webgpu-reversed');
    camera.position.set(6, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();

    setRaycasterFromCamera(raycaster, new THREE.Vector2(0.4, 0.4), camera);

    expect(raycaster.ray.origin.x).toBeCloseTo(6);
    expect(raycaster.ray.origin.y).toBeCloseTo(0.42);
    expect(raycaster.ray.origin.z).toBeCloseTo(-0.42);
    expect(firstHitDistance(raycaster)).toBeCloseTo(5.5);
  });
});
