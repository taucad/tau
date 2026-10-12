import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  MeshStandardMaterial,
  Scene,
  ShaderLib,
  Texture,
  TextureLoader,
} from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';
import { applyGltfSurfaceDepthBias } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import { createSectionClip, installSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function createTriangleGeometry({ vertexColors = false }: { readonly vertexColors?: boolean } = {}): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));

  if (vertexColors) {
    geometry.setAttribute('color', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3));
  }

  return geometry;
}

function getMatcapMaterial(mesh: Mesh): MeshMatcapMaterial {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof MeshMatcapMaterial)) {
    throw new Error('Expected mesh material to be a MeshMatcapMaterial');
  }

  return mesh.material;
}

describe('applyMatcap', () => {
  it.each(['webgl', 'webgpu'] as const)(
    'should restore authored opacity and selected bias after switching dimmed PBR to matcap on %s',
    async (backend) => {
      vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
      const source = new MeshStandardMaterial({ metalness: 0.65, roughness: 0.32 });
      const mesh: Mesh = new Mesh(createTriangleGeometry(), source);
      const scene = new Scene();
      scene.add(mesh);
      const sourceAppearance = getOrCaptureModelMaterialAppearance(source);
      applyModelMaterialAppearance(source, sourceAppearance, 0.25);
      await applyMatcap({ scene }, 1, backend);
      const replacement = mesh.material;
      if (Array.isArray(replacement)) {
        throw new TypeError('Expected one matcap replacement');
      }
      expect(replacement.opacity).toBe(0.25);
      applyGltfSurfaceDepthBias(replacement, backend);
      const replacementAppearance = getOrCaptureModelMaterialAppearance(replacement);
      applyModelMaterialAppearance(replacement, replacementAppearance, 1);
      expect(replacement.opacity).toBe(1);
      expect(replacement.transparent).toBe(false);
      expect(replacement.depthWrite).toBe(true);
      expect(replacement.polygonOffsetFactor).toBe(backend === 'webgl' ? 1.5 : -1.5);
    },
  );

  it('should seed mixed source alpha baselines without copying PBR color or changing reused snapshots', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const captured = new MeshStandardMaterial({ color: 0xaa_55_22 });
    const sourceAppearance = getOrCaptureModelMaterialAppearance(captured);
    applyModelMaterialAppearance(captured, sourceAppearance, 0.25);
    const authored = new MeshStandardMaterial({ opacity: 0.6, transparent: true, depthWrite: false });
    const mesh: Mesh = new Mesh(createTriangleGeometry(), [captured, authored]);
    const scene = new Scene();
    scene.add(mesh);
    await applyMatcap({ scene }, 0.5);
    const replacement = getMatcapMaterial(mesh);
    const snapshot = getOrCaptureModelMaterialAppearance(replacement);
    expect(replacement.opacity).toBe(0.25);
    expect(snapshot.opacity).toBe(0.6);
    expect(snapshot.transparent).toBe(true);
    expect(snapshot.depthWrite).toBe(false);
    expect(snapshot.color?.equals(replacement.color)).toBe(true);
    expect(snapshot.color?.equals(captured.color)).toBe(false);
    applyModelMaterialAppearance(replacement, snapshot, 1);
    expect(replacement.opacity).toBe(0.6);
    expect(replacement.transparent).toBe(true);
    await applyMatcap({ scene }, 0.5);
    expect(mesh.material).toBe(replacement);
    expect(getOrCaptureModelMaterialAppearance(replacement)).toBe(snapshot);
  });

  it('should reuse the material and restore the source color after repeated tint cycles', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const source = new MeshBasicMaterial({ color: 0xaa_55_22 });
    const mesh = new Mesh(createTriangleGeometry(), source);
    const scene = new Scene();
    scene.add(mesh);
    await applyMatcap({ scene }, 0.5);
    const { material } = mesh;
    await applyMatcap({ scene }, 1);
    expect(mesh.material).toBe(material);
    expect(getMatcapMaterial(mesh).color.equals(source.color)).toBe(true);
    await applyMatcap({ scene }, 0.5);
    await applyMatcap({ scene }, 1);
    expect(getMatcapMaterial(mesh).color.equals(source.color)).toBe(true);
  });

  it('should disable depth writes when replacing a translucent source material', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const sourceMaterial = new MeshBasicMaterial({ color: 0xaa_55_22, opacity: 0.4, transparent: true });
    const mesh = new Mesh(createTriangleGeometry(), sourceMaterial);
    const scene = new Scene();
    scene.add(mesh);

    await applyMatcap({ scene });

    const material = getMatcapMaterial(mesh);
    expect(material.color.getHex()).toBe(0xaa_55_22);
    expect(material.opacity).toBe(0.4);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('should preserve translucent render state for vertex-colored matcap replacements', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const sourceMaterial = new MeshBasicMaterial({ opacity: 0.35, transparent: true });
    const mesh = new Mesh(createTriangleGeometry({ vertexColors: true }), sourceMaterial);
    const scene = new Scene();
    scene.add(mesh);

    await applyMatcap({ scene });

    const material = getMatcapMaterial(mesh);
    expect(material.vertexColors).toBe(true);
    expect(material.opacity).toBe(0.35);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('should carry the section clip over to the WebGL matcap replacement', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const sourceMaterial = new MeshBasicMaterial();
    installSectionClip(sourceMaterial, createSectionClip('webgl'));
    const mesh = new Mesh(createTriangleGeometry(), sourceMaterial);
    const scene = new Scene();
    scene.add(mesh);

    await applyMatcap({ scene });

    const shader = {
      vertexShader: ShaderLib.matcap.vertexShader,
      fragmentShader: ShaderLib.matcap.fragmentShader,
      uniforms: {},
    } as unknown as WebGLProgramParametersWithUniforms;
    getMatcapMaterial(mesh).onBeforeCompile(shader, {} as unknown as WebGLRenderer);
    expect(shader.fragmentShader).toContain('tauSectionRemoved( vTauSectionWorld )');
  });

  it('should carry the section clip over to the WebGPU matcap replacement', async () => {
    vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(new Texture());
    const clip = createSectionClip('webgpu');
    const sourceMaterial = new MeshBasicMaterial();
    installSectionClip(sourceMaterial, clip);
    const mesh = new Mesh(createTriangleGeometry(), sourceMaterial);
    const scene = new Scene();
    scene.add(mesh);

    await applyMatcap({ scene }, 1, 'webgpu');

    expect((mesh.material as { maskNode?: unknown }).maskNode).toBe(clip.mask);
  });
});
