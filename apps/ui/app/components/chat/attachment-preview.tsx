import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { chatAttachmentsPath } from '#db/attachment-store.js';
import { composerRecordPaths, recordAttachmentsPath } from '#db/composer-record-store.js';
import { File, FileText, ImageOff } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { attachmentAbsentLabel, attachmentDownloadName, useAttachmentSource } from '#hooks/use-attachment-source.js';
import { formatBytes } from '#lib/format-bytes.js';

/** The directories one project chat's attachment references resolve against. */
export type ChatAttachmentDirectories = {
  /** The chat's own, which its sent messages reference (`createChatAttachmentStore`). */
  readonly transcript: string;
  /** Its composer record's, which its draft and open edits reference. */
  readonly composer: string;
};

/** Where a project chat's attachments live. */
export const chatAttachmentDirectories = (projectId: string, chatId: string): ChatAttachmentDirectories => ({
  transcript: chatAttachmentsPath(projectId, chatId),
  composer: recordAttachmentsPath(composerRecordPaths.chat(projectId, chatId)),
});

/** The Home composer's draft-stage attachments, the default for a composer without a chat. */
export const homeComposerAttachmentDirectory = recordAttachmentsPath(composerRecordPaths.newProject);

/** Provided by the chat surface, so its transcript and composers resolve against the focused chat. */
export const ChatAttachmentDirectoriesContext = createContext<ChatAttachmentDirectories | undefined>(undefined);

/** The focused chat's attachment directories, or `undefined` outside a chat surface. */
export const useChatAttachmentDirectories = (): ChatAttachmentDirectories | undefined =>
  useContext(ChatAttachmentDirectoriesContext);

type AttachmentFileChipProperties = {
  /** The directory the part's `attachments/` reference resolves against. */
  readonly directory: string | undefined;
  readonly part: { readonly url: string; readonly mediaType: string; readonly filename?: string };
  /** The part is an image whose preview failed; the chip is its download fallback. */
  readonly isError?: boolean;
  readonly className?: string;
};

/**
 * A non-image attachment (or an image whose preview failed): its name, what it
 * is and its size, and a download of its bytes. Shared by the transcript and
 * the composer rail so both show a document the same way.
 */
export function AttachmentFileChip({
  directory,
  part,
  isError = false,
  className,
}: AttachmentFileChipProperties): ReactNode {
  const source = useAttachmentSource(directory, part);
  const name = attachmentDownloadName(part);
  const isPdf = part.mediaType === 'application/pdf';
  const Icon = isPdf ? FileText : File;
  const details = [
    isPdf ? 'PDF' : part.mediaType,
    source.status === 'ready' && source.byteLength !== undefined ? formatBytes(source.byteLength) : undefined,
  ].filter(Boolean);

  return (
    <div className={cn('flex shrink-0 items-center gap-2 rounded-lg border bg-background p-3', className)}>
      <Icon aria-hidden className='size-5 shrink-0 text-muted-foreground' />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        {source.status === 'ready' ? (
          <a
            href={source.src}
            download={name}
            className={cn('truncate text-sm font-medium hover:underline', isError && 'text-destructive')}
            target='_blank'
            rel='noopener noreferrer'
          >
            {name ?? 'File'}
          </a>
        ) : (
          <span className='truncate text-sm font-medium'>{name ?? 'File'}</span>
        )}
        {isError && source.status === 'ready' ? (
          <span className='text-xs text-destructive'>Failed to load image. Click to download.</span>
        ) : null}
        <span className='text-xs text-muted-foreground'>
          {source.status === 'absent' ? attachmentAbsentLabel : details.join(' · ')}
        </span>
      </div>
    </div>
  );
}

type AttachmentImageProperties = {
  readonly directory: string | undefined;
  readonly part: { readonly url: string; readonly mediaType: string };
  readonly alt: string;
  readonly className?: string;
  /** The pixels cannot be shown: the image failed to decode, or its bytes are not on this device. */
  readonly onUnavailable?: () => void;
};

/**
 * An image attachment's pixels. While the bytes load it holds the space; when
 * they are absent it shows a placeholder and reports `onUnavailable`, so a
 * surface with room can show the labelled file chip instead.
 */
export function AttachmentImage({
  directory,
  part,
  alt,
  className,
  onUnavailable,
}: AttachmentImageProperties): ReactNode {
  const source = useAttachmentSource(directory, part);
  const isAbsent = source.status === 'absent';
  useEffect(() => {
    if (isAbsent) {
      onUnavailable?.();
    }
  }, [isAbsent, onUnavailable]);

  if (source.status !== 'ready') {
    return (
      <span
        role='img'
        aria-label={isAbsent ? `${alt}: ${attachmentAbsentLabel}` : alt}
        title={isAbsent ? attachmentAbsentLabel : undefined}
        className={cn('flex size-full items-center justify-center bg-muted text-muted-foreground', className)}
      >
        {isAbsent ? <ImageOff aria-hidden className='size-4' /> : null}
      </span>
    );
  }
  return <img alt={alt} className={className} loading='lazy' src={source.src} onError={onUnavailable} />;
}
