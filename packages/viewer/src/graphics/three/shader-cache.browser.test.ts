import { expect, it, vi } from 'vitest';
import { AmbientLight, BoxGeometry, Mesh, PerspectiveCamera, RenderTarget, Scene } from 'three';
import { MeshStandardNodeMaterial, WebGPUBackend } from 'three/webgpu';
import { createRenderer } from '#graphics/three/renderer.js';
import { createSectionClip, installSectionClip, writeSectionClip } from '#graphics/three/materials/section-clip.js';

it.each(['webgpu', 'webgl'] as const)(
  'should reuse section shader source across independent owners on node %s',
  async (backend) => {
    const renderer = await createRenderer('showcase', backend, document.createElement('canvas'));
    const geometry = new BoxGeometry();
    const scene = new Scene();
    scene.add(new AmbientLight(0xff_ff_ff, 2));
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.z = 3;
    camera.updateMatrixWorld();
    const target = new RenderTarget(256, 256);
    renderer.setSize(256, 256);
    renderer.setRenderTarget(target);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const validation: string[] = [];
    const { device } = renderer.backend as WebGPUBackend & { device?: EventTarget };
    const uncaptured = (event: Event): void => {
      validation.push((event as Event & { error: { message: string } }).error.message);
    };
    device?.addEventListener('uncapturederror', uncaptured);
    const pixels: Array<Uint8Array<ArrayBuffer>> = [];
    const meshes: Mesh[] = [];
    const materials: MeshStandardNodeMaterial[] = [];
    try {
      expect(renderer.backend instanceof WebGPUBackend).toBe(backend === 'webgpu');
      const sources: unknown[] = [];
      for (let index = 0; index < 2; index++) {
        const material = new MeshStandardNodeMaterial();
        materials.push(material);
        const clip = createSectionClip('webgpu');
        writeSectionClip(clip, [
          { cutId: 'test', faces: [], halfSpaces: [{ normal: [1, 0, 0], constant: index / 3 }] },
        ]);
        installSectionClip(material, clip);
        const mesh = new Mesh(geometry, material);
        meshes.push(mesh);
        scene.add(mesh);
        renderer.render(scene, camera);
        // Sequential compilation on an isolated test renderer, never a live viewer.
        // oxlint-disable-next-line no-await-in-loop -- Sequential owners exercise shader reuse on one renderer.
        sources.push(await renderer.debug.getShaderAsync(scene, camera, mesh));
        // oxlint-disable-next-line no-await-in-loop -- Sequential owners exercise shader reuse on one renderer.
        pixels.push(new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 256)));
        scene.remove(mesh);
      }
      expect(JSON.stringify(sources[0])).toContain('tauSectionFirst');
      expect(sources[1]).toEqual(sources[0]);
      expect(pixels[1]).not.toEqual(pixels[0]);
      scene.add(meshes[0]!);
      renderer.render(scene, camera);
      const repeated = new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 256));
      expect(repeated).toEqual(pixels[0]);
      expect(validation).toEqual([]);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      device?.removeEventListener('uncapturederror', uncaptured);
      errors.mockRestore();
      target.dispose();
      for (const material of materials) {
        material.dispose();
      }
      geometry.dispose();
      renderer.dispose();
    }
  },
);
