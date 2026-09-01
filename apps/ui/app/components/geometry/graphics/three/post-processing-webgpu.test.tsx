import { describe, expect, it, vi, beforeEach } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- mocks mirror three.js RenderPipeline / WebGPU API spellings */
import { render } from '@testing-library/react';
import { act } from 'react';

const hoistedMocks = vi.hoisted(() => {
  const depthSampleStub = { kind: 'depthSample' };
  const composedColorStub = { kind: 'composedColor' };
  const aoMultiplierStub = { kind: 'aoMultiplier' };

  const depthTextureNodeStub = {
    kind: 'depthTextureNode',
    sample: vi.fn(() => depthSampleStub),
  };
  const colorTextureNodeStub = {
    kind: 'colorTextureNode',
    mul: vi.fn(() => composedColorStub),
  };
  const normalTextureNodeStub = {
    kind: 'normalTextureNode',
    sample: vi.fn(() => ({ kind: 'normalTextureSample' })),
  };
  const aoTextureNodeStub = {
    kind: 'aoTextureNode',
    sample: vi.fn(() => ({ r: { kind: 'aoR' } })),
  };

  const scenePassNormalTextureStub: { type: number } = { type: 0 };

  const glRenderSpy = vi.fn();
  const sceneStub: Record<string, unknown> = { isScene: true };
  const cameraStub: Record<string, unknown> = { isCamera: true };
  const invalidateSpy = vi.fn();

  const gpuGl = {
    isWebGPURenderer: true,
    render: glRenderSpy,
  };

  let priorityOneFrameCallback: ((_state: Record<string, unknown>, delta: number) => void) | undefined;

  const resetPriorityOneCallback = (): void => {
    priorityOneFrameCallback = undefined;
  };

  const getPriorityOneCallback = (): typeof priorityOneFrameCallback => priorityOneFrameCallback;

  function createDefaultThreeState(): {
    readonly gl: Record<string, unknown>;
    readonly scene: Record<string, unknown>;
    readonly camera: Record<string, unknown>;
    readonly invalidate: () => void;
  } {
    return {
      gl: gpuGl,
      scene: sceneStub,
      camera: cameraStub,
      invalidate: invalidateSpy,
    };
  }

  const useThreeMock = vi.fn(createDefaultThreeState);

  const useFrameMock = (
    callback: (_state: Record<string, unknown>, delta: number) => void,
    priority?: number,
  ): void => {
    if (priority === 1) {
      priorityOneFrameCallback = callback;
    }
  };

  const postDisposeSpy = vi.fn();
  const aoDisposeSpy = vi.fn();

  const aoImplementation = vi.fn(() => ({
    radius: { value: 0 },
    thickness: { value: 0 },
    samples: { value: 0 },
    distanceFallOff: { value: 0 },
    resolutionScale: 0,
    useTemporalFiltering: true,
    getTextureNode: vi.fn(() => aoTextureNodeStub),
    dispose: aoDisposeSpy,
  }));

  /**
   * Tracks every order-sensitive call we want to assert across the pipeline construction sequence.
   * The composite-quad depth wire must happen *after* `RenderPipeline` construction but before the
   * `compileAsync` warmup resolves and `pipelineRef` publishes.
   */
  const callOrder: string[] = [];

  let compileResolve: (() => void) | undefined;
  const compileAsyncSpy = vi.fn(
    async (): Promise<void> =>
      new Promise<void>((resolve) => {
        compileResolve = (): void => {
          callOrder.push('compileAsync.resolve');
          resolve();
        };
      }),
  );

  const scenePassStub: {
    setMRT: ReturnType<typeof vi.fn>;
    getTexture: ReturnType<typeof vi.fn>;
    getTextureNode: ReturnType<typeof vi.fn>;
    compileAsync: typeof compileAsyncSpy;
  } = {
    setMRT: vi.fn(() => {
      callOrder.push('scenePass.setMRT');
    }),
    getTexture: vi.fn((channel: string) => {
      callOrder.push(`scenePass.getTexture(${channel})`);
      if (channel === 'normal') {
        return scenePassNormalTextureStub;
      }
      return { type: 0 };
    }),
    getTextureNode: vi.fn((channel: string) => {
      callOrder.push(`scenePass.getTextureNode(${channel})`);
      if (channel === 'depth') {
        return depthTextureNodeStub;
      }
      if (channel === 'output') {
        return colorTextureNodeStub;
      }
      if (channel === 'normal') {
        return normalTextureNodeStub;
      }
      return { kind: 'unknownChannel' };
    }),
    compileAsync: compileAsyncSpy,
  };

  const passImplementation = vi.fn((): typeof scenePassStub => {
    callOrder.push('pass()');
    return scenePassStub;
  });

  const mrtImplementation = vi.fn(() => {
    callOrder.push('mrt()');
    return { kind: 'mrt' };
  });

  const pipelineInstances: Array<{
    outputNode?: unknown;
  }> = [];

  const unsignedByteTypeStub = 1009;

  const resolveCompile = (): void => {
    if (compileResolve === undefined) {
      throw new Error('compileAsync was not invoked yet');
    }
    compileResolve();
  };

  return {
    aoDisposeSpy,
    aoImplementation,
    aoTextureNodeStub,
    cameraStub,
    invalidateSpy,
    callOrder,
    colorTextureNodeStub,
    composedColorStub,
    aoMultiplierStub,
    compileAsyncSpy,
    depthSampleStub,
    depthTextureNodeStub,
    getPriorityOneCallback,
    glRenderSpy,
    gpuGl,
    createDefaultThreeState,
    gpuGlFallback: {
      isWebGPURenderer: false,
      render: vi.fn(),
    },
    mrtImplementation,
    normalTextureNodeStub,
    passImplementation,
    pipelineInstances,
    postDisposeSpy,
    resolveCompile,
    resetCompileResolver: (): void => {
      compileResolve = undefined;
    },
    resetPriorityOneCallback,
    scenePassNormalTextureStub,
    scenePassStub,
    sceneStub,
    unsignedByteTypeStub,
    useFrameMock,
    useThreeMock,
  };
});

