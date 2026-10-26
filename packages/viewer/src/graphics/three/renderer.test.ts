import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ThreeModule from 'three';
import type * as ThreeWebGpuModule from 'three/webgpu';
import { WebGpuInitializationError } from '#graphics/three/webgpu-initialization-error.js';
/* eslint-disable @typescript-eslint/naming-convention -- stub class + module-export property names mirror three.js's WebGPURenderer/WebGLRenderer spellings */

/**
 * Stubs `three` and `three/webgpu` so the renderer factory can be exercised in jsdom (no
 * GPU device). Each constructed renderer is recorded into `hoisted.createdRenderers` so
 * tests can assert which `setTransparentSort` calls fired and on which backend.
 *
 * Mirrors the WebGPU mocking style in `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx`.
 */
const hoisted = vi.hoisted(() => {
  type RecordedRenderer = {
    readonly setTransparentSort: ReturnType<typeof vi.fn>;
    readonly setOpaqueSort: ReturnType<typeof vi.fn>;
    readonly init: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly options: unknown;
    readonly kind: 'webgl' | 'webgpu';
  };

  return {
    createdRenderers: [] as RecordedRenderer[],
    initializationError: undefined as Error | undefined,
    nativeBackend: true,
    destroyDevice: vi.fn(),
    /** The browser destroys the device as the canvas presents its first frame (no swap chain backing). */
    presentationDestroysDevice: false,
    /** Acquiring the canvas texture throws, the device staying alive. */
    presentationThrows: false,
    /** The queue never reports the first frame's work done. */
    workDoneStalls: false,
    presentedFrames: 0,
  };
});

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeWebGpuModule>();
  class WebGPURendererStub {
    public readonly setTransparentSort = vi.fn();
    public readonly setOpaqueSort = vi.fn();
    public readonly setRenderObjectFunction = vi.fn();
    public readonly backend = new actual.WebGPUBackend();
    public readonly dispose = vi.fn();
    public get coordinateSystem() {
      return hoisted.nativeBackend ? actual.WebGPUCoordinateSystem : actual.WebGLCoordinateSystem;
    }
    public readonly init = vi.fn(async () => {
      if (hoisted.initializationError) {
        throw hoisted.initializationError;
      }
    });
    // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
    public readonly options: unknown;
    public get reversedDepthBuffer() {
      return (this.options as { reversedDepthBuffer?: boolean }).reversedDepthBuffer === true;
    }

    public constructor(options: unknown) {
      this.options = options;
      let loseDevice: (info: { reason: string; message: string }) => void = () => undefined;
      const lost = new Promise<{ reason: string; message: string }>((resolve) => {
        loseDevice = resolve;
      });
      Object.assign(this.backend, {
        device: {
          destroy: hoisted.destroyDevice,
          lost,
          createCommandEncoder: () => ({
            beginRenderPass: () => ({ end: () => undefined }),
            finish: () => ({}),
          }),
          queue: {
            submit: () => {
              hoisted.presentedFrames += 1;
              if (hoisted.presentationDestroysDevice) {
                loseDevice({ reason: 'destroyed', message: 'Device was destroyed.' });
              }
            },
            onSubmittedWorkDone: async () => {
              if (hoisted.presentationDestroysDevice) {
                throw new Error('A valid external Instance reference no longer exists.');
              }
              if (hoisted.workDoneStalls) {
                await new Promise<never>(() => {
                  // Never settles, like a stalled queue.
                });
              }
            },
          },
        },
      });
      Object.defineProperty(this.backend, 'context', {
        value: {
          getCurrentTexture: () => {
            if (hoisted.presentationThrows) {
              throw new Error('Canvas texture unavailable');
            }
            return { createView: () => ({}) };
          },
        },
      });
      hoisted.createdRenderers.push({
        setTransparentSort: this.setTransparentSort,
        setOpaqueSort: this.setOpaqueSort,
        init: this.init,
        dispose: this.dispose,
        options,
        kind: 'webgpu',
      });
    }
  }

  return { ...actual, WebGPURenderer: WebGPURendererStub };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeModule>();

  class WebGLRendererStub {
    public readonly setTransparentSort = vi.fn();
    public readonly setOpaqueSort = vi.fn();
    public readonly setRenderObjectFunction = vi.fn();
    public readonly domElement: HTMLCanvasElement;
    // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
    public readonly parameters: { canvas: HTMLCanvasElement };

    public constructor(parameters: { canvas: HTMLCanvasElement }) {
      this.parameters = parameters;
      this.domElement = parameters.canvas;
      hoisted.createdRenderers.push({
        setTransparentSort: this.setTransparentSort,
        setOpaqueSort: this.setOpaqueSort,
        init: vi.fn(),
        dispose: vi.fn(),
        options: parameters,
        kind: 'webgl',
      });
    }
  }

  return {
    ...actual,
    WebGLRenderer: WebGLRendererStub,
  };
});
/* eslint-enable @typescript-eslint/naming-convention -- end three.js-mirror naming window */

