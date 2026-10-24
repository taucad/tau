import { expect, it, vi } from 'vitest';
import { DataTexture, PerspectiveCamera, Scene } from 'three';
import { NodeMaterial, QuadMesh, WebGPUBackend, WebGLBackend } from 'three/webgpu';
import { float, sample, screenUV, texture, vec3, vec4 } from 'three/tsl';
import { createRenderer } from '#graphics/three/renderer.js';
import { createViewportFxaa } from '#graphics/three/fxaa.js';
import { createAoDenoise } from '#graphics/three/ao-denoise.js';
import { getGeneratedShaderSource } from '#graphics/three/utils/three-shader-debug.js';

// Installed Three declarations omit the native backend device surface.
type ShaderDevice = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
  queue: { onSubmittedWorkDone: () => Promise<void> };
  lost: Promise<unknown>;
  createShaderModule: (descriptor: { code: string }) => {
    getCompilationInfo: () => Promise<{ messages: ReadonlyArray<{ type: string }> }>;
  };
  pushErrorScope: (filter: 'validation') => void;
  popErrorScope: () => Promise<unknown>;
};

it.each(['denoise', 'upsample', 'fxaa'] as const)(
  'should compile viewport %s with native validation and an invalid-shader control',
  async (stage) => {
    const renderer = await createRenderer('showcase', 'webgpu', document.createElement('canvas'));
    if (!(renderer.backend instanceof WebGPUBackend) || !('device' in renderer.backend)) {
      throw new Error('Native WebGPU is required for AO shader qualification');
    }
    const device = renderer.backend.device as ShaderDevice;
    const gpuErrors = vi.fn();
    device.addEventListener('uncapturederror', gpuErrors);
    const input = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    input.needsUpdate = true;
    const material = new NodeMaterial();
    const filter = createAoDenoise({
      texture: texture(input),
      depth: sample(() => float(0.5)),
      // Production MRT normals are RGBA; a TS assertion does not remove alpha.
      normal: sample(() => vec4(0, 0, 1, 1)),
      camera: new PerspectiveCamera(),
    });
    filter.step.value.set(1 / 384, 1 / 384);
    material.fragmentNode = vec4(
      vec3(stage === 'denoise' ? filter.visibility(screenUV) : filter.upsample(texture(input), screenUV)),
      1,
    );
    if (stage === 'fxaa') {
      material.fragmentNode = createViewportFxaa(texture(input));
    }
    material.depthTest = false;
    material.depthWrite = false;
    const quad = new QuadMesh(material);
    const scene = new Scene();
    scene.add(quad);
    try {
      const source = await getGeneratedShaderSource({
        renderer,
        scene,
        camera: quad.camera,
        object: quad,
      });
      if (!source.fragmentShader) {
        throw new Error('The AO material did not produce a fragment shader');
      }
      if (stage === 'denoise') {
        const gathers = source.fragmentShader.match(/\btexture(?:Sample\w*|Load)\s*\(/g)?.length ?? 0;
        expect(gathers).toBeGreaterThan(0);
        expect(gathers).toBeLessThanOrEqual(14);
      }
      // A homogeneous W=1 added to the distance dot product rejects coplanar taps.
      expect(source.fragmentShader).not.toMatch(/dot\(\s*vec4/);
      const compilation = await device.createShaderModule({ code: source.fragmentShader }).getCompilationInfo();
      expect(compilation.messages.filter((message) => message.type === 'error')).toEqual([]);
      renderer.render(scene, quad.camera);
      await device.queue.onSubmittedWorkDone();
      expect(gpuErrors).not.toHaveBeenCalled();
      const lost = await Promise.race([device.lost, Promise.resolve(undefined)]);
      expect(lost).toBeUndefined();
      device.pushErrorScope('validation');
      const invalid = await device.createShaderModule({ code: 'invalid AO shader' }).getCompilationInfo();
      expect(invalid.messages.some((message) => message.type === 'error')).toBe(true);
      expect(await device.popErrorScope()).not.toBeNull();
    } finally {
      device.removeEventListener('uncapturederror', gpuErrors);
      material.dispose();
      input.dispose();
      renderer.dispose();
    }
  },
);

it.each(['denoise', 'upsample', 'fxaa'] as const)(
  'should compile viewport %s with WebGL2 validation and an invalid-shader control',
  async (stage) => {
    const canvas = document.createElement('canvas');
    const renderer = await createRenderer('showcase', 'webgl', canvas);
    const context = canvas.getContext('webgl2');
    expect(renderer.backend).toBeInstanceOf(WebGLBackend);
    if (!context) {
      throw new Error('Node WebGL2 shader qualification requires a WebGL2 context');
    }
    const input = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    input.needsUpdate = true;
    const material = new NodeMaterial();
    const filter = createAoDenoise({
      texture: texture(input),
      depth: sample(() => float(0.5)),
      normal: sample(() => vec4(0, 0, 1, 1)),
      camera: new PerspectiveCamera(),
    });
    filter.step.value.set(1 / 384, 1 / 384);
    material.fragmentNode =
      stage === 'fxaa'
        ? createViewportFxaa(texture(input))
        : vec4(vec3(stage === 'denoise' ? filter.visibility(screenUV) : filter.upsample(texture(input), screenUV)), 1);
    material.depthTest = false;
    material.depthWrite = false;
    const quad = new QuadMesh(material);
    const scene = new Scene();
    scene.add(quad);
    const shaders: WebGLShader[] = [];
    const program = context.createProgram();
    const compile = (type: number, source: string): WebGLShader => {
      const shader = context.createShader(type);
      if (!shader) {
        throw new Error('WebGL2 could not allocate a shader');
      }
      shaders.push(shader);
      context.shaderSource(shader, source);
      context.compileShader(shader);
      return shader;
    };
    try {
      const source = await getGeneratedShaderSource({ renderer, scene, camera: quad.camera, object: quad });
      if (!source.vertexShader || !source.fragmentShader) {
        throw new Error('WebGL2 did not produce the viewport shader program');
      }
      if (stage === 'denoise') {
        const gathers = source.fragmentShader.match(/texture(?:Lod)?\(/g)?.length ?? 0;
        expect(gathers).toBeGreaterThan(0);
        expect(gathers).toBeLessThanOrEqual(14);
      }
      const vertex = compile(context.VERTEX_SHADER, source.vertexShader);
      const fragment = compile(context.FRAGMENT_SHADER, source.fragmentShader);
      expect(context.getShaderParameter(vertex, context.COMPILE_STATUS), context.getShaderInfoLog(vertex) ?? '').toBe(
        true,
      );
      expect(
        context.getShaderParameter(fragment, context.COMPILE_STATUS),
        context.getShaderInfoLog(fragment) ?? '',
      ).toBe(true);
      context.attachShader(program, vertex);
      context.attachShader(program, fragment);
      context.linkProgram(program);
      expect(context.getProgramParameter(program, context.LINK_STATUS), context.getProgramInfoLog(program) ?? '').toBe(
        true,
      );
      renderer.render(scene, quad.camera);
      expect(context.getError()).toBe(context.NO_ERROR);
      const invalid = compile(context.FRAGMENT_SHADER, 'invalid viewport shader');
      expect(context.getShaderParameter(invalid, context.COMPILE_STATUS)).toBe(false);
      expect(context.getShaderInfoLog(invalid)).toMatch(/error/i);
    } finally {
      for (const shader of shaders) {
        context.deleteShader(shader);
      }
      context.deleteProgram(program);
      material.dispose();
      input.dispose();
      renderer.dispose();
    }
  },
);
