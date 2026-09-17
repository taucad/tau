import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FileUIPart } from 'ai';
import { AttachmentFileChip, AttachmentImage } from '#components/chat/attachment-preview.js';
import { ImageCarouselDialog } from '#components/ui/image-carousel-dialog.js';
import { OmniScroller } from '#components/ui/omni-scroller.js';

type ChatMessageFileAttachmentsProperties = {
  readonly parts: readonly FileUIPart[];
  /** The chat's attachment directory, which its `attachments/` references resolve against. */
  readonly directory: string | undefined;
};

type AttachmentEntry =
  | {
      readonly type: 'image-group';
    }
  | {
      readonly type: 'file';
      readonly part: FileUIPart;
      readonly isError: boolean;
    };

function isImagePart(part: FileUIPart): boolean {
  return part.mediaType.startsWith('image/');
}

export function ChatMessageFileAttachments({ parts, directory }: ChatMessageFileAttachmentsProperties): ReactNode {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<ReadonlySet<string>>(() => new Set());

  const markImageFailed = useCallback((url: string): void => {
    setFailedImageUrls((previous) => {
      if (previous.has(url)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(url);
      return next;
    });
  }, []);

  const imageParts = useMemo(
    () => parts.filter((part) => isImagePart(part) && !failedImageUrls.has(part.url)),
    [failedImageUrls, parts],
  );

  const carouselItems = useMemo(
    () =>
      imageParts.map((part, index) => ({
        id: `${part.url}-${index}`,
        src: part.url,
        mediaType: part.mediaType,
        alt: part.filename ?? `Uploaded image ${index + 1}`,
        label: part.filename,
        downloadName: part.filename,
      })),
    [imageParts],
  );

  const attachmentEntries = useMemo<AttachmentEntry[]>(() => {
    const entries: AttachmentEntry[] = [];
    let imageGroupRendered = false;

    for (const part of parts) {
      const isImage = isImagePart(part);
      const isFailedImage = isImage && failedImageUrls.has(part.url);

      if (isImage && !isFailedImage) {
        if (!imageGroupRendered && imageParts.length > 0) {
          entries.push({ type: 'image-group' });
          imageGroupRendered = true;
        }

        continue;
      }

      entries.push({ type: 'file', part, isError: isFailedImage });
    }

    return entries;
  }, [failedImageUrls, imageParts.length, parts]);

  if (parts.length === 0) {
    return null;
  }

  return (
    <>
      <OmniScroller aria-label='Attached files' className='flex max-w-full scroll-shadows-x flex-row gap-2'>
        {attachmentEntries.map((entry, entryIndex) => {
          if (entry.type === 'file') {
            return (
              <AttachmentFileChip
                // oxlint-disable-next-line react/no-array-index-key -- file URLs can repeat across message attachments
                key={`file-${entryIndex}-${entry.part.url}`}
                directory={directory}
                part={entry.part}
                isError={entry.isError}
              />
            );
          }

          return (
            <div
              // oxlint-disable-next-line react/no-array-index-key -- group position follows attachment order
              key={`image-group-${entryIndex}`}
              aria-label='Attached image previews'
              className='flex shrink-0 flex-row gap-2'
            >
              {imageParts.map((part, imageIndex) => (
                <button
                  type='button'
                  // oxlint-disable-next-line react/no-array-index-key -- image URLs can repeat across message attachments
                  key={`${part.url}-${imageIndex}`}
                  aria-label={`Open image ${part.filename ?? imageIndex + 1}`}
                  className='size-12 shrink-0 overflow-hidden rounded-lg border bg-background outline-none focus-visible:focus-outline'
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
                    part={part}
                    alt={part.filename ?? `Uploaded image ${imageIndex + 1}`}
                    className='size-full object-contain'
                    onUnavailable={() => {
                      markImageFailed(part.url);
                    }}
                  />
                </button>
              ))}
            </div>
          );
        })}
      </OmniScroller>
      <ImageCarouselDialog
        directory={directory}
        initialIndex={previewInitialIndex}
        isOpen={previewOpen}
        items={carouselItems}
        onImageError={(_, index) => {
          const failedPart = imageParts[index];
          const failedUrl = failedPart?.url ?? carouselItems[index]?.src;

          if (failedUrl) {
            markImageFailed(failedUrl);
          }
        }}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
