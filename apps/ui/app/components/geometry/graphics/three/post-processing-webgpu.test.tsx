import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  const scene = { isScene: true };
  const invalidate = vi.fn();
  const glRender = vi.fn();
  const gl = { isWebGPURenderer: true, render: glRender };
  const state = { gl, scene, camera: perspectiveCamera, invalidate };
  const rig = {
    perspectiveCamera,
    orthographicCamera,
    activeCamera: perspectiveCamera,
  };

  let frame:
    | ((
        state: { gl: typeof gl; scene: typeof scene; camera: typeof perspectiveCamera; invalidate: typeof invalidate },
        delta: number,
      ) => void)
    | undefined;
  let retarget: ((camera: typeof perspectiveCamera) => void) | undefined;
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
  const postDispose = vi.fn();
  const aoDispose = vi.fn();

  const depthNode = { kind: 'depth' };
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
      setMRT: vi.fn(),
      getTexture: vi.fn(() => normalTexture),
      getTextureNode: vi.fn((name: string) => {
        if (name === 'depth') return depthNode;
        if (name === 'normal') return normalNode;
        return colorNode;
      }),
    };
    scenePasses.push(scenePass);
    return scenePass;
  });

  const ao = vi.fn(() => ({
    resolutionScale: 1,
    useTemporalFiltering: true,
    radius: { value: 0 },
    thickness: { value: 0 },
    samples: { value: 0 },
    distanceFallOff: { value: 0 },
    getTextureNode: vi.fn(() => aoTexture),
    dispose: aoDispose,
  }));

  return {
    ao,
    aoDispose,
    aoTexture,
    colorNode,
    compileSettlers,
    depthNode,
    getFrame: () => frame,
    getRetarget: () => retarget,
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
    scenePasses,
    state,
    setFrame: (callback: typeof frame) => {
      frame = callback;
    },
    setRetarget: (callback: typeof retarget) => {
      retarget = callback;
      callback?.(rig.activeCamera);
    },
    takeConstructionCamera: () => constructionCamera,
  };
});

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: Parameters<typeof mocks.setFrame>[0], priority: number) => {
    if (priority === 1) mocks.setFrame(callback);
  },
  useThree: () => mocks.state,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mocks.rig,
  useCameraRetarget: (callback: (camera: typeof mocks.perspectiveCamera) => void) => mocks.setRetarget(callback),
}));

vi.mock('three/addons/tsl/display/GTAONode.js', () => ({ ao: mocks.ao }));

vi.mock('three/tsl', () => ({
  colorToDirection: vi.fn((value) => value),
  directionToColor: vi.fn((value) => value),
  mrt: vi.fn((value) => value),
  normalView: { kind: 'normal-view' },
  output: { kind: 'output' },
  pass: mocks.pass,
  sample: vi.fn((mapper) => ({ mapper })),
  screenUV: { kind: 'screen-uv' },
  vec3: vi.fn((value) => value),
  vec4: vi.fn((...values) => values),
}));

vi.mock('three/webgpu', () => {
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

  return { RenderPipeline, UnsignedByteType: 1009 };
});

const mount = async () => {
  const { PostProcessingWebGPU } = await import('#components/geometry/graphics/three/post-processing-webgpu.js');
  return render(<PostProcessingWebGPU />);
};

const settleBothCompiles = async (): Promise<void> => {
  await act(async () => {
    for (const settler of mocks.compileSettlers) settler.resolve();
    await Promise.resolve();
  });
};

describe('PostProcessingWebGPU retained endpoint pipelines', () => {
  beforeEach(() => {
    mocks.ao.mockClear();
    mocks.aoDispose.mockClear();
    mocks.aoTexture.sample.mockClear();
    mocks.colorNode.mul.mockClear();
    mocks.compileSettlers.length = 0;
    mocks.glRender.mockClear();
    mocks.invalidate.mockClear();
    mocks.normalNode.sample.mockClear();
    mocks.normalTexture.type = 0;
    mocks.pass.mockClear();
    mocks.pipelineInstances.length = 0;
    mocks.postDispose.mockClear();
    mocks.rig.activeCamera = mocks.perspectiveCamera;
    mocks.state.camera = mocks.perspectiveCamera;
    mocks.scenePasses.length = 0;
    mocks.setFrame(undefined);
    mocks.setRetarget(undefined);
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
    expect(mocks.invalidate).not.toHaveBeenCalled();

    await settleBothCompiles();
    expect(mocks.invalidate).toHaveBeenCalledOnce();
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
      mocks.getRetarget()?.(mocks.orthographicCamera);
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
    for (const result of mocks.ao.mock.results) {
      const aoNode = result.value;
      expect(aoNode.resolutionScale).toBe(0.5);
      expect(aoNode.useTemporalFiltering).toBe(false);
      expect(aoNode.samples.value).toBe(8);
    }
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
