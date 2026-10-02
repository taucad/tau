import type * as ReactThreeFiber from '@react-three/fiber';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import { ThreeCanvasInstance } from '#components/geometry/graphics/three/three-canvas-instance.js';

/**
 * Dispatches context-loss handlers registered via the latest stub `<Canvas>`
 * (`onCreated` runs in a microtask so `ThreeCanvasInstance` has a measurable `isCanvasReady` gap).
 */
let fireLatestWebGlContextLost: (() => void) | undefined;

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactThreeFiber>();

  type StubCanvasProps = {
    readonly children?: React.ReactNode;
    readonly onCreated?: (state: { gl: Record<string, unknown> }) => void;
  };

  function StubCanvas({ children, onCreated }: StubCanvasProps): JSX.Element {
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
  });

  it('shows Graphics context lost fallback when WebGL fires context loss', async () => {
    const onRetry = vi.fn();

    render(
      <ThreeCanvasInstance graphicsBackend='webgl' onRetry={onRetry}>
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
});
