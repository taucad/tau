import { memo, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ImageCarouselDialog } from '#components/ui/image-carousel-dialog.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';
import { cn } from '@taucad/ui/utils/cn';
import { focusTrapAttribute } from '#components/chat/chat-textarea-types.js';
import { AttachmentFileChip, AttachmentImage } from '#components/chat/attachment-preview.js';
import type { DraftAttachment } from '#hooks/draft.machine.js';
import { attachmentKind, attachmentUrl } from '#utils/attachment.utils.js';

type ChatTextareaAttachmentRailSize = 'desktop' | 'mobile';

type ChatTextareaAttachmentRailProperties = {
  readonly attachments: readonly DraftAttachment[];
  /** The directory the draft's attachment references resolve against. */
  readonly directory: string;
  /** Why Send is disabled for these attachments, shown under them (D20). */
  readonly blockReason?: string;
  readonly onRemove: (index: number) => void;
  readonly size: ChatTextareaAttachmentRailSize;
};

const thumbnailSize: Record<ChatTextareaAttachmentRailSize, string> = {
  desktop: 'size-20',
  mobile: 'size-14',
};

const removeButtonClassName = cn(
  'absolute top-1 right-1 z-10 flex size-5 items-center justify-center',
  'rounded-full border bg-background text-muted-foreground',
  'outline-none hover:text-foreground focus-visible:focus-outline',
);

/**
 * The composer's attachment rail: image thumbnails that open the preview
 * carousel, document chips with name and size, and the reason Send is
 * disabled when the selected model cannot read one of them.
 */
export const ChatTextareaAttachmentRail = memo(function ({
  attachments,
  directory,
  blockReason,
  onRemove,
  size,
}: ChatTextareaAttachmentRailProperties): React.JSX.Element | undefined {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const entries = useMemo(
    () =>
      attachments.map((attachment, index) => ({
        attachment,
        index,
        url: attachmentUrl(attachment),
        isImage: attachmentKind(attachment.mediaType) === 'image',
      })),
    [attachments],
  );
  const images = useMemo(() => entries.filter((entry) => entry.isImage), [entries]);
  const carouselItems = useMemo(
    () =>
      images.map((entry, imageIndex) => ({
        id: `image-${entry.index}-${entry.url}`,
        src: entry.url,
        mediaType: entry.attachment.mediaType,
        alt: entry.attachment.filename ?? `Uploaded ${imageIndex + 1}`,
        downloadName: entry.attachment.filename,
      })),
    [images],
  );

  if (attachments.length === 0) {
    return undefined;
  }

  return (
    <>
      <OmniScroller
        aria-label='Attachments'
        className={cn('w-full scroll-shadows-x', size === 'desktop' ? 'px-3 pt-3 pb-2' : 'pb-1')}
      >
        <div
          className={cn(
            'flex w-max min-w-full max-w-none flex-nowrap items-center justify-start',
            size === 'desktop' ? 'gap-3' : 'gap-2',
          )}
        >
          {entries.map((entry) => {
            if (!entry.isImage) {
              const name = entry.attachment.filename ?? 'document';
              return (
                <div
                  // oxlint-disable-next-line react/no-array-index-key -- the same bytes can be attached twice
                  key={`document-${entry.index}-${entry.url}`}
                  className='relative shrink-0'
                >
                  <AttachmentFileChip
                    directory={directory}
                    part={{
                      url: entry.url,
                      mediaType: entry.attachment.mediaType,
                      filename: entry.attachment.filename,
                    }}
                    className={cn('max-w-56 pr-8', size === 'desktop' ? 'h-20' : 'h-14 p-2')}
                  />
                  <button
                    type='button'
                    className={removeButtonClassName}
                    aria-label={`Remove ${name}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(entry.index);
                    }}
                  >
                    <X className='size-3' />
                  </button>
                </div>
              );
            }
            const imageIndex = images.indexOf(entry);
            return (
              <div
                // oxlint-disable-next-line react/no-array-index-key -- the same bytes can be attached twice
                key={`image-${entry.index}-${entry.url}`}
                className='group/image-item relative shrink-0 text-muted-foreground hover:text-foreground'
              >
                <button
                  type='button'
                  aria-label={`Open uploaded image ${imageIndex + 1}`}
                  className={cn(
                    'overflow-hidden rounded-md border bg-background hover:bg-accent',
                    'outline-none focus-visible:focus-outline',
                    thumbnailSize[size],
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewInitialIndex(imageIndex);
                    setPreviewOpen(true);
                  }}
                >
                  <AttachmentImage
                    directory={directory}
                    part={{ url: entry.url, mediaType: entry.attachment.mediaType }}
                    alt={`Uploaded ${imageIndex + 1}`}
                    className='size-full object-cover'
                  />
                </button>
                <button
                  type='button'
                  className={removeButtonClassName}
                  aria-label={`Remove uploaded image ${imageIndex + 1}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(entry.index);
                  }}
                >
                  <X className='size-3' />
                </button>
              </div>
            );
          })}
        </div>
      </OmniScroller>
      {blockReason === undefined ? null : (
        <p role='status' className={cn('text-xs text-destructive', size === 'desktop' ? 'px-3 pb-1' : 'pb-1')}>
          {blockReason}
        </p>
      )}
      <ImageCarouselDialog
        dialogProps={{ [focusTrapAttribute]: focusTrapAttribute }}
        directory={directory}
        initialIndex={previewInitialIndex}
        isOpen={previewOpen}
        items={carouselItems}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
});
