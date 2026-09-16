import * as React from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@taucad/ui/components/carousel';
import type { CarouselApi } from '@taucad/ui/components/carousel';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@taucad/ui/components/dialog';
import { cn } from '@taucad/ui/utils/cn';
import { attachmentAbsentLabel, attachmentDownloadName, useAttachmentSource } from '#hooks/use-attachment-source.js';

type ImageCarouselDialogItem = {
  readonly id: string;
  /** A `data:` URL or an `attachments/…` reference resolved against the dialog's `directory`. */
  readonly src: string;
  readonly mediaType: string;
  readonly alt: string;
  readonly label?: string;
  readonly downloadName?: string;
};

type ImageCarouselDialogProperties = {
  readonly items: readonly ImageCarouselDialogItem[];
  /** The directory the items' `attachments/` references resolve against. */
  readonly directory: string | undefined;
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
  return (
    item.downloadName ??
    attachmentDownloadName({ url: item.src, mediaType: item.mediaType }) ??
    `uploaded-image-${index + 1}.png`
  );
}

type DownloadLinkProperties = {
  readonly directory: string | undefined;
  readonly item: ImageCarouselDialogItem;
  readonly name: string;
};

/** Downloads the current image's bytes: the object URL for a reference, the URL itself otherwise. */
function DownloadLink({ directory, item, name }: DownloadLinkProperties): React.JSX.Element | undefined {
  const source = useAttachmentSource(directory, { url: item.src, mediaType: item.mediaType });
  if (source.status !== 'ready') {
    return undefined;
  }
  return (
    <Button
      asChild
      aria-label={`Download ${name}`}
      className='rounded-full border-0 bg-background text-foreground shadow-md hover:bg-background/90 [&_svg]:size-5'
      size='icon-lg'
      variant='outline'
    >
      <a
        download={name}
        href={source.src}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <Download />
      </a>
    </Button>
  );
}

type SlideImageProperties = {
  readonly directory: string | undefined;
  readonly item: ImageCarouselDialogItem;
  readonly onError: () => void;
};

function SlideImage({ directory, item, onError }: SlideImageProperties): React.JSX.Element {
  const source = useAttachmentSource(directory, { url: item.src, mediaType: item.mediaType });
  if (source.status === 'absent') {
    return (
      <div className='pointer-events-auto rounded-lg bg-background px-4 py-3 text-sm text-muted-foreground'>
        {attachmentAbsentLabel}
      </div>
    );
  }
  return (
    <img
      alt={item.alt}
      className='pointer-events-auto max-h-[80vh] max-w-[90vw] rounded-lg object-contain'
      loading='eager'
      src={source.status === 'ready' ? source.src : undefined}
      onError={onError}
    />
  );
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
  directory,
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
  const [previousState, setPreviousState] = React.useState({ isOpen, clampedInitialIndex, itemCount: items.length });
  const carouselReference = React.useRef<HTMLDivElement>(null);
  const hasMultipleItems = items.length > 1;
  const clampedActiveIndex = clampImageIndex(activeIndex, items.length);
  const currentItem = items[clampedActiveIndex];
  const currentDownloadName = currentItem ? getDownloadName(currentItem, clampedActiveIndex) : undefined;
  const carouselOptions = React.useMemo(
    // Duration 0 makes prev/next and arrow keys jump instantly instead of sliding.
    () => ({ duration: 0, loop: hasMultipleItems, startIndex: clampedInitialIndex }),
    [clampedInitialIndex, hasMultipleItems],
  );
  const canUseDocument = isOpen && typeof document !== 'undefined';

  if (
    previousState.isOpen !== isOpen ||
    previousState.clampedInitialIndex !== clampedInitialIndex ||
    previousState.itemCount !== items.length
  ) {
    setPreviousState({ isOpen, clampedInitialIndex, itemCount: items.length });
    if (previousState.isOpen !== isOpen || previousState.clampedInitialIndex !== clampedInitialIndex) {
      setActiveIndex(clampedInitialIndex);
    } else {
      setActiveIndex((currentIndex) => clampImageIndex(currentIndex, items.length));
    }
    if (!isOpen) {
      setCarouselApi(undefined);
    }
  }

  React.useEffect(() => {
    if (isOpen && items.length === 0) {
      queueMicrotask(() => {
        onOpenChange(false);
      });
    }
  }, [isOpen, items.length, onOpenChange]);

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
              <DownloadLink directory={directory} item={currentItem} name={currentDownloadName} />
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
          'z-101! pointer-events-none flex h-[80vh]! max-h-none! w-auto! max-w-[90vw]! items-center justify-center overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none *:data-[slot=dialog-close]:hidden max-md:w-[90vw]',
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
          className='flex h-full w-full min-w-0 flex-col outline-none'
          opts={carouselOptions}
          setApi={setCarouselApi}
          tabIndex={0}
        >
          <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
            <CarouselContent className='ml-0 h-full items-center'>
              {items.map((item, index) => (
                <CarouselItem key={item.id} className='flex h-full items-center justify-center pl-0'>
                  <div className='relative flex h-full w-full items-center justify-center'>
                    {/* Only the image takes clicks; the rest of the dialog falls through to the closing backdrop. */}
                    <SlideImage
                      directory={directory}
                      item={item}
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
