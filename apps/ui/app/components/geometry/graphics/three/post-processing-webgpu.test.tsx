import { act, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockCameraSnapshot = { view: { target: [number, number, number] } };
type MockAoNode = {
  resolutionScale: number;
  useTemporalFiltering: boolean;
  radius: { value: number };
  thickness: { value: number };
  samples: { value: number };
  distanceFallOff: { value: number };
  getTextureNode: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  const scene = { isScene: true };
  const invalidate = vi.fn();
  const glRender = vi.fn();
  const clearDepth = vi.fn();
  const compileAsync = vi.fn(async () => undefined);
  const getRenderTarget = vi.fn(() => ({ kind: 'prior-target' }));
  const setRenderTarget = vi.fn();
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API property.
  const gl = { clearDepth, compileAsync, getRenderTarget, isWebGPURenderer: true, render: glRender, setRenderTarget };
  const getCurrentViewport = vi.fn((camera: unknown) => ({
    height: camera === perspectiveCamera ? 20 : 40,
    width: 20,
  }));
  const state = {
    gl,
    scene,
    camera: perspectiveCamera,
    invalidate,
    size: { width: 1500, height: 1000 },
    viewport: { getCurrentViewport },
  };
  const rig = {
    perspectiveCamera,
    orthographicCamera,
    activeCamera: perspectiveCamera,
    renderFrame: { anchorFrameId: 'tau:root', originMeters: [10, 20, 30], metersPerRenderUnit: 0.001 },
  };
  const snapshot: MockCameraSnapshot = { view: { target: [10.01, 20.02, 30.03] } };

  let frame:
    | ((
        state: { gl: typeof gl; scene: typeof scene; camera: typeof perspectiveCamera; invalidate: typeof invalidate },
        delta: number,
      ) => void)
    | undefined;
  let retarget: ((camera: typeof perspectiveCamera, snapshot: MockCameraSnapshot) => void) | undefined;
  let restoreDepth: (() => void) | undefined;
  let constructionCamera: unknown;
  const compileSettlers: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const scenePasses: Array<{
    camera: unknown;
    compileAsync: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getTexture: ReturnType<typeof vi.fn>;
    getTextureNode: ReturnType<typeof vi.fn>;
    setMRT: ReturnType<typeof vi.fn>;
  }> = [];
  const pipelineInstances: Array<{ camera: unknown; outputNode?: unknown; render: ReturnType<typeof vi.fn> }> = [];
  const aoNodes: MockAoNode[] = [];
  const postDispose = vi.fn();
  const aoDispose = vi.fn();

  const depthNode = { kind: 'depth', sample: vi.fn(() => ({ kind: 'sampled-depth' })) };
  const normalNode = { sample: vi.fn(() => ({ kind: 'normal-sample' })) };
  const colorNode = { mul: vi.fn(() => ({ kind: 'composed-color' })) };
  const aoTexture = { sample: vi.fn(() => ({ r: { kind: 'ao-r' } })) };
  const normalTexture = { type: 0 };

  const pass = vi.fn((_scene: unknown, camera: unknown) => {
    constructionCamera = camera;
    const scenePass = {
      camera,
      compileAsync: vi.fn(
        async () =>
          new Promise<void>((resolve, reject) => {
            compileSettlers.push({ resolve, reject });
          }),
      ),
      dispose: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API method.
      setMRT: vi.fn(),
      getTexture: vi.fn(() => normalTexture),
      getTextureNode: vi.fn((name: string) => {
        if (name === 'depth') {
          return depthNode;
        }
        if (name === 'normal') {
          return normalNode;
        }
        return colorNode;
      }),
    };
    scenePasses.push(scenePass);
    return scenePass;
  });

  const ao = vi.fn((): MockAoNode => {
    const node: MockAoNode = {
      resolutionScale: 1,
      useTemporalFiltering: true,
      radius: { value: 0 },
      thickness: { value: 0 },
      samples: { value: 0 },
      distanceFallOff: { value: 0 },
      getTextureNode: vi.fn(() => aoTexture),
      dispose: aoDispose,
    };
    aoNodes.push(node);
    return node;
  });

  return {
    ao,
    aoDispose,
    aoNodes,
    aoTexture,
    clearDepth,
    colorNode,
    compileAsync,
    compileSettlers,
    depthNode,
    getFrame: () => frame,
    getCurrentViewport,
    getRetarget: () => retarget,
    getRestoreDepth: () => restoreDepth,
    gl,
    glRender,
    invalidate,
    normalNode,
    normalTexture,
    orthographicCamera,
    pass,
    perspectiveCamera,
    pipelineInstances,
    postDispose,
    rig,
    scene,
    snapshot,
    scenePasses,
    state,
    setFrame: (callback: typeof frame) => {
      frame = callback;
    },
    setRetarget: (callback: typeof retarget) => {
      retarget = callback;
      callback?.(rig.activeCamera, snapshot);
    },
    setRestoreDepth: (callback: typeof restoreDepth) => {
      restoreDepth = callback;
    },
    setRenderTarget,
    takeConstructionCamera: () => constructionCamera,
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
  useCameraRetarget: (callback: (camera: typeof mocks.perspectiveCamera, snapshot: typeof mocks.snapshot) => void) => {
    useLayoutEffect(() => {
      mocks.setRetarget(callback);
    }, [callback]);
  },
}));

