import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { Canvas, createRoot, _roots, flushSync as flushThreeSync } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, WebGLCoordinateSystem } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { Activity, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import { WebglErrorBoundary } from '#cad/webgl-error-boundary.jsx';

const allocation = vi.hoisted(() => ({
  createRenderer: vi.fn<(preset: string, backend: string, canvas: HTMLCanvasElement) => Promise<WebGPURenderer>>(),
}));
vi.mock('#graphics/three/renderer.js', () => ({
  createRenderer: allocation.createRenderer,
}));
const perspectiveCamera = new PerspectiveCamera();
const orthographicCamera = new OrthographicCamera();
const cameraRig = {
  activeCamera: perspectiveCamera,
  perspectiveCamera,
  orthographicCamera,
  setClipPlanes: vi.fn(),
};
vi.mock('#hooks/use-graphics.jsx', () => ({ useCameraRig: () => cameraRig }));
vi.mock('#graphics/three/scene.jsx', () => ({
  Scene: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  ThreeGraphicsBackendProvider: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('#graphics/three/scene-overlay.jsx', () => ({
  OverlayDepthProvider: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  SceneOverlay: () => null,
}));
vi.mock('#graphics/three/post-processing.jsx', () => ({
  PostProcessing: () => null,
}));
vi.mock('#graphics/three/react/model-emphasis-overlay.jsx', () => ({
  ModelEmphasisOverlay: () => null,
}));
vi.mock('#graphics/three/render-fps-overlay.jsx', () => ({
  RenderFpsOverlay: () => null,
}));
vi.mock('#graphics/three/actor-bridge.jsx', () => ({
  ActorBridge: () => null,
}));
vi.mock('#graphics/three/react/axes-helper.jsx', () => ({
  AxesHelper: () => null,
}));
vi.mock('#graphics/three/grid.jsx', () => ({
  Grid: () => null,
}));
vi.mock('#graphics/three/webgpu-inspector-overlay.jsx', () => ({
  WebGpuInspectorOverlay: () => null,
}));

/** Real Canvas, configure, Provider, unmount and Three init/animation/dispose; only allocation is controlled. */
describe('ThreeCanvasInstance renderer lifetime', () => {
  const observers = new Set<() => void>();
  const frameCallbacks = new Map<number, FrameRequestCallback>();
  const renderers: WebGPURenderer[] = [];
  const animationTokens: Array<number | undefined> = [];
  const disposeCalls: Array<ReturnType<typeof vi.spyOn>> = [];
  let frameId = 0;
  let release: (() => void) | undefined;
  let width = 475;

  const drain = async (): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  };
  const measure = async (): Promise<void> => {
    await act(async () => {
      for (const notify of observers) {
        notify();
      }
    });
    await drain();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frameCallbacks.delete(id);
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly notify: () => void;
        public constructor(callback: ResizeObserverCallback) {
          this.notify = () => {
            callback([], this as unknown as ResizeObserver);
          };
        }
        public observe(): void {
          observers.add(this.notify);
        }
        public unobserve(): void {
          observers.delete(this.notify);
        }
        public disconnect(): void {
          observers.delete(this.notify);
        }
      },
    );
    width = 475;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, 864));
    allocation.createRenderer.mockImplementation(
      async (_preset: string, _backend: string, canvas: HTMLCanvasElement) => {
        const renderer = new WebGPURenderer({
          canvas,
          reversedDepthBuffer: true,
        });
        // GPU device/context allocation only. Three's actual init starts its actual internal Animation.
        vi.spyOn(renderer.backend, 'init').mockImplementation(async () => {
          if (release !== undefined) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
        });
        // Installed Three has these methods; its published Backend declaration omits them.
        const backend = renderer.backend as typeof renderer.backend & { updateSize: () => void; dispose: () => void };
        vi.spyOn(backend, 'updateSize').mockImplementation(() => undefined);
        vi.spyOn(backend, 'dispose').mockImplementation(() => undefined);
        vi.spyOn(renderer, 'render').mockImplementation(() => undefined);
        disposeCalls.push(vi.spyOn(renderer, 'dispose'));
        renderers.push(renderer);
        await renderer.init();
        // Observe Three's own RAF token separately from R3F's demand-loop token.
        animationTokens.push(
          (
            renderer as unknown as {
              readonly _animation: { readonly _requestId: number | undefined };
            }
          )._animation._requestId,
        );
        return renderer;
      },
    );
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    // Diagnostic cleanup is explicit even when the ownership assertion is RED.
    for (const renderer of renderers) {
      renderer.dispose();
    }
    _roots.clear();
    renderers.length = 0;
    disposeCalls.length = 0;
    animationTokens.length = 0;
    observers.clear();
    frameCallbacks.clear();
    release = undefined;
    allocation.createRenderer.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should dispose a settled renderer and stop its internally owned animation on removal', async () => {
    const view = render(<ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />);
    await measure();
    expect(renderers).toHaveLength(1);
    const renderer = renderers[0]!;
    const state = _roots.get(renderer.domElement)!.store.getState();
    expect(state.internal.active).toBe(true);
    const queuedBefore = frameCallbacks.size;
    expect(queuedBefore).toBeGreaterThan(0);
    expect(frameCallbacks.has(animationTokens[0]!)).toBe(true);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(disposeCalls[0]).toHaveBeenCalledOnce();
    expect(frameCallbacks.has(animationTokens[0]!)).toBe(false);
    expect(_roots.has(renderer.domElement)).toBe(false);
  });

  it('should keep a settled renderer through ordinary root size reconfiguration and scene updates', async () => {
    const view = render(
      <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined}>
        <group name='first-child' />
      </ThreeCanvasInstance>,
    );
    await measure();
    const renderer = renderers[0]!;
    expect(_roots.get(renderer.domElement)!.store.getState().scene.getObjectByName('first-child')).toBeDefined();
    width = 640;
    await measure();
    view.rerender(
      <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined}>
        <group name='replacement-child' />
      </ThreeCanvasInstance>,
    );
    await drain();
    expect(_roots.get(renderer.domElement)!.store.getState().size.width).toBe(640);
    const { scene } = _roots.get(renderer.domElement)!.store.getState();
    expect(scene.getObjectByName('first-child')).toBeUndefined();
    expect(scene.getObjectByName('replacement-child')).toBeDefined();
    expect(allocation.createRenderer).toHaveBeenCalledOnce();
    expect(disposeCalls[0]).not.toHaveBeenCalled();
  });

  it('should release the failed renderer root when creation shows the fallback', async () => {
    allocation.createRenderer.mockRejectedValueOnce(new Error('Renderer creation unavailable.'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(
      <WebglErrorBoundary fallback={({ error }) => <span>{error?.message}</span>}>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </WebglErrorBoundary>,
    );
    const canvas = view.container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    await measure();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(allocation.createRenderer).toHaveBeenCalledOnce();
    expect(view.getByText('Renderer creation unavailable.')).toBeDefined();
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(_roots.has(canvas!)).toBe(false);
  });

  it('should retain the live renderer through StrictMode effect replay', async () => {
    const view = render(
      <StrictMode>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </StrictMode>,
    );
    await measure();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(renderers).toHaveLength(1);
    expect(disposeCalls[0]).not.toHaveBeenCalled();
    expect(_roots.get(renderers[0]!.domElement)!.store.getState().internal.active).toBe(true);
    view.unmount();
  });

  it('should retain the renderer while Activity hides and reveals its canvas', async () => {
    const view = render(
      <Activity mode='visible'>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </Activity>,
    );
    await measure();
    const renderer = renderers[0]!;
    view.rerender(
      <Activity mode='hidden'>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </Activity>,
    );
    await drain();
    expect(disposeCalls[0]).not.toHaveBeenCalled();
    view.rerender(
      <Activity mode='visible'>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </Activity>,
    );
    await measure();
    expect(allocation.createRenderer).toHaveBeenCalledOnce();
    expect(_roots.get(renderer.domElement)!.store.getState().internal.active).toBe(true);
    view.unmount();
    await drain();
    expect(disposeCalls[0]).toHaveBeenCalledOnce();
  });

  it('should preserve a replacement created reentrantly while caller-owned renderer caches are released', async () => {
    const canvas = document.createElement('canvas');
    const renderer = new WebGPURenderer({ canvas });
    const replacement = new WebGPURenderer({ canvas });
    const loseContext = vi.fn();
    let replacementReady: Promise<unknown> | undefined;
    let replacementRoot: ReturnType<typeof createRoot> | undefined;
    const releaseCaches = vi.fn(() => {
      replacementRoot = createRoot(canvas);
      replacementReady = replacementRoot.configure({
        gl: replacement,
        size: { width: 20, height: 30, top: 0, left: 0 },
        frameloop: 'never',
      });
    });
    Object.assign(renderer, { forceContextLoss: loseContext, renderLists: { dispose: releaseCaches } });
    const dispose = vi.spyOn(renderer, 'dispose');
    const old = createRoot(canvas);
    await old.configure({ gl: renderer, size: { width: 10, height: 10, top: 0, left: 0 }, frameloop: 'never' });
    old.render(<group />);
    await drain();
    flushThreeSync(() => {
      old.unmount();
    });
    await drain();
    await replacementReady;
    expect(releaseCaches).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    expect(loseContext).not.toHaveBeenCalled();
    expect(_roots.get(canvas)!.store.getState().gl).toBe(replacement);
    replacementRoot!.unmount();
  });

  it.each(['resolve', 'reject'] as const)(
    'should preserve a replacement installed during asynchronous disposal (%s)',
    async (result) => {
      const canvas = document.createElement('canvas');
      const renderer: WebGPURenderer = await allocation.createRenderer('viewport', 'webgpu', canvas);
      const loseContext = vi.fn();
      Object.assign(renderer, { forceContextLoss: loseContext });
      let finish: (() => void) | undefined;
      const dispose = vi.spyOn(renderer, 'dispose').mockImplementationOnce(
        async () =>
          new Promise<void>((resolve, reject) => {
            finish =
              result === 'resolve'
                ? resolve
                : () => {
                    reject(new Error('Controlled disposal rejection'));
                  };
          }),
      );
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const old = createRoot(canvas);
      await old.configure({
        gl: async () => renderer,
        size: { width: 10, height: 10, top: 0, left: 0 },
        frameloop: 'never',
      });
      old.render(<group />);
      await drain();
      flushThreeSync(() => {
        old.unmount();
      });
      await drain();
      expect(dispose).toHaveBeenCalledOnce();
      const survivor = createRoot(canvas);
      const replacement = new WebGPURenderer({ canvas });
      await survivor.configure({
        gl: replacement,
        size: { width: 20, height: 30, top: 0, left: 0 },
        frameloop: 'never',
      });
      survivor.render(<group />);
      finish!();
      await drain();
      expect(loseContext).not.toHaveBeenCalled();
      expect(_roots.get(canvas)!.store.getState().gl).toBe(replacement);
      expect(dispose).toHaveBeenCalledOnce();
      if (result === 'reject') {
        expect(warning).toHaveBeenCalledWith('[R3F] Error disposing renderer', expect.any(Error));
      }
      survivor.unmount();
    },
  );

  it('should retire only the removed keyed backend and retain an independent canvas', async () => {
    const view = render(
      <>
        <ThreeCanvasInstance key='webgpu' graphicsBackend='webgpu' onRetry={() => undefined} />
        <ThreeCanvasInstance key='independent' graphicsBackend='webgpu' onRetry={() => undefined} />
      </>,
    );
    await measure();
    const oldRenderer = renderers[0]!;
    const independent = renderers[1]!;
    view.rerender(
      <>
        <ThreeCanvasInstance key='webgl' graphicsBackend='webgl' onRetry={() => undefined} />
        <ThreeCanvasInstance key='independent' graphicsBackend='webgpu' onRetry={() => undefined} />
      </>,
    );
    await measure();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(renderers).toHaveLength(3);
    expect(disposeCalls[0]).toHaveBeenCalledOnce();
    expect(disposeCalls[1]).not.toHaveBeenCalled();
    expect(disposeCalls[2]).not.toHaveBeenCalled();
    expect(_roots.has(oldRenderer.domElement)).toBe(false);
    expect(_roots.get(independent.domElement)!.store.getState().internal.active).toBe(true);
    expect(_roots.get(renderers[2]!.domElement)!.store.getState().internal.active).toBe(true);
    width = 700;
    await measure();
    expect(_roots.get(independent.domElement)!.store.getState().size.width).toBe(700);
    expect(_roots.get(renderers[2]!.domElement)!.store.getState().size.width).toBe(700);
  });

  it('should dispose the owned renderer when device loss removes Canvas without removing its parent', async () => {
    const view = render(<ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />);
    await measure();
    const renderer = renderers[0]!;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      renderer.onDeviceLost({
        api: 'WebGPU',
        message: 'test device loss',
        reason: 'unknown',
        originalEvent: undefined,
      });
    });
    await drain();
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(disposeCalls[0]).toHaveBeenCalledOnce();
    expect(frameCallbacks.has(animationTokens[0]!)).toBe(false);
  });

  it('should not dispose a caller-owned external renderer on R3F Canvas removal', async () => {
    const canvas = document.createElement('canvas');
    const renderer = await allocation.createRenderer('viewport', 'webgpu', canvas);
    const view = render(
      <Canvas gl={renderer} frameloop='never'>
        <group name='external-child' />
      </Canvas>,
    );
    await measure();
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(disposeCalls[0]).not.toHaveBeenCalled();
    expect(frameCallbacks.has(animationTokens[0]!)).toBe(true);
  });

  it.each([0, 501])(
    'should prevent a retired configure/render continuation from replacing a fresh same-canvas root at %i ms',
    async (elapsed) => {
      const canvas = document.createElement('canvas');
      let resolveOld: ((renderer: WebGPURenderer) => void) | undefined;
      const oldRenderer: WebGPURenderer = await allocation.createRenderer('viewport', 'webgpu', canvas);
      const loseOldContext = vi.fn();
      Object.assign(oldRenderer, { forceContextLoss: loseOldContext });
      const sharedCamera = new PerspectiveCamera();
      const old = createRoot(canvas);
      const oldConfiguration = old.configure({
        gl: async () =>
          new Promise<WebGPURenderer>((resolve) => {
            resolveOld = resolve;
          }),
        camera: sharedCamera,
        size: { width: 10, height: 10, top: 0, left: 0 },
        frameloop: 'never',
      });
      old.render(<group name='retired-child' />);
      flushThreeSync(() => {
        old.unmount();
      });
      await drain();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(elapsed);
      });
      const survivor = createRoot(canvas);
      const newRenderer = new WebGPURenderer({ canvas });
      await survivor.configure({
        gl: newRenderer,
        camera: sharedCamera,
        size: { width: 20, height: 30, top: 0, left: 0 },
        dpr: 1.5,
        frameloop: 'never',
      });
      survivor.render(<group name='survivor-child' />);
      await drain();
      const backingSize = [canvas.width, canvas.height];
      const projection = sharedCamera.projectionMatrix.toArray();
      await act(async () => {
        resolveOld!(oldRenderer);
        await oldConfiguration;
      });
      await drain();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(501);
      });
      const state = _roots.get(canvas)!.store.getState();
      expect(state.gl).toBe(newRenderer);
      expect(state.internal.active).toBe(true);
      expect(state.scene.getObjectByName('survivor-child')).toBeDefined();
      expect(state.scene.getObjectByName('retired-child')).toBeUndefined();
      expect(state.size.width).toBe(20);
      expect(newRenderer.getPixelRatio()).toBe(1.5);
      expect.soft([canvas.width, canvas.height]).toEqual(backingSize);
      expect.soft(sharedCamera.projectionMatrix.toArray()).toEqual(projection);
      expect.soft(disposeCalls[0]).toHaveBeenCalledTimes(1);
      expect.soft(loseOldContext).not.toHaveBeenCalled();
      survivor.unmount();
    },
  );

  it('should cancel render at the resolved-configure microtask handoff', async () => {
    const canvas = document.createElement('canvas');
    const renderer = new WebGPURenderer({ canvas });
    const root = createRoot(canvas);
    const rootStore = _roots.get(canvas)!.store;
    let resolveRenderer: ((renderer: WebGPURenderer) => void) | undefined;
    const configuration = root.configure({
      gl: async () =>
        new Promise<WebGPURenderer>((resolve) => {
          resolveRenderer = resolve;
        }),
      size: { width: 10, height: 10, top: 0, left: 0 },
      frameloop: 'never',
    });
    root.render(<group name='late-child' />);
    resolveRenderer!(renderer);
    queueMicrotask(() => {
      flushThreeSync(() => {
        root.unmount();
      });
    });
    await configuration;
    await drain();
    const state = rootStore.getState();
    expect(state.internal.active).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- R3F declares Scene but its pre-init store contains null.
    expect(state.scene?.getObjectByName('late-child')).toBeUndefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(_roots.has(canvas)).toBe(false);
  });

  it.each([0, 501])(
    'should retire pending init resolved %i ms after removal without late camera or root activation',
    async (elapsed) => {
      release = () => undefined;
      // Supported external eventSource keeps event connection observable after the inner Canvas div is detached.
      // The unchanged default-source reproduction is frozen separately and throws at that late connection.
      const view = render(
        <ThreeCanvasInstance graphicsBackend='webgpu' eventSource={document.body} onRetry={() => undefined} />,
      );
      await measure();
      expect(renderers).toHaveLength(1);
      const renderer = renderers[0]!;
      const root = _roots.get(renderer.domElement)!;
      expect(root.store.getState().gl).toBeNull();
      flushThreeSync(() => {
        view.unmount();
      });
      await drain();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(elapsed);
      });
      perspectiveCamera.coordinateSystem = WebGLCoordinateSystem;
      orthographicCamera.coordinateSystem = WebGLCoordinateSystem;
      await act(async () => {
        release!();
      });
      await drain();
      expect.soft(disposeCalls[0]).toHaveBeenCalledOnce();
      expect.soft(perspectiveCamera.coordinateSystem).toBe(WebGLCoordinateSystem);
      expect(root.store.getState().internal.active).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(501);
      });
      expect(_roots.has(renderer.domElement)).toBe(false);
    },
  );
});
