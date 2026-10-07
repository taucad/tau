// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshMatcapMaterial, MeshStandardMaterial, Plane } from 'three';
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import {
  applyGltfSurfaceDepthBias,
  applyGltfSurfaceDepthBiasToScene,
  refreshGltfSurfaceDepthBias,
} from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import { createSectionClip, installSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';

type ShaderProbe = {
  fragmentShader: string;
};

const compile = (material: MeshStandardMaterial, fragmentShader = '#include <logdepthbuf_fragment>'): ShaderProbe => {
  const shader = { fragmentShader };
  material.onBeforeCompile(shader as unknown as WebGLProgramParametersWithUniforms, {} as unknown as WebGLRenderer);
  return shader;
};

describe('GLTF surface depth bias', () => {
  it.each(['webgl', 'webgpu'] as const)(
    'should refresh final appearance without dirtying repeated states on %s',
    (backend) => {
      const material = new MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: 7, polygonOffsetUnits: 9 });
      const snapshot = getOrCaptureModelMaterialAppearance(material);
      applyGltfSurfaceDepthBias(material, backend);
      const clip = createSectionClip(backend);
      installSectionClip(material, clip);
      const hook = material.onBeforeCompile;
      const key = material.customProgramCacheKey;
      const mask = (material as Material & { maskNode?: unknown }).maskNode;
      const opaqueVersion = material.version;
      applyModelMaterialAppearance(material, snapshot, 1);
      expect(material.version).toBe(opaqueVersion);
      applyModelMaterialAppearance(material, snapshot, 0.25);
      expect(material.polygonOffsetFactor).toBe(7);
      expect(material.polygonOffsetUnits).toBe(9);
      expect(material.customProgramCacheKey()).not.toContain('tau-gltf-surface-depth-bias');
      const dimVersion = material.version;
      applyModelMaterialAppearance(material, snapshot, 0.5);
      applyModelMaterialAppearance(material, snapshot, 0.5);
      expect(material.version).toBe(dimVersion);
      applyModelMaterialAppearance(material, snapshot, 1);
      expect(material.polygonOffsetFactor).toBe(backend === 'webgl' ? 1.5 : -1.5);
      expect(material.onBeforeCompile).toBe(hook);
      expect(material.customProgramCacheKey).toBe(key);
      expect((material as Material & { maskNode?: unknown }).maskNode).toBe(mask);
      if (backend === 'webgl') {
        expect(material.customProgramCacheKey()).toContain('|tau-section-clip-v1');
        expect(material.customProgramCacheKey().match(/tau-gltf-surface-depth-bias/g)).toHaveLength(1);
      }
    },
  );

  it('should remember an inactive backend without installing hooks and leave unconfigured materials untouched', () => {
    const material = new MeshStandardMaterial({ transparent: true, opacity: 0.25, depthWrite: false });
    const hook = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    const { version } = material;
    refreshGltfSurfaceDepthBias(material);
    applyGltfSurfaceDepthBias(material, 'webgl');
    applyGltfSurfaceDepthBias(material, 'webgpu');
    expect(material.onBeforeCompile).toBe(hook);
    expect(material.customProgramCacheKey).toBe(key);
    expect(material.version).toBe(version);
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
    refreshGltfSurfaceDepthBias(material);
    expect(material.polygonOffsetFactor).toBe(-1.5);
    expect(material.customProgramCacheKey()).not.toContain('tau-gltf-surface-depth-bias');
  });
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

  it('also separates orthographic surfaces when the renderer writes fragment depth', () => {
    const material = new MeshStandardMaterial();
    applyGltfSurfaceDepthBias(material, 'webgl');

    // Three's log-depth chunk writes gl_FragCoord.z for orthographic cameras too,
    // so rasterizer polygon offset cannot provide their coplanar separation.
    expect(compile(material).fragmentShader).not.toContain('if (vIsPerspective == 1.0)');
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
      expect(() => compile(material, fragmentShader)).toThrow(
        'GLTF surface depth bias requires exactly one <logdepthbuf_fragment> chunk',
      );
    },
  );

  it('turns the bias off when component appearance becomes transparent, and back on when it is opaque again', () => {
    const material = new MeshStandardMaterial();

    applyGltfSurfaceDepthBias(material, 'webgl');
    material.transparent = true;
    material.depthWrite = false;
    material.opacity = 0.5;
    applyGltfSurfaceDepthBias(material, 'webgl');

    expect(material.polygonOffset).toBe(false);
    expect(compile(material).fragmentShader).not.toContain('tauSurfaceDepthOffset');
    expect(material.customProgramCacheKey()).not.toContain('tau-gltf-surface-depth-bias');

    material.transparent = false;
    material.depthWrite = true;
    material.opacity = 1;
    applyGltfSurfaceDepthBias(material, 'webgl');

    expect(material.polygonOffset).toBe(true);
    expect(compile(material).fragmentShader.match(/float tauSurfaceDepthOffset/g)).toHaveLength(1);
    expect(material.customProgramCacheKey()).toContain('tau-gltf-surface-depth-bias');
  });

  it('keeps a hook composed after it when the bias turns off', () => {
    const material = new MeshStandardMaterial();
    applyGltfSurfaceDepthBias(material, 'webgl');
    const biasHook = material.onBeforeCompile;
    const laterHook = vi.fn();
    material.onBeforeCompile = (shader, renderer): void => {
      biasHook.call(material, shader, renderer);
      laterHook();
    };
    material.transparent = true;
    material.opacity = 0.5;

    applyGltfSurfaceDepthBias(material, 'webgl');
    compile(material);

    expect(laterHook).toHaveBeenCalledOnce();
  });

  it('never biases an overlay, so nothing drawn over a surface can tie its depth', () => {
    // Only opaque depth writers are separated. An overlay that copied the surface's bias would
    // pass the depth test on an exact `LEQUAL` tie, and a derivative-based `gl_FragDepth` is not
    // reproducible between two draws of the same geometry — it speckles.
    for (const overlay of [
      new MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }),
      new MeshBasicMaterial({ depthWrite: false }),
    ]) {
      const priorHook = overlay.onBeforeCompile;
      applyGltfSurfaceDepthBias(overlay, 'webgl');
      applyGltfSurfaceDepthBias(overlay, 'webgpu');
      expect(overlay.polygonOffset).toBe(false);
      expect(overlay.onBeforeCompile).toBe(priorHook);
    }
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
