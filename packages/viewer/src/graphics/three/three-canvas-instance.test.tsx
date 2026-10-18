import type * as ReactThreeFiber from '@react-three/fiber';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from 'three';
import type { Camera } from 'three';
import { mock } from 'vitest-mock-extended';

import { WebglErrorBoundary } from '#cad/webgl-error-boundary.jsx';
import { WebglErrorFallback } from '#cad/webgl-fallback.jsx';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#graphics/three/utils/infinite-grid-frame.js';
import type * as ViewerEnvironmentModule from '#environment/viewer-environment.jsx';

/**
 * Dispatches context-loss handlers registered via the latest stub `<Canvas>`
 * (`onCreated` runs in a microtask so `ThreeCanvasInstance` has a measurable `isCanvasReady` gap).
 */
let fireLatestWebGlContextLost: (() => void) | undefined;
let latestCanvasEventSource: ReactThreeFiber.CanvasProps['eventSource'] | undefined;
let latestCanvasEventPrefix: ReactThreeFiber.CanvasProps['eventPrefix'] | undefined;
let latestCanvasCamera: ReactThreeFiber.CanvasProps['camera'] | undefined;
let latestCanvasGl: ReactThreeFiber.CanvasProps['gl'] | undefined;
let latestCanvasDpr: ReactThreeFiber.CanvasProps['dpr'] | undefined;
let exposureAfterCreated: number | undefined;
let latestCanvasState: StubRootState | undefined;
/** The camera the stub root rays from; a test replaces it. */
let stubRootCamera: Camera = new PerspectiveCamera();

type StubPointerEvent = Readonly<Record<'offsetX' | 'offsetY' | 'clientX' | 'clientY', number>>;
type StubCompute = (event: StubPointerEvent, state: StubRootState, previous?: StubRootState) => void;
/** The slice of R3F's root state that `onCreated` and pointer compute read. */
type StubRootState = {
  gl: Record<string, unknown>;
  camera: Camera;
  pointer: Vector2;
  raycaster: Raycaster;
  size: Readonly<{ width: number; height: number }>;
  events: { compute?: StubCompute };
  setEvents: (events: { compute?: StubCompute }) => void;
};
const rigCamera = new PerspectiveCamera();
const orthographicCamera = new OrthographicCamera();
const setClipPlanes = vi.fn();
const cameraRig = { activeCamera: rigCamera, perspectiveCamera: rigCamera, orthographicCamera, setClipPlanes };
const enabledFeatures = vi.hoisted(() => new Set<string>());
/** When set, the mocked renderer factory throws it, as three's `WebGLRenderer` does without a context. */
const rendererFailure = vi.hoisted((): { error: Error | undefined } => ({ error: undefined }));

vi.mock('#graphics/three/renderer.js', () => ({
  async createRenderer() {
    if (rendererFailure.error) {
      throw rendererFailure.error;
    }
    let pixelRatio = 1;
    return {
      dispose: vi.fn(),
      coordinateSystem: WebGLCoordinateSystem,
      getPixelRatio: () => pixelRatio,
      setPixelRatio(value: number) {
        pixelRatio = value;
      },
    };
  },
}));

