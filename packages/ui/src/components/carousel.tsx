import * as React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { UseEmblaCarouselType } from 'embla-carousel-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { Button } from '#components/button.js';

/**
 * Embla API exposed by {@link Carousel} after initialization.
 *
 * @public
 * @example <caption>Advance a captured carousel API.</caption>
 * ```typescript
 * import type { CarouselApi } from '@taucad/ui/components/carousel';
 *
 * const advance = (api: CarouselApi) => api?.scrollNext();
 * ```
 */
type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  readonly opts?: CarouselOptions;
  readonly plugins?: CarouselPlugin;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | undefined>(undefined);

function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />');
  }

  return context;
}

/**
 * Owns an Embla carousel and its keyboard navigation state.
 *
 * @public
 * @example <caption>Render a horizontal carousel.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Carousel } from '@taucad/ui/components/carousel';
 *
 * createElement(Carousel, { orientation: 'horizontal' });
 * ```
 */
function Carousel({
  orientation = 'horizontal',
  opts,
  setApi,
  plugins,
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<'div'> & CarouselProps): React.JSX.Element {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === 'horizontal' ? 'x' : 'y',
    },
    plugins,
  );
  const [canScrollPrevious, setCanScrollPrevious] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) {
      return;
    }

    setCanScrollPrevious(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  const scrollPrevious = React.useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = React.useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrevious, scrollNext],
  );

  React.useEffect(() => {
    if (!api || !setApi) {
      return;
    }

    setApi(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) {
      return;
    }

    onSelect(api);
    api.on('reInit', onSelect);
    api.on('select', onSelect);

    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api, onSelect]);

  const contextValue = React.useMemo(
    () => ({
      carouselRef,
      api,
      opts,
      orientation,
      scrollPrev: scrollPrevious,
      scrollNext,
      canScrollPrev: canScrollPrevious,
      canScrollNext,
    }),
    [carouselRef, api, opts, orientation, scrollPrevious, scrollNext, canScrollPrevious, canScrollNext],
  );

  return (
    <CarouselContext.Provider value={contextValue}>
      <div
        ref={ref}
        className={cn('relative', className)}
        role='region'
        aria-roledescription='carousel'
        onKeyDownCapture={handleKeyDown}
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

/**
 * Provides the clipped track that contains carousel items.
 *
 * @public
 * @example <caption>Render a carousel track.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Carousel, CarouselContent } from '@taucad/ui/components/carousel';
 *
 * createElement(Carousel, null, createElement(CarouselContent));
 * ```
 */
function CarouselContent({ className, ref, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div ref={carouselRef} className='overflow-hidden'>
      <div
        ref={ref}
        className={cn('flex', orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col', className)}
        {...props}
      />
    </div>
  );
}

/**
 * Renders one accessible slide within {@link CarouselContent}.
 *
 * @public
 * @example <caption>Render one carousel slide.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Carousel, CarouselContent, CarouselItem } from '@taucad/ui/components/carousel';
 *
 * createElement(Carousel, null, createElement(CarouselContent, null, createElement(CarouselItem, null, 'One')));
 * ```
 */
function CarouselItem({ className, ref, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  const { orientation } = useCarousel();

  return (
    <div
      ref={ref}
      role='group'
      aria-roledescription='slide'
      className={cn('min-w-0 shrink-0 grow-0 basis-full', orientation === 'horizontal' ? 'pl-4' : 'pt-4', className)}
      {...props}
    />
  );
}

/**
 * Moves the carousel to its previous slide.
 *
 * @public
 * @example <caption>Add a previous-slide control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Carousel, CarouselPrevious } from '@taucad/ui/components/carousel';
 *
 * createElement(Carousel, null, createElement(CarouselPrevious));
 * ```
 */
function CarouselPrevious({
  className,
  variant = 'outline',
  size = 'icon',
  ...props
}: React.ComponentProps<typeof Button>): React.JSX.Element {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'absolute h-8 w-8 rounded-full',
        orientation === 'horizontal'
          ? 'top-1/2 -left-12 -translate-y-1/2'
          : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeft className='h-4 w-4' />
      <span className='sr-only'>Previous slide</span>
    </Button>
  );
}

/**
 * Moves the carousel to its next slide.
 *
 * @public
 * @example <caption>Add a next-slide control.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Carousel, CarouselNext } from '@taucad/ui/components/carousel';
 *
 * createElement(Carousel, null, createElement(CarouselNext));
 * ```
 */
function CarouselNext({
  className,
  variant = 'outline',
  size = 'icon',
  ...props
}: React.ComponentProps<typeof Button>): React.JSX.Element {
  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'absolute h-8 w-8 rounded-full',
        orientation === 'horizontal'
          ? 'top-1/2 -right-12 -translate-y-1/2'
          : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRight className='h-4 w-4' />
      <span className='sr-only'>Next slide</span>
    </Button>
  );
}

export { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext };
