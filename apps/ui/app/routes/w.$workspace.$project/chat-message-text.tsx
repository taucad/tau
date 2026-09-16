import type { TextUIPart } from 'ai';
import { memo } from 'react';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

export const ChatMessageText = memo(function ({
  part,
  isMessageActive,
}: {
  readonly part: TextUIPart;
  readonly isMessageActive: boolean;
}): React.JSX.Element {
  const isStreaming = isMessageActive && part.state !== 'done';
  return (
    <MarkdownViewerChat className='my-1' isStreaming={isStreaming} isStreamingFade={isStreaming}>
      {part.text}
    </MarkdownViewerChat>
  );
});
