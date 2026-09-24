import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3, WebGPUCoordinateSystem } from 'three';
import { createGtaoCameraAdapter } from '#components/geometry/graphics/three/gtao-depth-camera.js';

const cameras = [
  {
    name: 'perspective',
    make: (reversed: boolean) => {
      const camera = new PerspectiveCamera(45, 1.6, 0.1, 1000);
      camera.projectionMatrix.makePerspective(-0.08, 0.12, 0.07, -0.05, 0.1, 1000, WebGPUCoordinateSystem, reversed);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      return camera;
    },
  },
  {
    name: 'orthographic',
    make: (reversed: boolean) => {
      const camera = new OrthographicCamera(-3, 7, 5, -2, 0.1, 1000);
      camera.projectionMatrix.makeOrthographic(-3, 7, 5, -2, 0.1, 1000, WebGPUCoordinateSystem, reversed);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      return camera;
    },
  },
];

describe('GTAO depth convention adapter', () => {
  it.each(cameras)('reconstructs $name positions from forward samples of reversed depth', ({ make }) => {
    const source = make(true);
    const forward = make(false);
    const adapter = createGtaoCameraAdapter(source, true);
    for (const z of [-0.1, -1, -10, -1000]) {
      const point = new Vector3(0.02, -0.01, z);
      const reversed = point.clone().applyMatrix4(source.projectionMatrix);
      const expected = point.clone().applyMatrix4(forward.projectionMatrix);
      expect(1 - reversed.z).toBeCloseTo(expected.z, 12);
      const sampled = new Vector3(reversed.x, reversed.y, 1 - reversed.z);
      const reconstructed = sampled.applyMatrix4(adapter.camera.projectionMatrixInverse);
      expect(reconstructed.distanceTo(point)).toBeLessThan(1e-6);
    }
    for (const [index, value] of forward.projectionMatrix.elements.entries()) {
      expect(adapter.camera.projectionMatrix.elements[index]).toBeCloseTo(value, 12);
    }
  });

  it.each(cameras)('retains forward $name depth and updates matrices without replacing uniforms', ({ make }) => {
    const source = make(false);
    const adapter = createGtaoCameraAdapter(source, false);
    const projection = adapter.camera.projectionMatrix;
    const inverse = adapter.camera.projectionMatrixInverse;
    expect(projection.equals(source.projectionMatrix)).toBe(true);
    source.near = 0.5;
    source.far = 25;
    source.coordinateSystem = WebGPUCoordinateSystem;
    source.updateProjectionMatrix();
    adapter.update();
    expect(adapter.camera.projectionMatrix).toBe(projection);
    expect(adapter.camera.projectionMatrixInverse).toBe(inverse);
    expect(projection.equals(source.projectionMatrix)).toBe(true);
    expect(inverse.equals(source.projectionMatrixInverse)).toBe(true);
    expect(adapter.camera.near).toBe(0.5);
    expect(adapter.camera.far).toBe(25);
  });
});
