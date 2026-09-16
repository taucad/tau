import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type * as GraphicsBackendModule from '#components/geometry/graphics/graphics-backend.js';
import type {
  MetalMorphFrameCapture,
  MetalMorphLoaderController,
  MetalMorphLoaderStatistics,
  MetalMorphSequenceState,
} from '#components/geometry/loader/metal-morph-controller.js';

const hoisted = vi.hoisted(() => ({
  controllers: [] as MetalMorphLoaderController[],
  createOptions: [] as unknown[],
  reducedMotion: false,
  probeResult: false,
  observers: [] as Array<{ callback: IntersectionObserverCallback; element?: Element }>,
}));

vi.mock('#components/geometry/loader/metal-morph-controller.js', () => ({
  createMetalMorphLoader: vi.fn((options: unknown) => {
    hoisted.createOptions.push(options);
    // A plain object rather than `mock<T>()`: the proxy would wrap `ready` and break `await`.
    const controller: MetalMorphLoaderController = {
      ready: Promise.resolve(),
      play: vi.fn(),
      pause: vi.fn(),
      renderOnce: vi.fn(),
      setSize: vi.fn(),
      setTheme: vi.fn(),
      setSpeed: vi.fn(),
      jumpTo: vi.fn(),
      getSequenceState: vi.fn(
        (): MetalMorphSequenceState => ({
          phase: 'rest',
          currentShape: 'cube',
          nextShape: 'cube',
          history: ['cube'],
          transitionCount: 0,
        }),
      ),
      getStatistics: vi.fn(
        (): MetalMorphLoaderStatistics => ({
          backend: 'webgl2',
          framesPerSecond: 0,
          vertexCount: 0,
          isBloomEnabled: false,
          isPlaying: false,
        }),
      ),
      getShaderSource: vi.fn(async () => ({ vertexShader: '', fragmentShader: '' })),
      captureFrame: vi.fn(
        async (): Promise<MetalMorphFrameCapture> => ({
          backend: 'webgl2',
          size: 0,
          coverage: 0,
          bodyLuminance: 0,
          bodyContrast: 0,
          highlightShare: 0,
          shadowShare: 0,
          distinctColors: 0,
          cornerAlpha: 0,
        }),
      ),
      dispose: vi.fn(),
    };
    hoisted.controllers.push(controller);
    return controller;
  }),
}));

vi.mock('#components/geometry/graphics/graphics-backend.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GraphicsBackendModule>();
  return {
    ...actual,
    probeWebGpuSupport: vi.fn(async () => hoisted.probeResult),
  };
});

vi.mock('#hooks/use-theme.js', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

const lastController = (): MetalMorphLoaderController => {
  const controller = hoisted.controllers.at(-1);
  if (!controller) {
    throw new Error('No loader controller was created.');
  }
  return controller;
};

const entryFor = (isIntersecting: boolean, target: Element): IntersectionObserverEntry => {
  const rect = target.getBoundingClientRect();
  return {
    boundingClientRect: rect,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: rect,
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
};

const intersect = (isIntersecting: boolean): void => {
  for (const observer of hoisted.observers) {
    act(() => {
      observer.callback([entryFor(isIntersecting, observer.element!)], mock<IntersectionObserver>());
    });
  }
};

describe('MetalMorphLoader', () => {
  beforeEach(() => {
    hoisted.controllers.length = 0;
    hoisted.createOptions.length = 0;
    hoisted.observers.length = 0;
    hoisted.reducedMotion = false;
    hoisted.probeResult = false;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
        public readonly callback: IntersectionObserverCallback;
        public constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        public observe(element: Element): void {
          hoisted.observers.push({ callback: this.callback, element });
        }
        public disconnect(): void {
          hoisted.observers.length = 0;
        }
        public unobserve(): void {
          // No per-element bookkeeping is needed for the loader.
        }
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: hoisted.reducedMotion,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should announce a busy status and keep the fallback until the first frame is ready', async () => {
    const { MetalMorphLoader } = await import('#components/geometry/loader/metal-morph-loader.js');
    const onReady = vi.fn();
    const onStatusChange = vi.fn();

    render(<MetalMorphLoader onReady={onReady} onStatusChange={onStatusChange} />);

    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('data-state', 'pending');

    await waitFor(() => {
      expect(status).toHaveAttribute('data-state', 'ready');
    });
    expect(onReady).toHaveBeenCalledWith(lastController());
    expect(onStatusChange).toHaveBeenLastCalledWith('ready');
    expect(hoisted.createOptions[0]).toMatchObject({ backend: 'webgl', theme: 'dark', quality: 'high' });
  });

  it('should prefer WebGPU when an adapter exists and describe a showcase as an image', async () => {
    hoisted.probeResult = true;
    const { MetalMorphLoader } = await import('#components/geometry/loader/metal-morph-loader.js');

    render(<MetalMorphLoader semantic='img' label='Liquid metal showcase' />);

    const image = screen.getByRole('img', { name: 'Liquid metal showcase' });
    expect(image).not.toHaveAttribute('aria-busy');
    await waitFor(() => {
      expect(image).toHaveAttribute('data-state', 'ready');
    });
    expect(hoisted.createOptions[0]).toMatchObject({ backend: 'webgpu' });
  });

  it('should play only while visible and pause with a still frame when it leaves the viewport', async () => {
    const { MetalMorphLoader } = await import('#components/geometry/loader/metal-morph-loader.js');

    render(<MetalMorphLoader />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready');
    });
    const controller = lastController();
    expect(controller.play).not.toHaveBeenCalled();
    expect(controller.pause).toHaveBeenCalled();
    expect(controller.renderOnce).toHaveBeenCalled();

    intersect(true);
    await waitFor(() => {
      expect(controller.play).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('status')).toHaveAttribute('data-playing', 'true');

    intersect(false);
    await waitFor(() => {
      expect(controller.pause).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('status')).toHaveAttribute('data-playing', 'false');
  });

  it('should hold a still frame under reduced motion and when paused by the host', async () => {
    hoisted.reducedMotion = true;
    const { MetalMorphLoader } = await import('#components/geometry/loader/metal-morph-loader.js');

    const { rerender } = render(<MetalMorphLoader />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready');
    });
    intersect(true);
    const controller = lastController();
    expect(controller.play).not.toHaveBeenCalled();
    expect(controller.renderOnce).toHaveBeenCalled();

    hoisted.reducedMotion = false;
    rerender(<MetalMorphLoader isPaused />);
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('should forward theme and speed to the controller and dispose it on unmount', async () => {
    const { MetalMorphLoader } = await import('#components/geometry/loader/metal-morph-loader.js');

    const { rerender, unmount } = render(<MetalMorphLoader speed={1} />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready');
    });
    const controller = lastController();
    expect(controller.setTheme).toHaveBeenCalledWith('dark');
    const measured = vi.mocked(controller.setSize).mock.calls[0]?.[0];
    expect(measured?.pixelRatio).toBeGreaterThan(0);
    expect(measured?.width).toBeGreaterThan(0);

    rerender(<MetalMorphLoader speed={1.5} />);
    expect(controller.setSpeed).toHaveBeenLastCalledWith(1.5);

    unmount();
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });
});
