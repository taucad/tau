import type { TextUIPart } from '@ai-sdk/ui-utils';
import { MarkdownViewer } from '@/components/markdown-viewer';

export function ChatMessageText({ part }: { readonly part: TextUIPart }) {
  return <MarkdownViewer>{part.text}</MarkdownViewer>;
}
