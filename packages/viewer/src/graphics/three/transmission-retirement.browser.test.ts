import { expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HalfFloatType,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  RenderTarget,
  Scene,
} from 'three';
import type { Texture } from 'three';
import { ViewportTextureNode, WebGLBackend, WebGPUBackend } from 'three/webgpu';
import { viewportOpaqueMipTexture } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';
import { retireTransmissionCopy } from '#graphics/three/transmission-retirement.js';

it.each(['webgpu', 'webgl'] as const)(
  'should release a retired transmission copy and reacquire it safely on %s',
  async (backendName) => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const renderer = await createRenderer('showcase', backendName, canvas);
    expect(renderer.backend).toBeInstanceOf(backendName === 'webgpu' ? WebGPUBackend : WebGLBackend);
    const backend = renderer.backend as typeof renderer.backend & {
      destroyTexture: (texture: Texture, isDefaultTexture?: boolean) => void;
    };
    const release = vi.spyOn(backend, 'destroyTexture');
    const errors = vi.fn();
    if ('device' in backend) {
      (backend.device as Pick<EventTarget, 'addEventListener'>).addEventListener('uncapturederror', errors);
    }
    const first = new RenderTarget(320, 180, { type: HalfFloatType });
    const second = new RenderTarget(320, 180, { type: HalfFloatType });
    const geometry = new BoxGeometry(1, 1, 0.2);
    const material = new MeshPhysicalMaterial({ transmission: 1, roughness: 0.2, thickness: 0.1 });
    const scene = new Scene();
    scene.background = new Color(0x12_68_ab);
    scene.add(new Mesh(geometry, material), new DirectionalLight(0xff_ff_ff, 3));
    const camera = new PerspectiveCamera(45, 320 / 180, 0.01, 10);
    camera.position.z = 2;
    const node = viewportOpaqueMipTexture();
    if (!(node instanceof ViewportTextureNode)) {
      throw new Error('Unexpected viewport texture implementation');
    }
    const draw = (target: RenderTarget): void => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    };
    try {
      draw(first);
      const firstCopy = node.getTextureForReference(first);
      const before = await renderer.readRenderTargetPixelsAsync(first, 0, 0, 320, 180);
      draw(second);
      const secondCopy = node.getTextureForReference(second);
      const retained = renderer.info.memory.texturesSize;
      release.mockClear();
      retireTransmissionCopy(first);
      expect(release.mock.calls.some(([texture]) => texture === firstCopy)).toBe(true);
      expect(release.mock.calls.some(([texture]) => texture === secondCopy)).toBe(false);
      expect(renderer.info.memory.texturesSize).toBeLessThan(retained);
      draw(second);
      // Disposal also evicts cached bind groups. Reuse must allocate a valid copy,
      // not sample a destroyed GPU resource still referenced by the singleton.
      draw(first);
      const after = await renderer.readRenderTargetPixelsAsync(first, 0, 0, 320, 180);
      expect(after).toEqual(before);
      expect(errors).not.toHaveBeenCalled();
      if (backendName === 'webgl') {
        expect((renderer.getContext() as WebGL2RenderingContext).getError()).toBe(0);
      }
    } finally {
      retireTransmissionCopy(first);
      retireTransmissionCopy(second);
      first.dispose();
      second.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      release.mockRestore();
      canvas.remove();
    }
  },
);
