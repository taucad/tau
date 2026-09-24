import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3, WebGLCoordinateSystem, WebGPUCoordinateSystem } from 'three';

const hoisted = vi.hoisted(() => ({
  createRenderer: vi.fn(),
}));

vi.mock('#components/geometry/graphics/three/renderer.js', () => ({
  createRenderer: hoisted.createRenderer,
}));

describe('createTauR3fGlProp', () => {
  beforeEach(() => {
    hoisted.createRenderer.mockReset();
    hoisted.createRenderer.mockImplementation(async () => ({
      init: vi.fn(async () => {
        //
      }),
    }));
  });

  it('delegates WebGPU canvases to createRenderer viewport presets', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const glFactory = createTauR3fGlProp('webgpu');

    expect(glFactory).toBeTypeOf('function');

    const canvas = document.createElement('canvas');
    await (glFactory as (defaults: Record<string, unknown>) => Promise<unknown>)({
      canvas,
      alpha: true,
    });

    expect(hoisted.createRenderer).toHaveBeenCalledTimes(1);
    expect(hoisted.createRenderer).toHaveBeenCalledWith('viewport', 'webgpu', canvas);
  });

  it('delegates WebGL canvases to createRenderer viewport presets', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const glFactory = createTauR3fGlProp('webgl');

    expect(glFactory).toBeTypeOf('function');

    const canvas = document.createElement('canvas');
    await (glFactory as (defaults: Record<string, unknown>) => Promise<unknown>)({
      canvas,
      alpha: true,
    });

    expect(hoisted.createRenderer).toHaveBeenCalledTimes(1);
    expect(hoisted.createRenderer).toHaveBeenCalledWith('viewport', 'webgl', canvas);
  });

  it('should restore both retained cameras to forward depth before a WebGL canvas starts', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const cameras = [new PerspectiveCamera(35, 1.6, 0.1, 1000), new OrthographicCamera(-3, 7, 5, -2, 0.1, 1000)];
    const originalProjections = cameras.map((camera) => camera.projectionMatrix.clone());
    for (const camera of cameras) {
      // Three r184's WebGPU renderer mutates this internal flag; reversedDepth has no setter.
      Object.assign(camera, { coordinateSystem: WebGPUCoordinateSystem, _reversedDepth: true });
      camera.updateProjectionMatrix();
      expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1, 12);
      expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(0, 12);
    }
    hoisted.createRenderer.mockResolvedValue({ coordinateSystem: WebGLCoordinateSystem });
    const glFactory = createTauR3fGlProp('webgl', cameras);
    if (typeof glFactory !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }
    await glFactory({ canvas: document.createElement('canvas') });

    for (const [index, camera] of cameras.entries()) {
      expect(camera.coordinateSystem).toBe(WebGLCoordinateSystem);
      expect(camera.reversedDepth).toBe(false);
      expect(camera.projectionMatrix.equals(originalProjections[index]!)).toBe(true);
      expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(-1, 12);
      expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1, 12);
    }
  });

  it('should configure both native camera projections before the first WebGPU scene pass', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const cameras = [new PerspectiveCamera(35, 1.6, 0.1, 1000), new OrthographicCamera(-3, 7, 5, -2, 0.1, 1000)];
    hoisted.createRenderer.mockResolvedValue({ coordinateSystem: WebGPUCoordinateSystem, reversedDepthBuffer: true });
    const glFactory = createTauR3fGlProp('webgpu', cameras);
    if (typeof glFactory !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }
    await glFactory({ canvas: document.createElement('canvas') });

    for (const camera of cameras) {
      expect(camera.coordinateSystem).toBe(WebGPUCoordinateSystem);
      expect(camera.reversedDepth).toBe(true);
      expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1, 12);
      expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(0, 12);
    }
  });
});
