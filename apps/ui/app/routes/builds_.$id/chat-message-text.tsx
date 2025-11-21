import type { TextUIPart } from '@ai-sdk/ui-utils';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

export function ChatMessageText({ part }: { readonly part: TextUIPart }): React.JSX.Element {
  return <MarkdownViewer>{part.text}</MarkdownViewer>;
}