const colorToDirectionSpy = vi.fn((node: unknown) => ({ kind: 'colorToDirection', node }));
const directionToColorSpy = vi.fn((node: unknown) => ({ kind: 'directionToColor', node }));
const sampleSpy = vi.fn((mapper: (uv: unknown) => unknown) => ({ kind: 'sample', mapper }));
const vec3Spy = vi.fn((argument: unknown) => ({ kind: 'vec3', argument }));
const vec4Spy = vi.fn((...arguments_: unknown[]) => ({ kind: 'vec4', arguments: arguments_ }));
const screenUVStub = Symbol('screenUV');
const normalViewStub = Symbol('normalView');
const outputStub = Symbol('output');

vi.mock('three/tsl', () => ({
  colorToDirection: colorToDirectionSpy,
  directionToColor: directionToColorSpy,
  mrt: hoistedMocks.mrtImplementation,
  normalView: normalViewStub,
  output: outputStub,
  pass: hoistedMocks.passImplementation,
  sample: sampleSpy,
  screenUV: screenUVStub,
  vec3: vec3Spy,
  vec4: vec4Spy,
}));

vi.mock('three/addons/tsl/display/GTAONode.js', () => ({
  ao: hoistedMocks.aoImplementation,
}));

vi.mock('three/webgpu', () => {
  class RenderPipelineStub {
    public outputNode: unknown | undefined;

    // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
    public readonly renderer: { render: (...parameters: unknown[]) => void };

    public constructor(renderer: { render: (...parameters: unknown[]) => void }) {
      this.renderer = renderer;
      hoistedMocks.callOrder.push('RenderPipeline.construct');
      hoistedMocks.pipelineInstances.push(this);
    }

    public render(): void {
      hoistedMocks.callOrder.push('RenderPipeline.render');
      this.renderer.render(hoistedMocks.sceneStub, hoistedMocks.cameraStub);
    }

    public dispose(): void {
      hoistedMocks.postDisposeSpy();
    }
  }

  return {
    RenderPipeline: RenderPipelineStub,
    UnsignedByteType: hoistedMocks.unsignedByteTypeStub,
    WebGPURenderer: vi.fn(),
  };
});

vi.mock('@react-three/fiber', async (importOriginal) => {
  const fiberFacadeUnknown: unknown = await importOriginal();
  const fiberFacade =
    fiberFacadeUnknown !== null && typeof fiberFacadeUnknown === 'object'
      ? (fiberFacadeUnknown as Record<string, unknown>)
      : {};

  return {
    ...fiberFacade,
    useFrame: vi.fn(hoistedMocks.useFrameMock),
    useThree: (
      ...argument: Parameters<typeof hoistedMocks.useThreeMock>
    ): ReturnType<(typeof hoistedMocks)['useThreeMock']> => hoistedMocks.useThreeMock(...argument),
  };
});

