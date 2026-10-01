import { act, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { NeutralToneMapping } from 'three';
import type { PostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';
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
  const outputQuads: Array<{
    endpointCamera: unknown;
    material: { fragmentNode?: unknown };
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
    outputQuads,
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
  useRenderFrame: () => mocks.rig.renderFrame,
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
    public fragmentNode: unknown;
    public dispose = vi.fn();
  }

  class QuadMesh {
    public readonly camera = { kind: 'quad-camera' };
    public readonly endpointCamera = mocks.takeConstructionCamera();
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
    public readonly material: NodeMaterial;
    public readonly render = vi.fn((renderer: typeof mocks.gl): void => {
      // An output graph renders its endpoint's scene pass nested inside its own render.
      if (this.material.fragmentNode !== undefined) {
        const scenePass = mocks.scenePasses.find(({ camera }) => camera === this.endpointCamera);
        (scenePass?.updateBefore as (() => void) | undefined)?.();
      }
      renderer.render(this, this.camera);
    });

    public constructor(material: NodeMaterial) {
      this.material = material;
      // Output quads carry a fragment graph; the depth-restore quad only a depth node.
      if (material.fragmentNode !== undefined) {
        material.dispose = mocks.postDispose;
        mocks.outputQuads.push(this);
      }
    }
  }

  class RenderTarget {
    public dispose = vi.fn();
  }

  return { NodeMaterial, QuadMesh, RenderTarget, UnsignedByteType: 1009 };
});

const endpointProperties = { aoAllowed: true, toneMapping: NeutralToneMapping } as const;

const mount = async (properties: { aoAllowed?: boolean; settings?: Partial<PostProcessingSettings> } = {}) => {
  const { PostProcessingWebGPU: PostProcessingWebGpu } =
    await import('#components/geometry/graphics/three/post-processing-webgpu.js');
  return render(<PostProcessingWebGpu {...endpointProperties} {...properties} />);
};

