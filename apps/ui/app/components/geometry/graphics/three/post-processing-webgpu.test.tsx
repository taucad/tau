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
  scale: { value: number };
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
  const compileSettlers: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const compileAsync = vi.fn(
    async () =>
      new Promise<void>((resolve, reject) => {
        compileSettlers.push({ resolve, reject });
      }),
  );
  const rendererState = { target: { kind: 'prior-target' } as unknown, mrt: null as unknown };
  const getRenderTarget = vi.fn(() => rendererState.target);
  const setRenderTarget = vi.fn((target: unknown) => {
    rendererState.target = target;
  });
  const getMrt = vi.fn(() => rendererState.mrt);
  const setMrt = vi.fn((value: unknown) => {
    rendererState.mrt = value;
  });
  const gl = {
    clearDepth,
    compileAsync,
    getRenderTarget,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API property.
    getMRT: getMrt,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API property.
    isWebGPURenderer: true,
    render: glRender,
    reversedDepthBuffer: true,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API property.
    setMRT: setMrt,
    setRenderTarget,
  };
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
    viewport: { getCurrentViewport, dpr: 2 },
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
  let restoreDepth: ((target?: unknown) => void) | undefined;
  let constructionCamera: unknown;
  const scenePasses: Array<{
    camera: unknown;
    compileAsync: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getTexture: ReturnType<typeof vi.fn>;
    getTextureNode: ReturnType<typeof vi.fn>;
    setMRT: ReturnType<typeof vi.fn>;
    setup: ReturnType<typeof vi.fn>;
    updateBefore: ReturnType<typeof vi.fn>;
  }> = [];
  const pipelineInstances: Array<{
    camera: unknown;
    outputNode?: unknown;
    outputColorTransform?: boolean;
    render: ReturnType<typeof vi.fn>;
  }> = [];
  const aoNodes: MockAoNode[] = [];
  const displayUniforms: Array<{ value: number }> = [];
  const postDispose = vi.fn();
  const aoDispose = vi.fn();

  const depthNode = { kind: 'depth', sample: vi.fn(() => ({ kind: 'sampled-depth' })) };
  const normalNode = { sample: vi.fn(() => ({ kind: 'normal-sample' })) };
  const colorNode = { a: { kind: 'scene-alpha' }, mul: vi.fn(() => ({ kind: 'composed-color' })) };
  const renderOutput = vi.fn((color: unknown, toneMapping: unknown, colorSpace: unknown) => ({
    color,
    toneMapping,
    colorSpace,
    mul: (factor: unknown) => ({ kind: 'display-composed-color', color, factor }),
  }));
  const aoTexture = { sample: vi.fn(() => ({ r: { kind: 'ao-r' } })) };
  const normalTexture = { type: 0 };
  const prewarm = vi.fn();
  const updateAoCamera = vi.fn();
  const createGtaoCameraAdapter = vi.fn((camera: unknown) => ({ camera, update: updateAoCamera }));

  const pass = vi.fn((_scene: unknown, camera: unknown) => {
    constructionCamera = camera;
    const scenePass = {
      camera,
      compileAsync: vi.fn(async () => {
        const previousMrt = rendererState.mrt;
        const previousTarget = rendererState.target;
        rendererState.mrt = { camera };
        rendererState.target = { camera };
        await new Promise<void>((resolve, reject) => {
          compileSettlers.push({ resolve, reject });
        });
        rendererState.mrt = previousMrt;
        rendererState.target = previousTarget;
      }),
      setup: vi.fn(),
      updateBefore: vi.fn(() => {
        const previousMrt = rendererState.mrt;
        const previousTarget = rendererState.target;
        rendererState.mrt = { camera };
        rendererState.target = { camera };
        prewarm();
        rendererState.mrt = previousMrt;
        rendererState.target = previousTarget;
      }),
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
      scale: { value: 0 },
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
    createGtaoCameraAdapter,
    depthNode,
    displayUniforms,
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
    prewarm,
    postDispose,
    rig,
    scene,
    snapshot,
    scenePasses,
    rendererState,
    renderOutput,
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
    updateAoCamera,
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
vi.mock('#components/geometry/graphics/three/gtao-depth-camera.js', () => ({
  createGtaoCameraAdapter: mocks.createGtaoCameraAdapter,
}));

vi.mock('three/tsl', () => ({
  colorToDirection: vi.fn((value: unknown): unknown => value),
  directionToColor: vi.fn((value: unknown): unknown => value),
  float: vi.fn((value: number) => value),
  mrt: vi.fn((value: unknown): unknown => value),
  mix: vi.fn((beauty: unknown, aoOnly: unknown, factor: unknown) => ({ beauty, aoOnly, factor })),
  normalView: { kind: 'normal-view' },
  output: { kind: 'output' },
  pass: mocks.pass,
  renderOutput: mocks.renderOutput,
  sample: vi.fn((mapper: unknown) => ({ mapper })),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js TSL export.
  screenUV: { kind: 'screen-uv' },
  vec3: vi.fn((value: unknown): unknown => value),
  vec4: vi.fn((...values: unknown[]): unknown[] => values),
  uniform: vi.fn((value: number) => {
    const node = { value, equal: (other: number) => ({ other }) };
    mocks.displayUniforms.push(node);
    return node;
  }),
  select: vi.fn((condition: unknown, ifTrue: unknown, ifFalse: unknown) => ({ condition, ifTrue, ifFalse })),
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
    mocks.createGtaoCameraAdapter.mockClear();
    mocks.compileSettlers.length = 0;
    mocks.displayUniforms.length = 0;
    mocks.glRender.mockClear();
    mocks.getCurrentViewport.mockClear();
    mocks.invalidate.mockClear();
    mocks.normalNode.sample.mockClear();
    mocks.normalTexture.type = 0;
    mocks.pass.mockClear();
    mocks.pipelineInstances.length = 0;
    mocks.prewarm.mockReset();
    mocks.updateAoCamera.mockClear();
    mocks.rendererState.mrt = null;
    mocks.renderOutput.mockClear();
    mocks.rendererState.target = { kind: 'prior-target' };
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
      mocks.perspectiveCamera,
      mocks.orthographicCamera,
      mocks.orthographicCamera,
    ]);
    expect(
      mocks.scenePasses.every(
        ({ setup, updateBefore }) => setup.mock.calls.length === 1 && updateBefore.mock.calls.length === 1,
      ),
    ).toBe(true);
    expect(mocks.scenePasses.every(({ compileAsync }) => compileAsync.mock.calls.length === 0)).toBe(true);
    expect(mocks.compileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).not.toHaveBeenCalled();

    await settleBothCompiles();
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it('restores MRT and target before asynchronous compile work or a fallback frame can observe them', async () => {
    await mount();
    expect(mocks.gl.getMRT()).toBeNull();
    expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
    expect(mocks.compileSettlers).toHaveLength(2);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.gl.getMRT()).toBeNull();
    await settleBothCompiles();
    expect(mocks.gl.getMRT()).toBeNull();
    expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
  });

  it('restores MRT and target when synchronous scene prewarm throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.prewarm.mockImplementationOnce(() => {
      throw new Error('scene prewarm failed');
    });
    await mount();
    expect(mocks.gl.getMRT()).toBeNull();
    expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
    expect(mocks.compileSettlers).toHaveLength(0);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('restores the selected scene-pass depth with one direct fullscreen draw', async () => {
    await mount();
    await settleBothCompiles();
    mocks.glRender.mockClear();
    mocks.setRenderTarget.mockClear();

    mocks.getRestoreDepth()?.();

    expect(mocks.setRenderTarget).toHaveBeenNthCalledWith(1, null);
    expect(mocks.clearDepth).toHaveBeenCalledOnce();
    expect(mocks.glRender).toHaveBeenCalledOnce();
    const { QuadMesh } = await import('three/webgpu');
    expect(mocks.glRender.mock.calls[0]![0]).toBeInstanceOf(QuadMesh);
    expect(mocks.setRenderTarget).toHaveBeenLastCalledWith({ kind: 'prior-target' });

    // The emphasis coverage mask depth-tests inside its own target and asks the same owner for it.
    const maskTarget = { kind: 'mask-target' };
    mocks.setRenderTarget.mockClear();
    mocks.getRestoreDepth()?.(maskTarget);
    expect(mocks.setRenderTarget).toHaveBeenNthCalledWith(1, maskTarget);
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

    expect(mocks.pipelineInstances[2]!.render).toHaveBeenCalledOnce();
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

  it('releases the first endpoint when construction of the second endpoint fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const createAo = mocks.ao.getMockImplementation()!;
    mocks.ao.mockImplementationOnce(createAo).mockImplementationOnce(() => {
      throw new Error('AO construction failed');
    });
    await mount();
    expect(mocks.scenePasses).toHaveLength(2);
    expect(mocks.scenePasses.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.postDispose).toHaveBeenCalledTimes(2);
    expect(mocks.aoDispose).toHaveBeenCalledOnce();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
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
      expect(aoNode.scale.value).toBe(1);
    }
    // 1% of a 1500×1000 CSS viewport is 18.027756… CSS pixels.
    expect(mocks.aoNodes[0]!.radius.value).toBeCloseTo(0.3605551275, 9);
    expect(mocks.aoNodes[1]!.radius.value).toBeCloseTo(0.7211102551, 9);
    expect(mocks.aoNodes[0]!.thickness.value).toBeCloseTo(4.006168084, 8);
    expect(mocks.aoNodes[1]!.thickness.value).toBeCloseTo(8.012336168, 8);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([0, 1, 0, 1]);
  });

  it('keeps beauty ahead of AO dependencies and preserves its alpha in the AO visualization', async () => {
    await mount();
    await settleBothCompiles();
    const composed = mocks.pipelineInstances.filter(({ outputNode }) => outputNode !== mocks.colorNode);
    for (const pipeline of composed) {
      expect(pipeline.outputNode).toMatchObject({
        toneMapping: 0,
        color: {
          beauty: { kind: 'display-composed-color', color: { kind: 'composed-color' } },
          aoOnly: [{ kind: 'ao-r' }, { kind: 'scene-alpha' }],
        },
      });
    }
    expect(mocks.createGtaoCameraAdapter).toHaveBeenCalledWith(mocks.perspectiveCamera, true);
    expect(mocks.createGtaoCameraAdapter).toHaveBeenCalledWith(mocks.orthographicCamera, true);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.updateAoCamera).toHaveBeenCalledOnce();
  });

  it('updates both retained endpoint uniforms after viewport and camera retargeting without reconstruction', async () => {
    await mount();
    await settleBothCompiles();
    const { aoNodes } = mocks;

    mocks.state.size.height = 500;
    act(() => {
      mocks.getRetarget()?.(mocks.orthographicCamera, mocks.snapshot);
    });

    expect(aoNodes[0]!.radius.value).toBeCloseTo(0.632455532, 9);
    expect(aoNodes[1]!.radius.value).toBeCloseTo(1.264911064, 9);
    expect(mocks.pass).toHaveBeenCalledTimes(2);
  });

  it('updates AO output and estimator uniforms without rebuilding the production graph', async () => {
    const mounted = await mount();
    await settleBothCompiles();
    const { PostProcessingWebGPU: PostProcessingWebGpu } =
      await import('#components/geometry/graphics/three/post-processing-webgpu.js');
    mocks.invalidate.mockClear();
    mounted.rerender(
      <PostProcessingWebGpu
        settings={{
          radiusCssPixels: 10,
          intensity: 0.5,
          gtaoIntensity: 1.5,
          gtaoDistanceFalloff: 0.4,
          displayMode: 'ao',
        }}
      />,
    );
    expect(mocks.pass).toHaveBeenCalledTimes(2);
    expect(mocks.aoNodes.map(({ radius }) => radius.value)).toEqual([0.2, 0.4]);
    for (const aoNode of mocks.aoNodes) {
      expect(aoNode.scale.value).toBe(1.5);
      expect(aoNode.distanceFallOff.value).toBe(0.4);
    }
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([1, 1, 1, 1]);
    expect(mocks.invalidate).toHaveBeenCalled();
    mounted.rerender(<PostProcessingWebGpu settings={{ displayMode: 'no-ao' }} />);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([2, 1, 2, 1]);
    expect(mocks.aoNodes.map(({ scale }) => scale.value)).toEqual([1, 1]);
    expect(mocks.pass).toHaveBeenCalledTimes(2);
  });

  it('should tone-map once before display AO and encode the raw AO diagnostic without exposure', async () => {
    const mounted = await mount();
    const { PostProcessingWebGPU: PostProcessingWebGpu } =
      await import('#components/geometry/graphics/three/post-processing-webgpu.js');
    mounted.rerender(<PostProcessingWebGpu settings={{ aoCompositeStage: 'display', displayMode: 'ao' }} />);
    expect(mocks.pipelineInstances.filter(({ outputColorTransform }) => outputColorTransform === false)).toHaveLength(
      2,
    );
    expect(mocks.renderOutput.mock.calls.filter(([, toneMapping]) => toneMapping === 0)).toHaveLength(2);
    expect(mocks.renderOutput.mock.calls.filter((call) => call[2] === 'srgb-linear')).toHaveLength(2);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([1, 1, 1, 1]);
    mounted.rerender(<PostProcessingWebGpu settings={{ aoCompositeStage: 'scene', displayMode: 'ao' }} />);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([1, 0, 1, 0]);
    expect(mocks.pipelineInstances).toHaveLength(4);
  });

  it('bypasses GTAO through a retained beauty-only graph sharing the same scene pass', async () => {
    const mounted = await mount();
    await settleBothCompiles();
    const { PostProcessingWebGPU: PostProcessingWebGpu } =
      await import('#components/geometry/graphics/three/post-processing-webgpu.js');
    const aoPipelines = mocks.pipelineInstances.filter(({ outputNode }) => outputNode !== mocks.colorNode);
    const beautyPipelines = mocks.pipelineInstances.filter(({ outputNode }) => outputNode === mocks.colorNode);
    expect(beautyPipelines).toHaveLength(2);
    mounted.rerender(<PostProcessingWebGpu settings={{ aoEnabled: false }} />);
    mocks.getFrame()?.(mocks.state, 0);
    expect(beautyPipelines[0]!.render).toHaveBeenCalledOnce();
    expect(aoPipelines.every(({ render }) => render.mock.calls.length === 0)).toBe(true);
    mounted.rerender(<PostProcessingWebGpu settings={{ aoEnabled: true }} />);
    mocks.getFrame()?.(mocks.state, 0);
    expect(aoPipelines[0]!.render).toHaveBeenCalledOnce();
    expect(mocks.pass).toHaveBeenCalledTimes(2);
    expect(mocks.pipelineInstances).toHaveLength(4);
    expect(mocks.postDispose).not.toHaveBeenCalled();
  });

  it('disposes both endpoint resources once on unmount, including pending warm-up', async () => {
    const { unmount } = await mount();
    unmount();

    expect(mocks.postDispose).toHaveBeenCalledTimes(4);
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
