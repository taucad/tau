import * as React from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '#components/ui/carousel.js';
import type { CarouselApi } from '#components/ui/carousel.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '#components/ui/dialog.js';
import { cn } from '#utils/ui.utils.js';

type ImageCarouselDialogItem = {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly label?: string;
  readonly downloadName?: string;
};

type ImageCarouselDialogProperties = {
  readonly items: readonly ImageCarouselDialogItem[];
  readonly isOpen: boolean;
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImageError?: (item: ImageCarouselDialogItem, index: number) => void;
  readonly contentClassName?: string;
  /** Additional props to spread onto the dialog backdrop and content (e.g., focus trap attributes). */
  readonly dialogProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
};

const imageCarouselOverlayControlAttribute = 'data-image-carousel-overlay-control';

function clampImageIndex(index: number, itemCount: number): number {
  if (itemCount === 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), itemCount - 1);
}

function getDownloadName(item: ImageCarouselDialogItem, index: number): string {
  return item.downloadName ?? `uploaded-image-${index + 1}.png`;
}

function getOutsideInteractionTarget(event: Event): EventTarget | undefined {
  const originalEvent =
    event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'originalEvent' in event.detail
      ? (event.detail as { readonly originalEvent?: Event }).originalEvent
      : undefined;

  return originalEvent?.target ?? event.target ?? undefined;
}

function isImageCarouselOverlayControlEvent(event: Event): boolean {
  const target = getOutsideInteractionTarget(event);

  return target instanceof Element && target.closest(`[${imageCarouselOverlayControlAttribute}]`) !== null;
}