async function mountPostProcessing(): Promise<{
  unmount: () => void;
}> {
  const { PostProcessingWebGPU } = await import('#components/geometry/graphics/three/post-processing-webgpu.js');
  const { unmount } = render(<PostProcessingWebGPU />);
  return { unmount };
}

describe('PostProcessingWebGPU (single MRT scenePass + compose-AO + compileAsync warmup)', () => {
  beforeEach(() => {
    hoistedMocks.resetPriorityOneCallback();
    hoistedMocks.resetCompileResolver();
    hoistedMocks.glRenderSpy.mockClear();
    hoistedMocks.postDisposeSpy.mockClear();
    hoistedMocks.aoDisposeSpy.mockClear();
    hoistedMocks.invalidateSpy.mockClear();
    hoistedMocks.callOrder.length = 0;

    hoistedMocks.pipelineInstances.length = 0;

    hoistedMocks.scenePassNormalTextureStub.type = 0;
    hoistedMocks.scenePassStub.setMRT.mockClear();
    hoistedMocks.scenePassStub.getTexture.mockClear();
    hoistedMocks.scenePassStub.getTextureNode.mockClear();
    hoistedMocks.scenePassStub.compileAsync.mockClear();
    hoistedMocks.passImplementation.mockClear();
    hoistedMocks.normalTextureNodeStub.sample.mockClear();
    hoistedMocks.aoTextureNodeStub.sample.mockClear();

    colorToDirectionSpy.mockClear();
    directionToColorSpy.mockClear();
    sampleSpy.mockClear();
    vec3Spy.mockClear();
    vec4Spy.mockClear();
    hoistedMocks.mrtImplementation.mockClear();
    hoistedMocks.aoImplementation.mockClear();

    hoistedMocks.colorTextureNodeStub.mul.mockClear();
    hoistedMocks.depthTextureNodeStub.sample.mockClear();

    hoistedMocks.useThreeMock.mockImplementation(hoistedMocks.createDefaultThreeState);
  });

  it('rasterises the scene exactly once (single pass call) producing color + normal MRT outputs', async () => {
    await mountPostProcessing();

    expect(hoistedMocks.passImplementation).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.passImplementation).toHaveBeenCalledWith(hoistedMocks.sceneStub, hoistedMocks.cameraStub);

    expect(hoistedMocks.scenePassStub.setMRT).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.mrtImplementation).toHaveBeenCalledWith({
      output: outputStub,
      normal: { kind: 'directionToColor', node: normalViewStub },
    });
    expect(directionToColorSpy).toHaveBeenCalledWith(normalViewStub);
  });

  it('packs the normal MRT attachment as UnsignedByteType for compact UNORM8 storage', async () => {
    await mountPostProcessing();

    expect(hoistedMocks.scenePassStub.getTexture).toHaveBeenCalledWith('normal');
    expect(hoistedMocks.scenePassNormalTextureStub.type).toBe(hoistedMocks.unsignedByteTypeStub);
  });

  it('decodes the normal MRT via sample()+colorToDirection and feeds GTAO with scenePass depth', async () => {
    await mountPostProcessing();

    expect(sampleSpy).toHaveBeenCalledTimes(1);
    const sampleResult = sampleSpy.mock.results.at(0)?.value as unknown;

    expect(hoistedMocks.aoImplementation).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.aoImplementation).toHaveBeenCalledWith(
      hoistedMocks.depthTextureNodeStub,
      sampleResult,
      hoistedMocks.cameraStub,
    );

    const [mapperUnknown] = sampleSpy.mock.calls[0]!;
    const invokeMapper = mapperUnknown as (uv: unknown) => void;
    const uvToken = Symbol('uv');
    invokeMapper(uvToken);

    expect(hoistedMocks.normalTextureNodeStub.sample).toHaveBeenCalledWith(uvToken);
    expect(colorToDirectionSpy).toHaveBeenCalledTimes(1);
  });

  it('configures GTAO at half-resolution with temporal filtering OFF and 8 samples (audit D3+D4)', async () => {
    await mountPostProcessing();

    const aoInstance = hoistedMocks.aoImplementation.mock.results.at(0)?.value as
      | {
          readonly resolutionScale: number;
          readonly useTemporalFiltering: boolean;
          readonly samples: { value: number };
        }
      | undefined;

    expect(aoInstance).toBeTruthy();
    expect(aoInstance!.resolutionScale).toBe(0.5);
    expect(aoInstance!.useTemporalFiltering).toBe(false);
    expect(aoInstance!.samples.value).toBe(8);
  });

  it('composes AO multiplicatively with beauty color (compose-AO, NOT builtinAOContext)', async () => {
    await mountPostProcessing();

    expect(hoistedMocks.aoTextureNodeStub.sample).toHaveBeenCalledWith(screenUVStub);
    expect(vec3Spy).toHaveBeenCalledWith({ kind: 'aoR' });
    expect(vec4Spy).toHaveBeenCalledWith(vec3Spy.mock.results.at(0)?.value, 1);
    expect(hoistedMocks.colorTextureNodeStub.mul).toHaveBeenCalledWith(vec4Spy.mock.results.at(0)?.value);

    const pipeline = hoistedMocks.pipelineInstances.at(0);
    expect(pipeline).toBeTruthy();
    expect(pipeline!.outputNode).toBe(hoistedMocks.composedColorStub);
  });

  it('does not wire any composite-quad depthNode (canvas depth bridging owned by SceneOverlay)', async () => {
    // Audit C2 was reverted: in three.js r184 `_quadMesh.material.depthNode` does not route to the canvas
    // swap-chain depth attachment that priority-2 `gl.render` calls read. Canvas-depth bridging is owned by
    // SceneOverlay's traverse + clone-swap depth pre-pass. See
    // docs/research/webgpu-composite-quad-depth-write-non-functional.md.
    await mountPostProcessing();

    expect(hoistedMocks.depthTextureNodeStub.sample).not.toHaveBeenCalled();
  });

  it('warms the scene pipeline via compileAsync before publishing the priority-1 render handle', async () => {
    await mountPostProcessing();

    expect(hoistedMocks.scenePassStub.compileAsync).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.scenePassStub.compileAsync).toHaveBeenCalledWith(hoistedMocks.gpuGl);

    const frameCallbackPre = hoistedMocks.getPriorityOneCallback();
    expect(frameCallbackPre).toBeTypeOf('function');
    frameCallbackPre!({}, 0);
    expect(hoistedMocks.glRenderSpy).not.toHaveBeenCalled();

    await act(async () => {
      hoistedMocks.resolveCompile();
      await Promise.resolve();
    });

    expect(hoistedMocks.invalidateSpy).toHaveBeenCalledTimes(1);

    const frameCallbackPost = hoistedMocks.getPriorityOneCallback();
    frameCallbackPost!({}, 0);
    expect(hoistedMocks.glRenderSpy).toHaveBeenCalledOnce();
  });

  it('teardown before compileAsync resolves leaves pipelineRef unpublished (no render after unmount)', async () => {
    const { unmount } = await mountPostProcessing();

    unmount();

    await act(async () => {
      hoistedMocks.resolveCompile();
      await Promise.resolve();
    });

    expect(hoistedMocks.invalidateSpy).not.toHaveBeenCalled();
    expect(hoistedMocks.glRenderSpy).not.toHaveBeenCalled();
  });

  it('disposes RenderPipeline + GTAONode on unmount', async () => {
    const { unmount } = await mountPostProcessing();

    expect(hoistedMocks.postDisposeSpy).not.toHaveBeenCalled();
    expect(hoistedMocks.aoDisposeSpy).not.toHaveBeenCalled();

    unmount();

    expect(hoistedMocks.postDisposeSpy).toHaveBeenCalledTimes(1);
    expect(hoistedMocks.aoDisposeSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null when renderer is not WebGPU (no pipeline construction)', async () => {
    hoistedMocks.useThreeMock.mockImplementation(() => ({
      gl: hoistedMocks.gpuGlFallback,
      scene: hoistedMocks.sceneStub,
      camera: hoistedMocks.cameraStub,
      invalidate: hoistedMocks.invalidateSpy,
    }));

    await mountPostProcessing();

    expect(hoistedMocks.passImplementation).not.toHaveBeenCalled();
    expect(hoistedMocks.aoImplementation).not.toHaveBeenCalled();
  });

  it('constructs the pipeline exactly once after setting up scenePass + AO (order invariant)', async () => {
    await mountPostProcessing();

    const passIndex = hoistedMocks.callOrder.indexOf('pass()');
    const constructIndex = hoistedMocks.callOrder.indexOf('RenderPipeline.construct');

    expect(passIndex).toBeGreaterThan(-1);
    expect(constructIndex).toBeGreaterThan(passIndex);
    expect(hoistedMocks.pipelineInstances).toHaveLength(1);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end three.js / WebGPU mock spellings */
