import { memo } from 'react';
import type { ComponentProps } from 'react';
import { ChatTextareaAttachmentRail } from '#components/chat/chat-textarea-image-strip.js';

type ChatTextareaMobileAttachmentsProperties = Omit<ComponentProps<typeof ChatTextareaAttachmentRail>, 'size'>;

/**
 * Mobile attachment rail for the chat textarea: image thumbnails that open a
 * full-screen preview, and document chips.
 */
export const ChatTextareaMobileImages = memo(function (
  properties: ChatTextareaMobileAttachmentsProperties,
): React.JSX.Element | undefined {
  return <ChatTextareaAttachmentRail {...properties} size='mobile' />;
});
