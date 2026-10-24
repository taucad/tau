import { expect, it } from 'vitest';
import {
  PerspectiveCamera,
  Color,
  NoBlending,
  AlwaysDepth,
  AlwaysStencilFunc,
  DepthStencilFormat,
  DepthTexture,
  EqualStencilFunc,
  FloatType,
  FramebufferTexture,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector4,
  NoColorSpace,
  RenderTarget,
  ReplaceStencilOp,
  UnsignedInt248Type,
} from 'three';
import { NodeMaterial, QuadMesh, WebGLBackend, WebGPUBackend } from 'three/webgpu';
import { float, texture, vec4, expression, Fn } from 'three/tsl';
import { createSectionCapOutlineNodeMaterial } from '#graphics/three/materials/section-cap-outline.node.js';
import {
  createSectionCapOutlineFaces,
  writeSectionCapOutlineCamera,
  writeSectionCapOutlineFaces,
} from '#graphics/three/materials/section-cap-outline.material.js';
import type { Node } from 'three/webgpu';
import { createRenderer } from '#graphics/three/renderer.js';

// oxlint-disable no-await-in-loop -- Sequential reuse and disposal are the behavior under test.
it.each(
  (
    [
      { execution: 'webgpu', type: FloatType },
      { execution: 'webgpu', type: UnsignedInt248Type },
      { execution: 'webgl', type: UnsignedInt248Type },
    ] as const
  ).flatMap((configuration) => [false, true].map((shared) => ({ ...configuration, shared }))),
)(
  'should preserve sampled depth and attachment stencil through resize/recreation on $execution/$type shared=$shared',
  async ({ execution, type, shared }) => {
    // Two independent instances exercise factory installation and device-local view ownership.
    for (let instance = 0; instance < 2; instance++) {
      const renderer = await createRenderer('showcase', execution, document.createElement('canvas'));
      expect(renderer.backend).toBeInstanceOf(execution === 'webgpu' ? WebGPUBackend : WebGLBackend);
      const native = renderer.backend as typeof renderer.backend & {
        device?: {
          addEventListener: (type: string, callback: (event: { error: { message: string } }) => void) => void;
          removeEventListener: (type: string, callback: (event: { error: { message: string } }) => void) => void;
          queue: { onSubmittedWorkDone: () => Promise<void> };
        };
      };
      const errors: string[] = [];
      const observe = (event: { error: { message: string } }): void => {
        errors.push(event.error.message);
      };
      native.device?.addEventListener('uncapturederror', observe);
      const depth = new DepthTexture(16, 16, type);
      depth.format = DepthStencilFormat;
      const source = new RenderTarget(16, 16, { depthTexture: depth, stencilBuffer: true });
      const frame = shared ? new RenderTarget(16, 16, { depthTexture: depth, stencilBuffer: true }) : source;
      const destination = new RenderTarget(16, 16, { depthBuffer: false, type: FloatType });
      destination.texture.colorSpace = NoColorSpace;
      const write = new NodeMaterial();
      write.fragmentNode = vec4(1, 0, 0, 1);
      write.depthFunc = AlwaysDepth;
      write.stencilWrite = true;
      write.stencilFunc = AlwaysStencilFunc;
      write.stencilRef = 7;
      write.stencilZPass = ReplaceStencilOp;
      const probe = new NodeMaterial();
      probe.fragmentNode = vec4(0, 1, 0, 1);
      probe.depthTest = false;
      probe.depthWrite = false;
      probe.stencilWrite = true;
      probe.stencilFunc = EqualStencilFunc;
      // Equality requires restoring reference 7 on the new pass encoder.
      probe.stencilRef = 7;
      const read = new NodeMaterial();
      read.fragmentNode = vec4(texture(depth).r, 0, 0, 1);
      read.depthTest = false;
      read.depthWrite = false;
      const writeQuad = new QuadMesh(write);
      const probeQuad = new QuadMesh(probe);
      const readQuad = new QuadMesh(read);
      try {
        if (execution === 'webgpu' && type === FloatType) {
          expect(renderer.hasFeature('depth32float-stencil8')).toBe(true);
        }
        for (const [index, [width, height]] of (
          [
            [16, 16],
            [5120, 2880],
            [16, 16],
          ] as const
        ).entries()) {
          source.setSize(width, height);
          frame.setSize(width, height);
          destination.setSize(width, height);
          renderer.initRenderTarget(source);
          renderer.initRenderTarget(frame);
          if (shared) {
            // Three r184 clears depth on a target's first render even with autoClear=false.
            // The production compositor enters its target before scheduling the scene.
            renderer.setRenderTarget(frame);
            renderer.autoClear = true;
            probeQuad.render(renderer);
          }
          const expected = 0.375 + index * 2 ** -24;
          write.depthNode = float(expected);
          write.needsUpdate = true;
          renderer.autoClear = true;
          renderer.setRenderTarget(source);
          writeQuad.render(renderer);
          renderer.autoClear = false;
          renderer.setRenderTarget(frame);
          probeQuad.render(renderer);
          const stencilPixels = await renderer.readRenderTargetPixelsAsync(frame, 0, 0, 1, 1);
          expect([...stencilPixels].slice(0, 4)).toEqual([0, 255, 0, 255]);
          renderer.autoClear = true;
          renderer.setRenderTarget(destination);
          readQuad.render(renderer);
          for (const [x, y] of [
            [0, 0],
            [width - 1, 0],
            [0, height - 1],
            [width - 1, height - 1],
            [Math.floor(width / 2), Math.floor(height / 2)],
          ]) {
            const pixels = await renderer.readRenderTargetPixelsAsync(destination, x!, y!, 1, 1);
            expect(pixels).toBeInstanceOf(Float32Array);
            expect(
              Math.abs(Number(pixels[0]) - expected),
              JSON.stringify({ index, x, y, actual: pixels[0], errors }),
            ).toBeLessThanOrEqual(2 ** -25);
          }
          await native.device?.queue.onSubmittedWorkDone();
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
          expect(errors).toEqual([]);
          if (execution === 'webgl') {
            expect((renderer.getContext() as WebGL2RenderingContext).getError()).toBe(0);
          }
        }
      } finally {
        native.device?.removeEventListener('uncapturederror', observe);
        source.dispose();
        if (shared) {
          frame.dispose();
        }
        destination.dispose();
        write.dispose();
        probe.dispose();
        read.dispose();
        renderer.dispose();
      }
    }
  },
);

