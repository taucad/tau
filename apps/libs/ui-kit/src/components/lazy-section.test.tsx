import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

let observerCallback: IntersectionObserverCallback;
const mockDisconnect = vi.fn();
const mockObserve = vi.fn();

let lastObserverOptions: IntersectionObserverInit | undefined;

function createMockObserver(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
  observerCallback = callback;
  lastObserverOptions = options;
  return { observe: mockObserve, disconnect: mockDisconnect, unobserve: vi.fn() };
}

vi.stubGlobal('IntersectionObserver', createMockObserver);

describe('LazySection', () => {
  beforeEach(() => {
    mockDisconnect.mockClear();
    mockObserve.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not render children before intersection', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    render(
      <LazySection minHeight='400px'>
        <div data-testid='child'>Content</div>
      </LazySection>,
    );

    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('should render children after IntersectionObserver triggers', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    render(
      <LazySection minHeight='400px'>
        <div data-testid='child'>Content</div>
      </LazySection>,
    );

    act(() => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IntersectionObserver entries
      const entry: IntersectionObserverEntry = { isIntersecting: true } as IntersectionObserverEntry;
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IntersectionObserver
      observerCallback([entry], {} as IntersectionObserver);
    });

    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('should render a placeholder with specified minHeight', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    const { container } = render(
      <LazySection minHeight='400px'>
        <div>Content</div>
      </LazySection>,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.minHeight).toBe('400px');
  });

  it('should disconnect observer after first intersection', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    render(
      <LazySection minHeight='400px'>
        <div>Content</div>
      </LazySection>,
    );

    act(() => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IntersectionObserver entries
      const entry: IntersectionObserverEntry = { isIntersecting: true } as IntersectionObserverEntry;
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IntersectionObserver
      observerCallback([entry], {} as IntersectionObserver);
    });

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should render fallback when provided and not yet visible', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    render(
      <LazySection minHeight='400px' fallback={<div data-testid='fallback'>Loading...</div>}>
        <div data-testid='child'>Content</div>
      </LazySection>,
    );

    expect(screen.getByTestId('fallback')).toBeDefined();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('should not render fallback after intersection', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    render(
      <LazySection minHeight='400px' fallback={<div data-testid='fallback'>Loading...</div>}>
        <div data-testid='child'>Content</div>
      </LazySection>,
    );

    act(() => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IntersectionObserver entries
      const entry: IntersectionObserverEntry = { isIntersecting: true } as IntersectionObserverEntry;
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IntersectionObserver
      observerCallback([entry], {} as IntersectionObserver);
    });

    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('should accept a rootMargin for early triggering', async () => {
    const { LazySection } = await import('#components/lazy-section.js');

    render(
      <LazySection minHeight='400px' rootMargin='200px'>
        <div>Content</div>
      </LazySection>,
    );

    expect(lastObserverOptions?.rootMargin).toBe('200px');
  });
});