describe('createRenderer', () => {
  beforeEach(() => {
    hoisted.createdRenderers.length = 0;
    hoisted.initializationError = undefined;
    hoisted.nativeBackend = true;
    hoisted.destroyDevice.mockClear();
    hoisted.presentationDestroysDevice = false;
    hoisted.presentationThrows = false;
    hoisted.workDoneStalls = false;
    hoisted.presentedFrames = 0;
  });

  // First in this file: no test before it has reported a canvas loss to the shared module.
  it('should fail a first frame that throws without a device loss as an ordinary start, keeping WebGPU on', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    const { probeWebGpuSupport, webGpuFallbackReason } = await import('#graphics/graphics-backend.js');
    hoisted.presentationThrows = true;
    const creation = createRenderer('viewport', 'webgpu', document.createElement('canvas'));
    await expect(creation).rejects.toBeInstanceOf(WebGpuInitializationError);
    await expect(creation).rejects.toThrow('could not present its first frame: Canvas texture unavailable');
    expect(hoisted.createdRenderers[0]?.dispose).toHaveBeenCalledOnce();
    expect(hoisted.destroyDevice).toHaveBeenCalledOnce();
    expect(webGpuFallbackReason()).toBeUndefined();
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } });
    try {
      expect(await probeWebGpuSupport()).toBe(true);
    } finally {
      Reflect.deleteProperty(navigator, 'gpu');
    }
  });

  it('should not let a stalled first frame hold the renderer creation', async () => {
    vi.useFakeTimers();
    try {
      const { createRenderer, firstCanvasFrameTimeout } = await import('#graphics/three/renderer.js');
      hoisted.workDoneStalls = true;
      const creation = createRenderer('viewport', 'webgpu', document.createElement('canvas'));
      await vi.advanceTimersByTimeAsync(firstCanvasFrameTimeout + 10);
      await expect(creation).resolves.toBeDefined();
      expect(hoisted.destroyDevice).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should present one frame on a WebGPU viewport before the scene compiles anything', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    await createRenderer('viewport', 'webgpu', document.createElement('canvas'));
    expect(hoisted.presentedFrames).toBe(1);
    expect(hoisted.destroyDevice).not.toHaveBeenCalled();
    await createRenderer('offscreen', 'webgpu', document.createElement('canvas'));
    expect(hoisted.presentedFrames).toBe(1);
  });

  it('should reject a WebGPU viewport whose canvas cannot present, so the viewer starts on WebGL', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    const { probeWebGpuSupport } = await import('#graphics/graphics-backend.js');
    hoisted.presentationDestroysDevice = true;
    const creation = createRenderer('viewport', 'webgpu', document.createElement('canvas'));
    await expect(creation).rejects.toBeInstanceOf(WebGpuInitializationError);
    await expect(creation).rejects.toThrow('The WebGPU canvas could not present a frame: Device was destroyed.');
    expect(hoisted.createdRenderers[0]?.dispose).toHaveBeenCalledOnce();
    expect(hoisted.destroyDevice).toHaveBeenCalledOnce();
    // Later viewers start on WebGL instead of repeating the start, though an adapter is still offered.
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } });
    try {
      expect(await probeWebGpuSupport()).toBe(false);
    } finally {
      Reflect.deleteProperty(navigator, 'gpu');
    }
  });

  it('should keep the lean node viewport single-sample without changing classic or offscreen antialiasing', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    await createRenderer('viewport', 'webgpu', document.createElement('canvas'));
    await createRenderer('viewport', 'webgl', document.createElement('canvas'));
    await createRenderer('offscreen', 'webgpu', document.createElement('canvas'));
    expect(hoisted.createdRenderers[0]?.options).toMatchObject({
      antialias: false,
      samples: 0,
      stencil: true,
    });
    expect(hoisted.createdRenderers[1]?.options).toMatchObject({
      antialias: true,
    });
    expect(hoisted.createdRenderers[2]?.options).toMatchObject({
      antialias: true,
    });
  });

  it('should initialize the shared node pipeline when WebGL2 is requested', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    hoisted.nativeBackend = false;
    await createRenderer('viewport', 'webgl', {
      canvas: document.createElement('canvas'),
      nodePipeline: true,
    });
    expect(hoisted.createdRenderers[0]?.kind).toBe('webgpu');
    expect(hoisted.createdRenderers[0]?.options).toMatchObject({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
      forceWebGL: true,
      reversedDepthBuffer: false,
      logarithmicDepthBuffer: true,
      samples: 0,
    });
    expect(hoisted.createdRenderers[0]?.setTransparentSort).not.toHaveBeenCalled();
  });

  it('should reject a node-WebGL fallback instead of labeling it WebGPU', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    hoisted.nativeBackend = false;
    await expect(createRenderer('viewport', 'webgpu', document.createElement('canvas'))).rejects.toThrow(
      'WebGPU initialization did not select a native WebGPU backend',
    );
    expect(hoisted.createdRenderers[0]?.dispose).toHaveBeenCalledOnce();
    expect(hoisted.destroyDevice).toHaveBeenCalledOnce();
  });

  it('should release a partially initialized GPU device without disposing an uninitialized renderer', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');
    hoisted.initializationError = new Error('GPU device request rejected');
    await expect(createRenderer('viewport', 'webgpu', document.createElement('canvas'))).rejects.toThrow(
      'GPU device request rejected',
    );
    expect(hoisted.destroyDevice).toHaveBeenCalledOnce();
    expect(hoisted.createdRenderers[0]?.dispose).not.toHaveBeenCalled();
  });

  describe('reversed-Z transparent sort wiring', () => {
    it('should register reversedDepthTransparentSort on the WebGPU viewport renderer', async () => {
      const { createRenderer } = await import('#graphics/three/renderer.js');
      const { reversedDepthTransparentSort } = await import('#graphics/three/reversed-depth-transparent-sort.js');

      const canvas = document.createElement('canvas');
      await createRenderer('viewport', 'webgpu', canvas);

      expect(hoisted.createdRenderers).toHaveLength(1);
      const created = hoisted.createdRenderers.at(0);
      expect(created).toBeDefined();
      expect(created?.kind).toBe('webgpu');
      expect(created?.setTransparentSort).toHaveBeenCalledTimes(1);
      expect(created?.setTransparentSort).toHaveBeenCalledWith(reversedDepthTransparentSort);
      expect(created?.setOpaqueSort).not.toHaveBeenCalled();
    });

    it('should NOT register a custom transparent sort on the WebGPU offscreen renderer (no reversed-Z)', async () => {
      const { createRenderer } = await import('#graphics/three/renderer.js');

      const canvas = document.createElement('canvas');
      await createRenderer('offscreen', 'webgpu', canvas);

      expect(hoisted.createdRenderers).toHaveLength(1);
      const created = hoisted.createdRenderers.at(0);
      expect(created?.kind).toBe('webgpu');
      expect(created?.setTransparentSort).not.toHaveBeenCalled();
    });

    it.each(['viewport', 'offscreen'] as const)(
      'should NOT register a custom transparent sort on the WebGL %s renderer',
      async (useCase) => {
        const { createRenderer } = await import('#graphics/three/renderer.js');

        const canvas = document.createElement('canvas');
        await createRenderer(useCase, 'webgl', canvas);

        expect(hoisted.createdRenderers).toHaveLength(1);
        const created = hoisted.createdRenderers.at(0);
        expect(created?.kind).toBe('webgl');
        expect(created?.setTransparentSort).not.toHaveBeenCalled();
        expect(created?.options).not.toHaveProperty('premultipliedAlpha');
        expect(created?.options).not.toHaveProperty('preserveDrawingBuffer');
      },
    );

    it('should keep the WebGL drawing buffer for a readable viewport canvas', async () => {
      const { createRenderer } = await import('#graphics/three/renderer.js');

      const canvas = document.createElement('canvas');
      await createRenderer('viewport', 'webgl', {
        canvas,
        preserveDrawingBuffer: true,
      });

      expect(hoisted.createdRenderers.at(0)?.options).toMatchObject({
        canvas,
        preserveDrawingBuffer: true,
      });
    });
  });
});

