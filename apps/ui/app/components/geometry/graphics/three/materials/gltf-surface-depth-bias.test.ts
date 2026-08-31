// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshMatcapMaterial, MeshStandardMaterial, Plane } from 'three';
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import {
  applyGltfSurfaceDepthBias,
  applyGltfSurfaceDepthBiasToScene,
} from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';

type ShaderProbe = {
  fragmentShader: string;
};

const compile = (
  material: MeshStandardMaterial,
  fragmentShader: string = '#include <logdepthbuf_fragment>',
): ShaderProbe => {
  const shader = { fragmentShader };
  material.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, {} as unknown as WebGLRenderer);
  return shader;
};

describe('GLTF surface depth bias', () => {
  it('pushes opaque WebGL triangles locally in logarithmic depth', () => {
    const material = new MeshStandardMaterial();

    applyGltfSurfaceDepthBias(material, 'webgl');
    const shader = compile(material);

    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(1.5);
    expect(material.polygonOffsetUnits).toBe(2);
    expect(shader.fragmentShader).toContain('tauSurfaceDepthSlope');
    expect(shader.fragmentShader).toContain('gl_FragDepth + tauSurfaceDepthOffset');
  });

  it('uses reversed-depth signs for opaque WebGPU triangles', () => {
    const material = new MeshStandardMaterial();

    applyGltfSurfaceDepthBias(material, 'webgpu');

    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(-1.5);
    expect(material.polygonOffsetUnits).toBe(-2);
  });

  it('reconfigures an existing surface when the renderer backend changes', () => {
    const material = new MeshStandardMaterial();

    applyGltfSurfaceDepthBias(material, 'webgl');
    applyGltfSurfaceDepthBias(material, 'webgpu');

    expect(material.polygonOffsetFactor).toBe(-1.5);
    expect(material.polygonOffsetUnits).toBe(-2);
    expect(material.customProgramCacheKey()).not.toContain('tau-gltf-surface-depth-bias');
  });

  it('composes with existing shader hooks and preserves clipping planes', () => {
    const material = new MeshStandardMaterial();
    const clippingPlane = new Plane();
    const priorHook = vi.fn((shader: ShaderProbe) => {
      shader.fragmentShader = `prior\n${shader.fragmentShader}`;
    });
    material.clippingPlanes = [clippingPlane];
    material.onBeforeCompile = priorHook as unknown as Material['onBeforeCompile'];

    applyGltfSurfaceDepthBias(material, 'webgl');
    const shader = compile(material);

    expect(priorHook).toHaveBeenCalledOnce();
    expect(shader.fragmentShader).toContain('prior');
    expect(material.clippingPlanes).toEqual([clippingPlane]);
  });

  it.each(['void main() {}', '#include <logdepthbuf_fragment>\n#include <logdepthbuf_fragment>'])(
    'fails compilation when the expected log-depth chunk is absent or duplicated',
    (fragmentShader) => {
      const material = new MeshStandardMaterial();
      applyGltfSurfaceDepthBias(material, 'webgl');
      expect(() => compile(material, fragmentShader)).toThrowError(
        'GLTF surface depth bias requires exactly one <logdepthbuf_fragment> chunk',
      );
    },
  );

  it('restores the original state when component appearance becomes transparent', () => {
    const material = new MeshStandardMaterial();
    const priorHook = material.onBeforeCompile;

    applyGltfSurfaceDepthBias(material, 'webgl');
    material.transparent = true;
    material.depthWrite = false;
    material.opacity = 0.5;
    applyGltfSurfaceDepthBias(material, 'webgl');

    expect(material.polygonOffset).toBe(false);
    expect(material.onBeforeCompile).toBe(priorHook);
    expect(material.customProgramCacheKey()).not.toContain('tau-gltf-surface-depth-bias');
  });

  it('configures loaded and matcap surface materials without changing clipping', () => {
    const scene = new Group();
    const clippingPlanes = [new Plane(), new Plane()];
    const loadedMaterial = new MeshStandardMaterial({ clippingPlanes });
    const matcapMaterial = new MeshMatcapMaterial({ clippingPlanes });
    const transparentMaterial = new MeshStandardMaterial({ opacity: 0.5, transparent: true, depthWrite: false });
    scene.add(
      new Mesh(new BoxGeometry(), [loadedMaterial, matcapMaterial]),
      new Mesh(new BoxGeometry(), transparentMaterial),
    );

    applyGltfSurfaceDepthBiasToScene(scene, 'webgl');

    expect(loadedMaterial.polygonOffset).toBe(true);
    expect(matcapMaterial.polygonOffset).toBe(true);
    expect(transparentMaterial.polygonOffset).toBe(false);
    expect(loadedMaterial.clippingPlanes).toEqual(clippingPlanes);
    expect(matcapMaterial.clippingPlanes).toEqual(clippingPlanes);
  });
});