function ImageCarouselDialog({
  items,
  isOpen,
  initialIndex,
  onOpenChange,
  onImageError,
  contentClassName,
  dialogProps,
}: ImageCarouselDialogProperties): React.JSX.Element | undefined {
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>();
  const clampedInitialIndex = clampImageIndex(initialIndex, items.length);
  const [activeIndex, setActiveIndex] = React.useState(clampedInitialIndex);
  const carouselReference = React.useRef<HTMLDivElement>(null);
  const hasMultipleItems = items.length > 1;
  const clampedActiveIndex = clampImageIndex(activeIndex, items.length);
  const currentItem = items[clampedActiveIndex];
  const currentDownloadName = currentItem ? getDownloadName(currentItem, clampedActiveIndex) : undefined;
  const carouselOptions = React.useMemo(
    () => ({ loop: hasMultipleItems, startIndex: clampedInitialIndex }),
    [clampedInitialIndex, hasMultipleItems],
  );
  const canUseDocument = isOpen && typeof document !== 'undefined';

  React.useEffect(() => {
    if (items.length === 0) {
      if (isOpen) {
        onOpenChange(false);
      }

      return;
    }

    setActiveIndex((currentIndex) => clampImageIndex(currentIndex, items.length));
  }, [isOpen, items.length, onOpenChange]);

  React.useEffect(() => {
    if (isOpen) {
      setActiveIndex(clampedInitialIndex);
    } else {
      setCarouselApi(undefined);
      setActiveIndex(clampedInitialIndex);
    }
  }, [clampedInitialIndex, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    requestAnimationFrame(() => {
      carouselReference.current?.focus();
    });
  }, [isOpen]);

  React.useEffect(() => {
    if (!carouselApi) {
      return;
    }

    const handleSelect = (): void => {
      setActiveIndex(carouselApi.selectedScrollSnap());
    };

    carouselApi.on('select', handleSelect);
    carouselApi.on('reInit', handleSelect);

    return () => {
      carouselApi.off('select', handleSelect);
      carouselApi.off('reInit', handleSelect);
    };
  }, [carouselApi]);

  if (items.length === 0) {
    return undefined;
  }

  return (
    <Dialog open={isOpen} modal={false} onOpenChange={onOpenChange}>
      {canUseDocument
        ? createPortal(
            <div
              aria-hidden='true'
              className='fixed inset-0 z-100 animate-in bg-black/60 fade-in-0'
              {...dialogProps}
              onClick={() => {
                onOpenChange(false);
              }}
            />,
            document.body,
          )
        : null}
      {canUseDocument && currentItem && currentDownloadName
        ? createPortal(
            <div
              className='fixed top-4 right-4 z-102 flex items-center gap-2'
              data-image-carousel-overlay-control=''
              {...dialogProps}
            >
              <Button
                asChild
                aria-label={`Download ${currentDownloadName}`}
                className='rounded-full border-0 bg-background text-foreground shadow-md hover:bg-background/90 [&_svg]:size-5'
                size='icon-lg'
                variant='outline'
              >
                <a
                  download={currentDownloadName}
                  href={currentItem.src}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Download />
                </a>
              </Button>
              <DialogClose asChild>
                <Button
                  aria-label='Close image preview'
                  className='rounded-full border-0 bg-background text-foreground shadow-md hover:bg-background/90 [&_svg]:size-5'
                  size='icon-lg'
                  type='button'
                  variant='outline'
                >
                  <X />
                </Button>
              </DialogClose>
            </div>,
            document.body,
          )
        : null}
      <DialogContent
        {...dialogProps}
        onInteractOutside={(event) => {
          if (isImageCarouselOverlayControlEvent(event)) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isImageCarouselOverlayControlEvent(event)) {
            event.preventDefault();
          }
        }}
        className={cn(
          'z-101! flex h-[80vh]! max-h-none! w-auto! max-w-[90vw]! items-center justify-center overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none *:data-[slot=dialog-close]:hidden max-md:w-[90vw]',
          contentClassName,
        )}
      >
        <DialogTitle className='sr-only'>Image preview carousel</DialogTitle>
        <DialogDescription className='sr-only'>
          Use the previous and next controls or arrow keys to review images.
        </DialogDescription>
        <Carousel
          ref={carouselReference}
          aria-label='Image preview carousel'
          className='flex h-full w-full min-w-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
          opts={carouselOptions}
          setApi={setCarouselApi}
          tabIndex={0}
        >
          <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
            <CarouselContent className='h-full items-center'>
              {items.map((item, index) => (
                <CarouselItem key={item.id} className='flex h-full items-center justify-center pl-0'>
                  <div className='relative flex h-full w-full items-center justify-center'>
                    <img
                      alt={item.alt}
                      className='max-h-[80vh] max-w-[90vw] rounded-lg object-contain'
                      loading='eager'
                      src={item.src}
                      onError={() => {
                        onImageError?.(item, index);
                      }}
                    />
                    {item.label ? (
                      <div className='absolute top-5 left-10 max-w-[calc(100%-5rem)] truncate rounded bg-black/60 px-2 py-1 text-xs font-medium tracking-wide text-white uppercase max-md:left-4'>
                        {item.label}
                      </div>
                    ) : null}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>

            {hasMultipleItems ? (
              <>
                {canUseDocument
                  ? createPortal(
                      <div className='contents' data-image-carousel-overlay-control='' {...dialogProps}>
                        <CarouselPrevious
                          className='fixed top-1/2 left-4 z-102 size-10 -translate-y-1/2 rounded-full border-0 bg-background text-foreground shadow-md hover:bg-background/90 disabled:opacity-40 [&_svg]:size-5'
                          size='icon-lg'
                        />
                        <CarouselNext
                          className='fixed top-1/2 right-4 z-102 size-10 -translate-y-1/2 rounded-full border-0 bg-background text-foreground shadow-md hover:bg-background/90 disabled:opacity-40 [&_svg]:size-5'
                          size='icon-lg'
                        />
                      </div>,
                      document.body,
                    )
                  : null}
                {canUseDocument
                  ? createPortal(
                      <div className='pointer-events-none fixed bottom-4 left-1/2 z-102 flex h-10 -translate-x-1/2 items-center rounded-full bg-background/90 px-4 text-sm font-medium text-foreground shadow-md'>
                        {clampedActiveIndex + 1} / {items.length}
                      </div>,
                      document.body,
                    )
                  : null}
              </>
            ) : null}
          </div>
        </Carousel>
      </DialogContent>
    </Dialog>
  );
}

export { ImageCarouselDialog };
export type { ImageCarouselDialogItem };
