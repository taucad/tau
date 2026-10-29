import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { act, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import {
  UnsignedByteType,
  UnsignedInt248Type,
  DepthStencilFormat,
  HalfFloatType,
  RedFormat,
  NeutralToneMapping,
  NoToneMapping,
  SRGBColorSpace,
  LinearSRGBColorSpace,
  RenderTarget,
  Mesh,
} from 'three';
import type { ToneMapping, Vector2 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { PostProcessingSettings } from '#graphics/three/post-processing-settings.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockCameraSnapshot = { view: { target: [number, number, number] } };
type MockAoNode = {
  updateBefore: ReturnType<typeof vi.fn>;
  resolutionScale: number;
  useTemporalFiltering: boolean;
  radius: { value: number };
  thickness: { value: number };
  samples: { value: number };
  distanceFallOff: { value: number };
  scale: { value: number; greaterThan: (value: number) => unknown };
  getTextureNode: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  _noiseNode: { value: { dispose: ReturnType<typeof vi.fn> } };
};

const mocks = vi.hoisted(() => {
  const perspectiveCamera = {
    kind: 'perspective',
    isOrthographicCamera: false,
  };
  const orthographicCamera = {
    kind: 'orthographic',
    isOrthographicCamera: true,
  };
  const scene = {
    background: { kind: 'background' } as unknown,
    isScene: true,
    traverseVisible: vi.fn<(visit: (object: Mesh) => void) => void>(),
  };
  const invalidate = vi.fn();
  const glRender = vi.fn();
  const clearDepth = vi.fn();
  const compileSettlers: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  const compileAsync = vi.fn(
    async () =>
      new Promise<void>((resolve, reject) => {
        compileSettlers.push({ resolve, reject });
      }),
  );
  const rendererState = {
    target: { kind: 'prior-target' } as unknown,
    mrt: null as unknown,
    draw: null as ReturnType<WebGPURenderer['getRenderObjectFunction']>,
  };
  const getRenderTarget = vi.fn(() => rendererState.target);
  const setRenderTarget = vi.fn((target: unknown) => {
    rendererState.target = target;
  });
  const getMrt = vi.fn(() => rendererState.mrt);
  const setMrt = vi.fn((value: unknown) => {
    rendererState.mrt = value;
  });
  const gl = {
    domElement: undefined as HTMLCanvasElement | undefined,
    autoClearColor: true,
    coordinateSystem: 2001,
    autoClear: true,
    autoClearDepth: true,
    autoClearStencil: true,
    initRenderTarget: vi.fn(),
    outputColorSpace: 'srgb',
    toneMapping: 0,
    getDrawingBufferSize: (target: Vector2) => target.set(3000, 2000),
    clearDepth,
    compileAsync,
    getRenderTarget,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API property.
    getMRT: getMrt,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API property.
    isWebGPURenderer: true,
    render: glRender,
    renderObject: vi.fn<NonNullable<ReturnType<WebGPURenderer['getRenderObjectFunction']>>>(),
    getRenderObjectFunction: () => rendererState.draw,
    setRenderObjectFunction: (draw: typeof rendererState.draw) => {
      rendererState.draw = draw;
    },
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
        state: {
          gl: typeof gl;
          scene: typeof scene;
          camera: typeof perspectiveCamera;
          invalidate: typeof invalidate;
        },
        delta: number,
      ) => void)
    | undefined;
  let finalFrame: typeof frame;
  let edgeFrame: typeof frame;
  let retarget: ((camera: typeof perspectiveCamera, snapshot: MockCameraSnapshot) => void) | undefined;
  let restoreDepth: ((target?: unknown) => void) | undefined;
  let constructionCamera: unknown;
  const createSceneTarget = vi.fn<() => RenderTarget>();
  const scenePasses: Array<{
    camera: unknown;
    renderTarget: RenderTarget;
    compileAsync: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getTexture: (name: string) => { type: number; format: number };
    getTextureNode: ReturnType<typeof vi.fn>;
    setMRT: ReturnType<typeof vi.fn>;
    setup: ReturnType<typeof vi.fn>;
    updateBefore: ReturnType<typeof vi.fn>;
  }> = [];
  const outputQuads: Array<{
    endpointCamera: unknown;
    material: { fragmentNode?: unknown; depthWrite?: boolean };
    render: ReturnType<typeof vi.fn>;
  }> = [];
  const aoNodes: MockAoNode[] = [];
  const displayUniforms: Array<{ value: number }> = [];
  const postDispose = vi.fn();
  const antialiasDispose = vi.fn();
  const aoDispose = vi.fn();
  const noiseDispose = vi.fn();
  const retireTransmissionCopy = vi.fn();

  const depthNode = { kind: 'depth', sample: vi.fn(() => ({ kind: 'sampled-depth' })) };
  const normalNode = { sample: vi.fn(() => ({ kind: 'normal-sample' })) };
  const colorNode = {
    sample: vi.fn((): unknown => colorNode),
    a: { kind: 'scene-alpha' },
    mul: vi.fn(() => ({ kind: 'composed-color' })),
  };
  const renderOutput = vi.fn((color: unknown, toneMapping: unknown, colorSpace: unknown) => ({
    color,
    toneMapping,
    colorSpace,
    mul: (factor: unknown) => ({ kind: 'display-composed-color', color, factor }),
  }));
  const aoTexture = { sample: vi.fn(() => ({ r: { kind: 'ao-r' } })) };
  const normalTexture = { type: 0, format: 0 };
  const prewarm = vi.fn();
  const updateAoCamera = vi.fn();
  const createGtaoCameraAdapter = vi.fn((camera: unknown) => ({ camera, update: updateAoCamera }));

  const pass = vi.fn((_scene: unknown, camera: unknown) => {
    constructionCamera = camera;
    const depthTexture = { type: 0, format: 0 };
    const scenePass = {
      camera,
      renderTarget: createSceneTarget(),
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
      getTexture: vi.fn((name: string) => (name === 'depth' ? depthTexture : normalTexture)),
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
      updateBefore: vi.fn(),
      resolutionScale: 1,
      useTemporalFiltering: true,
      radius: { value: 0 },
      thickness: { value: 0 },
      samples: { value: 0 },
      distanceFallOff: { value: 0 },
      scale: { value: 0, greaterThan: (value: number) => ({ intensityAbove: value }) },
      getTextureNode: vi.fn(() => aoTexture),
      dispose: aoDispose,
      _noiseNode: { value: { dispose: noiseDispose } },
    };
    aoNodes.push(node);
    return node;
  });

  return {
    denoise: vi.fn(() => ({
      visibility: vi.fn(() => ({ kind: 'coarse-ao-r' })),
      upsample: vi.fn(() => ({ kind: 'denoised-ao-r' })),
      step: { value: { set: vi.fn() } },
      depthPhi: { value: 1 },
    })),
    ao,
    aoDispose,
    noiseDispose,
    aoNodes,
    aoTexture,
    clearDepth,
    colorNode,
    compileAsync,
    compileSettlers,
    createGtaoCameraAdapter,
    depthNode,
    displayUniforms,
    fxaa: vi.fn((value: unknown) => value),
    mix: vi.fn((beauty: unknown, aoOnly: unknown, factor: unknown) => ({ beauty, aoOnly, factor })),
    getFrame: () => frame,
    getFinalFrame: () => finalFrame,
    getEdgeFrame: () => edgeFrame,
    setEdgeFrame: (callback: typeof frame) => {
      edgeFrame = callback;
    },
    setFinalFrame: (callback: typeof frame) => {
      finalFrame = callback;
    },
    createSceneTarget,
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
    retireTransmissionCopy,
    perspectiveCamera,
    outputQuads,
    prewarm,
    postDispose,
    antialiasDispose,
    antialiasTargetDispose: vi.fn(),
    antialiasMaterialDispose: vi.fn(),
    antialiasTargetOptions: vi.fn(),
    denoiseSize: vi.fn(),
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
    switch (priority) {
      case 1: {
        mocks.setFrame(callback);
        break;
      }
      case 1.3: {
        mocks.setEdgeFrame(callback);
        break;
      }
      case 3.5: {
        mocks.setFinalFrame(callback);
        break;
      }
      default: {
        break;
      }
    }
  },
  useThree: () => mocks.state,
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => mocks.rig,
  useRenderFrame: () => mocks.rig.renderFrame,
  useCameraRetarget: (callback: (camera: typeof mocks.perspectiveCamera, snapshot: typeof mocks.snapshot) => void) => {
    useLayoutEffect(() => {
      mocks.setRetarget(callback);
    }, [callback]);
  },
}));

