import type { GraphicsEvent } from '#machines/graphics.machine.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { Canvas, createRoot, _roots, flushSync as flushThreeSync } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, WebGLCoordinateSystem } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { Component, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import { WebGpuInitializationError } from '#graphics/three/webgpu-initialization-error.js';
import { createTauR3fGlProp, RetiredCanvasError } from '#graphics/three/canvas-three-gl.js';

/** Stands in for the viewer's error boundary: records what the canvas throws and renders nothing after. */
class CatchRendererError extends Component<
  { readonly children: ReactNode; readonly onError: (error: unknown) => void },
  { readonly failed: boolean }
> {
  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  public override state = { failed: false };

  public override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  public override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const allocation = vi.hoisted(() => ({
  createRenderer: vi.fn(),
  /** A device the next renderers report, standing in for the GPUDevice Three's init would request. */
  device: undefined as { lost: Promise<{ reason: string; message: string }> } | undefined,
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
const graphicsRef = { send: vi.fn<(event: GraphicsEvent) => void>() };
vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => cameraRig,
  useGraphics: () => graphicsRef,
}));
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
    graphicsRef.send.mockClear();
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
      async (_preset: string, _backend: string, surface: HTMLCanvasElement | { canvas: HTMLCanvasElement }) => {
        const canvas = surface instanceof HTMLCanvasElement ? surface : surface.canvas;
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
        const backend = renderer.backend as typeof renderer.backend & {
          updateSize: () => void;
          dispose: () => void;
        };
        vi.spyOn(backend, 'updateSize').mockImplementation(() => undefined);
        vi.spyOn(backend, 'dispose').mockImplementation(() => undefined);
        vi.spyOn(renderer, 'render').mockImplementation(() => undefined);
        if (allocation.device) {
          Object.assign(renderer.backend, { device: allocation.device });
        }
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
    allocation.device = undefined;
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

  it('should hand a device the browser destroyed under a live canvas to the WebGL fallback', async () => {
    let loseDevice: (info: { reason: string; message: string }) => void = () => undefined;
    allocation.device = {
      lost: new Promise((resolve) => {
        loseDevice = resolve;
      }),
    };
    const { probeWebGpuSupport } = await import('#graphics/graphics-backend.js');
    const caught: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(
      <CatchRendererError onError={(error) => caught.push(error)}>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </CatchRendererError>,
    );
    await measure();
    await act(async () => {
      loseDevice({ reason: 'destroyed', message: 'Device was destroyed.' });
    });
    await drain();
    expect(caught).toHaveLength(1);
    expect(caught[0]).toBeInstanceOf(WebGpuInitializationError);
    expect(view.container.querySelector('canvas')).toBeNull();
    // Viewers mounted afterwards start on WebGL rather than repeating the start the browser could not present.
    expect(await probeWebGpuSupport()).toBe(false);
  });

  it('should take a destroyed device on a retired canvas for its own disposal', async () => {
    let loseDevice: (info: { reason: string; message: string }) => void = () => undefined;
    allocation.device = {
      lost: new Promise((resolve) => {
        loseDevice = resolve;
      }),
    };
    const caught: unknown[] = [];
    const view = render(
      <CatchRendererError onError={(error) => caught.push(error)}>
        <ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />
      </CatchRendererError>,
    );
    await measure();
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
      loseDevice({ reason: 'destroyed', message: 'Device was destroyed.' });
    });
    await drain();
    expect(caught).toHaveLength(0);
    expect(disposeCalls[0]).toHaveBeenCalledOnce();
  });

  it('should not dispose a caller-owned external renderer on R3F Canvas removal', async () => {
    const canvas = document.createElement('canvas');
    const renderer = (await allocation.createRenderer('viewport', 'webgpu', canvas)) as WebGPURenderer;
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
      // The viewer's own factory, retired while its renderer is still initializing, against a fresh root on the
      // same canvas. R3F 9.8 tears a root down only once its renderer request settles, so the factory must settle.
      release = () => undefined;
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      const factory = createTauR3fGlProp('webgpu');
      factory.bindCanvas(canvas);
      const old = createRoot(canvas);
      const oldConfiguration = old.configure({
        gl: factory,
        size: { width: 10, height: 10, top: 0, left: 0 },
        frameloop: 'never',
      });
      old.render(<group name='retired-child' />);
      await drain();
      expect(renderers).toHaveLength(1);
      flushThreeSync(() => {
        old.unmount();
      });
      canvas.remove();
      factory.bindCanvas(undefined);
      await expect(oldConfiguration).rejects.toBeInstanceOf(RetiredCanvasError);
      await drain();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(elapsed);
      });
      // The removed canvas's root is gone before its renderer exists, so nothing can resume it.
      expect(_roots.has(canvas)).toBe(false);
      const survivor = createRoot(canvas);
      const newRenderer = new WebGPURenderer({ canvas });
      await survivor.configure({
        gl: newRenderer,
        size: { width: 20, height: 30, top: 0, left: 0 },
        dpr: 1.5,
        frameloop: 'never',
      });
      survivor.render(<group name='survivor-child' />);
      await drain();
      await act(async () => {
        release!();
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
      // The late renderer of the retired request is released by its factory, once.
      expect(disposeCalls[0]).toHaveBeenCalledOnce();
      survivor.unmount();
    },
  );

  it('should cancel render at the resolved-configure microtask handoff', async () => {
    const canvas = document.createElement('canvas');
    const renderer = new WebGPURenderer({ canvas });
    const root = createRoot(canvas);
    // Observe the root this canvas had; R3F 9.8 removes it from `_roots` once teardown completes.
    const created = _roots.get(canvas)!;
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
    const state = created.store.getState();
    expect(state.internal.active).toBe(false);
    expect(state.scene.getObjectByName('late-child')).toBeUndefined();
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
      // The removed canvas is torn down without waiting for its renderer: no root stays registered for it.
      expect(_roots.has(renderer.domElement)).toBe(false);
      perspectiveCamera.coordinateSystem = WebGLCoordinateSystem;
      orthographicCamera.coordinateSystem = WebGLCoordinateSystem;
      await act(async () => {
        release!();
      });
      await drain();
      expect.soft(disposeCalls[0]).toHaveBeenCalledOnce();
      expect.soft(perspectiveCamera.coordinateSystem).toBe(WebGLCoordinateSystem);
      expect(root.store.getState().internal.active).toBe(false);
      // No renderer status from the retired canvas: only its mount declaration, withdrawn at removal.
      expect(graphicsRef.send.mock.calls.map(([event]) => event.type)).toEqual(['canvasMounted', 'canvasUnmounted']);
    },
  );
});
