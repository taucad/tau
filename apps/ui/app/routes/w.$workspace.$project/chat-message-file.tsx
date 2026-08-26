import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FileUIPart } from 'ai';
import { File } from 'lucide-react';
import { cn } from '#utils/ui.utils.js';
import { ImageCarouselDialog } from '#components/ui/image-carousel-dialog.js';

type ChatMessageFileProperties = {
  readonly part: FileUIPart;
  readonly isError?: boolean;
};

type ChatMessageFileAttachmentsProperties = {
  readonly parts: readonly FileUIPart[];
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

export function ChatMessageFile({ part, isError = false }: ChatMessageFileProperties): ReactNode {
  return (
    <div className='flex shrink-0 items-center gap-2 rounded-lg border bg-background p-3'>
      <File className='size-5 text-muted-foreground' />
      <div className='flex flex-1 flex-col gap-1'>
        <a
          href={part.url}
          download={part.filename}
          className={cn('text-sm font-medium hover:underline', isError && 'text-destructive')}
          target='_blank'
          rel='noopener noreferrer'
        >
          {part.filename ?? 'File'}
        </a>
        {isError ? <span className='text-xs text-destructive'>Failed to load image. Click to download.</span> : null}
        <span className='text-xs text-muted-foreground'>{part.mediaType}</span>
      </div>
    </div>
  );
}

export function ChatMessageFileAttachments({ parts }: ChatMessageFileAttachmentsProperties): ReactNode {
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
        alt: part.filename ?? `Uploaded image ${index + 1}`,
        label: part.filename,
        downloadName: part.filename ?? `uploaded-image-${index + 1}.png`,
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
      <div
        aria-label='Attached files'
        className='flex max-w-full scroll-shadows-x flex-row gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth'
      >
        {attachmentEntries.map((entry, entryIndex) => {
          if (entry.type === 'file') {
            return (
              <ChatMessageFile
                // oxlint-disable-next-line react/no-array-index-key -- file URLs can repeat across message attachments
                key={`file-${entryIndex}-${entry.part.url}`}
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
                  className='size-12 shrink-0 overflow-hidden rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:outline-none'
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewInitialIndex(imageIndex);
                    setPreviewOpen(true);
                  }}
                >
                  <img
                    alt={part.filename ?? `Uploaded image ${imageIndex + 1}`}
                    className='size-full object-contain'
                    loading='lazy'
                    src={part.url}
                    onError={() => {
                      markImageFailed(part.url);
                    }}
                  />
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <ImageCarouselDialog
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
