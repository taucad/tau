import { expect, it } from 'vitest';
import { DataTexture, FloatType, RGBAFormat, RGFormat, UnsignedByteType, NearestFilter, LinearFilter } from 'three';
import { NodeMaterial, QuadMesh, RenderTarget, WebGPUBackend, WebGLBackend } from 'three/webgpu';
import { texture, vec2, vec4 } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';
import { encodeAoNormal, decodeAoNormal, sampleAoNormal } from '#graphics/three/ao-normal.js';

it.each(['webgpu', 'webgl'] as const)(
  'should round-trip both normal hemispheres through RG8 on %s',
  async (backend) => {
    const renderer = await createRenderer('showcase', backend, document.createElement('canvas'));
    expect(renderer.backend).toBeInstanceOf(backend === 'webgpu' ? WebGPUBackend : WebGLBackend);
    const size = 128;
    const directions = new Float32Array(size * size * 4);
    for (let index = 0; index < size * size; index++) {
      const z = 1 - (2 * (index + 0.5)) / (size * size);
      const angle = index * 2.399963229728653;
      directions.set([Math.sqrt(1 - z * z) * Math.cos(angle), Math.sqrt(1 - z * z) * Math.sin(angle), z, 1], index * 4);
    }
    // Fold and sign-zero endpoints supplement the uniform sphere.
    directions.set([0, 0, -1, 1, 0, 0, 1, 1, 1, 0, 0, 1, -1, 0, 0, 1, 0, 1, 0, 1, 0, -1, 0, 1]);
    const input = new DataTexture(directions, size, size, RGBAFormat, FloatType);
    input.needsUpdate = true;
    const packed = new RenderTarget(size, size, {
      format: RGFormat,
      type: UnsignedByteType,
      depthBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    const decoded = new RenderTarget(size, size, { type: FloatType, depthBuffer: false });
    const encodeMaterial = new NodeMaterial();
    encodeMaterial.fragmentNode = vec4(encodeAoNormal(texture(input).rgb), 0, 1);
    encodeMaterial.depthTest = false;
    encodeMaterial.depthWrite = false;
    const decodeMaterial = new NodeMaterial();
    decodeMaterial.fragmentNode = vec4(decodeAoNormal(texture(packed.texture).rg), 1);
    decodeMaterial.depthTest = false;
    decodeMaterial.depthWrite = false;
    try {
      renderer.setRenderTarget(packed);
      new QuadMesh(encodeMaterial).render(renderer);
      renderer.setRenderTarget(decoded);
      new QuadMesh(decodeMaterial).render(renderer);
      const bytes = await renderer.readRenderTargetPixelsAsync(decoded, 0, 0, size, size);
      const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      let maximum = 0;
      let negativeControlMaximum = 0;
      for (let index = 0; index < size * size; index++) {
        const offset = index * 4;
        // WebGL readPixels starts at the bottom row; native readback is top-first.
        const readOffset =
          (backend === 'webgl' ? (size - 1 - Math.floor(index / size)) * size + (index % size) : index) * 4;
        const dot =
          directions[offset]! * values[readOffset]! +
          directions[offset + 1]! * values[readOffset + 1]! +
          directions[offset + 2]! * values[readOffset + 2]!;
        maximum = Math.max(maximum, (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI);
        // Applying the same angular gate to an upper-hemisphere-only decoder must fail.
        const wrongDot =
          directions[offset]! * values[readOffset]! +
          directions[offset + 1]! * values[readOffset + 1]! +
          directions[offset + 2]! * Math.abs(values[readOffset + 2]!);
        negativeControlMaximum = Math.max(
          negativeControlMaximum,
          (Math.acos(Math.min(1, Math.max(-1, wrongDot))) * 180) / Math.PI,
        );
      }
      expect(maximum).toBeLessThan(1);
      expect(negativeControlMaximum).toBeGreaterThan(90);
    } finally {
      renderer.setRenderTarget(null);
      input.dispose();
      packed.dispose();
      decoded.dispose();
      encodeMaterial.dispose();
      decodeMaterial.dispose();
      renderer.dispose();
    }
  },
);

it.each(['webgpu', 'webgl'] as const)(
  'should interpolate decoded normals across folds and clear texels on %s',
  async (backend) => {
    const renderer = await createRenderer('showcase', backend, document.createElement('canvas'));
    const texels = new Uint8Array([255, 255, 1, 1, 255, 255, 1, 1]);
    const input = new DataTexture(texels, 2, 2, RGFormat, UnsignedByteType);
    input.minFilter = LinearFilter;
    input.magFilter = LinearFilter;
    input.needsUpdate = true;
    const target = new RenderTarget(1, 1, { type: FloatType, depthBuffer: false });
    const material = new NodeMaterial();
    material.fragmentNode = vec4(sampleAoNormal(texture(input), vec2(0.5)), 1);
    material.depthTest = false;
    material.depthWrite = false;
    const quad = new QuadMesh(material);
    const read = async (): Promise<number[]> => {
      renderer.setRenderTarget(target);
      quad.render(renderer);
      const bytes = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1);
      return [...new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)];
    };
    try {
      // Opposite corners encode the same south pole: interpolating the encoding would produce north.
      const fold = await read();
      expect(fold[0]).toBeCloseTo(0, 5);
      expect(fold[1]).toBeCloseTo(0, 5);
      expect(fold[2]).toBeCloseTo(-1, 5);
      material.fragmentNode = vec4(decodeAoNormal(texture(input, vec2(0.5)).rg), 1);
      material.needsUpdate = true;
      const incorrectlyFiltered = await read();
      expect(incorrectlyFiltered[2]).toBeGreaterThan(0.99);
      material.fragmentNode = vec4(sampleAoNormal(texture(input), vec2(0.5)), 1);
      material.needsUpdate = true;
      texels.set([0, 0, 128, 128, 0, 0, 128, 128]);
      input.needsUpdate = true;
      const boundary = await read();
      expect(boundary[0]).toBeCloseTo(-0.5, 5);
      expect(boundary[1]).toBeCloseTo(-0.5, 5);
      expect(boundary[2]).toBeCloseTo(0, 5);
    } finally {
      renderer.setRenderTarget(null);
      input.dispose();
      target.dispose();
      material.dispose();
      renderer.dispose();
    }
  },
);
