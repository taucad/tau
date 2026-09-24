import { act, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlwaysDepth, HalfFloatType } from 'three';

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  const scene = { isScene: true };
  const invalidate = vi.fn();
  const glRender = vi.fn();
  const clearDepth = vi.fn();
  const getRenderTarget = vi.fn(() => ({ kind: 'prior-target' }));
  const getActiveCubeFace = vi.fn(() => 2);
  const getActiveMipmapLevel = vi.fn(() => 1);
  const setRenderTarget = vi.fn();
  const getPixelRatio = vi.fn(() => 2);
  const gl = {
    clearDepth,
    getActiveCubeFace,
    getActiveMipmapLevel,
    getPixelRatio,
    getRenderTarget,
    render: glRender,
    setRenderTarget,
  };
  const size = { width: 800, height: 600 };
  const viewport = { dpr: 2 };
  const state = { gl, scene, camera: perspectiveCamera, invalidate, size, viewport };
  const rig = { perspectiveCamera, orthographicCamera, activeCamera: perspectiveCamera };

  let frame:
    | ((state: { gl: typeof gl; scene: typeof scene; camera: typeof perspectiveCamera }, delta: number) => void)
    | undefined;
  let retarget: ((camera: typeof perspectiveCamera) => void) | undefined;
  let restoreDepth: ((target?: unknown) => void) | undefined;
  let failCamera: unknown;
  let failWarmupCamera: unknown;
  const composers: Array<{
    autoRenderToScreen: boolean;
    inputBuffer: { samples: number };
    outputBuffer: { samples: number };
    options: unknown;
    addPass: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    passes: Array<Record<string, unknown>>;
    screenRenderFlags: boolean[];
    renderedCameras: unknown[];
    renderedAoCameras: unknown[][];
  }> = [];
  const renderPasses: Array<{ camera: unknown; dispose: ReturnType<typeof vi.fn> }> = [];
  const aoPasses: Array<{
    camera: unknown;
    enabled: boolean;
    needsSwap: boolean;
    configuration: Record<string, unknown>;
    configurationWrites: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const toneMappingEffects: Array<{ mode: string; blendMode: { blendFunction: string; opacity: { value: number } } }> =
    [];

  return {
    aoPasses,
    clearDepth,
    composers,
    getFailCamera: () => failCamera,
    getFailWarmupCamera: () => failWarmupCamera,
    getFrame: () => frame,
    getPixelRatio,
    getRetarget: () => retarget,
    getRestoreDepth: () => restoreDepth,
    gl,
    glRender,
    invalidate,
    orthographicCamera,
    perspectiveCamera,
    renderPasses,
    rig,
    scene,
    setFailCamera: (camera: unknown) => {
      failCamera = camera;
    },
    setFailWarmupCamera: (camera: unknown) => {
      failWarmupCamera = camera;
    },
    setFrame: (callback: typeof frame) => {
      frame = callback;
    },
    setRetarget: (callback: typeof retarget) => {
      retarget = callback;
      callback?.(rig.activeCamera);
    },
    setRestoreDepth: (callback: typeof restoreDepth) => {
      restoreDepth = callback;
    },
    setRenderTarget,
    size,
    state,
    toneMappingEffects,
    viewport,
  };
});

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: Parameters<typeof mocks.setFrame>[0], priority: number) => {
    if (priority === 1) {
      mocks.setFrame(callback);
    }
  },
  useThree: () => mocks.state,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mocks.rig,
  useCameraRetarget: (callback: (camera: typeof mocks.perspectiveCamera) => void) => {
    useLayoutEffect(() => {
      mocks.setRetarget(callback);
      return () => {
        mocks.setRetarget(undefined);
      };
    }, [callback]);
  },
}));

vi.mock('#components/geometry/graphics/three/scene-overlay.js', () => ({
  useOverlayDepthRestore: (callback: () => void) => {
    mocks.setRestoreDepth(callback);
  },
}));

