// @vitest-environment jsdom
import * as React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCarouselDialog } from '#components/ui/image-carousel-dialog.js';
import type { ImageCarouselDialogItem } from '#components/ui/image-carousel-dialog.js';

type MockCarouselOptions = {
  readonly loop?: boolean;
  readonly startIndex?: number;
};

type MockCarouselEvent = 'select' | 'reInit';

const carouselMock = vi.hoisted(() => {
  const listeners: Record<MockCarouselEvent, Set<() => void>> = {
    select: new Set(),
    reInit: new Set(),
  };
  const optionsHistory: MockCarouselOptions[] = [];
  const state = {
    selectedSnap: 0,
  };
  const api = {
    canScrollNext: vi.fn(() => true),
    canScrollPrev: vi.fn(() => true),
    off: vi.fn((eventName: MockCarouselEvent, handler: () => void) => {
      listeners[eventName].delete(handler);
      return api;
    }),
    on: vi.fn((eventName: MockCarouselEvent, handler: () => void) => {
      listeners[eventName].add(handler);
      return api;
    }),
    scrollNext: vi.fn(),
    scrollPrev: vi.fn(),
    scrollTo: vi.fn(),
    selectedScrollSnap: vi.fn(() => state.selectedSnap),
  };

  return {
    api,
    listeners,
    optionsHistory,
    reset() {
      state.selectedSnap = 0;
      listeners.select.clear();
      listeners.reInit.clear();
      optionsHistory.length = 0;
      api.canScrollNext.mockClear();
      api.canScrollPrev.mockClear();
      api.off.mockClear();
      api.on.mockClear();
      api.scrollNext.mockClear();
      api.scrollPrev.mockClear();
      api.scrollTo.mockClear();
      api.selectedScrollSnap.mockClear();
    },
    select(index: number) {
      state.selectedSnap = index;
      for (const handler of listeners.select) {
        handler();
      }
    },
  };
});

vi.mock('#components/ui/carousel.js', async () => {
  const ReactModule = await import('react');

  type MockCarouselProperties = React.ComponentProps<'div'> & {
    readonly opts?: MockCarouselOptions;
    readonly setApi?: (api: typeof carouselMock.api) => void;
  };

  const Carousel = ReactModule.forwardRef<HTMLDivElement, MockCarouselProperties>(function MockCarousel(
    { children, opts, setApi, ...properties },
    reference,
  ) {
    carouselMock.optionsHistory.push(opts ?? {});

    ReactModule.useEffect(() => {
      setApi?.(carouselMock.api);
    }, [setApi]);

    return (
      <div ref={reference} {...properties}>
        {children}
      </div>
    );
  });

  const CarouselContent = ReactModule.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    function MockCarouselContent({ children, ...properties }, reference) {
      return (
        <div ref={reference} {...properties}>
          {children}
        </div>
      );
    },
  );

  const CarouselItem = ReactModule.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(function MockCarouselItem(
    { children, ...properties },
    reference,
  ) {
    return (
      <div ref={reference} {...properties}>
        {children}
      </div>
    );
  });

  function CarouselPrevious(properties: React.ComponentProps<'button'>): React.JSX.Element {
    return (
      <button type='button' {...properties}>
        Previous slide
      </button>
    );
  }

  function CarouselNext(properties: React.ComponentProps<'button'>): React.JSX.Element {
    return (
      <button type='button' {...properties}>
        Next slide
      </button>
    );
  }

  return {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
  };
});

const items: ImageCarouselDialogItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `item-${index + 1}`,
  src: `data:image/svg+xml,item-${index + 1}`,
  alt: `Item ${index + 1}`,
  downloadName: `item-${index + 1}.png`,
}));

describe('ImageCarouselDialog', () => {
  beforeEach(() => {
    carouselMock.reset();
  });

  it('should initialize Embla with the clicked image index and update chrome from select events only', async () => {
    render(<ImageCarouselDialog initialIndex={2} isOpen items={items} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(carouselMock.api.on).toHaveBeenCalledWith('select', expect.any(Function));
    });

    expect(carouselMock.optionsHistory.at(-1)).toMatchObject({ loop: true, startIndex: 2 });
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download item-3.png' })).toHaveAttribute('href', items[2]?.src);

    act(() => {
      carouselMock.select(3);
    });

    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download item-4.png' })).toHaveAttribute('href', items[3]?.src);
    expect(carouselMock.api.scrollTo).not.toHaveBeenCalled();
    expect(carouselMock.optionsHistory.at(-1)).toMatchObject({ loop: true, startIndex: 2 });
  });

  it('should create each open session from the supplied initial index', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ImageCarouselDialog initialIndex={0} isOpen={false} items={items} onOpenChange={onOpenChange} />,
    );

    rerender(<ImageCarouselDialog initialIndex={4} isOpen items={items} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(carouselMock.optionsHistory.at(-1)).toMatchObject({ startIndex: 4 });
    });
    expect(screen.getByText('5 / 5')).toBeInTheDocument();

    rerender(<ImageCarouselDialog initialIndex={4} isOpen={false} items={items} onOpenChange={onOpenChange} />);
    rerender(<ImageCarouselDialog initialIndex={1} isOpen items={items} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(carouselMock.optionsHistory.at(-1)).toMatchObject({ startIndex: 1 });
    });
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('should eager-load full dialog images', () => {
    render(<ImageCarouselDialog initialIndex={0} isOpen items={items} onOpenChange={vi.fn()} />);

    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('loading', 'eager');
    }
  });
});
