import { MarkdownViewer } from '@/components/markdown-viewer';
import { TextUIPart } from '@ai-sdk/ui-utils';

export function ChatMessageText({ part }: { part: TextUIPart }) {
  return <MarkdownViewer>{part.text}</MarkdownViewer>;
}
