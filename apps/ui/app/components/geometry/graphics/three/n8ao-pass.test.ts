import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferGeometry,
  DepthTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderTarget,
} from 'three';
import type { Material, WebGLRenderer } from 'three';
import { mock } from 'vitest-mock-extended';
import { BlendFunction, EffectComposer, Pass, ToneMappingEffect } from 'postprocessing';
import { ManagedN8AoPass } from '#components/geometry/graphics/three/n8ao-pass.js';

const passes: ManagedN8AoPass[] = [];
const materials: Material[] = [];
const geometries: BoxGeometry[] = [];

const createFixture = (camera: PerspectiveCamera | OrthographicCamera = new PerspectiveCamera()) => {
  const scene = new Scene();
  const material = new MeshStandardMaterial();
  const geometry = new BoxGeometry();
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  const pass = new ManagedN8AoPass(scene, camera);
  passes.push(pass);
  materials.push(material);
  geometries.push(geometry);
  return { pass, material, mesh, scene };
};

afterEach(() => {
  for (const pass of passes.splice(0)) {
    pass.dispose();
  }
  for (const material of materials.splice(0)) {
    material.dispose();
  }
  for (const geometry of geometries.splice(0)) {
    geometry.dispose();
  }
});

describe('ManagedN8AoPass', () => {
  it('should distinguish opacity-aware tone-map blending from the installed default that ignores opacity', () => {
    const source = new ToneMappingEffect();
    const normal = new ToneMappingEffect({ blendFunction: BlendFunction.NORMAL });
    try {
      // Source evidence complements the actual WebGL raw-AO/exposure pixel check.
      expect(source.blendMode.getShaderCode()).toBe(
        'vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return src;}',
      );
      expect(normal.blendMode.getShaderCode()).toBe(
        'vec4 blend(const in vec4 dst,const in vec4 src,const in float opacity){return mix(dst,src,opacity);}',
      );
    } finally {
      source.dispose();
      normal.dispose();
    }
  });

  it('should copy AO color without rejecting pixels against a reused composer depth attachment', () => {
    const { pass } = createFixture();
    expect(pass.copyQuad.material.depthTest).toBe(false);
    expect(pass.copyQuad.material.depthWrite).toBe(false);
  });

  it.each([true, false])('should route the native AO copy without texture feedback when needsSwap=%s', (needsSwap) => {
    const { pass } = createFixture();
    pass.needsSwap = needsSwap;
    type NativeRenderTarget = NonNullable<Parameters<WebGLRenderer['setRenderTarget']>[0]>;
    let target: NativeRenderTarget | undefined;
    const draws: Array<{
      target: NativeRenderTarget | undefined;
      material: ShaderMaterial;
      sampledTextures: unknown[];
    }> = [];
    const renderer = mock<WebGLRenderer>({
      capabilities: mock<WebGLRenderer['capabilities']>({ logarithmicDepthBuffer: true }),
      xr: mock<WebGLRenderer['xr']>({ enabled: false }),
      autoClear: false,
    });
    renderer.setRenderTarget.mockImplementation((value) => {
      target = value ?? undefined;
    });
    renderer.render.mockImplementation((object) => {
      if (!(object instanceof Mesh) || !(object.material instanceof ShaderMaterial)) {
        throw new TypeError('Expected a native AO fullscreen draw.');
      }
      draws.push({
        target,
        material: object.material,
        sampledTextures: Object.values(object.material.uniforms).flatMap((uniform) => {
          const value: unknown = uniform.value;
          return value instanceof Texture ? [value] : [];
        }),
      });
    });
    const input = new WebGLRenderTarget(1, 1);
    const output = new WebGLRenderTarget(1, 1);
    try {
      for (const mode of [0, 1, 2]) {
        draws.length = 0;
        pass.configuration.renderMode = mode;
        pass.render(renderer, input, output, 0, false);
        expect(draws.at(-1)?.target).toBe(needsSwap ? output : input);
        expect(draws.at(-1)?.material).toBe(pass.copyQuad.material);
        expect(draws.at(-2)?.material).toBe(pass.effectCompositerQuad.material);
        expect(draws.at(-1)?.sampledTextures).toEqual([draws.at(-2)?.target?.texture]);
        expect(draws.every((draw) => !draw.sampledTextures.includes(draw.target!.texture))).toBe(true);
      }
    } finally {
      input.dispose();
      output.dispose();
    }
  });

  it('should restart native composer frames at the MSAA geometry target after an in-place post chain', () => {
    const renderer = mock<WebGLRenderer>({
      getSize: (size) => size.set(800, 600),
      getDrawingBufferSize: (size) => size.set(1600, 1200),
      getContext: () => mock<WebGL2RenderingContext>({ getContextAttributes: () => ({ alpha: true }) }),
    });
    const composer = new EffectComposer(renderer, { multisampling: 4 });
    composer.outputBuffer.samples = 0;
    const geometry = new Pass();
    geometry.needsSwap = false;
    const preTone = new Pass();
    const inPlaceAo = new Pass();
    inPlaceAo.needsSwap = false;
    const finalOutput = new Pass();
    const probes = [geometry, preTone, inPlaceAo, finalOutput].map((pass) =>
      vi.spyOn(pass, 'render').mockImplementation(() => undefined),
    );
    try {
      for (const pass of [geometry, preTone, inPlaceAo, finalOutput]) {
        composer.addPass(pass);
      }
      composer.render(0);
      composer.setSize(1024, 768);
      composer.render(0);
      for (const frame of [0, 1]) {
        expect(probes[0]!.mock.calls[frame]?.[1]).toBe(composer.inputBuffer);
        expect(probes[1]!.mock.calls[frame]?.[1]).toBe(composer.inputBuffer);
        expect(probes[2]!.mock.calls[frame]?.[1]).toBe(composer.outputBuffer);
        expect(probes[3]!.mock.calls[frame]?.[1]).toBe(composer.outputBuffer);
      }
      expect(composer.inputBuffer.samples).toBe(4);
      expect(composer.outputBuffer.samples).toBe(0);
    } finally {
      composer.dispose();
    }
  });

  it('should guard the dependency implementation whose owned wrappers it disposes', () => {
    const require = createRequire(import.meta.url);
    const sourceMap = JSON.parse(readFileSync(`${require.resolve('n8ao')}.map`, 'utf8')) as {
      sources: string[];
      sourcesContent: string[];
    };
    const source = sourceMap.sourcesContent[sourceMap.sources.indexOf('src/N8AOPostPass.js')]!;
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '8c4797567c3a2643942e64e006cbc75ed438bc73a7362c26119c9db82ac62a2a',
    );
    const patchedSource = readFileSync(resolve(dirname(require.resolve('n8ao')), '../src/N8AOPostPass.js'), 'utf8');
    expect(createHash('sha256').update(patchedSource).digest('hex')).toBe(
      '90beac6de9eaf069b3e8da5453f1ed3a282fe7153f36ffaac46621a9b62b8972',
    );
  });

  it.each(['perspective', 'orthographic'] as const)(
    'should pass the actual log-depth convention to the half-resolution shader for a %s camera',
    (projection) => {
      const camera = projection === 'perspective' ? new PerspectiveCamera() : new OrthographicCamera();
      const { pass } = createFixture(camera);
      pass.configuration.halfRes = true;
      const renderer = mock<WebGLRenderer>({
        capabilities: mock<WebGLRenderer['capabilities']>({ logarithmicDepthBuffer: true }),
        xr: mock<WebGLRenderer['xr']>({ enabled: false }),
        autoClear: true,
      });
      const input = new WebGLRenderTarget(1, 1);
      const output = new WebGLRenderTarget(1, 1);
      try {
        pass.render(renderer, input, output, 0, false);
        expect(pass.depthDownsampleQuad?.material.uniforms['logDepth']?.value).toBe(true);
        expect(Boolean(pass.depthDownsampleQuad?.material.uniforms['ortho']?.value)).toBe(
          projection === 'orthographic',
        );
        expect(renderer.render).toHaveBeenCalled();
      } finally {
        input.dispose();
        output.dispose();
      }
    },
  );

  it('should release half-resolution materials without disposing shared fullscreen geometry on a toggle', () => {
    const { pass } = createFixture();
    pass.configuration.halfRes = true;
    const disposed = vi.fn();
    pass.depthDownsampleQuad!.material.addEventListener('dispose', disposed);
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    try {
      pass.configuration.halfRes = false;
      expect(disposed).toHaveBeenCalledOnce();
      expect(geometryDispose).not.toHaveBeenCalled();
      expect(pass.depthDownsampleQuad).toBeUndefined();
    } finally {
      geometryDispose.mockRestore();
    }
  });

  it('should dispose all owned fullscreen materials and preserve borrowed depth', () => {
    const { pass, material } = createFixture();
    material.transparent = true;
    pass.detectTransparency();
    const wrappers = [
      pass.effectShaderQuad,
      pass.poissonBlurQuad,
      pass.effectCompositerQuad,
      pass.copyQuad,
      pass.accumulationQuad,
      pass.depthCopyPass!,
    ];
    const disposed = wrappers.map(({ material: owned }) => {
      const listener = vi.fn();
      owned.addEventListener('dispose', listener);
      return listener;
    });
    const depth = new DepthTexture(1, 1);
    const borrowedDepthDisposed = vi.fn();
    depth.addEventListener('dispose', borrowedDepthDisposed);
    pass.setDepthTexture(depth);
    pass.dispose();
    passes.splice(passes.indexOf(pass), 1);
    for (const listener of disposed) {
      expect(listener).toHaveBeenCalledOnce();
    }
    expect(borrowedDepthDisposed).not.toHaveBeenCalled();
    depth.dispose();
  });

  it('should stop transparent scene replays when all visible parts become opaque', () => {
    const { pass, material, mesh, scene } = createFixture();
    material.transparent = true;
    pass.detectTransparency();
    expect(pass.configuration.transparencyAware).toBe(true);
    material.transparent = false;
    pass.detectTransparency();
    expect(pass.configuration.transparencyAware).toBe(false);
    material.transparent = true;
    const hidden = new Group();
    hidden.visible = false;
    scene.add(hidden);
    hidden.add(mesh);
    pass.detectTransparency();
    expect(pass.configuration.transparencyAware).toBe(false);
    hidden.visible = true;
    pass.detectTransparency();
    expect(pass.configuration.transparencyAware).toBe(true);
  });

  it('should allocate transparency targets only after construction and release their material on return to opaque', () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial({ transparent: true });
    materials.push(material);
    const geometry = new BoxGeometry();
    geometries.push(geometry);
    scene.add(new Mesh(geometry, material));
    const pass = new ManagedN8AoPass(scene, new PerspectiveCamera());
    passes.push(pass);
    expect(pass.depthCopyPass).toBeUndefined();
    pass.detectTransparency();
    const depthCopyDisposed = vi.fn();
    pass.depthCopyPass!.material.addEventListener('dispose', depthCopyDisposed);
    material.transparent = false;
    pass.detectTransparency();
    expect(depthCopyDisposed).toHaveBeenCalledOnce();
    expect(pass.depthCopyPass).toBeUndefined();
    material.transparent = true;
    pass.detectTransparency();
    expect(pass.configuration.transparencyAware).toBe(true);
  });
});
