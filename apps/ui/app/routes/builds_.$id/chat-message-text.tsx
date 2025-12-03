import type { TextUIPart } from 'ai';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

export function ChatMessageText({ part }: { readonly part: TextUIPart }): React.JSX.Element {
  return <MarkdownViewer>{part.text}</MarkdownViewer>;
}
