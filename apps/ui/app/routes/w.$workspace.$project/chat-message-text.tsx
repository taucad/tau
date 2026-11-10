import type { TextUIPart } from 'ai';
import { memo, useMemo } from 'react';
import { normalizeLatexDelimiters } from '@taucad/agent-host';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

export const ChatMessageText = memo(function ({
  part,
  isMessageActive,
}: {
  readonly part: TextUIPart;
  readonly isMessageActive: boolean;
}): React.JSX.Element {
  const isStreaming = isMessageActive && part.state !== 'done';
  // The durable reply keeps the provider's bytes; the delimiters the renderer reads are applied here.
  const text = useMemo(() => normalizeLatexDelimiters(part.text), [part.text]);
  return (
    <MarkdownViewerChat className='my-1' isStreaming={isStreaming} isStreamingFade={isStreaming}>
      {text}
    </MarkdownViewerChat>
  );
});