vi.mock('#components/geometry/graphics/three/scene-overlay.js', () => ({
  useOverlayDepthRestore: (callback: () => void) => {
    mocks.setRestoreDepth(callback);
  },
}));

vi.mock('three/addons/tsl/display/GTAONode.js', () => ({ ao: mocks.ao }));

vi.mock('three/tsl', () => ({
  colorToDirection: vi.fn((value: unknown): unknown => value),
  directionToColor: vi.fn((value: unknown): unknown => value),
  mrt: vi.fn((value: unknown): unknown => value),
  normalView: { kind: 'normal-view' },
  output: { kind: 'output' },
  pass: mocks.pass,
  sample: vi.fn((mapper: unknown) => ({ mapper })),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js TSL export.
  screenUV: { kind: 'screen-uv' },
  vec3: vi.fn((value: unknown): unknown => value),
  vec4: vi.fn((...values: unknown[]): unknown[] => values),
}));

vi.mock('three/webgpu', () => {
  class NodeMaterial {
    public colorWrite = true;
    public depthNode: unknown;
    public depthTest = true;
    public depthWrite = false;
    public readonly dispose = vi.fn();
  }

  class QuadMesh {
    public readonly camera = { kind: 'quad-camera' };
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
    public readonly material: NodeMaterial;
    public constructor(material: NodeMaterial) {
      this.material = material;
    }
    public render(renderer: typeof mocks.gl): void {
      renderer.render(this, this.camera);
    }
  }

  class RenderPipeline {
    public outputNode: unknown;
    public readonly camera = mocks.takeConstructionCamera();
    public readonly render = vi.fn();

    public constructor(_renderer: unknown) {
      mocks.pipelineInstances.push(this);
    }

    public dispose(): void {
      mocks.postDispose();
    }
  }

  return { NodeMaterial, QuadMesh, RenderPipeline, UnsignedByteType: 1009 };
});

const mount = async () => {
  const { PostProcessingWebGPU: PostProcessingWebGpu } =
    await import('#components/geometry/graphics/three/post-processing-webgpu.js');
  return render(<PostProcessingWebGpu />);
};

const settleBothCompiles = async (): Promise<void> => {
  await act(async () => {
    for (const settler of mocks.compileSettlers) {
      settler.resolve();
    }
    await Promise.resolve();
  });
};

