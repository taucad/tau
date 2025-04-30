import type { TextUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { MarkdownViewer } from '@/components/markdown-viewer.js';

export function ChatMessageText({
  part,
  onCodeApply,
}: {
  readonly part: TextUIPart;
  readonly onCodeApply?: (code: string) => void;
}): JSX.Element {
  return <MarkdownViewer onCodeApply={onCodeApply}>{part.text}</MarkdownViewer>;
}
