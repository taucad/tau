import * as React from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { Dialog, DialogContent } from '@taucad/ui/components/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@taucad/ui/components/carousel';
import type { CarouselApi } from '@taucad/ui/components/carousel';

type ImagePreviewItem = {
  /** Unique identifier for the item */
  id: string;
  /** Image source URL */
  src: string;
  /** Label to display on the image */
  label: string;
};

type ImagePreviewGroupProps = {
  /** Array of image items to display */
  readonly items: ImagePreviewItem[];
  /** Alt text prefix for images (label will be appended) */
  readonly alt?: string;
  /** Additional className for the container */
  readonly className?: string;
  /** Size of thumbnails - matches Tailwind size classes */
  readonly thumbnailSize?: 'size-10' | 'size-12' | 'size-14' | 'size-16';
  /** Whether to show labels below thumbnails */
  readonly hasLabels?: boolean;
};

/**
 * ImagePreviewGroup - Displays a list of images as thumbnails with a carousel dialog
 *
 * Shows all image thumbnails in a row with optional labels.
 * Each image can be clicked to open a full-size carousel dialog.
 * Supports left/right arrow key navigation and looping in the dialog.
 */
function ImagePreviewGroup({
  items,
  alt = 'Image',
  className,
  thumbnailSize = 'size-12',
  hasLabels = true,
}: ImagePreviewGroupProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>();
  const carouselRef = React.useRef<HTMLDivElement>(null);
  // Track the index to scroll to when dialog opens (separate from visual selection)
  const pendingScrollIndex = React.useRef<number | undefined>(undefined);

  // Auto-focus carousel when dialog opens for immediate keyboard navigation
  React.useEffect(() => {
    if (dialogOpen && carouselRef.current) {
      carouselRef.current.focus();
    }
  }, [dialogOpen]);

  // Scroll to pending index when carousel API becomes available or dialog opens
  React.useEffect(() => {
    if (carouselApi && dialogOpen && pendingScrollIndex.current !== undefined) {
      // Use instant scroll (true = no animation) for initial positioning
      carouselApi.scrollTo(pendingScrollIndex.current, true);
      pendingScrollIndex.current = undefined;
    }
  }, [carouselApi, dialogOpen]);

  // Update selected index when carousel scrolls
  React.useEffect(() => {
    if (!carouselApi) {
      return;
    }

    const onSelect = (): void => {
      setSelectedIndex(carouselApi.selectedScrollSnap());
    };

    carouselApi.on('select', onSelect);

    return () => {
      carouselApi.off('select', onSelect);
    };
  }, [carouselApi]);

  const handleThumbnailClick = React.useCallback(
    (index: number) => {
      setSelectedIndex(index);
      pendingScrollIndex.current = index;

      // If carousel is already initialized, scroll immediately
      if (carouselApi) {
        carouselApi.scrollTo(index, true);
      }

      setDialogOpen(true);
    },
    [carouselApi],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowLeft': {
          event.preventDefault();
          setSelectedIndex((index) => (index > 0 ? index - 1 : items.length - 1));
          break;
        }

        case 'ArrowRight': {
          event.preventDefault();
          setSelectedIndex((index) => (index < items.length - 1 ? index + 1 : 0));
          break;
        }

        case 'Enter':
        case ' ': {
          event.preventDefault();
          setDialogOpen(true);
          break;
        }

        default: {
          break;
        }
      }
    },
    [items.length],
  );

  if (items.length === 0) {
    return <div className={cn('text-xs text-muted-foreground', className)}>No images</div>;
  }

  return (
    <>
      {/* Thumbnail grid */}
      <div
        aria-label='Image gallery'
        className={cn('flex flex-wrap items-start justify-center gap-3', className)}
        role='group'
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg p-1 transition-colors',
              index === selectedIndex && 'bg-muted/50',
            )}
          >
            <div
              className='cursor-pointer overflow-hidden rounded-md border bg-neutral/30 transition-colors hover:bg-neutral/40'
              role='button'
              tabIndex={-1}
              onClick={() => {
                handleThumbnailClick(index);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleThumbnailClick(index);
                }
              }}
              onMouseDown={(event) => {
                // Prevent blur events on parent elements
                event.preventDefault();
              }}
            >
              <img
                alt={`${alt} - ${item.label}`}
                className={cn(thumbnailSize, 'object-cover')}
                loading='lazy'
                src={item.src}
              />
            </div>

            {/* Optional label below thumbnail */}
            {hasLabels ? (
              <span className='text-[10px] tracking-wide text-muted-foreground uppercase'>{item.label}</span>
            ) : undefined}
          </div>
        ))}
      </div>

      {/* Full-size carousel dialog - carousel stays mounted for fast open */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='h-[80vh] w-auto max-w-[90vw]! overflow-hidden p-0 max-md:min-w-[90vw]'>
          <Carousel
            ref={carouselRef}
            className='flex h-full w-full flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
            opts={{ loop: true }}
            setApi={setCarouselApi}
            tabIndex={0}
          >
            {/* Carousel content with navigation buttons */}
            <div className='relative flex flex-1 items-center justify-center overflow-hidden'>
              <CarouselContent className='h-full items-center'>
                {items.map((item) => (
                  <CarouselItem key={item.id} className='flex h-full items-center justify-center pl-0'>
                    <div className='relative'>
                      <img
                        alt={`${alt} - ${item.label}`}
                        className='max-h-[calc(80vh-6rem)] w-auto rounded-lg object-contain'
                        loading='lazy'
                        src={item.src}
                      />
                      {/* Label overlay on top-left of image */}
                      <div className='absolute top-2 left-6 rounded bg-black/60 px-2 py-1 text-xs font-medium tracking-wide text-white uppercase'>
                        {item.label}
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </div>

            <CarouselPrevious className='left-2 max-md:top-[calc(100%-2rem)]' />
            <CarouselNext className='right-2 max-md:top-[calc(100%-2rem)]' />
            {/* Current position indicator */}
            <div className='mb-5 shrink-0 pt-3 text-center text-xs font-medium text-muted-foreground'>
              {selectedIndex + 1} / {items.length}
            </div>
          </Carousel>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ImagePreviewGroup };
export type { ImagePreviewItem };
