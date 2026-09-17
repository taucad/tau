import { memo } from 'react';
import type { ComponentProps } from 'react';
import { ChatTextareaAttachmentRail } from '#components/chat/chat-textarea-image-strip.js';

type ChatTextareaDesktopAttachmentsProperties = Omit<ComponentProps<typeof ChatTextareaAttachmentRail>, 'size'>;

/**
 * Desktop attachment rail for the chat textarea: image thumbnails that open a
 * full-screen preview, and document chips.
 */
export const ChatTextareaDesktopImages = memo(function (
  properties: ChatTextareaDesktopAttachmentsProperties,
): React.JSX.Element | undefined {
  return <ChatTextareaAttachmentRail {...properties} size='desktop' />;
});