const isBeautyOnly = ({ material }: { material: { fragmentNode?: unknown } }): boolean =>
  (material.fragmentNode as { color?: unknown }).color === mocks.colorNode;

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
    mocks.glRender.mockReset();
    mocks.gl.isWebGPURenderer = true;
    mocks.getCurrentViewport.mockClear();
    mocks.invalidate.mockClear();
    mocks.normalNode.sample.mockClear();
    mocks.normalTexture.type = 0;
    mocks.pass.mockClear();
    mocks.outputQuads.length = 0;
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

  it('should prepare only the active beauty endpoint when AO is disabled', async () => {
    await mount({ aoAllowed: false });
    expect(mocks.pass).toHaveBeenCalledTimes(1);
    expect(mocks.pass).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera);
    expect(mocks.ao).not.toHaveBeenCalled();
    expect(mocks.scenePasses[0]!.setMRT).not.toHaveBeenCalled();
    expect(mocks.compileAsync).not.toHaveBeenCalled();
    expect(mocks.glRender).not.toHaveBeenCalled();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.outputQuads[0]!.render).toHaveBeenCalledOnce();
    expect(isBeautyOnly(mocks.outputQuads[0]!)).toBe(true);
  });

  it('should create the other projection only on demand and reuse it on return', async () => {
    await mount({ aoAllowed: false });
    act(() => mocks.getRetarget()?.(mocks.orthographicCamera, mocks.snapshot));
    expect(mocks.pass).toHaveBeenCalledTimes(1);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.pass).toHaveBeenCalledTimes(2);
    expect(mocks.outputQuads[1]!.endpointCamera).toBe(mocks.orthographicCamera);
    expect(mocks.outputQuads[1]!.render).toHaveBeenCalledOnce();
    act(() => mocks.getRetarget()?.(mocks.perspectiveCamera, mocks.snapshot));
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.pass).toHaveBeenCalledTimes(2);
    expect(mocks.outputQuads[0]!.render).toHaveBeenCalledOnce();
  });

  it('restores the selected scene-pass depth with one direct fullscreen draw', async () => {
    await mount({ aoAllowed: false });
    mocks.getFrame()?.(mocks.state, 0);
    mocks.glRender.mockClear();
    mocks.getRestoreDepth()?.();
    expect(mocks.glRender).toHaveBeenCalledOnce();
    expect(mocks.clearDepth).not.toHaveBeenCalled();
    expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
    expect(mocks.gl.getMRT()).toBeNull();
  });

  it('should restore the target when depth submission throws', async () => {
    await mount({ aoAllowed: false });
    mocks.glRender.mockImplementationOnce(() => {
      throw new Error('draw failed');
    });
    expect(() => mocks.getRestoreDepth()?.()).toThrow('draw failed');
    expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
  });

  it('keeps beauty ahead of AO dependencies and preserves its alpha in the AO visualization', async () => {
    await mount();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.aoNodes).toHaveLength(1);
    const composed = mocks.outputQuads.find((quad) => !isBeautyOnly(quad));
    expect(composed?.material.fragmentNode).toMatchObject({
      beauty: { kind: 'display-composed-color', color: { kind: 'composed-color' } },
      aoOnly: [{ kind: 'ao-r' }, { kind: 'scene-alpha' }],
    });
    expect(mocks.scenePasses[0]!.setMRT).toHaveBeenCalledWith({
      output: { kind: 'output' },
      normal: { kind: 'normal-view' },
    });
    expect(mocks.normalTexture.type).toBe(1009);
    expect(mocks.aoNodes[0]).toMatchObject({
      resolutionScale: 0.5,
      useTemporalFiltering: false,
      samples: { value: 8 },
    });
    expect(mocks.aoNodes[0]!.radius.value).toBeCloseTo(0.3605551275, 9);
    expect(mocks.updateAoCamera).toHaveBeenCalledOnce();
  });

  it('updates AO output and estimator uniforms without rebuilding the production graph', async () => {
    const mounted = await mount();
    const { PostProcessingWebGPU: PostProcessingWebGpu } =
      await import('#components/geometry/graphics/three/post-processing-webgpu.js');
    mounted.rerender(
      <PostProcessingWebGpu
        {...endpointProperties}
        settings={{ gtaoIntensity: 2, gtaoDistanceFalloff: 0.4, displayMode: 'ao', aoCompositeStage: 'display' }}
      />,
    );
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.pass).toHaveBeenCalledTimes(1);
    expect(mocks.aoNodes[0]!.scale.value).toBe(2);
    expect(mocks.aoNodes[0]!.distanceFallOff.value).toBe(0.4);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([1, 1]);
  });

  it('should replace and dispose AO resources on toggles while beauty-only owns no AO graph', async () => {
    const mounted = await mount({ aoAllowed: false });
    const { PostProcessingWebGPU: PostProcessingWebGpu } =
      await import('#components/geometry/graphics/three/post-processing-webgpu.js');
    mounted.rerender(<PostProcessingWebGpu {...endpointProperties} />);
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.aoNodes).toHaveLength(1);
    mounted.rerender(<PostProcessingWebGpu {...endpointProperties} settings={{ displayMode: 'no-ao' }} />);
    expect(mocks.aoDispose).toHaveBeenCalledOnce();
    expect(mocks.aoNodes).toHaveLength(1);
    expect(mocks.scenePasses[2]!.setMRT).not.toHaveBeenCalled();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.outputQuads.at(-1)!.render).toHaveBeenCalledOnce();
  });

  it('should tone-map the scene once in linear light and leave the sRGB encode to the output pass', async () => {
    await mount({ aoAllowed: false });
    expect(mocks.renderOutput).toHaveBeenCalledOnce();
    expect(mocks.renderOutput).toHaveBeenCalledWith(mocks.colorNode, NeutralToneMapping, 'srgb-linear');
  });

  it('should dispose every demanded endpoint once on unmount', async () => {
    const mounted = await mount();
    act(() => mocks.getRetarget()?.(mocks.orthographicCamera, mocks.snapshot));
    mocks.getFrame()?.(mocks.state, 0);
    mounted.unmount();
    for (const pass of mocks.scenePasses) {
      expect(pass.dispose).toHaveBeenCalledOnce();
    }
    expect(mocks.aoDispose).toHaveBeenCalledTimes(2);
    expect(mocks.postDispose).toHaveBeenCalledTimes(4);
  });

  it('should release partial resources when graph construction fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.ao.mockImplementationOnce(() => {
      throw new Error('AO failed');
    });
    const mounted = await mount();
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.postDispose).toHaveBeenCalledOnce();
    mounted.unmount();
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('does not construct resources for a non-WebGPU renderer', async () => {
    mocks.gl.isWebGPURenderer = false;
    await mount();
    expect(mocks.pass).not.toHaveBeenCalled();
    mocks.gl.isWebGPURenderer = true;
  });
});