vi.mock('#graphics/three/scene-overlay.jsx', () => ({
  useOverlayDepthRestore: (callback: () => void) => {
    mocks.setRestoreDepth(callback);
  },
}));

vi.mock('#graphics/three/transmission-retirement.js', () => ({ retireTransmissionCopy: mocks.retireTransmissionCopy }));
vi.mock('#graphics/three/materials/line2.material.js', () => ({ Line2NodeMaterial: vi.fn() }));
vi.mock('#graphics/three/fxaa.js', () => ({ createViewportFxaa: mocks.fxaa }));
vi.mock('three/addons/tsl/display/GTAONode.js', () => ({ ao: mocks.ao }));
vi.mock('#graphics/three/ao-normal.js', () => ({
  encodeAoNormal: (normal: unknown) => normal,
  sampleAoNormal: (encoded: unknown) => encoded,
}));
vi.mock('#graphics/three/ao-denoise.js', () => ({ createAoDenoise: mocks.denoise }));
vi.mock('#graphics/three/gtao-depth-camera.js', () => ({
  createGtaoCameraAdapter: mocks.createGtaoCameraAdapter,
}));

vi.mock('three/tsl', () => ({
  texture: (value: unknown) => ({ kind: 'frame-texture', value }),
  colorSpaceToWorking: (value: unknown) => value,
  workingToColorSpace: (value: unknown) => value,
  // oxlint-disable-next-line eslint/max-params -- Match the native RTT factory signature.
  rtt: (value: Record<string, unknown>, width: unknown, height: unknown, options: unknown) => {
    mocks.antialiasTargetOptions(width, height, options);
    return Object.assign(value, {
      width,
      height,
      sample: vi.fn(() => ({ r: { kind: 'filtered-ao-r' } })),
      setSize: (nextWidth: number, nextHeight: number) => {
        mocks.denoiseSize(nextWidth, nextHeight);
        Object.assign(value, { width: nextWidth, height: nextHeight });
      },
      dispose: mocks.antialiasDispose,
      renderTarget: { dispose: mocks.antialiasTargetDispose },
      _quadMesh: { material: { dispose: mocks.antialiasMaterialDispose } },
    });
  },
  colorToDirection: vi.fn((value: unknown): unknown => value),
  directionToColor: vi.fn((value: unknown): unknown => value),
  float: vi.fn((value: number) => value),
  mrt: vi.fn((value: unknown): unknown => value),
  mix: mocks.mix,
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
      if (
        material.fragmentNode !== undefined &&
        (material.fragmentNode as { color?: { kind?: string } }).color?.kind !== 'frame-texture'
      ) {
        material.dispose = mocks.postDispose;
        mocks.outputQuads.push(this);
      }
    }
  }

  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's public node update enum.
    NodeUpdateType: { OBJECT: 'object' },
    NodeMaterial,
    QuadMesh,
    RenderTarget,
    UnsignedByteType: 1009,
    RendererUtils: {
      saveRendererState: (renderer: typeof mocks.gl) => ({
        target: renderer.getRenderTarget(),
        mrt: renderer.getMRT(),
        autoClear: renderer.autoClear,
      }),
      restoreRendererState: (
        renderer: typeof mocks.gl,
        saved: { target: unknown; mrt: unknown; autoClear: boolean },
      ) => {
        renderer.setRenderTarget(saved.target);
        renderer.setMRT(saved.mrt);
        renderer.autoClear = saved.autoClear;
      },
    },
  };
});