describe('createRenderer showcase preset', () => {
  beforeEach(() => {
    hoisted.createdRenderers.length = 0;
    hoisted.initializationError = undefined;
    hoisted.nativeBackend = true;
    hoisted.destroyDevice.mockClear();
  });

  it('should build the node renderer on the WebGPU backend without forcing WebGL', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');

    const canvas = document.createElement('canvas');
    await createRenderer('showcase', 'webgpu', canvas);

    expect(hoisted.createdRenderers).toHaveLength(1);
    const created = hoisted.createdRenderers.at(0);
    expect(created?.kind).toBe('webgpu');
    expect(created?.init).toHaveBeenCalledTimes(1);
    expect(created?.options).toMatchObject({
      alpha: true,
      antialias: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- three.js constructor option name
      forceWebGL: false,
      reversedDepthBuffer: false,
      stencil: false,
    });
    expect(created?.setTransparentSort).not.toHaveBeenCalled();
  });

  it('should pin the WebGL 2 backend of the node renderer for the webgl backend', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');

    const canvas = document.createElement('canvas');
    await createRenderer('showcase', 'webgl', canvas);

    expect(hoisted.createdRenderers).toHaveLength(1);
    const created = hoisted.createdRenderers.at(0);
    expect(created?.kind).toBe('webgpu');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- three.js constructor option name
    expect(created?.options).toMatchObject({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
      forceWebGL: true,
      alpha: true,
      antialias: true,
    });
  });

  it('should forward the adapter power preference for spinners', async () => {
    const { createRenderer } = await import('#graphics/three/renderer.js');

    const canvas = document.createElement('canvas');
    await createRenderer('showcase', 'webgpu', {
      canvas,
      powerPreference: 'low-power',
    });

    expect(hoisted.createdRenderers.at(0)?.options).toMatchObject({
      powerPreference: 'low-power',
    });
  });
});
