import type * as ReactThreeFiber from '@react-three/fiber';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { PerspectiveCamera } from 'three';

import { ThreeCanvasInstance } from '#components/geometry/graphics/three/three-canvas-instance.js';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';

/**
 * Dispatches context-loss handlers registered via the latest stub `<Canvas>`
 * (`onCreated` runs in a microtask so `ThreeCanvasInstance` has a measurable `isCanvasReady` gap).
 */
let fireLatestWebGlContextLost: (() => void) | undefined;
let latestCanvasEventSource: ReactThreeFiber.CanvasProps['eventSource'] | undefined;
let latestCanvasEventPrefix: ReactThreeFiber.CanvasProps['eventPrefix'] | undefined;
let latestCanvasCamera: ReactThreeFiber.CanvasProps['camera'] | undefined;
const rigCamera = new PerspectiveCamera();
const setClipPlanes = vi.fn();
const cameraRig = { activeCamera: rigCamera, setClipPlanes };

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => cameraRig,
}));

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactThreeFiber>();

  type StubCanvasProps = {
    readonly children?: React.ReactNode;
    readonly camera?: ReactThreeFiber.CanvasProps['camera'];
    readonly eventPrefix?: ReactThreeFiber.CanvasProps['eventPrefix'];
    readonly eventSource?: ReactThreeFiber.CanvasProps['eventSource'];
    readonly onCreated?: (state: { gl: Record<string, unknown> }) => void;
  };

  function StubCanvas({ camera, children, eventPrefix, eventSource, onCreated }: StubCanvasProps): JSX.Element {
    latestCanvasCamera = camera;
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
        toneMappingExposure: 1,
        domElement,
      };

      const microtaskHandle = (): void => {
        onCreated?.({ gl });
        fireLatestWebGlContextLost = (): void => {
          for (const listener of webglListeners) {
            listener({ preventDefault: vi.fn() } as unknown as Event);
          }
        };
      };

      queueMicrotask(microtaskHandle);
    }, [onCreated]);

    return <div data-testid='stub-canvas'>{children}</div>;
  }

  return { ...actual, Canvas: StubCanvas };
});

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => false,
}));

vi.mock('#components/geometry/graphics/three/scene.js', () => ({
  Scene: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/geometry/graphics/three/post-processing.js', () => ({
  PostProcessing: () => null,
}));

vi.mock('#components/geometry/graphics/three/scene-overlay.js', () => ({
  OverlayDepthProvider: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  SceneOverlay: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  ThreeGraphicsBackendProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='graphics-backend-provider'>{children}</div>
  ),
}));

vi.mock('#components/geometry/graphics/three/react/axes-helper.js', () => ({
  AxesHelper: () => null,
}));

vi.mock('#components/geometry/graphics/three/grid.js', () => ({
  Grid: () => null,
}));

vi.mock('#components/geometry/graphics/three/webgpu-inspector-overlay.js', () => ({
  WebGpuInspectorOverlay: () => null,
}));

vi.mock('#components/geometry/graphics/three/actor-bridge.js', () => ({
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
    fireLatestWebGlContextLost = undefined;
    latestCanvasEventPrefix = undefined;
    latestCanvasEventSource = undefined;
    latestCanvasCamera = undefined;
    setClipPlanes.mockClear();
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
