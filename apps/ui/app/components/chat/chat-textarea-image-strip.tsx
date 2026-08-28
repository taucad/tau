import { memo, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ImageCarouselDialog } from '#components/ui/image-carousel-dialog.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';
import { cn } from '#utils/ui.utils.js';
import { focusTrapAttribute } from '#components/chat/chat-textarea-types.js';

type ChatTextareaImageStripSize = 'desktop' | 'mobile';

type ChatTextareaImageStripProperties = {
  readonly images: string[];
  readonly onRemoveImage: (index: number) => void;
  readonly size: ChatTextareaImageStripSize;
};

const thumbnailSize: Record<ChatTextareaImageStripSize, string> = {
  desktop: 'size-20',
  mobile: 'size-14',
};

export const ChatTextareaImageStrip = memo(function ({
  images,
  onRemoveImage,
  size,
}: ChatTextareaImageStripProperties): React.JSX.Element | undefined {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const carouselItems = useMemo(
    () =>
      images.map((image, index) => ({
        id: `image-${index}-${image}`,
        src: image,
        alt: `Uploaded ${index + 1}`,
        downloadName: `uploaded-image-${index + 1}.png`,
      })),
    [images],
  );

  if (images.length === 0) {
    return undefined;
  }

  return (
    <>
      <OmniScroller
        aria-label='Attached images'
        className={cn('w-full scroll-shadows-x', size === 'desktop' ? 'px-3 pt-3 pb-2' : 'pb-1')}
      >
        <div
          className={cn(
            'flex w-max min-w-full max-w-none flex-nowrap justify-start',
            size === 'desktop' ? 'gap-3' : 'gap-2',
          )}
        >
          {images.map((image, index) => (
            <div
              // oxlint-disable-next-line react/no-array-index-key -- user can attach duplicate data URLs
              key={`image-${index}-${image}`}
              className='group/image-item relative shrink-0 text-muted-foreground hover:text-foreground'
            >
              <button
                type='button'
                aria-label={`Open uploaded image ${index + 1}`}
                className={cn(
                  'cursor-pointer overflow-hidden rounded-md border bg-background hover:bg-accent',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  thumbnailSize[size],
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setPreviewInitialIndex(index);
                  setPreviewOpen(true);
                }}
              >
                <img alt={`Uploaded ${index + 1}`} className='size-full object-cover' loading='lazy' src={image} />
              </button>
              <button
                type='button'
                className={cn(
                  'absolute top-1 right-1 z-10 flex size-5 items-center justify-center',
                  'rounded-full border bg-background text-muted-foreground',
                  'outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring',
                )}
                aria-label={`Remove uploaded image ${index + 1}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveImage(index);
                }}
              >
                <X className='size-3' />
              </button>
            </div>
          ))}
        </div>
      </OmniScroller>
      <ImageCarouselDialog
        dialogProps={{ [focusTrapAttribute]: focusTrapAttribute }}
        initialIndex={previewInitialIndex}
        isOpen={previewOpen}
        items={carouselItems}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
});
