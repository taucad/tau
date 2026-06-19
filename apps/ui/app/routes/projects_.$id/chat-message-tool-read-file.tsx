import { FileText } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName, fileUnchangedMarker } from '@taucad/chat/constants';
import { FileLink } from '#components/files/file-link.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

function formatLineRange(offset?: number, limit?: number): string {
  if (offset === undefined && limit === undefined) {
    return '';
  }

  const startLine = offset ?? 1;

  if (limit === undefined) {
    return ` L${startLine}`;
  }

  const endLine = startLine + limit - 1;
  return ` L${startLine}-${endLine}`;
}

function countDisplayedLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split('\n').length;
}

function formatCompletedLineRange(options: {
  content: string;
  totalLines: number;
  startLine?: number;
  offset?: number;
  limit?: number;
}): string {
  const startLine = options.startLine ?? options.offset ?? 1;
  const displayedLines = options.limit ?? countDisplayedLines(options.content);
  const endLine = Math.min(options.totalLines, Math.max(startLine, startLine + displayedLines - 1));
  return ` L${startLine}-L${endLine}`;
}

export function ChatMessageToolReadFile({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.readFile>;
}): React.JSX.Element {
  const { input } = part;
  const targetFile = input?.targetFile ?? 'file';
  const lineRange = formatLineRange(input?.offset, input?.limit);

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={FileText} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Reading'>
                <ChatToolDescription>
                  {targetFile}
                  {lineRange}...
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { input } = part;
      const { targetFile } = input;
      const lineRange = formatCompletedLineRange({
        content: part.output.content,
        totalLines: part.output.totalLines,
        startLine: part.output.startLine,
        offset: input.offset,
        limit: input.limit,
      });
      const startLine = part.output.startLine ?? input.offset ?? 1;
      const isCached = fileUnchangedMarker.matches(part.output.content);

      return (
        <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={FileText} />
            <ChatToolCardTitle>
              <ChatToolLabel verb={isCached ? 'Re-read, cached' : 'Read'}>
                <ChatToolDescription className={isCached ? 'text-muted-foreground' : undefined}>
                  <FileLink path={targetFile} lineNumber={startLine}>
                    {targetFile}
                    {lineRange}
                  </FileLink>
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={FileText} noun='file read' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.readFile} state: ${part.state}`);
    }
  }
}
