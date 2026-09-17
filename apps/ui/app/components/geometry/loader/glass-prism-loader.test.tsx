import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GraphicsBackendModule from '#components/geometry/graphics/graphics-backend.js';
import type {
  GlassPrismLoaderController,
  GlassPrismLoaderStatistics,
  GlassPrismSequenceState,
} from '#components/geometry/loader/glass-prism-controller.js';
import type { ShowcaseFrameCapture } from '#components/geometry/loader/showcase-capture.js';

const hoisted = vi.hoisted(() => ({
  controllers: [] as GlassPrismLoaderController[],
  createOptions: [] as unknown[],
  probeResult: false,
}));

vi.mock('#components/geometry/loader/glass-prism-controller.js', () => ({
  createGlassPrismLoader: vi.fn((options: unknown) => {
    hoisted.createOptions.push(options);
    // A plain object rather than `mock<T>()`: the proxy would wrap `ready` and break `await`.
    const controller: GlassPrismLoaderController = {
      ready: Promise.resolve(),
      play: vi.fn(),
      pause: vi.fn(),
      renderOnce: vi.fn(),
      setSize: vi.fn(),
      setTheme: vi.fn(),
      setSpeed: vi.fn(),
      jumpTo: vi.fn(),
      getSequenceState: vi.fn(
        (): GlassPrismSequenceState => ({
          phase: 'rest',
          currentShape: 'prism',
          nextShape: 'prism',
          history: ['prism'],
          transitionCount: 0,
        }),
      ),
      getStatistics: vi.fn(
        (): GlassPrismLoaderStatistics => ({
          backend: 'webgl2',
          framesPerSecond: 0,
          vertexCount: 0,
          ribbonCount: 0,
          isBloomEnabled: false,
          targetFrameRate: 60,
          adaptiveLevel: 0,
          pixelRatio: 1,
          isPlaying: false,
        }),
      ),
      getShaderSource: vi.fn(async () => ({ vertexShader: '', fragmentShader: '' })),
      captureFrame: vi.fn(
        async (): Promise<ShowcaseFrameCapture> => ({
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
  useTheme: () => ({ theme: 'light' }),
}));

const lastController = (): GlassPrismLoaderController => {
  const controller = hoisted.controllers.at(-1);
  if (!controller) {
    throw new Error('No loader controller was created.');
  }
  return controller;
};

describe('GlassPrismLoader', () => {
  beforeEach(() => {
    hoisted.controllers.length = 0;
    hoisted.createOptions.length = 0;
    hoisted.probeResult = false;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        public observe(): void {
          // Visibility is exercised by the shared hook's metal loader tests.
        }
        public disconnect(): void {
          // No bookkeeping.
        }
        public unobserve(): void {
          // No bookkeeping.
        }
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should announce a busy status and build the controller for the page theme', async () => {
    const { GlassPrismLoader } = await import('#components/geometry/loader/glass-prism-loader.js');
    const onReady = vi.fn();

    render(<GlassPrismLoader onReady={onReady} initialShape='gem' seed={3} />);

    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => {
      expect(status).toHaveAttribute('data-state', 'ready');
    });
    expect(onReady).toHaveBeenCalledWith(lastController());
    expect(hoisted.createOptions[0]).toMatchObject({
      backend: 'webgl',
      theme: 'light',
      quality: 'high',
      initialShape: 'gem',
      seed: 3,
    });
  });

  it('should forward theme and speed to the controller and dispose it on unmount', async () => {
    const { GlassPrismLoader } = await import('#components/geometry/loader/glass-prism-loader.js');

    const { rerender, unmount } = render(<GlassPrismLoader semantic='img' label='Glass showcase' speed={1} />);
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Glass showcase' })).toHaveAttribute('data-state', 'ready');
    });
    const controller = lastController();
    expect(controller.setTheme).toHaveBeenCalledWith('light');
    expect(vi.mocked(controller.setSize).mock.calls[0]?.[0]?.pixelRatio).toBeGreaterThan(0);

    rerender(<GlassPrismLoader semantic='img' label='Glass showcase' speed={0.5} />);
    expect(controller.setSpeed).toHaveBeenLastCalledWith(0.5);
    expect(hoisted.controllers).toHaveLength(1);

    unmount();
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });
});
