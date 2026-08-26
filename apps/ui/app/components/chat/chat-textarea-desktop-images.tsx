import { memo } from 'react';
import { ChatTextareaImageStrip } from '#components/chat/chat-textarea-image-strip.js';

type ChatTextareaImagesProperties = {
  readonly images: string[];
  readonly onRemoveImage: (index: number) => void;
};

/**
 * Desktop image preview strip for the chat textarea.
 * Displays prominent uploaded images with click-to-preview and remove functionality.
 */
export const ChatTextareaDesktopImages = memo(function ({
  images,
  onRemoveImage,
}: ChatTextareaImagesProperties): React.JSX.Element | undefined {
  return <ChatTextareaImageStrip images={images} onRemoveImage={onRemoveImage} size='desktop' />;
});