vi.mock('#graphics/three/render-fps-overlay.jsx', () => ({
  RenderFpsOverlay: () => <output aria-label='Render-loop submission FPS'>FPS · idle</output>,
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => cameraRig,
}));

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactThreeFiber>();

  type StubCanvasProps = {
    readonly children?: React.ReactNode;
    readonly camera?: ReactThreeFiber.CanvasProps['camera'];
    readonly gl?: ReactThreeFiber.CanvasProps['gl'];
    readonly dpr?: ReactThreeFiber.CanvasProps['dpr'];
    readonly eventPrefix?: ReactThreeFiber.CanvasProps['eventPrefix'];
    readonly eventSource?: ReactThreeFiber.CanvasProps['eventSource'];
    readonly onCreated?: (state: StubRootState) => void;
  };

  function StubCanvas({
    camera,
    children,
    dpr,
    eventPrefix,
    eventSource,
    gl: glFactory,
    onCreated,
  }: StubCanvasProps): JSX.Element {
    latestCanvasCamera = camera;
    latestCanvasGl = glFactory;
    latestCanvasDpr = dpr;
    latestCanvasEventPrefix = eventPrefix;
    latestCanvasEventSource = eventSource;

    useEffect(() => {
      const webglListeners: EventListener[] = [];
      const domElement = {
        addEventListener(type: string, listener: EventListener): void {
          if (type === 'webglcontextlost') {
            webglListeners.push(listener);
          }
        },
        removeEventListener(): void {
          void 0;
        },
      };

      const gl = {
        toneMappingExposure: 0.37,
        domElement,
      };

      // As R3F's root: its default compute reads offset coordinates, and an `eventPrefix` Canvas swaps in a compute
      // reading `${eventPrefix}X` just before `onCreated`. Both ray with three's own `setFromCamera`.
      const computeFrom =
        (prefix: 'offset' | 'client'): StubCompute =>
        (event, state) => {
          state.pointer.set(
            (event[`${prefix}X`] / state.size.width) * 2 - 1,
            -(event[`${prefix}Y`] / state.size.height) * 2 + 1,
          );
          state.raycaster.setFromCamera(state.pointer, state.camera);
        };
      const state: StubRootState = {
        gl,
        camera: stubRootCamera,
        pointer: new Vector2(),
        raycaster: new Raycaster(),
        size: { width: 800, height: 600 },
        events: { compute: computeFrom('offset') },
        setEvents(events) {
          state.events = { ...state.events, ...events };
        },
      };

      const microtaskHandle = (): void => {
        if (eventPrefix === 'client') {
          state.setEvents({ compute: computeFrom('client') });
        }
        onCreated?.(state);
        latestCanvasState = state;
        exposureAfterCreated = gl.toneMappingExposure;
        fireLatestWebGlContextLost = (): void => {
          for (const listener of webglListeners) {
            listener({ preventDefault: vi.fn() } as unknown as Event);
          }
        };
      };

      queueMicrotask(microtaskHandle);
    }, [eventPrefix, onCreated]);

    return <div data-testid='stub-canvas'>{children}</div>;
  }

  return { ...actual, Canvas: StubCanvas };
});

vi.mock('#environment/viewer-environment.jsx', async (importOriginal) => ({
  ...(await importOriginal<typeof ViewerEnvironmentModule>()),
  useViewerFeature: (key: string) => enabledFeatures.has(key),
}));

vi.mock('#graphics/three/scene.jsx', () => ({
  Scene: ({ children, enableGizmo }: { readonly children: React.ReactNode; readonly enableGizmo: boolean }) => (
    <div>
      {enableGizmo ? <div role='img' aria-label='View cube' /> : null}
      {children}
    </div>
  ),
}));

vi.mock('#graphics/three/post-processing.jsx', () => ({
  PostProcessing: () => null,
}));

vi.mock('#graphics/three/react/model-emphasis-overlay.jsx', () => ({
  ModelEmphasisOverlay: () => null,
}));

vi.mock('#graphics/three/scene-overlay.jsx', () => ({
  OverlayDepthProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  SceneOverlay: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  ThreeGraphicsBackendProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='graphics-backend-provider'>{children}</div>
  ),
}));

vi.mock('#graphics/three/react/axes-helper.jsx', () => ({
  AxesHelper: () => null,
}));

vi.mock('#graphics/three/grid.jsx', () => ({
  Grid: () => null,
}));

vi.mock('#graphics/three/webgpu-inspector-overlay.jsx', () => ({
  WebGpuInspectorOverlay: () => <div data-testid='gpu-inspector' />,
}));

vi.mock('#graphics/three/actor-bridge.jsx', () => ({
  ActorBridge: () => <div data-testid='actor-bridge' />,
}));

function KeyedThreeCanvas({ canvasKey }: { readonly canvasKey: string }) {
  return (
    <ThreeCanvasInstance key={canvasKey} graphicsBackend='webgl' onRetry={() => undefined}>
      {null}
    </ThreeCanvasInstance>
  );
}

