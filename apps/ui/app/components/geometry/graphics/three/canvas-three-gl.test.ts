import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, _roots } from '@react-three/fiber';
import { WebGPURenderer } from 'three/webgpu';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Vector2,
  Vector3,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from 'three';

const hoisted = vi.hoisted(() => ({
  createRenderer: vi.fn(),
}));

vi.mock('#components/geometry/graphics/three/renderer.js', () => ({
  createRenderer: hoisted.createRenderer,
}));

describe('createTauR3fGlProp', () => {
  beforeEach(() => {
    hoisted.createRenderer.mockReset();
    hoisted.createRenderer.mockImplementation(async () => ({
      setPixelRatio: vi.fn(),
      getPixelRatio: () => 1,
      init: vi.fn(async () => {
        //
      }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates WebGPU canvases to createRenderer viewport presets', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const glFactory = createTauR3fGlProp('webgpu');

    expect(glFactory).toBeTypeOf('function');

    const canvas = document.createElement('canvas');
    await glFactory({
      canvas,
      alpha: true,
    });

    expect(hoisted.createRenderer).toHaveBeenCalledTimes(1);
    expect(hoisted.createRenderer).toHaveBeenCalledWith('viewport', 'webgpu', canvas);
  });

  it('delegates WebGL canvases to createRenderer viewport presets', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const glFactory = createTauR3fGlProp('webgl');

    expect(glFactory).toBeTypeOf('function');

    const canvas = document.createElement('canvas');
    await glFactory({
      canvas,
      alpha: true,
    });

    expect(hoisted.createRenderer).toHaveBeenCalledTimes(1);
    expect(hoisted.createRenderer).toHaveBeenCalledWith('viewport', 'webgl', canvas);
  });

  it('should size one renderer through overlapping and later resized R3F configurations', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const canvas = document.createElement('canvas');
    const renderers: WebGPURenderer[] = [];
    const releases: Array<() => void> = [];
    hoisted.createRenderer.mockImplementation(async (_preset: string, _backend: string, surface: HTMLCanvasElement) => {
      // Construct the real sizing owner without init(), a GPU device or a rendered React root.
      const renderer = new WebGPURenderer({
        canvas: surface,
        reversedDepthBuffer: true,
      });
      renderers.push(renderer);
      return new Promise<WebGPURenderer>((resolve) => {
        releases.push(() => {
          resolve(renderer);
        });
      });
    });
    const factory = createTauR3fGlProp('webgpu');
    if (typeof factory !== 'function') {
      throw new TypeError('Expected renderer factory');
    }
    const root = createRoot(canvas);
    const size = { width: 475, height: 864, top: 0, left: 0 };
    try {
      const first = root.configure({
        gl: factory,
        size,
        dpr: 2,
        frameloop: 'never',
      });
      const second = root.configure({
        gl: factory,
        size,
        dpr: 2,
        frameloop: 'never',
      });
      for (const release of releases) {
        release();
      }
      await Promise.all([first, second]);
      const renderer = _roots.get(canvas)!.store.getState().gl;
      expect(renderer.getDrawingBufferSize(new Vector2()).toArray()).toEqual([950, 1728]);
      expect([canvas.width, canvas.height]).toEqual([950, 1728]);
      expect(renderers).toHaveLength(1);

      await root.configure({
        gl: factory,
        size: { ...size, width: 640, height: 480 },
        dpr: 1.5,
        frameloop: 'never',
      });
      expect(_roots.get(canvas)!.store.getState().gl).toBe(renderer);
      expect(renderer.getPixelRatio()).toBe(1.5);
      expect(renderer.getDrawingBufferSize(new Vector2()).toArray()).toEqual([960, 720]);
      expect([canvas.width, canvas.height]).toEqual([960, 720]);
      expect(hoisted.createRenderer).toHaveBeenCalledOnce();
    } finally {
      // No Provider was rendered or renderer initialized, so there are no GPU resources or active frames to dispose.
      _roots.delete(canvas);
    }
  });

  it('should isolate renderer initialization between factories and canvases', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const canvases = [document.createElement('canvas'), document.createElement('canvas')] as const;
    const renderers = canvases.map((canvas) => new WebGPURenderer({ canvas }));
    hoisted.createRenderer.mockResolvedValueOnce(renderers[0]).mockResolvedValueOnce(renderers[1]);
    const first = createTauR3fGlProp('webgpu');
    const second = createTauR3fGlProp('webgpu');
    if (typeof first !== 'function' || typeof second !== 'function') {
      throw new TypeError('Expected renderer factories');
    }
    expect(await first({ canvas: canvases[0] })).toBe(renderers[0]);
    expect(await second({ canvas: canvases[1] })).toBe(renderers[1]);
    expect(await first({ canvas: canvases[0] })).toBe(renderers[0]);
    expect(hoisted.createRenderer).toHaveBeenCalledTimes(2);
    expect(hoisted.createRenderer).toHaveBeenNthCalledWith(1, 'viewport', 'webgpu', canvases[0]);
    expect(hoisted.createRenderer).toHaveBeenNthCalledWith(2, 'viewport', 'webgpu', canvases[1]);
  });

  it('should preserve DPR changes but skip buffer resets for an unchanged DPR', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    let ratio = 1;
    const setPixelRatio = vi.fn((value: number) => {
      ratio = value;
    });
    const renderer = { setPixelRatio, getPixelRatio: () => ratio };
    hoisted.createRenderer.mockResolvedValue(renderer);
    const factory = createTauR3fGlProp('webgl');
    if (typeof factory !== 'function') {
      throw new TypeError('Expected renderer factory');
    }
    await factory({ canvas: document.createElement('canvas') });
    renderer.setPixelRatio(1);
    renderer.setPixelRatio(2);
    renderer.setPixelRatio(2);
    renderer.setPixelRatio(1);
    expect(setPixelRatio.mock.calls).toEqual([[2], [1]]);
  });

  it('should report renderer creation failure and never settle so R3F leaves no unhandled rejection', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const failure = new Error('Error creating WebGL context.');
    hoisted.createRenderer.mockRejectedValue(failure);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onCreateError = vi.fn();
    const glFactory = createTauR3fGlProp('webgl', [], onCreateError);
    if (typeof glFactory !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }
    const canvas = document.createElement('canvas');
    const first = glFactory({ canvas });
    const second = glFactory({ canvas });
    const third = glFactory({ canvas });
    const settlement = async (): Promise<'settled'> => {
      try {
        await Promise.all([first, second, third]);
      } catch {
        return 'settled';
      }
      return 'settled';
    };
    const stillPending = async (): Promise<'pending'> => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      return 'pending';
    };

    expect(await Promise.race([settlement(), stillPending()])).toBe('pending');
    expect(onCreateError).toHaveBeenCalledWith(failure);
    expect(onCreateError).toHaveBeenCalledOnce();
    expect(hoisted.createRenderer).toHaveBeenCalledOnce();

    const replacement = { setPixelRatio: vi.fn(), getPixelRatio: () => 1 };
    hoisted.createRenderer.mockResolvedValue(replacement);
    const retryFactory = createTauR3fGlProp('webgl', [], onCreateError);
    if (typeof retryFactory !== 'function') {
      throw new TypeError('Expected fresh renderer factory');
    }
    expect(await retryFactory({ canvas: document.createElement('canvas') })).toBe(replacement);
    expect(onCreateError).toHaveBeenCalledOnce();
    expect(hoisted.createRenderer).toHaveBeenCalledTimes(2);
  });

  it('should suppress a retired pending failure and allow a fresh factory retry', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    let rejectCreation: ((error: Error) => void) | undefined;
    hoisted.createRenderer.mockImplementationOnce(
      async () =>
        new Promise<never>((_resolve, reject) => {
          rejectCreation = reject;
        }),
    );
    const onCreateError = vi.fn();
    const factory = createTauR3fGlProp('webgpu', [], onCreateError);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    factory.bindCanvas(canvas);
    let settled = false;
    const trackSettlement = async (): Promise<void> => {
      await factory({ canvas });
      settled = true;
    };
    const pendingSettlement = trackSettlement();
    canvas.remove();
    factory.bindCanvas(undefined);
    rejectCreation!(new Error('retired initialization failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(factory.isRetired()).toBe(true);
    expect(onCreateError).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    expect(pendingSettlement).toBeInstanceOf(Promise);
    void factory({ canvas });
    expect(hoisted.createRenderer).toHaveBeenCalledOnce();
    const replacement = { setPixelRatio: vi.fn(), getPixelRatio: () => 1 };
    hoisted.createRenderer.mockResolvedValueOnce(replacement);
    const fresh = createTauR3fGlProp('webgl', [], onCreateError);
    expect(await fresh({ canvas: document.createElement('canvas') })).toBe(replacement);
    expect(hoisted.createRenderer).toHaveBeenCalledTimes(2);
  });

  it('should restore both retained cameras to forward depth before a WebGL canvas starts', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const cameras = [new PerspectiveCamera(35, 1.6, 0.1, 1000), new OrthographicCamera(-3, 7, 5, -2, 0.1, 1000)];
    const originalProjections = cameras.map((camera) => camera.projectionMatrix.clone());
    for (const camera of cameras) {
      // Three r184's WebGPU renderer mutates this internal flag; reversedDepth has no setter.
      Object.assign(camera, {
        coordinateSystem: WebGPUCoordinateSystem,
        _reversedDepth: true,
      });
      camera.updateProjectionMatrix();
      expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1, 12);
      expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(0, 12);
    }
    hoisted.createRenderer.mockResolvedValue({
      setPixelRatio: vi.fn(),
      getPixelRatio: () => 1,
      coordinateSystem: WebGLCoordinateSystem,
    });
    const glFactory = createTauR3fGlProp('webgl', cameras);
    if (typeof glFactory !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }
    await glFactory({ canvas: document.createElement('canvas') });

    for (const [index, camera] of cameras.entries()) {
      expect(camera.coordinateSystem).toBe(WebGLCoordinateSystem);
      expect(camera.reversedDepth).toBe(false);
      expect(camera.projectionMatrix.equals(originalProjections[index]!)).toBe(true);
      expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(-1, 12);
      expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1, 12);
    }
  });

  it('should configure both native camera projections before the first WebGPU scene pass', async () => {
    const { createTauR3fGlProp } = await import('#components/geometry/graphics/three/canvas-three-gl.js');
    const cameras = [new PerspectiveCamera(35, 1.6, 0.1, 1000), new OrthographicCamera(-3, 7, 5, -2, 0.1, 1000)];
    const projectionUpdates = cameras.map((camera) => vi.spyOn(camera, 'updateProjectionMatrix'));
    hoisted.createRenderer.mockResolvedValue({
      setPixelRatio: vi.fn(),
      getPixelRatio: () => 1,
      coordinateSystem: WebGPUCoordinateSystem,
      reversedDepthBuffer: true,
    });
    const glFactory = createTauR3fGlProp('webgpu', cameras);
    if (typeof glFactory !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }
    const canvas = document.createElement('canvas');
    await Promise.all([glFactory({ canvas }), glFactory({ canvas })]);
    for (const update of projectionUpdates) {
      expect(update).toHaveBeenCalledOnce();
    }

    for (const camera of cameras) {
      expect(camera.coordinateSystem).toBe(WebGPUCoordinateSystem);
      expect(camera.reversedDepth).toBe(true);
      expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1, 12);
      expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(0, 12);
    }
  });
});
