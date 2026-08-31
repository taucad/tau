import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  const scene = { isScene: true };
  const invalidate = vi.fn();
  const glRender = vi.fn();
  const clearDepth = vi.fn();
  const getRenderTarget = vi.fn(() => ({ kind: 'prior-target' }));
  const setRenderTarget = vi.fn();
  const gl = { clearDepth, getRenderTarget, render: glRender, setRenderTarget };
  const size = { width: 800, height: 600 };
  const state = { gl, scene, camera: perspectiveCamera, invalidate, size };
  const rig = { perspectiveCamera, orthographicCamera, activeCamera: perspectiveCamera };

  let frame:
    | ((state: { gl: typeof gl; scene: typeof scene; camera: typeof perspectiveCamera }, delta: number) => void)
    | undefined;
  let retarget: ((camera: typeof perspectiveCamera) => void) | undefined;
  let restoreDepth: (() => void) | undefined;
  let failCamera: unknown;
  const composers: Array<{
    autoRenderToScreen: boolean;
    addPass: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    passes: Array<Record<string, unknown>>;
  }> = [];
  const renderPasses: Array<{ camera: unknown; dispose: ReturnType<typeof vi.fn> }> = [];
  const aoPasses: Array<{
    camera: unknown;
    configuration: Record<string, unknown>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    aoPasses,
    clearDepth,
    composers,
    getFailCamera: () => failCamera,
    getFrame: () => frame,
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
    mocks.setRetarget(callback);
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
    public fullscreenMaterial: { dispose?: () => void } | undefined;
    public readonly dispose = vi.fn(() => this.fullscreenMaterial?.dispose?.());

    public setDepthTexture(texture: unknown): void {
      void texture;
    }
  }

  class EffectComposer {
    public autoRenderToScreen = true;
    public readonly passes: Array<Record<string, unknown> & { dispose?: () => void }> = [];
    public readonly addPass = vi.fn((pass: Record<string, unknown> & { dispose?: () => void }) => {
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
    public readonly render = vi.fn();
    public readonly setSize = vi.fn();

    public constructor(_renderer: unknown, _options: unknown) {
      mocks.composers.push(this);
    }
  }

  class RenderPass {
    public readonly dispose = vi.fn();
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
    public readonly camera: unknown;

    public constructor(_scene: unknown, camera: unknown) {
      this.camera = camera;
      mocks.renderPasses.push(this);
    }
  }

  return { EffectComposer, Pass, RenderPass };
});

vi.mock('n8ao', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- exact upstream module export.
  N8AOPostPass: class N8AoPostPass {
    public readonly configuration: Record<string, unknown> = {};
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

describe('PostProcessingWebGL retained endpoint composers', () => {
  beforeEach(() => {
    mocks.aoPasses.length = 0;
    mocks.composers.length = 0;
    mocks.clearDepth.mockClear();
    mocks.glRender.mockClear();
    mocks.invalidate.mockClear();
    mocks.renderPasses.length = 0;
    mocks.rig.activeCamera = mocks.perspectiveCamera;
    mocks.setFailCamera(undefined);
    mocks.setFrame(undefined);
    mocks.setRestoreDepth(undefined);
    mocks.setRetarget(undefined);
    mocks.size.width = 800;
    mocks.size.height = 600;
    mocks.state.camera = mocks.perspectiveCamera;
    mocks.setRenderTarget.mockClear();
  });

  it('builds and warms exactly two endpoint composers', async () => {
    await mount();

    expect(mocks.composers).toHaveLength(2);
    expect(mocks.renderPasses.map(({ camera }) => camera)).toEqual([mocks.perspectiveCamera, mocks.orthographicCamera]);
    expect(mocks.aoPasses.map(({ camera }) => camera)).toEqual([mocks.perspectiveCamera, mocks.orthographicCamera]);
    expect(mocks.composers.every(({ render }) => render.mock.calls.length === 1)).toBe(true);
    expect(mocks.composers.every(({ passes }) => passes.length === 3)).toBe(true);
    expect(mocks.composers.every(({ passes }) => passes[1]?.['needsDepthTexture'] === true)).toBe(true);
  });

  it('restores the selected composer depth directly to canvas without replaying the scene', async () => {
    await mount();
    mocks.glRender.mockClear();

    mocks.getRestoreDepth()?.();

    expect(mocks.setRenderTarget).toHaveBeenNthCalledWith(1, null);
    expect(mocks.clearDepth).toHaveBeenCalledOnce();
    expect(mocks.glRender).toHaveBeenCalledOnce();
    expect(mocks.glRender.mock.calls[0]![0]).toEqual({ kind: 'fullscreen-scene' });
    expect(mocks.glRender).not.toHaveBeenCalledWith(mocks.scene, expect.anything());
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

  it('switches composers without construction, disposal, or a blank frame', async () => {
    await mount();
    for (const composer of mocks.composers) {
      composer.render.mockClear();
    }

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.composers[0]!.render).toHaveBeenCalledOnce();

    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera);
      mocks.state.camera = mocks.orthographicCamera;
    });
    mocks.getFrame()?.(mocks.state, 0);

    expect(mocks.composers[1]!.render).toHaveBeenCalledOnce();
    expect(mocks.composers).toHaveLength(2);
    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 0)).toBe(true);
    expect(mocks.glRender).not.toHaveBeenCalled();
  });

  it('resizes the retained composers without replacing them', async () => {
    const mounted = await mount();
    for (const composer of mocks.composers) {
      composer.setSize.mockClear();
    }

    mocks.size.width = 1200;
    mocks.size.height = 700;
    const { PostProcessingWebGL: PostProcessingWebGl } =
      await import('#components/geometry/graphics/three/post-processing-webgl.js');
    mounted.rerender(<PostProcessingWebGl />);

    expect(mocks.composers).toHaveLength(2);
    expect(mocks.composers.every(({ setSize }) => setSize.mock.calls.at(-1)?.[0] === 1200)).toBe(true);
  });

  it('keeps direct rendering when endpoint resource construction fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.setFailCamera(mocks.orthographicCamera);
    await mount();

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('disposes all retained resources on unmount', async () => {
    const mounted = await mount();
    mounted.unmount();

    expect(mocks.composers.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.renderPasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.aoPasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });
});
