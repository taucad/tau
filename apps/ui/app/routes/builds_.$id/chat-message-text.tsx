import type { TextUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { MarkdownViewer } from '@/components/markdown-viewer.js';

export function ChatMessageText({ part }: { readonly part: TextUIPart }): JSX.Element {
  return <MarkdownViewer>{part.text}</MarkdownViewer>;
}
