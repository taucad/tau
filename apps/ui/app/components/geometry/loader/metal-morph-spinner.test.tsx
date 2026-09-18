import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MetalMorphSpinnerTarget } from '#components/geometry/loader/metal-morph-spinner-service.js';

const hoisted = vi.hoisted(() => ({
  targets: [] as MetalMorphSpinnerTarget[],
  unsubscribes: [] as Array<ReturnType<typeof vi.fn>>,
  observers: [] as Array<{ callback: IntersectionObserverCallback; element?: Element }>,
  reducedMotion: false,
  service: {
    subscribe: vi.fn(),
    setTheme: vi.fn(),
    setMotionAllowed: vi.fn(),
    setDocumentHidden: vi.fn(),
    refresh: vi.fn(),
    getDiagnostics: vi.fn(),
  },
}));

vi.mock('#components/geometry/loader/metal-morph-spinner-service.js', () => ({
  getMetalMorphSpinnerService: () => hoisted.service,
}));

vi.mock('#hooks/use-theme.js', () => ({
  useTheme: (): { theme: string } => ({ theme: 'dark' }),
}));

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

const lastTarget = (): MetalMorphSpinnerTarget => {
  const target = hoisted.targets.at(-1);
  if (!target) {
    throw new Error('The spinner registered no target with the service.');
  }
  return target;
};

describe('MetalMorphSpinner', () => {
  beforeEach(() => {
    hoisted.targets.length = 0;
    hoisted.unsubscribes.length = 0;
    hoisted.observers.length = 0;
    hoisted.reducedMotion = false;
    hoisted.service.subscribe.mockImplementation((target: MetalMorphSpinnerTarget) => {
      hoisted.targets.push(target);
      const unsubscribe = vi.fn();
      hoisted.unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
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
          // No per-element bookkeeping is needed for the spinner.
        }
      },
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public observe(): void {
          // The spinner only needs the observer to exist; resizes are exercised through `getSize`.
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
      vi.fn(() => ({
        matches: hoisted.reducedMotion,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should stay out of the accessibility tree and show its stand-in until the first frame', async () => {
    const { MetalMorphSpinner } = await import('#components/geometry/loader/metal-morph-spinner.js');

    render(<MetalMorphSpinner className='size-4' fallback={<span data-testid='stand-in'>waiting</span>} />);

    const root = document.querySelector('[data-state]');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveAttribute('data-state', 'pending');
    expect(screen.getByTestId('stand-in')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    act(() => {
      lastTarget().onFirstFrame?.();
    });

    expect(root).toHaveAttribute('data-state', 'ready');
    expect(screen.queryByTestId('stand-in')).not.toBeInTheDocument();
  });

  it('should register its canvas with the shared service and release it on unmount', async () => {
    const { MetalMorphSpinner } = await import('#components/geometry/loader/metal-morph-spinner.js');

    const view = render(<MetalMorphSpinner className='size-4' />);

    expect(hoisted.service.subscribe).toHaveBeenCalledTimes(1);
    expect(lastTarget().canvas).toBeInstanceOf(HTMLCanvasElement);

    view.unmount();

    expect(hoisted.unsubscribes[0]).toHaveBeenCalledTimes(1);
  });

  it('should report its own visibility to the service rather than holding the loop open offscreen', async () => {
    const { MetalMorphSpinner } = await import('#components/geometry/loader/metal-morph-spinner.js');

    render(<MetalMorphSpinner className='size-4' />);
    const target = lastTarget();
    expect(target.isIntersecting()).toBe(false);

    intersect(true);
    expect(target.isIntersecting()).toBe(true);
    expect(hoisted.service.refresh).toHaveBeenCalled();

    intersect(false);
    expect(target.isIntersecting()).toBe(false);
  });

  it('should forward the theme and the reduced-motion preference to the service', async () => {
    hoisted.reducedMotion = true;
    const { MetalMorphSpinner } = await import('#components/geometry/loader/metal-morph-spinner.js');

    render(<MetalMorphSpinner className='size-4' />);

    expect(hoisted.service.setTheme).toHaveBeenCalledWith('dark');
    expect(hoisted.service.setMotionAllowed).toHaveBeenCalledWith(false);
    expect(hoisted.service.setDocumentHidden).toHaveBeenCalledWith(false);
  });

  it('should ask for a source that covers its own box at the display ratio', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { MetalMorphSpinner } = await import('#components/geometry/loader/metal-morph-spinner.js');

    render(<MetalMorphSpinner className='size-4' />);

    // The box jsdom reports is zero-sized, which the spinner floors at one CSS pixel; the ratio is what
    // matters here, and it is capped so a 3× display does not ask for a nine-times-larger source.
    expect(lastTarget().getSize()).toMatchObject({ pixelRatio: 2 });
  });
});