it.each(['webgpu', 'webgl'] as const)(
  'should restore repeated stencil references across passes and framebuffer copies on %s',
  async (execution) => {
    const renderer = await createRenderer('showcase', execution, document.createElement('canvas'));
    expect(renderer.backend).toBeInstanceOf(execution === 'webgpu' ? WebGPUBackend : WebGLBackend);
    const { device } = renderer.backend as typeof renderer.backend & { device?: EventTarget };
    const errors: string[] = [];
    const observe = (event: Event): void => {
      errors.push((event as Event & { error: { message: string } }).error.message);
    };
    device?.addEventListener('uncapturederror', observe);
    const source = new RenderTarget(16, 16, { stencilBuffer: true });
    const copy = new FramebufferTexture(16, 16);
    const geometry = new PlaneGeometry(2, 2);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const scene = new Scene();
    const write = new NodeMaterial();
    write.fragmentNode = vec4(1, 0, 0, 1);
    write.depthTest = false;
    write.depthWrite = false;
    write.stencilWrite = true;
    write.stencilFunc = AlwaysStencilFunc;
    write.stencilZPass = ReplaceStencilOp;
    const probe = new NodeMaterial();
    probe.fragmentNode = vec4(0, 1, 0, 1);
    probe.depthTest = false;
    probe.depthWrite = false;
    probe.stencilWrite = true;
    probe.stencilFunc = EqualStencilFunc;
    const writer = new Mesh(geometry, write);
    const reader = new Mesh(geometry, probe);
    reader.renderOrder = 1;
    scene.add(writer, reader);
    const rectangle = new Vector4(0, 0, 16, 16);
    try {
      for (const withCopy of [false, true]) {
        reader.onBeforeRender = () => {
          if (withCopy) {
            renderer.copyFramebufferToTexture(copy, rectangle);
          }
        };
        for (const reference of [7, 7, 0, 19, 19, 7]) {
          write.stencilRef = reference;
          probe.stencilRef = reference;
          renderer.setRenderTarget(source);
          renderer.render(scene, camera);
          const pixels = await renderer.readRenderTargetPixelsAsync(source, 8, 8, 1, 1);
          expect([...pixels].slice(0, 4), JSON.stringify({ execution, withCopy, reference })).toEqual([0, 255, 0, 255]);
        }
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      expect(errors).toEqual([]);
      if (execution === 'webgl') {
        expect((renderer.getContext() as WebGL2RenderingContext).getError()).toBe(0);
      }
    } finally {
      device?.removeEventListener('uncapturederror', observe);
      source.dispose();
      copy.dispose();
      geometry.dispose();
      write.dispose();
      probe.dispose();
      renderer.dispose();
    }
  },
);

// oxlint-enable no-await-in-loop -- End sequential lifecycle checks.

it.each(['webgpu', 'webgl'] as const)(
  'should preserve rasterized cap-outline depth on a front surface at 5K on %s',
  async (execution) => {
    const renderer = await createRenderer('showcase', execution, document.createElement('canvas'));
    expect(renderer.backend).toBeInstanceOf(execution === 'webgpu' ? WebGPUBackend : WebGLBackend);
    const target = new RenderTarget(5120, 2880, { samples: 0, type: FloatType, depthBuffer: false });
    const camera = new PerspectiveCamera(35, 5120 / 2880, 242.49394217288253, 1454.8833061776754);
    camera.up.set(0, 0, 1);
    camera.position.set(216.7, 216.7, 216.7);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const geometry = new PlaneGeometry(170, 170);
    const faces = createSectionCapOutlineFaces();
    writeSectionCapOutlineFaces(faces, [{ plane: { normal: [1, 0, 0], constant: 0 }, bounds: [], cutId: 'raster' }], 3);
    writeSectionCapOutlineCamera(faces, camera, 2880);
    const material = createSectionCapOutlineNodeMaterial(faces, 0xff_ff_ff);
    // Compare the shader's numeric depth with the rasterizer in one floating-point
    // output. A separate EqualDepth draw confounds vertex-code and D24 rounding.
    // oxlint-disable-next-line new-cap -- Three's Fn builds a shader graph.
    const rasterDepth = Fn(
      (builder) => expression(`${builder.getFragCoord().slice(0, -2)}z`, 'float') as unknown as Node<'float'>,
    )();
    material.fragmentNode = vec4(material.depthNode as Node<'float'>, rasterDepth, 0, 1);
    material.blending = NoBlending;
    material.depthTest = false;
    material.depthWrite = false;
    const outline = new Mesh(geometry, material);
    outline.rotation.set(0.31, 0.47, 0.13);
    outline.position.set(17.126, -11.547, 6.289);
    const scene = new Scene();
    scene.background = new Color(0);
    scene.add(outline);
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 5120, 2880);
      expect(pixels).toBeInstanceOf(Float32Array);
      let ink = 0;
      let changed = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3]! > 0 && pixels[offset]! > 0) {
          ink++;
          changed += Number(pixels[offset] !== pixels[offset + 1]);
        }
      }
      expect(ink).toBeGreaterThan(1000);
      expect(changed, 'Non-crossing depth must equal the rasterized depth, without world-space reprojection').toBe(0);
    } finally {
      renderer.setRenderTarget(null);
      geometry.dispose();
      material.dispose();
      target.dispose();
      renderer.dispose();
    }
  },
  60_000,
);