describe('ThreeCanvasInstance', () => {
  beforeEach(() => {
    enabledFeatures.clear();
    fireLatestWebGlContextLost = undefined;
    latestCanvasEventPrefix = undefined;
    latestCanvasEventSource = undefined;
    latestCanvasCamera = undefined;
    latestCanvasGl = undefined;
    latestCanvasDpr = undefined;
    exposureAfterCreated = undefined;
    latestCanvasState = undefined;
    stubRootCamera = new PerspectiveCamera();
    setClipPlanes.mockClear();
    rendererFailure.error = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('drawing-buffer pixel ratio', () => {
    const renderAt = (devicePixelRatio: number, coarsePointer: boolean): void => {
      vi.spyOn(globalThis, 'devicePixelRatio', 'get').mockReturnValue(devicePixelRatio);
      vi.spyOn(globalThis, 'matchMedia').mockImplementation((query: string) =>
        mock<MediaQueryList>({
          matches: coarsePointer && query === '(pointer: coarse)',
          media: query,
        }),
      );
      render(<ThreeCanvasInstance graphicsBackend='webgl' onRetry={() => undefined} />);
    };

    it('should cap a coarse-pointer phone at 2, as on desktop, so edges stay sharp', () => {
      renderAt(3, true);
      expect(latestCanvasDpr).toBe(2);
    });

    it('should keep the 2x cap on a fine-pointer display', () => {
      renderAt(3, false);
      expect(latestCanvasDpr).toBe(2);
    });

    it('should never raise the pixel ratio above the device ratio', () => {
      renderAt(1, true);
      expect(latestCanvasDpr).toBe(1);
    });
  });

  it.each(['webgl', 'webgpu'] as const)(
    'should show %s FPS only while Tau Debug is enabled and retain the view cube',
    async (graphicsBackend) => {
      const view = render(
        <ThreeCanvasInstance enableGizmo graphicsBackend={graphicsBackend} onRetry={() => undefined} />,
      );
      await waitFor(() => {
        expect(screen.getByRole('img', { name: 'View cube' })).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Render-loop submission FPS')).not.toBeInTheDocument();

      enabledFeatures.add('tauDebug');
      view.rerender(<ThreeCanvasInstance enableGizmo graphicsBackend={graphicsBackend} onRetry={() => undefined} />);
      expect(screen.getByRole('img', { name: 'View cube' })).toBeInTheDocument();
      expect(screen.getByLabelText('Render-loop submission FPS')).toBeInTheDocument();

      view.rerender(
        <ThreeCanvasInstance enableGizmo={false} graphicsBackend={graphicsBackend} onRetry={() => undefined} />,
      );
      expect(screen.queryByRole('img', { name: 'View cube' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Render-loop submission FPS')).toBeInTheDocument();

      enabledFeatures.delete('tauDebug');
      view.rerender(<ThreeCanvasInstance enableGizmo graphicsBackend={graphicsBackend} onRetry={() => undefined} />);
      expect(screen.getByRole('img', { name: 'View cube' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Render-loop submission FPS')).not.toBeInTheDocument();
    },
  );

  it('should show the WebGL fallback instead of an unhandled rejection when the renderer cannot be created', async () => {
    rendererFailure.error = new Error('Error creating WebGL context.');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <WebglErrorBoundary fallback={(errorProps) => <WebglErrorFallback {...errorProps} />}>
        <ThreeCanvasInstance graphicsBackend='webgl' onRetry={() => undefined}>
          {null}
        </ThreeCanvasInstance>
      </WebglErrorBoundary>,
    );
    const glFactory = latestCanvasGl;
    if (typeof glFactory !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }

    await act(async () => {
      // The real Canvas catches configure rejection while the owner renders its fallback.
      await expect(glFactory({ canvas: document.createElement('canvas') })).rejects.toThrow(
        'Error creating WebGL context.',
      );
    });

    expect(await screen.findByText('3D rendering failed')).toBeInTheDocument();
    expect(screen.getByText('Error creating WebGL context.')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-canvas')).not.toBeInTheDocument();
  });

  it('loads the inspector only on explicit demand while the lightweight debug bridge remains independent', async () => {
    enabledFeatures.add('tauDebug');
    const view = render(<ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('actor-bridge')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gpu-inspector')).not.toBeInTheDocument();
    enabledFeatures.add('webGpuInspector');
    view.rerender(<ThreeCanvasInstance graphicsBackend='webgpu' onRetry={() => undefined} />);
    expect(screen.getByTestId('gpu-inspector')).toBeInTheDocument();
  });

  it('shows Graphics context lost fallback when WebGL fires context loss', async () => {
    const onRetry = vi.fn();

    render(
      <ThreeCanvasInstance enableGrid graphicsBackend='webgl' onRetry={onRetry}>
        {null}
      </ThreeCanvasInstance>,
    );

    await waitFor(() => {
      expect(fireLatestWebGlContextLost).toBeDefined();
    });

    await act(async () => {
      fireLatestWebGlContextLost?.();
    });

    await waitFor(() => {
      expect(screen.getByText('Graphics context lost')).toBeInTheDocument();
    });
    expect(setClipPlanes).toHaveBeenLastCalledWith(undefined);
  });

  it('preserves the lighting owner exposure when the canvas finishes mounting', async () => {
    render(<KeyedThreeCanvas canvasKey='exposure' />);
    await waitFor(() => {
      expect(exposureAfterCreated).toBe(0.37);
    });
  });

  it('ignores queued context-loss when the keyed instance already unmounted (stale teardown)', async () => {
    const { rerender } = render(<KeyedThreeCanvas canvasKey='a' />);

    await waitFor(() => {
      expect(fireLatestWebGlContextLost).toBeDefined();
    });

    const staleFire = fireLatestWebGlContextLost;

    rerender(<KeyedThreeCanvas canvasKey='b' />);

    await waitFor(() => {
      expect(screen.getByTestId('stub-canvas')).toBeInTheDocument();
    });

    await act(async () => {
      staleFire?.();
    });

    expect(screen.queryByText('Graphics context lost')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-canvas')).toBeInTheDocument();
  });

  it('keeps ActorBridge gated until each key mount runs onCreated again', async () => {
    const { rerender } = render(<KeyedThreeCanvas canvasKey='a' />);

    await waitFor(() => {
      expect(screen.getByTestId('actor-bridge')).toBeInTheDocument();
    });

    rerender(<KeyedThreeCanvas canvasKey='b' />);

    expect(screen.queryByTestId('actor-bridge')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('actor-bridge')).toBeInTheDocument();
    });
  });

  it('reveals ActorBridge only after deferred onCreated completes (stub microtask)', async () => {
    render(
      <ThreeCanvasInstance graphicsBackend='webgl' onRetry={() => undefined}>
        {null}
      </ThreeCanvasInstance>,
    );

    expect(screen.queryByTestId('actor-bridge')).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('actor-bridge')).toBeInTheDocument();
  });

  it('forwards explicit Canvas event routing props to R3F', async () => {
    const eventSource: React.RefObject<HTMLElement> = { current: document.createElement('div') };

    await act(async () => {
      render(
        <ThreeCanvasInstance
          eventPrefix='client'
          eventSource={eventSource}
          graphicsBackend='webgl'
          onRetry={() => undefined}
        >
          {null}
        </ThreeCanvasInstance>,
      );
      await Promise.resolve();
    });

    expect(latestCanvasEventPrefix).toBe('client');
    expect(latestCanvasEventSource).toBe(eventSource);
  });

  it.each([['default', undefined] as const, ['eventPrefix', 'client'] as const])(
    'should start orthographic pointer rays on the camera plane under WebGPU reversed depth with the %s compute',
    async (_compute, eventPrefix) => {
      // At z 6 looking down −z, as the WebGPU renderer (`reversedDepthBuffer: true`) leaves an orthographic camera.
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
      Object.assign(camera, { coordinateSystem: WebGPUCoordinateSystem, _reversedDepth: true });
      camera.position.set(0, 0, 6);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      stubRootCamera = camera;

      await act(async () => {
        render(
          <ThreeCanvasInstance eventPrefix={eventPrefix} graphicsBackend='webgpu' onRetry={() => undefined}>
            {null}
          </ThreeCanvasInstance>,
        );
        await Promise.resolve();
      });
      const state = latestCanvasState;
      if (!state) {
        throw new TypeError('Expected the Canvas to be created.');
      }
      state.events.compute?.({ offsetX: 400, offsetY: 300, clientX: 400, clientY: 300 }, state);

      expect(state.raycaster.ray.origin.z).toBeCloseTo(6);
      expect(state.raycaster.ray.direction.z).toBeCloseTo(-1);
    },
  );

  it('uses the provider-owned native camera from the first Canvas render', async () => {
    await act(async () => {
      render(
        <ThreeCanvasInstance graphicsBackend='webgl' onRetry={() => undefined}>
          {null}
        </ThreeCanvasInstance>,
      );
      await Promise.resolve();
    });

    expect(latestCanvasCamera).toBe(rigCamera);
  });

  it('should restore both retained camera depth conventions when AO is disabled', async () => {
    for (const camera of [rigCamera, orthographicCamera]) {
      Object.assign(camera, { coordinateSystem: WebGPUCoordinateSystem, _reversedDepth: true });
      camera.updateProjectionMatrix();
    }
    await act(async () => {
      render(
        <ThreeCanvasInstance
          graphicsBackend='webgl'
          postProcessingSettings={{ aoEnabled: false }}
          onRetry={() => undefined}
        >
          {null}
        </ThreeCanvasInstance>,
      );
    });
    if (typeof latestCanvasGl !== 'function') {
      throw new TypeError('Expected the R3F renderer factory.');
    }
    await latestCanvasGl({ canvas: document.createElement('canvas') });

    for (const camera of [rigCamera, orthographicCamera]) {
      expect(camera.coordinateSystem).toBe(WebGLCoordinateSystem);
      expect(camera.reversedDepth).toBe(false);
    }
  });

  it('installs and clears grid presentation clipping during the canvas layout lifecycle', () => {
    const { rerender, unmount } = render(
      <ThreeCanvasInstance enableGrid graphicsBackend='webgl' onRetry={() => undefined}>
        {null}
      </ThreeCanvasInstance>,
    );

    expect(setClipPlanes).toHaveBeenLastCalledWith({
      farPaddingVerticalSpans: infiniteGridFadeEndVisibleSpans,
      presentationPlane: infiniteGridPresentationPlaneByUpDirection.z,
    });
    const installedCallCount = setClipPlanes.mock.calls.length;

    rerender(
      <ThreeCanvasInstance className='unchanged-policy' enableGrid graphicsBackend='webgl' onRetry={() => undefined}>
        {null}
      </ThreeCanvasInstance>,
    );
    expect(setClipPlanes).toHaveBeenCalledTimes(installedCallCount);

    rerender(
      <ThreeCanvasInstance enableGrid graphicsBackend='webgl' onRetry={() => undefined} upDirection='x'>
        {null}
      </ThreeCanvasInstance>,
    );
    expect(setClipPlanes).toHaveBeenCalledTimes(installedCallCount + 1);
    expect(setClipPlanes).toHaveBeenLastCalledWith({
      farPaddingVerticalSpans: infiniteGridFadeEndVisibleSpans,
      presentationPlane: infiniteGridPresentationPlaneByUpDirection.x,
    });

    rerender(
      <ThreeCanvasInstance enableGrid={false} graphicsBackend='webgl' onRetry={() => undefined}>
        {null}
      </ThreeCanvasInstance>,
    );
    expect(setClipPlanes).toHaveBeenLastCalledWith(undefined);

    rerender(
      <ThreeCanvasInstance enableGrid graphicsBackend='webgl' onRetry={() => undefined}>
        {null}
      </ThreeCanvasInstance>,
    );
    expect(setClipPlanes).toHaveBeenLastCalledWith({
      farPaddingVerticalSpans: infiniteGridFadeEndVisibleSpans,
      presentationPlane: infiniteGridPresentationPlaneByUpDirection.z,
    });

    const clearCallsBeforeUnmount = setClipPlanes.mock.calls.filter(([policy]) => policy === undefined).length;
    unmount();
    expect(setClipPlanes).toHaveBeenLastCalledWith(undefined);
    expect(setClipPlanes.mock.calls.filter(([policy]) => policy === undefined)).toHaveLength(
      clearCallsBeforeUnmount + 1,
    );
  });
});
