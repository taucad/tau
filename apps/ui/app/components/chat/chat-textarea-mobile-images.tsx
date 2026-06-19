import { memo } from 'react';
import { ChatTextareaImageStrip } from '#components/chat/chat-textarea-image-strip.js';

type ChatTextareaMobileImagesProperties = {
  readonly images: string[];
  readonly onRemoveImage: (index: number) => void;
};

/**
 * Mobile image preview component for the chat textarea.
 * Displays compact thumbnails that open in a full-screen dialog when tapped.
 */
export const ChatTextareaMobileImages = memo(function ({
  images,
  onRemoveImage,
}: ChatTextareaMobileImagesProperties): React.JSX.Element | undefined {
  return <ChatTextareaImageStrip images={images} onRemoveImage={onRemoveImage} size='mobile' />;
});