vi.mock('postprocessing', () => {
  class Pass {
    public camera = { kind: 'fullscreen-camera' };
    public scene = { kind: 'fullscreen-scene' };
    public needsDepthTexture = false;
    public needsSwap = true;
    public renderToScreen = false;
    public fullscreenMaterial: { dispose?: () => void } | undefined;
    public readonly dispose = vi.fn(() => this.fullscreenMaterial?.dispose?.());

    public setDepthTexture(texture: unknown): void {
      void texture;
    }
  }

  class EffectComposer {
    public autoRenderToScreen = true;
    public readonly inputBuffer = { samples: 4 };
    public readonly outputBuffer = { samples: 4 };
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
    public readonly options: unknown;
    public readonly passes: Array<Record<string, unknown> & { dispose?: () => void }> = [];
    public readonly addPass = vi.fn((pass: Record<string, unknown> & { dispose?: () => void }) => {
      if (this.autoRenderToScreen) {
        const previous = this.passes.at(-1);
        if (previous) {
          previous['renderToScreen'] = false;
        }
        pass['renderToScreen'] = true;
      }
      this.passes.push(pass);
      if (pass['needsDepthTexture'] === true) {
        (pass['setDepthTexture'] as ((texture: unknown) => void) | undefined)?.({ kind: 'stable-depth' });
      }
    });
    public readonly dispose = vi.fn(() => {
      for (const pass of this.passes) {
        pass.dispose?.();
      }
    });
    public readonly screenRenderFlags: boolean[] = [];
    public readonly renderedCameras: unknown[] = [];
    public readonly renderedAoCameras: unknown[][] = [];
    public readonly render = vi.fn(() => {
      this.screenRenderFlags.push(this.passes.some((pass) => pass['renderToScreen'] === true));
      this.renderedCameras.push(this.passes[0]?.['camera']);
      this.renderedAoCameras.push(
        this.passes
          .filter((pass) => pass['configuration'] !== undefined && pass['enabled'] === true)
          .map((pass) => pass['camera']),
      );
      if (this.passes[0]?.['camera'] === mocks.getFailWarmupCamera()) {
        throw new Error('warmup failed');
      }
    });
    public readonly setSize = vi.fn();

    public constructor(_renderer: unknown, options: unknown) {
      this.options = options;
      mocks.composers.push(this);
    }
  }

  class RenderPass {
    public readonly dispose = vi.fn();
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
    public camera: unknown;

    public constructor(_scene: unknown, camera: unknown) {
      this.camera = camera;
      mocks.renderPasses.push(this);
    }

    public get mainCamera(): unknown {
      return this.camera;
    }

    public set mainCamera(camera: unknown) {
      this.camera = camera;
    }
  }

  class EffectPass extends Pass {}

  class ToneMappingEffect {
    public mode = 'aces';
    public readonly blendMode = { blendFunction: 'src', opacity: { value: 1 } };

    public constructor(options: { blendFunction?: string }) {
      this.blendMode.blendFunction = options.blendFunction ?? 'src';
      mocks.toneMappingEffects.push(this);
    }
  }

  return {
    EffectComposer,
    EffectPass,
    Pass,
    RenderPass,
    ToneMappingEffect,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- exact upstream enum keys.
    BlendFunction: { NORMAL: 'normal' },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- exact upstream enum keys.
    ToneMappingMode: { ACES_FILMIC: 'aces', NEUTRAL: 'neutral', LINEAR: 'linear' },
  };
});

vi.mock('#components/geometry/graphics/three/n8ao-pass.js', () => ({
  ManagedN8AoPass: class N8AoPostPass {
    public enabled = true;
    public needsSwap = true;
    public readonly configurationWrites = vi.fn();
    public readonly configuration = new Proxy<Record<string, unknown>>(
      {},
      {
        set: (target, key, value: unknown) => {
          this.configurationWrites(key, value);
          return Reflect.set(target, key, value);
        },
      },
    );
    public readonly dispose = vi.fn();
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
    public readonly camera: unknown;

    public constructor(_scene: unknown, camera: unknown) {
      this.camera = camera;
      if (camera === mocks.getFailCamera()) {
        throw new Error('AO construction failed');
      }
      mocks.aoPasses.push(this);
    }
  },
}));

const mount = async () => {
  const { PostProcessingWebGL: PostProcessingWebGl } =
    await import('#components/geometry/graphics/three/post-processing-webgl.js');
  return render(<PostProcessingWebGl />);
};

