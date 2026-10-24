/* eslint-disable no-await-in-loop -- Ordered draws/readbacks reuse one GPU context and target. */
import { expect, it } from 'vitest';
import { DataTexture, RGBAFormat, LinearFilter, UnsignedByteType, NoBlending, Scene } from 'three';
import { NodeMaterial, QuadMesh, RenderTarget, WebGPUBackend, WebGLBackend } from 'three/webgpu';
import { texture } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';
import { createViewportFxaa } from '#graphics/three/fxaa.js';

// Bound the approximation on actual surface boundary pixels, not the mostly-flat whole image.
it.each(['webgpu', 'webgl'] as const)(
  'should retain surface boundary quality with bounded FXAA on %s',
  async (backend) => {
    const renderer = await createRenderer('showcase', backend, document.createElement('canvas'));
    expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
    const width = 5120;
    const height = 2880;
    renderer.setSize(width, height);
    const source = new Uint8Array(width * height * 4);
    const input = new DataTexture(source, width, height, RGBAFormat);
    input.minFilter = LinearFilter;
    input.magFilter = LinearFilter;
    const target = new RenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
    const materials = ([12, 6, 0] as const).map((steps) => {
      const material = new NodeMaterial();
      material.depthWrite = false;
      material.depthTest = false;
      material.blending = NoBlending;
      material.fragmentNode = steps === 0 ? texture(input) : createViewportFxaa(texture(input), undefined, steps);
      return material;
    });
    const read = async (material: NodeMaterial): Promise<Uint8Array<ArrayBuffer>> => {
      renderer.setRenderTarget(target);
      new QuadMesh(material).render(renderer);
      return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height));
    };
    try {
      renderer.setRenderTarget(target);
      const inspection = new QuadMesh(materials[1]);
      const generated = await renderer.debug.getShaderAsync(new Scene().add(inspection), inspection.camera, inspection);
      expect(generated.fragmentShader).toMatch(/for\s*\([^\n]*< 6/);
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const localX = x % 1280;
            const localY = y % 720;
            // Different slopes, curves and a translucent boundary; shift by subpixel phase.
            const region = Math.floor(x / 1280);
            const inside =
              region === 2
                ? Math.hypot(localX - 640 - phase, localY - 360) < 251
                : localX > 320 + localY * (region === 0 ? 0.13 : 0.71) + phase;
            const offset = (y * width + x) * 4;
            source[offset] = inside ? 230 : 20;
            source[offset + 1] = inside ? 210 : 40;
            source[offset + 2] = inside ? 180 : 80;
            source[offset + 3] = region === 3 && inside ? 96 : 255;
          }
        }
        input.needsUpdate = true;
        const reference = await read(materials[0]!);
        const candidate = await read(materials[1]!);
        const unfiltered = await read(materials[2]!);
        let count = 0;
        let error = 0;
        let large = 0;
        let smoothed = 0;
        let lost = 0;
        let flatError = 0;
        for (let i = 0; i < reference.length; i += 4) {
          const filtered = Math.abs(reference[i]! - unfiltered[i]!) > 8;
          if (filtered) {
            smoothed++;
            if (Math.abs(candidate[i]! - unfiltered[i]!) < 2) {
              lost++;
            }
            for (let c = 0; c < 4; c++) {
              const delta = Math.abs(candidate[i + c]! - reference[i + c]!) / 255;
              error += delta;
              large += Number(delta > 0.125);
              count++;
            }
          } else if (reference[i] === unfiltered[i]) {
            flatError += Math.abs(candidate[i]! - reference[i]!);
          }
        }
        const receipt = JSON.stringify({
          backend,
          phase,
          mean: error / count,
          large: large / count,
          smoothed,
          lost,
          flatError,
        });
        expect(smoothed, receipt).toBeGreaterThan(1000);
        expect(error / count, receipt).toBeLessThanOrEqual(0.025);
        expect(large / count, receipt).toBeLessThanOrEqual(0.05);
        expect(lost / smoothed, receipt).toBeLessThanOrEqual(0.05);
        expect(flatError, receipt).toBe(0);
      }
    } finally {
      renderer.setRenderTarget(null);
      for (const material of materials) {
        material.dispose();
      }
      input.dispose();
      target.dispose();
      renderer.dispose();
    }
  },
);