describe('PostProcessingWebGPU retained endpoint pipelines', () => {
  beforeEach(() => {
    mocks.ao.mockClear();
    mocks.aoDispose.mockClear();
    mocks.aoNodes.length = 0;
    mocks.aoTexture.sample.mockClear();
    mocks.clearDepth.mockClear();
    mocks.colorNode.mul.mockClear();
    mocks.compileAsync.mockClear();
    mocks.compileSettlers.length = 0;
    mocks.glRender.mockClear();
    mocks.getCurrentViewport.mockClear();
    mocks.invalidate.mockClear();
    mocks.normalNode.sample.mockClear();
    mocks.normalTexture.type = 0;
    mocks.pass.mockClear();
    mocks.pipelineInstances.length = 0;
    mocks.postDispose.mockClear();
    mocks.rig.activeCamera = mocks.perspectiveCamera;
    mocks.state.camera = mocks.perspectiveCamera;
    mocks.state.size.height = 1000;
    mocks.scenePasses.length = 0;
    mocks.setFrame(undefined);
    mocks.setRetarget(undefined);
    mocks.setRestoreDepth(undefined);
    mocks.setRenderTarget.mockClear();
  });

  it('builds and warms both native camera graphs before publishing post-processing', async () => {
    await mount();

    expect(mocks.pass).toHaveBeenCalledTimes(2);
    expect(mocks.pass).toHaveBeenNthCalledWith(1, mocks.scene, mocks.perspectiveCamera);
    expect(mocks.pass).toHaveBeenNthCalledWith(2, mocks.scene, mocks.orthographicCamera);
    expect(mocks.pipelineInstances.map(({ camera }) => camera)).toEqual([
      mocks.perspectiveCamera,
      mocks.orthographicCamera,
    ]);
    expect(mocks.scenePasses.every(({ compileAsync }) => compileAsync.mock.calls.length === 1)).toBe(true);
    expect(mocks.compileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).not.toHaveBeenCalled();

    await settleBothCompiles();
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it('restores the selected scene-pass depth with one direct fullscreen draw', async () => {
    await mount();
    await settleBothCompiles();
    mocks.glRender.mockClear();

    mocks.getRestoreDepth()?.();

    expect(mocks.setRenderTarget).toHaveBeenNthCalledWith(1, null);
    expect(mocks.clearDepth).toHaveBeenCalledOnce();
    expect(mocks.glRender).toHaveBeenCalledOnce();
    const { QuadMesh } = await import('three/webgpu');
    expect(mocks.glRender.mock.calls[0]![0]).toBeInstanceOf(QuadMesh);
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' });
  });

  it('restores the previous render target when the depth draw fails', async () => {
    await mount();
    await settleBothCompiles();
    mocks.glRender.mockImplementationOnce(() => {
      throw new Error('depth draw failed');
    });

    expect(() => mocks.getRestoreDepth()?.()).toThrow('depth draw failed');
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' });
  });

  it('keeps one priority-1 direct render alive while both graphs warm', async () => {
    await mount();

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    expect(mocks.pipelineInstances.every(({ render }) => render.mock.calls.length === 0)).toBe(true);
  });

  it('switches endpoint pipelines without teardown or a blank frame', async () => {
    await mount();
    await settleBothCompiles();

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.pipelineInstances[0]!.render).toHaveBeenCalledOnce();

    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera, mocks.snapshot);
      mocks.state.camera = mocks.orthographicCamera;
    });
    mocks.getFrame()?.(mocks.state, 0);

    expect(mocks.pipelineInstances[1]!.render).toHaveBeenCalledOnce();
    expect(mocks.pass).toHaveBeenCalledTimes(2);
    expect(mocks.postDispose).not.toHaveBeenCalled();
    expect(mocks.glRender).not.toHaveBeenCalled();
  });

  it('keeps direct rendering after warm-up failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await mount();
    await act(async () => {
      mocks.compileSettlers[0]!.reject(new Error('compile failed'));
      mocks.compileSettlers[1]!.resolve();
      await Promise.resolve();
    });

    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('retains the single-MRT GTAO configuration for both graphs', async () => {
    await mount();

    expect(mocks.ao).toHaveBeenCalledTimes(2);
    expect(mocks.normalTexture.type).toBe(1009);
    for (const aoNode of mocks.aoNodes) {
      expect(aoNode.resolutionScale).toBe(0.5);
      expect(aoNode.useTemporalFiltering).toBe(false);
      expect(aoNode.samples.value).toBe(8);
    }
    expect(mocks.aoNodes.map(({ radius }) => radius.value)).toEqual([0.48, 0.96]);
    expect(mocks.aoNodes.map(({ thickness }) => thickness.value)).toEqual([0.48 / 0.09, 0.96 / 0.09]);
  });

  it('updates both retained endpoint uniforms after viewport and camera retargeting without reconstruction', async () => {
    await mount();
    await settleBothCompiles();
    const { aoNodes } = mocks;

    mocks.state.size.height = 500;
    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera, mocks.snapshot);
    });

    expect(aoNodes.map(({ radius }) => radius.value)).toEqual([0.96, 1.92]);
    expect(mocks.pass).toHaveBeenCalledTimes(2);
  });

  it('disposes both endpoint resources once on unmount, including pending warm-up', async () => {
    const { unmount } = await mount();
    unmount();

    expect(mocks.postDispose).toHaveBeenCalledTimes(2);
    expect(mocks.aoDispose).toHaveBeenCalledTimes(2);
    expect(mocks.scenePasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    await settleBothCompiles();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('does not construct resources for a non-WebGPU renderer', async () => {
    mocks.gl.isWebGPURenderer = false;
    await mount();
    expect(mocks.pass).not.toHaveBeenCalled();
    mocks.gl.isWebGPURenderer = true;
  });
});
