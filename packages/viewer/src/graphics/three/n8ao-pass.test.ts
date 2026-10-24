import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DepthTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import type { Material, WebGLRenderer } from 'three';
import { mock } from 'vitest-mock-extended';
import { BlendFunction, ToneMappingEffect } from 'postprocessing';
// @ts-expect-error -- n8ao 1.10.2 does not publish TypeScript declarations.
import { DepthType } from 'n8ao';
import { ManagedN8AoPass } from '#graphics/three/n8ao-pass.js';
import { invalidateSceneTransparency } from '#graphics/three/utils/scene-transparency-revision.js';

const passes: ManagedN8AoPass[] = [];
const materials: Material[] = [];
const geometries: BoxGeometry[] = [];

const createFixture = (camera: PerspectiveCamera | OrthographicCamera = new PerspectiveCamera()) => {
  const scene = new Scene();
  const material = new MeshStandardMaterial();
  const geometry = new BoxGeometry();
  const mesh = new Mesh<BoxGeometry, MeshStandardMaterial | MeshStandardMaterial[]>(geometry, material);
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
  it('should detect transparent material arrays and refresh owned-scene classification only on appearance changes', () => {
    const { pass, material, mesh, scene } = createFixture();
    const transparent = new MeshStandardMaterial({ transparent: true });
    materials.push(transparent);
    mesh.material = [material, transparent];
    pass.detectTransparency();
    expect(pass.configuration.transparencyAware).toBe(true);
    invalidateSceneTransparency(scene);
    const traversal = vi.spyOn(scene, 'traverseVisible');
    const renderer = mock<WebGLRenderer>({
      capabilities: mock<WebGLRenderer['capabilities']>({ logarithmicDepthBuffer: true }),
      xr: mock<WebGLRenderer['xr']>({ enabled: false }),
    });
    const input = new WebGLRenderTarget(1, 1);
    const output = new WebGLRenderTarget(1, 1);
    // Preserve real classification while isolating unrelated AO draw setup.
    const nativeRender = vi.spyOn(pass, 'renderTransparency').mockImplementation(() => undefined);
    try {
      pass.render(renderer, input, output);
      pass.render(renderer, input, output);
      expect(traversal).toHaveBeenCalledOnce();
      transparent.transparent = false;
      invalidateSceneTransparency(scene);
      pass.render(renderer, input, output);
      expect(traversal).toHaveBeenCalledTimes(2);
      expect(pass.configuration.transparencyAware).toBe(false);
      transparent.transparent = true;
      pass.detectTransparency();
      expect(pass.configuration.transparencyAware).toBe(true);
    } finally {
      nativeRender.mockRestore();
      traversal.mockRestore();
      input.dispose();
      output.dispose();
    }
  });
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

  it.each([true, false])(
    'should publish spatial AO without overwriting normal channels when halfRes=%s',
    (halfResolution) => {
      const { pass } = createFixture();
      pass.configuration.halfRes = halfResolution;
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
          expect(draws.at(-1)?.target).toBe(pass.outputTargetInternal);
          expect(draws.at(-1)?.material).toBe(pass.effectCompositerQuad.material);
          expect(draws).toHaveLength(halfResolution ? 5 : 4);
          expect(draws.some((draw) => draw.material === pass.copyQuad.material)).toBe(false);
          expect(draws.some((draw) => draw.material === pass.accumulationQuad.material)).toBe(false);
          expect(pass.effectCompositerQuad.material.uniforms['tDiffuse']?.value).toBe(pass.writeTargetInternal.texture);
          expect(draws.every((draw) => !draw.sampledTextures.includes(draw.target!.texture))).toBe(true);
        }
      } finally {
        input.dispose();
        output.dispose();
      }
    },
  );

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
    const composite = sourceMap.sourcesContent[sourceMap.sources.indexOf('src/EffectCompositer.js')]!;
    expect(createHash('sha256').update(composite).digest('hex')).toBe(
      '9ce856628c5534c6e5f9b3e3d9df020886cb97ae4755ce7a75e09d2c7f89b047',
    );
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Verify the exact upstream exported enum keys.
    expect(DepthType).toEqual({ Default: 1, Log: 2, Reverse: 3 });
  });

  it('should initialize the weighted AO sum after every composite shader reconfiguration', () => {
    const { pass } = createFixture();
    for (const halfResolution of [false, true, false, true]) {
      pass.configuration.halfRes = halfResolution;
      for (const depthType of [1, 2, 3]) {
        for (const orthographic of [false, true]) {
          pass.configureEffectCompositer(depthType, orthographic);
          const shader = pass.effectCompositerQuad.material.fragmentShader;
          const start = shader.indexOf('#ifdef HALFRES');
          const weightedSum = shader.indexOf('texel += sampleInfo * weight;');
          expect(start).toBeGreaterThan(-1);
          expect(weightedSum).toBeGreaterThan(start);
          expect(shader.slice(start, weightedSum)).toContain('vec4 texel = vec4(0.0);');
          expect(shader).not.toContain('vec4 texel;');
          expect(shader).toContain('texel = texture2D(tDiffuse, vUv);');
        }
      }
    }
  });

  it.each([
    { orthographic: false, halfRes: false },
    { orthographic: true, halfRes: false },
    { orthographic: false, halfRes: true },
    { orthographic: true, halfRes: true },
  ])(
    'should preserve native shader parameters outside the qualified spatial output bindings for %j',
    ({ orthographic, halfRes: halfResolution }) => {
      const camera = orthographic ? new OrthographicCamera() : new PerspectiveCamera();
      camera.position.set(20, 30, 40);
      const { pass } = createFixture(camera);
      pass.configuration.halfRes = halfResolution;
      pass.configuration.screenSpaceRadius = true;
      pass.setSize(800, 600);
      const renderer = mock<WebGLRenderer>({
        capabilities: mock<WebGLRenderer['capabilities']>({ logarithmicDepthBuffer: true }),
        xr: mock<WebGLRenderer['xr']>({ enabled: false }),
      });
      const captures: Array<Record<string, unknown>> = [];
      renderer.render.mockImplementation((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        const material: unknown = object.material;
        if (!(material instanceof ShaderMaterial)) {
          return;
        }
        if (
          ![pass.effectShaderQuad.material, pass.poissonBlurQuad.material, pass.effectCompositerQuad.material].includes(
            material,
          )
        ) {
          return;
        }
        captures.push(
          Object.fromEntries(
            Object.entries(material.uniforms)
              .filter(([name]) => material !== pass.effectCompositerQuad.material || name !== 'tDiffuse')
              .map(([name, uniform]) => {
                const value: unknown = uniform.value;
                if (name === 'ortho') {
                  return [name, Boolean(value)];
                }
                return [
                  name,
                  value instanceof Vector2 ||
                  value instanceof Vector3 ||
                  value instanceof Matrix4 ||
                  value instanceof Color
                    ? value.clone()
                    : value,
                ];
              }),
          ),
        );
      });
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
      const input = new WebGLRenderTarget(800, 600);
      const output = new WebGLRenderTarget(800, 600);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Compare to the source-hash-guarded native render implementation on the same owned resources.
      const native = Object.getPrototypeOf(ManagedN8AoPass.prototype) as Pick<ManagedN8AoPass, 'render'>;
      try {
        pass.render(renderer, input, output);
        const managed = captures.splice(0);
        native.render.call(pass, renderer, input, output);
        expect(captures).toHaveLength(4);
        expect(managed).toEqual(captures);
      } finally {
        clock.mockRestore();
        input.dispose();
        output.dispose();
      }
    },
  );

  it('should restore renderer flags if the half-resolution composite draw fails', () => {
    const { pass } = createFixture();
    pass.configuration.halfRes = true;
    const renderer = mock<WebGLRenderer>({
      capabilities: mock<WebGLRenderer['capabilities']>({ logarithmicDepthBuffer: true }),
      xr: mock<WebGLRenderer['xr']>({ enabled: true }),
      autoClear: true,
    });
    const failure = new Error('draw failed');
    renderer.render.mockImplementation((object) => {
      if (object instanceof Mesh && object.material === pass.effectCompositerQuad.material) {
        throw failure;
      }
    });
    const input = new WebGLRenderTarget(1, 1);
    const output = new WebGLRenderTarget(1, 1);
    try {
      expect(() => {
        pass.render(renderer, input, output);
      }).toThrow(failure);
      expect(renderer.xr.enabled).toBe(true);
      expect(renderer.autoClear).toBe(true);
    } finally {
      input.dispose();
      output.dispose();
    }
  });

  it.each(['perspective', 'orthographic'] as const)(
    'should pass the actual log-depth convention to the half-resolution shader for a %s camera',
    (projection) => {
      const camera = projection === 'perspective' ? new PerspectiveCamera() : new OrthographicCamera();
      const { pass } = createFixture(camera);
      pass.configuration.halfRes = true;
      expect(pass.depthDownsampleTarget?.depthBuffer).toBe(false);
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
