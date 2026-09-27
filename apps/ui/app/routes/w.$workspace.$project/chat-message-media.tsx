/**
 * Media an agent produced, shown in the transcript where it was produced.
 *
 * An image renders at reading size in a rounded frame and opens in the
 * workbench's side image viewer; audio gets a player; anything else is the
 * attachment chip a user's own file already renders as. One component serves an
 * agent's assistant blocks and the media on its tool calls, so a Codex render,
 * a Claude screenshot read and a Tau capture look and open the same way.
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import {
  AttachmentFileChip,
  AttachmentImage,
  useChatAttachmentDirectories,
} from '#components/chat/attachment-preview.js';
import { ImageCarouselDialog } from '#components/ui/image-carousel-dialog.js';
import { useProject } from '#hooks/use-project.js';
import { useAttachmentSource } from '#hooks/use-attachment-source.js';
import { attachmentUrlPrefix, isAttachmentUrl } from '#utils/attachment.utils.js';

/** One piece of media: an `attachments/…` reference or a `data:` URL, and what its bytes are. */
export type ChatMedia = {
  readonly url: string;
  readonly mediaType: string;
  readonly filename?: string;
};

/**
 * The project path of a chat attachment, which the workbench opens like any file.
 *
 * The transcript directory is `/projects/<id>/.tau/chats/<chatId>/attachments`;
 * the project's own view is rooted one `/projects/<id>/` below it.
 *
 * @param directory - The chat's transcript attachment directory.
 * @param url - An `attachments/…` reference.
 * @returns The project-relative path, or `undefined` when either is not a chat attachment.
 */
export const chatAttachmentProjectPath = (directory: string | undefined, url: string): string | undefined => {
  const root = /^\/projects\/[^/]+\/(?<path>\.tau\/chats\/[^/]+\/attachments)$/u.exec(directory ?? '')?.groups?.[
    'path'
  ];
  return root === undefined || !isAttachmentUrl(url) ? undefined : `${root}/${url.slice(attachmentUrlPrefix.length)}`;
};

function ChatMediaAudio({ media, directory }: { readonly media: ChatMedia; readonly directory: string | undefined }) {
  const source = useAttachmentSource(directory, media);
  if (source.status !== 'ready') {
    return <AttachmentFileChip directory={directory} part={media} />;
  }
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- agent audio carries no caption track to offer.
    <audio
      controls
      preload='metadata'
      src={source.src}
      className='w-full max-w-md'
      aria-label={media.filename ?? 'Agent audio'}
    />
  );
}

/**
 * One agent image, sized for reading and opened in the side viewer on click.
 *
 * An attachment opens as a read-only file of the project, so the workbench's
 * native image viewer (zoom, fit, download) shows it beside the chat. A legacy
 * inline image has no file to open and falls back to the image lightbox.
 */
function ChatMediaImage({
  media,
  directory,
  alt,
  className,
}: {
  readonly media: ChatMedia;
  readonly directory: string | undefined;
  readonly alt: string;
  readonly className?: string;
}): ReactNode {
  const project = useProject({ enableNoContext: true });
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isUnavailable, setUnavailable] = useState(false);
  const path = chatAttachmentProjectPath(directory, media.url);
  const markUnavailable = useCallback(() => {
    setUnavailable(true);
  }, []);

  if (isUnavailable) {
    return <AttachmentFileChip directory={directory} part={media} isError />;
  }

  return (
    <>
      <button
        type='button'
        aria-label={`Open ${alt}`}
        className={cn(
          'block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-xl border bg-background outline-none hover:border-primary focus-visible:focus-outline',
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (project && path !== undefined) {
            project.editorRef.send({
              type: 'openFile',
              path,
              source: 'user',
              lineNumber: 1,
              column: 1,
              readOnly: true,
            });
            return;
          }
          setPreviewOpen(true);
        }}
      >
        <AttachmentImage
          directory={directory}
          part={media}
          alt={alt}
          className='block max-h-96 w-auto max-w-full object-contain'
          onUnavailable={markUnavailable}
        />
      </button>
      {path === undefined || !project ? (
        <ImageCarouselDialog
          directory={directory}
          initialIndex={0}
          isOpen={isPreviewOpen}
          items={[
            {
              id: media.url,
              src: media.url,
              mediaType: media.mediaType,
              alt,
              label: media.filename,
              downloadName: media.filename,
            },
          ]}
          onOpenChange={setPreviewOpen}
        />
      ) : null}
    </>
  );
}

/**
 * Agent media, rendered by what its bytes are.
 *
 * @param properties - The media and its type, what an image shows (for assistive technology) and its frame classes.
 * @returns The image, player or file chip.
 */
export function ChatMessageMedia({
  media,
  alt,
  className,
}: {
  readonly media: ChatMedia;
  readonly alt?: string;
  readonly className?: string;
}): ReactNode {
  const directory = useChatAttachmentDirectories()?.transcript;
  if (media.mediaType.startsWith('image/')) {
    return (
      <ChatMediaImage
        media={media}
        directory={directory}
        alt={alt ?? media.filename ?? 'Agent image'}
        {...(className === undefined ? {} : { className })}
      />
    );
  }
  if (media.mediaType.startsWith('audio/')) {
    return <ChatMediaAudio media={media} directory={directory} />;
  }
  return <AttachmentFileChip directory={directory} part={media} className='w-fit max-w-full' />;
}