const endpointProperties = { aoAllowed: true, toneMapping: NeutralToneMapping } as const;

const mount = async (
  properties: {
    aoAllowed?: boolean;
    speculativePreparation?: boolean;
    antialiasAllowed?: boolean;
    settings?: Partial<PostProcessingSettings>;
    toneMapping?: ToneMapping;
  } = {},
) => {
  const { PostProcessingWebGPU: PostProcessingWebGpu } = await import('#graphics/three/post-processing-webgpu.jsx');
  return render(<PostProcessingWebGpu {...endpointProperties} {...properties} />);
};

const isBeautyOnly = ({ material }: { material: { fragmentNode?: unknown } }): boolean =>
  (material.fragmentNode as { color?: unknown }).color === mocks.colorNode;

describe('PostProcessingWebGPU active endpoint pipeline', () => {
  beforeEach(() => {
    mocks.createSceneTarget.mockImplementation(() => {
      const target = new RenderTarget(1, 1, { type: HalfFloatType });
      target.texture.colorSpace = LinearSRGBColorSpace;
      vi.spyOn(target, 'setSize');
      return target;
    });
    mocks.ao.mockClear();
    mocks.denoise.mockClear();
    mocks.fxaa
      .mockReset()
      .mockImplementation((value: unknown, sample?: (uv: unknown) => unknown) =>
        sample ? sample({ kind: 'screen-uv' }) : value,
      );
    mocks.mix.mockClear();
    mocks.denoiseSize.mockClear();
    mocks.aoDispose.mockClear();
    mocks.noiseDispose.mockClear();
    mocks.retireTransmissionCopy.mockClear();
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
    mocks.gl.autoClear = true;
    mocks.gl.autoClearDepth = true;
    mocks.gl.autoClearStencil = true;
    mocks.gl.initRenderTarget.mockClear();
    mocks.gl.coordinateSystem = 2001;
    mocks.getCurrentViewport.mockClear();
    mocks.invalidate.mockClear();
    mocks.normalNode.sample.mockClear();
    mocks.normalTexture.type = 0;
    mocks.normalTexture.format = 0;
    mocks.pass.mockClear();
    mocks.outputQuads.length = 0;
    mocks.prewarm.mockReset();
    mocks.updateAoCamera.mockClear();
    mocks.rendererState.mrt = null;
    mocks.rendererState.draw = null;
    mocks.gl.renderObject.mockReset();
    mocks.renderOutput.mockClear();
    mocks.rendererState.target = { kind: 'prior-target' };
    mocks.postDispose.mockClear();
    mocks.antialiasDispose.mockClear();
    mocks.antialiasTargetDispose.mockClear();
    mocks.antialiasMaterialDispose.mockClear();
    mocks.antialiasTargetOptions.mockClear();
    mocks.rig.activeCamera = mocks.perspectiveCamera;
    mocks.state.camera = mocks.perspectiveCamera;
    mocks.state.size.height = 1000;
    mocks.state.size.width = 1500;
    mocks.state.viewport.dpr = 2;
    mocks.scenePasses.length = 0;
    mocks.setFrame(undefined);
    mocks.setFinalFrame(undefined);
    mocks.setEdgeFrame(undefined);
    mocks.setRetarget(undefined);
    mocks.setRestoreDepth(undefined);
    mocks.setRenderTarget.mockClear();
  });

  it.each([false, true])(
    'should prepare offscreen once and restore camera and state after failure=%s',
    async (fails) => {
      vi.useFakeTimers();
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mocks.gl.domElement = document.createElement('canvas');
      const surface = new Mesh();
      mocks.scene.traverseVisible.mockImplementation((visit) => {
        visit(surface);
      });
      const mounted = await mount();
      try {
        const destination = mocks.gl.getRenderTarget();
        mocks.getFrame()?.(mocks.state, 0);
        mocks.getFinalFrame()?.(mocks.state, 0);
        const before = mocks.glRender.mock.calls.length;
        const composed = mocks.gl.initRenderTarget.mock.calls
          .map(([value]) => value as RenderTarget)
          .find((value) => value.texture.name === 'Tau composed surface');
        mocks.glRender.mockImplementationOnce(() => {
          expect(mocks.gl.getRenderTarget()).toBe(composed);
          expect(mocks.scenePasses[0]!.camera).toBe(mocks.orthographicCamera);
          mocks.gl.autoClearColor = false;
          mocks.gl.autoClearDepth = false;
          mocks.gl.autoClearStencil = false;
          mocks.gl.setMRT({ temporary: true });
          if (fails) {
            throw new Error('speculative draw failed');
          }
        });
        await act(() => vi.advanceTimersByTime(750));
        expect(mocks.glRender.mock.calls.length).toBe(before + (fails ? 1 : 2));
        expect(mocks.scenePasses[0]!.camera).toBe(mocks.perspectiveCamera);
        expect(mocks.gl.getRenderTarget()).toBe(destination);
        expect(mocks.gl.getMRT()).toBeNull();
        expect(mocks.gl.autoClearColor).toBe(true);
        expect(mocks.gl.autoClearDepth).toBe(true);
        expect(mocks.gl.autoClearStencil).toBe(true);
        expect(mocks.compileAsync).not.toHaveBeenCalled();
        mocks.getFrame()?.(mocks.state, 0);
        mocks.getFinalFrame()?.(mocks.state, 0);
        const after = mocks.glRender.mock.calls.length;
        await act(() => vi.advanceTimersByTime(1000));
        expect(mocks.glRender.mock.calls.length).toBe(after);
        expect(mocks.scenePasses).toHaveLength(1);
        expect(mocks.aoNodes).toHaveLength(1);
        expect(warning).toHaveBeenCalledTimes(fails ? 1 : 0);
      } finally {
        mounted.unmount();
        mocks.gl.domElement = undefined;
        mocks.scene.traverseVisible.mockReset();
        visibility.mockRestore();
        warning.mockRestore();
        vi.useRealTimers();
      }
    },
  );

  it('should build no AO graph and render nothing speculatively within a software adapter budget', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    mocks.gl.domElement = document.createElement('canvas');
    const surface = new Mesh();
    mocks.scene.traverseVisible.mockImplementation((visit) => {
      visit(surface);
    });
    mocks.fxaa.mockClear();
    const mounted = await mount({ aoAllowed: false, speculativePreparation: false, antialiasAllowed: false });
    try {
      expect(mocks.ao).not.toHaveBeenCalled();
      // The FXAA filter's shader alone takes a software adapter over thirty seconds to compile.
      expect(mocks.fxaa).not.toHaveBeenCalled();
      expect(mocks.denoise).not.toHaveBeenCalled();
      expect(mocks.scenePasses[0]!.setMRT).toHaveBeenCalledWith({ output: { kind: 'output' } });
      mocks.getFrame()?.(mocks.state, 0);
      mocks.getFinalFrame()?.(mocks.state, 0);
      const rendered = mocks.glRender.mock.calls.length;
      const requested = mocks.invalidate.mock.calls.length;
      // A quiet stage stays quiet: no alternate-camera render and no further frame requests.
      await act(() => vi.advanceTimersByTime(2000));
      expect(mocks.glRender.mock.calls.length).toBe(rendered);
      expect(mocks.invalidate.mock.calls.length).toBe(requested);
      expect(mocks.scenePasses[0]!.camera).toBe(mocks.perspectiveCamera);
      expect(mocks.scene.traverseVisible).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
      mocks.gl.domElement = undefined;
      mocks.scene.traverseVisible.mockReset();
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

  it('should filter a beauty-only composition with FXAA unless the rasterizer cannot afford it', async () => {
    const filtered = await mount({ aoAllowed: false });
    expect(mocks.fxaa).toHaveBeenCalledOnce();
    filtered.unmount();
    mocks.fxaa.mockClear();
    const unfiltered = await mount({ aoAllowed: false, antialiasAllowed: false });
    expect(mocks.fxaa).not.toHaveBeenCalled();
    unfiltered.unmount();
  });

  it.each([false, true])('should isolate CAD draws and restore renderer state after failure=%s', async (fails) => {
    const ownerDraw = vi.fn<NonNullable<ReturnType<WebGPURenderer['getRenderObjectFunction']>>>();
    mocks.gl.setRenderObjectFunction(ownerDraw);
    const mounted = await mount({ aoAllowed: false });
    const { background } = mocks.scene;
    mocks.getFrame()?.(mocks.state, 0);
    const target = mocks.gl.getRenderTarget();
    mocks.glRender.mockImplementationOnce(() => {
      expect(mocks.gl.getRenderTarget()).toBe(target);
      expect(mocks.gl.getRenderObjectFunction()).not.toBe(ownerDraw);
      expect(mocks.scene.background).toBeNull();
      expect(mocks.gl.autoClear).toBe(false);
      expect(mocks.gl.toneMapping).toBe(NoToneMapping);
      if (fails) {
        throw new Error('edge draw failed');
      }
    });
    const drawEdges = (): void => {
      mocks.getEdgeFrame()?.(mocks.state, 0);
    };
    if (fails) {
      expect(drawEdges).toThrow('edge draw failed');
    } else {
      drawEdges();
    }
    expect(mocks.gl.getRenderObjectFunction()).toBe(ownerDraw);
    expect(mocks.scene.background).toBe(background);
    expect(mocks.gl.getRenderTarget()).toBe(target);
    mocks.getFinalFrame()?.(mocks.state, 0);
    mocks.glRender.mockClear();
    drawEdges();
    expect(mocks.glRender).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it.each([2000, 2001])(
    'should reuse scene color with compact composition and precise depth on %s',
    async (coordinates) => {
      mocks.gl.coordinateSystem = coordinates;
      const mounted = await mount();
      mocks.getFrame()?.(mocks.state, 0);
      const target = mocks.gl.getRenderTarget() as RenderTarget;
      expect(target.texture).toBe(mocks.scenePasses[0]!.renderTarget.texture);
      const composed = mocks.gl.initRenderTarget.mock.calls
        .map(([value]) => value as RenderTarget)
        .find((value) => value.texture.name === 'Tau composed surface')!;
      expect(composed.texture.type).toBe(UnsignedByteType);
      expect(composed.texture.colorSpace).toBe(SRGBColorSpace);
      expect(target.depthTexture).toBe(composed.depthTexture);
      expect(target.depthTexture?.type).toBe(UnsignedInt248Type);
      expect(target.depthTexture?.format).toBe(DepthStencilFormat);
      expect(target.samples).toBe(0);
      expect(target.width).toBe(3000);
      expect(target.height).toBe(2000);
      mounted.unmount();
    },
  );

  it('should retain HDR frame storage for unbounded output and retire it on tone-map changes', async () => {
    const mounted = await mount({ toneMapping: NoToneMapping });
    mocks.getFrame()?.(mocks.state, 0);
    const previous = mocks.gl.getRenderTarget() as RenderTarget;
    const dispose = vi.spyOn(previous, 'dispose');
    expect(previous.texture.type).toBe(HalfFloatType);
    const { PostProcessingWebGPU: PostProcessingWebGpu } = await import('#graphics/three/post-processing-webgpu.jsx');
    mounted.rerender(<PostProcessingWebGpu {...endpointProperties} />);
    mocks.getFrame()?.(mocks.state, 0);
    const current = mocks.gl.getRenderTarget() as RenderTarget;
    expect(current).not.toBe(previous);
    expect(current.texture).toBe(mocks.scenePasses.at(-1)!.renderTarget.texture);
    const composed = mocks.gl.initRenderTarget.mock.calls
      .map(([value]) => value as RenderTarget)
      .findLast((value) => value.texture.name === 'Tau composed surface')!;
    expect(composed.texture.type).toBe(UnsignedByteType);
    expect(dispose).toHaveBeenCalledOnce();
    mounted.unmount();
  });

  it('should budget AO at half drawing-buffer resolution', async () => {
    const mounted = await mount();
    expect(mocks.antialiasTargetOptions).toHaveBeenCalledWith(1, 1, {
      type: HalfFloatType,
      format: RedFormat,
      depthBuffer: false,
      stencilBuffer: false,
    });
    expect(mocks.denoiseSize).toHaveBeenCalledWith(1500, 1000);
    expect(mocks.aoNodes[0]!.resolutionScale).toBe(0.5);
    mocks.denoiseSize.mockClear();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.denoiseSize).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('should keep AO active without multisampled scene attachments or a native-resolution AA intermediate', async () => {
    const mounted = await mount();
    expect(mocks.pass).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera, { samples: 0 });
    expect(mocks.antialiasTargetOptions).toHaveBeenCalledTimes(1);
    expect(mocks.fxaa).toHaveBeenCalledOnce();
    expect(mocks.denoise.mock.results[0]!.value.upsample).not.toHaveBeenCalled();
    expect(mocks.aoNodes[0]!.scale.value).toBeGreaterThan(0);
    mocks.getFrame()?.(mocks.state, 1 / 60);
    expect(mocks.updateAoCamera).toHaveBeenCalled();
    mounted.unmount();
    expect(mocks.antialiasTargetDispose).toHaveBeenCalledOnce();
  });

  it('should resize AO with CSS size and DPR without rebuilding the pipeline', async () => {
    mocks.state.size.width = 1501;
    mocks.state.size.height = 1001;
    mocks.state.viewport.dpr = 1;
    const mounted = await mount();
    expect(mocks.denoiseSize).toHaveBeenLastCalledWith(751, 501);
    expect(mocks.aoNodes[0]!.resolutionScale).toBe(0.5);
    mocks.denoiseSize.mockClear();
    mocks.state.viewport.dpr = 2;
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.aoNodes[0]!.resolutionScale).toBe(0.5);
    expect(mocks.denoiseSize).toHaveBeenLastCalledWith(1501, 1001);
    mocks.denoiseSize.mockClear();
    mocks.state.size.width = 2560;
    mocks.state.size.height = 1440;
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.denoiseSize).toHaveBeenCalledOnce();
    expect(mocks.denoiseSize).toHaveBeenLastCalledWith(2560, 1440);
    expect(mocks.pass).toHaveBeenCalledOnce();
    expect(mocks.aoNodes).toHaveLength(1);
    mounted.unmount();
  });

  it('should denoise contact visibility before compositing without allocating another noise texture', async () => {
    const mounted = await mount();
    expect(mocks.denoise).toHaveBeenCalledOnce();
    expect(mocks.denoise).toHaveBeenCalledWith({
      texture: mocks.aoTexture,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher.
      depth: expect.anything(),
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher.
      normal: expect.anything(),
      camera: mocks.perspectiveCamera,
    });
    const composed = mocks.outputQuads.find((quad) => !isBeautyOnly(quad));
    expect(composed?.material.fragmentNode).toMatchObject({
      aoOnly: [
        { condition: { intensityAbove: 0 }, ifTrue: { kind: 'filtered-ao-r' }, ifFalse: 1 },
        { kind: 'scene-alpha' },
      ],
    });
    expect(mocks.denoise.mock.results[0]!.value.step.value.set).toHaveBeenCalledWith(1 / 1500, 1 / 1000);
    mounted.unmount();
    expect(mocks.noiseDispose).toHaveBeenCalledOnce();
  });

  it('should prepare only the active beauty endpoint when AO is disabled', async () => {
    await mount({ aoAllowed: false });
    expect(mocks.pass).toHaveBeenCalledTimes(1);
    expect(mocks.pass).toHaveBeenCalledWith(mocks.scene, mocks.perspectiveCamera, { samples: 0 });
    expect(mocks.ao).not.toHaveBeenCalled();
    expect(mocks.denoise).not.toHaveBeenCalled();
    expect(mocks.scenePasses[0]!.setMRT).toHaveBeenCalledWith({
      output: { kind: 'output' },
    });
    expect(mocks.compileAsync).not.toHaveBeenCalled();
    expect(mocks.glRender).not.toHaveBeenCalled();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender.mock.calls.filter(([object]) => object === mocks.outputQuads[0])).toHaveLength(1);
    expect(isBeautyOnly(mocks.outputQuads[0]!)).toBe(true);
  });

  it('should retain scene depth for overlays without a final antialias target', async () => {
    await mount();
    expect(mocks.antialiasTargetOptions).not.toHaveBeenCalledWith(null, null, expect.anything());
    mocks.getFrame()?.(mocks.state, 0);
    mocks.glRender.mockClear();
    mocks.getRestoreDepth()?.();
    expect(mocks.glRender).not.toHaveBeenCalled();
  });

  it('should retarget one live graph and frame without rebuilding camera resources', async () => {
    const mounted = await mount();
    mocks.getFrame()?.(mocks.state, 0);
    const firstPass = mocks.scenePasses[0]!;
    const firstFrame = mocks.gl.getRenderTarget() as RenderTarget;
    const disposeFrame = vi.spyOn(firstFrame, 'dispose');
    mocks.getFinalFrame()?.(mocks.state, 0);
    for (const camera of [mocks.orthographicCamera, mocks.perspectiveCamera, mocks.orthographicCamera]) {
      act(() => mocks.getRetarget()?.(camera, mocks.snapshot));
      mocks.getFrame()?.(mocks.state, 0);
      expect(firstPass.camera).toBe(camera);
      expect(mocks.updateAoCamera).toHaveBeenLastCalledWith(camera);
      expect(mocks.gl.getRenderTarget()).toBe(firstFrame);
      mocks.getFinalFrame()?.(mocks.state, 0);
      expect(disposeFrame).not.toHaveBeenCalled();
      expect(firstPass.dispose).not.toHaveBeenCalled();
      expect(mocks.pass).toHaveBeenCalledOnce();
      expect(mocks.ao).toHaveBeenCalledOnce();
    }
    const outputs = firstPass.setMRT.mock.calls.map(([value]): unknown => value);
    expect(outputs).toHaveLength(4);
    expect(outputs[0]).toBe(outputs[2]);
    expect(outputs[1]).toBe(outputs[3]);
    expect(outputs[0]).not.toBe(outputs[1]);
    expect(mocks.compileAsync).not.toHaveBeenCalled();
    mounted.unmount();
    expect(disposeFrame).toHaveBeenCalledOnce();
    expect(firstPass.dispose).toHaveBeenCalledOnce();
    expect(mocks.antialiasTargetDispose).toHaveBeenCalledOnce();
    expect(mocks.noiseDispose).toHaveBeenCalledOnce();
  });

  it('restores the selected scene-pass depth with one direct fullscreen draw', async () => {
    await mount({ aoAllowed: false });
    mocks.glRender.mockClear();
    mocks.glRender.mockImplementationOnce(() => {
      expect(mocks.gl.autoClear).toBe(false);
    });
    mocks.getRestoreDepth()?.();
    expect(mocks.gl.autoClear).toBe(true);
    expect(mocks.glRender).toHaveBeenCalledOnce();
    expect(mocks.clearDepth).not.toHaveBeenCalled();
    expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
    expect(mocks.gl.getMRT()).toBeNull();
  });

  it.each([true, false])(
    'should restore the target and autoClear=%s when depth submission throws',
    async (autoClear) => {
      await mount({ aoAllowed: false });
      mocks.gl.autoClear = autoClear;
      mocks.glRender.mockImplementationOnce(() => {
        expect(mocks.gl.autoClear).toBe(false);
        throw new Error('draw failed');
      });
      expect(() => mocks.getRestoreDepth()?.()).toThrow('draw failed');
      expect(mocks.gl.autoClear).toBe(autoClear);
      expect(mocks.gl.getRenderTarget()).toEqual({ kind: 'prior-target' });
    },
  );

  it('keeps beauty ahead of AO dependencies and preserves its alpha in the AO visualization', async () => {
    await mount();
    expect(mocks.updateAoCamera).toHaveBeenCalledOnce();
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.aoNodes).toHaveLength(1);
    const composed = mocks.outputQuads.find((quad) => !isBeautyOnly(quad));
    expect(composed?.material.fragmentNode).toMatchObject({
      beauty: { kind: 'display-composed-color', color: { kind: 'composed-color' } },
      aoOnly: [
        { condition: { intensityAbove: 0 }, ifTrue: { kind: 'filtered-ao-r' }, ifFalse: 1 },
        { kind: 'scene-alpha' },
      ],
    });
    expect(mocks.scenePasses[0]!.setMRT).toHaveBeenCalledWith({
      output: { kind: 'output' },
      normal: { kind: 'normal-view' },
    });
    expect(mocks.normalTexture.type).toBe(1009);
    expect(mocks.normalTexture.format).toBe(1030);
    expect(mocks.aoNodes[0]).toMatchObject({
      resolutionScale: 0.5,
      useTemporalFiltering: false,
      samples: { value: 16 },
    });
    expect(mocks.aoNodes[0]!.scale.value).toBe(0.75);
    expect(mocks.aoNodes[0]!.radius.value).toBeCloseTo(0.3605551275, 9);
    expect(mocks.updateAoCamera).toHaveBeenCalledTimes(2);
  });

  it('uses hardware-filtered RGBA8 normals on the node WebGL2 backend', async () => {
    mocks.gl.coordinateSystem = 2000;
    await mount();
    expect(mocks.normalTexture.type).toBe(1009);
    expect(mocks.normalTexture.format).toBe(1023);
  });

  it('updates AO output and estimator uniforms without rebuilding the production graph', async () => {
    const mounted = await mount();
    const { PostProcessingWebGPU: PostProcessingWebGpu } = await import('#graphics/three/post-processing-webgpu.jsx');
    const invalidationsBeforeSettings = mocks.invalidate.mock.calls.length;
    mounted.rerender(
      <PostProcessingWebGpu
        {...endpointProperties}
        settings={{ gtaoIntensity: 2, gtaoDistanceFalloff: 0.4, displayMode: 'ao', aoCompositeStage: 'display' }}
      />,
    );
    // Demand rendering must receive current uniforms before the next frame is submitted.
    expect(mocks.aoNodes[0]!.scale.value).toBe(2);
    expect(mocks.aoNodes[0]!.distanceFallOff.value).toBe(0.4);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([1, 1]);
    expect(mocks.invalidate.mock.calls.length).toBeGreaterThan(invalidationsBeforeSettings);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.pass).toHaveBeenCalledTimes(1);
    expect(mocks.aoNodes[0]!.scale.value).toBe(2);
    expect(mocks.aoNodes[0]!.distanceFallOff.value).toBe(0.4);
    expect(mocks.displayUniforms.map(({ value }) => value)).toEqual([1, 1]);
  });

  it('should replace and dispose AO resources on toggles while beauty-only owns no AO graph', async () => {
    const mounted = await mount({ aoAllowed: false });
    const { PostProcessingWebGPU: PostProcessingWebGpu } = await import('#graphics/three/post-processing-webgpu.jsx');
    mounted.rerender(<PostProcessingWebGpu {...endpointProperties} />);
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.aoNodes).toHaveLength(1);
    mounted.rerender(<PostProcessingWebGpu {...endpointProperties} settings={{ displayMode: 'no-ao' }} />);
    expect(mocks.aoDispose).toHaveBeenCalledOnce();
    expect(mocks.antialiasTargetDispose).toHaveBeenCalledTimes(1);
    expect(mocks.antialiasMaterialDispose).toHaveBeenCalledTimes(1);
    expect(mocks.noiseDispose).toHaveBeenCalledOnce();
    expect(mocks.aoNodes).toHaveLength(1);
    expect(mocks.scenePasses[2]!.setMRT).toHaveBeenCalledWith({
      output: { kind: 'output' },
    });
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.glRender.mock.calls.filter(([object]) => object === mocks.outputQuads.at(-1))).toHaveLength(1);
  });

  it('should tone-map the scene once in linear light and leave the sRGB encode to the output pass', async () => {
    await mount({ aoAllowed: false });
    expect(mocks.renderOutput).toHaveBeenCalledTimes(2);
    expect(mocks.renderOutput).toHaveBeenCalledWith(mocks.colorNode, NeutralToneMapping, 'srgb-linear');
    expect(mocks.renderOutput).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'frame-texture' }),
      NoToneMapping,
      SRGBColorSpace,
    );
  });

  it('should share D24S8 on node WebGL2 and prepare all three views before drawing', async () => {
    mocks.gl.coordinateSystem = 2000;
    const mounted = await mount();
    const scenePass = mocks.scenePasses[0]!;
    mocks.prewarm.mockImplementation(() => {
      expect(mocks.gl.autoClearDepth).toBe(true);
      expect(mocks.gl.autoClearStencil).toBe(true);
    });
    mocks.glRender.mockImplementation(() => {
      expect(mocks.gl.autoClearDepth).toBe(false);
      expect(mocks.gl.autoClearStencil).toBe(false);
    });
    mocks.getFrame()?.(mocks.state, 0);
    const target = mocks.gl.getRenderTarget() as RenderTarget;
    expect(target.depthTexture).toBe(scenePass.getTexture('depth'));
    expect(target.depthTexture).toMatchObject({ type: UnsignedInt248Type, format: DepthStencilFormat });
    expect(scenePass.renderTarget.stencilBuffer).toBe(true);
    expect(mocks.outputQuads[0]!.material.depthWrite).toBe(false);
    const composed = mocks.gl.initRenderTarget.mock.calls[1]![0] as RenderTarget;
    expect(composed.texture.name).toBe('Tau composed surface');
    expect(composed.depthTexture).toBe(target.depthTexture);
    expect(mocks.gl.initRenderTarget.mock.calls).toEqual([[scenePass.renderTarget], [composed], [target]]);
    expect(scenePass.renderTarget.setSize).toHaveBeenCalledWith(3000, 2000);
    expect(mocks.gl.autoClearDepth).toBe(true);
    expect(mocks.gl.autoClearStencil).toBe(true);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.gl.initRenderTarget).toHaveBeenCalledTimes(3);
    const dimensions = vi.spyOn(mocks.gl, 'getDrawingBufferSize').mockImplementation((size) => size.set(5120, 2880));
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.gl.initRenderTarget).toHaveBeenCalledTimes(6);
    expect(scenePass.renderTarget.setSize).toHaveBeenLastCalledWith(5120, 2880);
    expect(target.depthTexture).toBe(scenePass.getTexture('depth'));
    dimensions.mockRestore();
    mocks.glRender.mockImplementationOnce(() => {
      throw new Error('composite failed');
    });
    expect(() => mocks.getFrame()?.(mocks.state, 0)).toThrow('composite failed');
    expect(mocks.gl.autoClearDepth).toBe(true);
    expect(mocks.gl.autoClearStencil).toBe(true);
    mounted.unmount();
  });

  it('should retain one linear stencil frame through overlays and encode only at frame completion', async () => {
    const mounted = await mount();
    const destination = mocks.gl.getRenderTarget();
    mocks.getFrame()?.(mocks.state, 0);
    const target = mocks.gl.getRenderTarget() as RenderTarget;
    expect(target).toBeInstanceOf(RenderTarget);
    expect([target.width, target.height, target.samples, target.stencilBuffer]).toEqual([3000, 2000, 0, true]);
    expect(target.texture.colorSpace).toBe(LinearSRGBColorSpace);
    const dispose = vi.spyOn(target, 'dispose');
    const { material } = mocks.outputQuads[0]!;
    expect(material).toMatchObject({ depthWrite: true, depthNode: { kind: 'sampled-depth' } });
    mocks.glRender.mockClear();
    mocks.getRestoreDepth()?.();
    expect(mocks.glRender).not.toHaveBeenCalled();
    mocks.glRender.mockImplementationOnce(() => {
      expect(mocks.gl.getRenderTarget()).toBe(destination);
      expect(mocks.gl.outputColorSpace).toBe('srgb-linear');
    });
    mocks.getFinalFrame()?.(mocks.state, 0);
    expect(mocks.glRender).toHaveBeenCalledOnce();
    expect(mocks.gl.outputColorSpace).toBe('srgb');
    expect(mocks.gl.getRenderTarget()).toBe(destination);
    mocks.getFrame()?.(mocks.state, 0);
    expect(mocks.gl.getRenderTarget()).toBe(target);
    mounted.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    expect(mocks.gl.getRenderTarget()).toBe(destination);
  });

  it('should restore output state when final encoding fails and recover the following frame', async () => {
    const mounted = await mount();
    const destination = mocks.gl.getRenderTarget();
    mocks.getFrame()?.(mocks.state, 0);
    mocks.glRender.mockImplementationOnce(() => {
      throw new Error('encoding failed');
    });
    expect(() => mocks.getFinalFrame()?.(mocks.state, 0)).toThrow('encoding failed');
    expect(mocks.gl.getRenderTarget()).toBe(destination);
    expect(mocks.gl.outputColorSpace).toBe('srgb');
    expect(mocks.gl.autoClear).toBe(true);
    mocks.getFrame()?.(mocks.state, 0);
    mocks.getFinalFrame()?.(mocks.state, 0);
    expect(mocks.gl.getRenderTarget()).toBe(destination);
    mounted.unmount();
  });

  it('should retire the scene transmission copy with its owning graph', async () => {
    const mounted = await mount();
    const pass = mocks.scenePasses[0]!;
    mounted.unmount();
    expect(mocks.retireTransmissionCopy).toHaveBeenCalledOnce();
    expect(mocks.retireTransmissionCopy).toHaveBeenCalledWith(pass.renderTarget);
    expect(pass.dispose).toHaveBeenCalledOnce();
  });

  it('should guard the upstream implementations whose owned resources require explicit disposal', () => {
    const require = createRequire(import.meta.url);
    // Shared targets must be initialized together before the first scene write.
    // Requalify the adaptation if Three changes initialization, clearing or retirement.
    for (const [file, digest] of [
      ['three/src/materials/nodes/NodeMaterial.js', 'f4ba7cbf3c79c62aee417867d4ff4cce7951135d2cede2cf922646b680ab80a1'],
      [
        'three/src/renderers/common/RenderObject.js',
        '3efeff495ae23dba0b5ac4b795084d952626395b1c596d884f6a7752df07c8aa',
      ],
      [
        'three/src/nodes/display/ViewportDepthNode.js',
        '4090bce996d51b6c5ca00b3276a833ca05bfa5d63ab4766b38dae8a6c171d382',
      ],
      ['three/src/renderers/common/Textures.js', 'f254ca8221e17bf58a2aad3e99735bc6b5b183331dc9aeafd530d73bf2b3347c'],
      ['three/src/nodes/display/PassNode.js', 'e4547bb6d360cc7b2459bdfa1d1ca53a2f43f47538b37607d19d32c45a7526e5'],
    ]) {
      expect(
        createHash('sha256')
          .update(readFileSync(require.resolve(file!)))
          .digest('hex'),
      ).toBe(digest);
    }
    const source = readFileSync(require.resolve('three/src/nodes/utils/RTTNode.js'), 'utf8');
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      'f87704938524dc419b91d9dd29c89d53272c78819d17537780a1c3b7e42c921b',
    );
    const aoSource = readFileSync(require.resolve('three/addons/tsl/display/GTAONode.js'), 'utf8');
    expect(createHash('sha256').update(aoSource).digest('hex')).toBe(
      '2786bf04e0a166e11d18153f0e26776792701c2294b9b1a9fb93ced6a22f148c',
    );
  });

  it('should dispose the retargeted graph once on unmount', async () => {
    const mounted = await mount();
    act(() => mocks.getRetarget()?.(mocks.orthographicCamera, mocks.snapshot));
    mocks.getFrame()?.(mocks.state, 0);
    mounted.unmount();
    for (const pass of mocks.scenePasses) {
      expect(pass.dispose).toHaveBeenCalledOnce();
    }
    expect(mocks.aoDispose).toHaveBeenCalledOnce();
    expect(mocks.antialiasDispose).toHaveBeenCalledOnce();
    expect(mocks.antialiasTargetDispose).toHaveBeenCalledOnce();
    expect(mocks.antialiasMaterialDispose).toHaveBeenCalledOnce();
    expect(mocks.noiseDispose).toHaveBeenCalledOnce();
    expect(mocks.postDispose).toHaveBeenCalledTimes(2);
  });

  it('should release partial resources when graph construction fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.ao.mockImplementationOnce(() => {
      throw new Error('AO failed');
    });
    const mounted = await mount();
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.postDispose).not.toHaveBeenCalled();
    mounted.unmount();
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('should release allocated AO and RTT resources when composition construction fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.mix.mockImplementationOnce(() => {
      throw new Error('Composition failed');
    });
    const mounted = await mount();
    expect(mocks.antialiasTargetDispose).toHaveBeenCalledTimes(1);
    expect(mocks.antialiasMaterialDispose).toHaveBeenCalledTimes(1);
    expect(mocks.noiseDispose).toHaveBeenCalledOnce();
    expect(mocks.aoDispose).toHaveBeenCalledOnce();
    expect(mocks.scenePasses[0]!.dispose).toHaveBeenCalledOnce();
    mounted.unmount();
    expect(mocks.antialiasTargetDispose).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('does not construct resources for a non-WebGPU renderer', async () => {
    mocks.gl.isWebGPURenderer = false;
    await mount();
    expect(mocks.pass).not.toHaveBeenCalled();
    mocks.gl.isWebGPURenderer = true;
  });
});