describe('PostProcessingWebGL shared composer and retained camera AO passes', () => {
  beforeEach(() => {
    mocks.aoPasses.length = 0;
    mocks.composers.length = 0;
    mocks.clearDepth.mockClear();
    mocks.glRender.mockClear();
    mocks.invalidate.mockClear();
    mocks.renderPasses.length = 0;
    mocks.toneMappingEffects.length = 0;
    mocks.getPixelRatio.mockReturnValue(2);
    mocks.viewport.dpr = 2;
    mocks.rig.activeCamera = mocks.perspectiveCamera;
    mocks.setFailCamera(undefined);
    mocks.setFailWarmupCamera(undefined);
    mocks.setFrame(undefined);
    mocks.setRestoreDepth(undefined);
    mocks.setRetarget(undefined);
    mocks.size.width = 800;
    mocks.size.height = 600;
    mocks.state.camera = mocks.perspectiveCamera;
    mocks.state.scene = mocks.scene;
    mocks.setRenderTarget.mockClear();
  });

  it('prewarms both camera-specific AO passes on one composer offscreen, then restores perspective', async () => {
    await mount();

    expect(mocks.composers).toHaveLength(1);
    expect(mocks.renderPasses.map(({ camera }) => camera)).toEqual([mocks.perspectiveCamera]);
    expect(mocks.aoPasses.map(({ camera }) => camera)).toEqual([mocks.perspectiveCamera, mocks.orthographicCamera]);
    expect(mocks.composers[0]!.renderedCameras).toEqual([mocks.perspectiveCamera, mocks.orthographicCamera]);
    expect(mocks.composers[0]!.renderedAoCameras).toEqual([[mocks.perspectiveCamera], [mocks.orthographicCamera]]);
    expect(mocks.composers[0]!.passes).toHaveLength(6);
    expect(mocks.composers.every(({ passes }) => passes[1]?.['needsDepthTexture'] === true)).toBe(true);
    expect(mocks.composers[0]!.screenRenderFlags).toEqual([false, false]);
    expect(mocks.composers[0]!.passes[5]?.['renderToScreen']).toBe(true);
    expect(mocks.aoPasses.map(({ enabled }) => enabled)).toEqual([true, false]);
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' }, 2, 1);
  });

  it('restores the initial orthographic camera and its AO after warming both projections', async () => {
    mocks.rig.activeCamera = mocks.orthographicCamera;
    mocks.state.camera = mocks.orthographicCamera;
    await mount();

    expect(mocks.composers).toHaveLength(1);
    expect(mocks.renderPasses[0]!.camera).toBe(mocks.orthographicCamera);
    expect(mocks.aoPasses.map(({ enabled }) => enabled)).toEqual([false, true]);
    expect(mocks.composers[0]!.screenRenderFlags).toEqual([false, false]);
  });

  it('keeps screen-space occlusion attenuation positive for the active camera', async () => {
    await mount();

    for (const { configuration } of mocks.aoPasses) {
      expect(configuration['screenSpaceRadius']).toBe(true);
      expect(configuration['distanceFalloff']).toBe(0.2);
      expect(configuration['aoRadius']).toBe(20);
      expect(configuration['denoiseRadius']).toBe(6);
      expect(configuration['intensity']).toBe(3);
    }
    expect(mocks.toneMappingEffects.every(({ mode }) => mode === 'neutral')).toBe(true);
  });

  it('updates AO diagnostics and tone mapping on the retained production composers', async () => {
    const mounted = await mount();
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    mocks.invalidate.mockClear();
    mounted.rerender(
      <PostProcessingWebGl
        settings={{
          radiusCssPixels: 7,
          webglDenoiseRadiusCssPixels: 6,
          intensity: 1.5,
          distanceFalloff: 0.4,
          displayMode: 'ao',
          toneMapping: 'neutral',
        }}
      />,
    );
    expect(mocks.composers).toHaveLength(1);
    for (const { configuration } of mocks.aoPasses) {
      expect(configuration).toMatchObject({
        aoRadius: 14,
        denoiseRadius: 12,
        intensity: 1.5,
        distanceFalloff: 0.4,
        renderMode: 1,
      });
    }
    expect(mocks.toneMappingEffects.every(({ mode }) => mode === 'neutral')).toBe(true);
    expect(mocks.invalidate).toHaveBeenCalled();
    mounted.rerender(<PostProcessingWebGl settings={{ displayMode: 'no-ao', toneMapping: 'none' }} />);
    expect(mocks.aoPasses.every(({ configuration }) => configuration['renderMode'] === 2)).toBe(true);
    expect(mocks.toneMappingEffects.every(({ blendMode }) => blendMode.opacity.value === 0)).toBe(true);
    expect(mocks.composers).toHaveLength(1);
  });

  it('keeps AO in CSS pixels when DPR changes without a CSS resize', async () => {
    const mounted = await mount();
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    mocks.getPixelRatio.mockReturnValue(1);
    mocks.viewport.dpr = 1;
    mounted.rerender(<PostProcessingWebGl />);
    expect(mocks.aoPasses.every(({ configuration }) => configuration['aoRadius'] === 10)).toBe(true);
    expect(mocks.aoPasses.every(({ configuration }) => configuration['denoiseRadius'] === 3)).toBe(true);
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers[0]!.inputBuffer.samples).toBe(4);
    expect(mocks.composers[0]!.outputBuffer.samples).toBe(0);
  });

  it('should toggle half-resolution diagnostics without replacing the retained composer or changing the CSS radius', async () => {
    const mounted = await mount();
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    const composer = mocks.composers[0];
    expect(mocks.aoPasses[0]!.configuration).toMatchObject({ halfRes: false, aoRadius: 20 });
    mounted.rerender(<PostProcessingWebGl settings={{ webglHalfResolution: true }} />);
    expect(mocks.aoPasses[0]!.configuration).toMatchObject({ halfRes: true, aoRadius: 20 });
    mounted.rerender(<PostProcessingWebGl settings={{ webglHalfResolution: false }} />);
    expect(mocks.aoPasses[0]!.configuration).toMatchObject({ halfRes: false, aoRadius: 20 });
    expect(mocks.composers).toEqual([composer]);
    expect(composer!.dispose).not.toHaveBeenCalled();
  });

  it('bypasses AO execution while retaining the same tone-mapping composer', async () => {
    const mounted = await mount();
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    const toneMappingEffects = [...mocks.toneMappingEffects];
    mounted.rerender(<PostProcessingWebGl settings={{ aoEnabled: false, toneMapping: 'neutral' }} />);
    expect(mocks.aoPasses.every(({ enabled }) => !enabled)).toBe(true);
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.toneMappingEffects).toEqual(toneMappingEffects);
    expect(mocks.toneMappingEffects.every(({ mode }) => mode === 'neutral')).toBe(true);
    mounted.rerender(<PostProcessingWebGl settings={{ aoEnabled: true, toneMapping: 'neutral' }} />);
    expect(mocks.aoPasses.map(({ enabled }) => enabled)).toEqual([true, false]);
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 0)).toBe(true);
  });

  it('should retain HDR precision before tone mapping', async () => {
    await mount();

    for (const { options } of mocks.composers) {
      expect(options).toMatchObject({ frameBufferType: HalfFloatType });
    }
  });

  it('should compose display AO after tone mapping and bypass tone mapping for the raw AO diagnostic', async () => {
    const mounted = await mount();
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    mounted.rerender(<PostProcessingWebGl settings={{ aoCompositeStage: 'display' }} />);
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.toneMappingEffects.every(({ blendMode }) => blendMode.blendFunction === 'normal')).toBe(true);
    expect(mocks.toneMappingEffects.map(({ blendMode }) => blendMode.opacity.value)).toEqual([1, 0]);
    expect(mocks.composers[0]!.passes[2]?.['enabled']).toBe(true);
    expect(mocks.aoPasses.every(({ needsSwap }) => !needsSwap)).toBe(true);
    mounted.rerender(<PostProcessingWebGl settings={{ aoCompositeStage: 'display', displayMode: 'ao' }} />);
    expect(mocks.composers[0]!.passes[2]?.['enabled']).toBe(false);
    expect(mocks.aoPasses.every(({ needsSwap }) => needsSwap)).toBe(true);
    expect(mocks.toneMappingEffects.map(({ blendMode }) => blendMode.opacity.value)).toEqual([1, 0]);
    mounted.rerender(<PostProcessingWebGl settings={{ aoCompositeStage: 'scene', displayMode: 'ao' }} />);
    expect(mocks.toneMappingEffects.at(-1)?.blendMode.opacity.value).toBe(0);
    mounted.rerender(<PostProcessingWebGl settings={{ aoCompositeStage: 'scene' }} />);
    expect(mocks.composers[0]!.passes[2]?.['enabled']).toBe(false);
    expect(mocks.toneMappingEffects.at(-1)?.blendMode.opacity.value).toBe(1);
    expect(mocks.aoPasses.every(({ needsSwap }) => needsSwap)).toBe(true);
    mounted.rerender(<PostProcessingWebGl settings={{ aoCompositeStage: 'display', displayMode: 'no-ao' }} />);
    expect(mocks.aoPasses.every(({ needsSwap }) => !needsSwap)).toBe(true);
    mounted.rerender(<PostProcessingWebGl settings={{ aoCompositeStage: 'display', aoEnabled: false }} />);
    expect(mocks.aoPasses.every(({ enabled }) => !enabled)).toBe(true);
    expect(mocks.composers[0]!.inputBuffer.samples).toBe(4);
    expect(mocks.composers[0]!.outputBuffer.samples).toBe(0);
  });

  it('restores the selected composer depth directly to canvas without replaying the scene', async () => {
    await mount();
    mocks.glRender.mockClear();
    mocks.setRenderTarget.mockClear();

    mocks.getRestoreDepth()?.();

    expect(mocks.setRenderTarget).toHaveBeenNthCalledWith(1, null);
    expect(mocks.clearDepth).toHaveBeenCalledOnce();
    expect(mocks.glRender).toHaveBeenCalledOnce();
    expect(mocks.glRender.mock.calls[0]![0]).toEqual({ kind: 'fullscreen-scene' });
    expect(mocks.glRender).not.toHaveBeenCalledWith(mocks.scene, expect.anything());
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' });
  });

  it('writes depth with the test enabled, because WebGL drops writes while it is off', async () => {
    await mount();

    const material = mocks.composers[0]!.passes[1]!['fullscreenMaterial'] as {
      colorWrite: boolean;
      depthTest: boolean;
      depthFunc: number;
      depthWrite: boolean;
    };
    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(AlwaysDepth);
  });

  it("stamps that same depth into a caller's own target", async () => {
    // The emphasis coverage mask depth-tests inside its own target; it asks the one owner of the
    // frame's depth for it rather than re-rasterising the scene.
    await mount();
    const maskTarget = { kind: 'mask-target' };
    mocks.setRenderTarget.mockClear();

    mocks.getRestoreDepth()?.(maskTarget);

    expect(mocks.setRenderTarget).toHaveBeenNthCalledWith(1, maskTarget);
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' });
  });

  it('restores the previous render target when the depth draw fails', async () => {
    await mount();
    mocks.glRender.mockImplementationOnce(() => {
      throw new Error('depth draw failed');
    });

    expect(() => mocks.getRestoreDepth()?.()).toThrow('depth draw failed');
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' });
  });

  it('switches projections without new buffers, warmup draws or AO shader configuration', async () => {
    await mount();
    const configurations = mocks.aoPasses.map(({ configuration }) => ({ ...configuration }));
    for (const { configurationWrites } of mocks.aoPasses) {
      configurationWrites.mockClear();
    }
    for (const composer of mocks.composers) {
      composer.render.mockClear();
      composer.setSize.mockClear();
    }

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.composers[0]!.render).toHaveBeenCalledOnce();

    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera);
      mocks.state.camera = mocks.orthographicCamera;
    });
    expect(mocks.composers[0]!.render).toHaveBeenCalledOnce();
    expect(mocks.renderPasses[0]!.camera).toBe(mocks.orthographicCamera);
    expect(mocks.aoPasses.map(({ enabled }) => enabled)).toEqual([false, true]);
    mocks.getFrame()?.(mocks.state, 0);

    expect(mocks.composers[0]!.render).toHaveBeenCalledTimes(2);
    expect(mocks.composers[0]!.renderedAoCameras.at(-1)).toEqual([mocks.orthographicCamera]);
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 0)).toBe(true);
    expect(mocks.glRender).not.toHaveBeenCalled();
    for (let index = 0; index < 20; index += 1) {
      act(() => {
        mocks.getRetarget()?.(mocks.perspectiveCamera);
        mocks.getRetarget()?.(mocks.orthographicCamera);
      });
    }
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers[0]!.render).toHaveBeenCalledTimes(2);
    expect(mocks.composers[0]!.setSize).not.toHaveBeenCalled();
    expect(mocks.aoPasses.map(({ camera }) => camera)).toEqual([mocks.perspectiveCamera, mocks.orthographicCamera]);
    expect(mocks.aoPasses.map(({ configuration }) => configuration)).toEqual(configurations);
    expect(mocks.aoPasses.every(({ configurationWrites }) => configurationWrites.mock.calls.length === 0)).toBe(true);
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 0)).toBe(true);
  });

  it('updates shared size and both camera settings before selecting a different projection', async () => {
    const mounted = await mount();
    for (const composer of mocks.composers) {
      composer.setSize.mockClear();
    }

    mocks.size.width = 1200;
    mocks.size.height = 700;
    mocks.getPixelRatio.mockReturnValue(1);
    mocks.viewport.dpr = 1;
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    mounted.rerender(
      <PostProcessingWebGl
        settings={{ aoEnabled: false, radiusCssPixels: 7, displayMode: 'ao', toneMapping: 'none' }}
      />,
    );
    expect(mocks.composers).toHaveLength(1);
    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera);
    });

    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers.every(({ setSize }) => setSize.mock.calls.at(-1)?.[0] === 1200)).toBe(true);
    expect(mocks.composers[0]!.setSize).toHaveBeenCalledExactlyOnceWith(1200, 700);
    expect(mocks.aoPasses[1]!.configuration).toMatchObject({ aoRadius: 7, renderMode: 1 });
    expect(mocks.aoPasses[1]!.enabled).toBe(false);
    expect(mocks.toneMappingEffects[0]!.blendMode.opacity.value).toBe(0);
  });

  it('keeps direct rendering when endpoint resource construction fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.setFailCamera(mocks.perspectiveCamera);
    await mount();

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    expect(error).toHaveBeenCalledOnce();
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.renderPasses[0]!.dispose).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('cleans partial construction when the second AO pass fails and does not retry during camera updates', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.setFailCamera(mocks.orthographicCamera);
    const mounted = await mount();
    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera);
      mocks.getRetarget()?.(mocks.orthographicCamera);
      mocks.getRetarget()?.(mocks.perspectiveCamera);
    });
    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.aoPasses[0]!.dispose).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    mocks.composers[0]!.render.mockClear();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.composers[0]!.render).not.toHaveBeenCalled();
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    mounted.unmount();
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    error.mockRestore();
  });

  it.each([
    { camera: mocks.perspectiveCamera, rendered: [false] },
    { camera: mocks.orthographicCamera, rendered: [false, false] },
  ])('restores all caller state when the $camera.kind AO warmup fails', async ({ camera, rendered }) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.setFailWarmupCamera(camera);
    const mounted = await mount();

    expect(mocks.composers).toHaveLength(1);
    expect(mocks.composers[0]!.screenRenderFlags).toEqual(rendered);
    expect(mocks.composers[0]!.passes[5]?.['renderToScreen']).toBe(true);
    expect(mocks.renderPasses[0]!.camera).toBe(mocks.perspectiveCamera);
    expect(mocks.aoPasses.map(({ enabled }) => enabled)).toEqual([true, false]);
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' }, 2, 1);
    expect(error).toHaveBeenCalledOnce();
    mounted.unmount();
    expect(mocks.composers[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.aoPasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    error.mockRestore();
  });

  it('replaces and prewarms the one owner when the scene changes, with current settings and size', async () => {
    const mounted = await mount();
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    const firstComposer = mocks.composers[0]!;
    mocks.state.scene = { isScene: true };
    mocks.size.width = 1200;
    mocks.size.height = 700;
    mocks.getPixelRatio.mockReturnValue(1);
    mocks.viewport.dpr = 1;
    mocks.rig.activeCamera = mocks.orthographicCamera;
    mounted.rerender(<PostProcessingWebGl settings={{ radiusCssPixels: 7, aoEnabled: false }} />);

    expect(mocks.composers).toHaveLength(2);
    expect(firstComposer.dispose).toHaveBeenCalledOnce();
    expect(mocks.composers[1]!.dispose).not.toHaveBeenCalled();
    expect(mocks.composers[1]!.setSize).toHaveBeenCalledExactlyOnceWith(1200, 700);
    expect(mocks.composers[1]!.screenRenderFlags).toEqual([false, false]);
    expect(mocks.composers[1]!.renderedAoCameras).toEqual([[], []]);
    expect(mocks.aoPasses.slice(2).every(({ configuration }) => configuration['aoRadius'] === 7)).toBe(true);
    expect(mocks.renderPasses[1]!.camera).toBe(mocks.orthographicCamera);
    mounted.unmount();
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.aoPasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });

  it('disposes all retained resources on unmount', async () => {
    const mounted = await mount();
    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera);
    });
    mounted.unmount();

    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.renderPasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.aoPasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });
});
