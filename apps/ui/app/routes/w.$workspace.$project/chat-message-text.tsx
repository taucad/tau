import type { TextUIPart } from 'ai';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';

export function ChatMessageText({ part }: { readonly part: TextUIPart }): React.JSX.Element {
  const isStreaming = useChatSelector((state) => state.status === 'streaming');

  return (
    <MarkdownViewerChat className='my-1' isStreaming={isStreaming}>
      {part.text}
    </MarkdownViewerChat>
  );
}
