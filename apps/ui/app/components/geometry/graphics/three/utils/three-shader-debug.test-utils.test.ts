// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Scene } from 'three';
import {
  getGeneratedShaderSource,
  supportedThreeShaderDebugRevision,
} from '#components/geometry/graphics/three/utils/three-shader-debug.test-utils.js';

describe('Three generated shader debug adapter', () => {
  it('is pinned to r184 and forwards the public debug call exactly', async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const object = new Mesh();
    const getShaderAsync = vi.fn(async () => ({ vertexShader: 'vertex', fragmentShader: 'fragment' }));

    await expect(
      getGeneratedShaderSource({ scene, camera, object, renderer: { debug: { getShaderAsync } } }),
    ).resolves.toEqual({
      vertexShader: 'vertex',
      fragmentShader: 'fragment',
    });
    expect(supportedThreeShaderDebugRevision).toBe('184');
    expect(getShaderAsync).toHaveBeenCalledWith(scene, camera, object);
  });
});
