import { FileText, ExternalLink } from 'lucide-react';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { FileLink } from '#components/files/file-link.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

type ChatMessagePlanCardProperties = {
  readonly targetFile: string;
  readonly content: string;
  readonly status: 'loading' | 'ready';
};

function extractPlanTitle(content: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(content);
  return match?.[1];
}

function extractPlanOverview(content: string): string | undefined {
  const lines = content.split('\n');
  let foundTitle = false;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      foundTitle = true;
      continue;
    }

    if (foundTitle && line.trim().length > 0 && !line.startsWith('#') && !line.startsWith('---')) {
      return line.trim();
    }
  }

  return undefined;
}

function extractTodos(content: string): Array<{ text: string; checked: boolean }> {
  const todos: Array<{ text: string; checked: boolean }> = [];
  const regex = /^\s*-\s+\[([ Xx])]\s+(.+)$/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    todos.push({
      checked: match[1] !== ' ',
      text: match[2]!,
    });
  }

  return todos;
}

export function ChatMessagePlanCard({ targetFile, content, status }: ChatMessagePlanCardProperties): React.JSX.Element {
  const title = extractPlanTitle(content);
  const overview = extractPlanOverview(content);
  const todos = extractTodos(content);

  if (status === 'loading') {
    return (
      <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={FileText} />
          <ChatToolCardTitle>
            <ChatToolLabel verb='Creating'>
              <ChatToolDescription>plan...</ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
      </ChatToolCard>
    );
  }

  return (
    <ChatToolCard variant='minimal' status='ready' isDefaultOpen isCookieDefaultOpen>
      <ChatToolCardHeader className='text-foreground'>
        <ChatToolCardIcon icon={FileText} />
        <ChatToolCardTitle>{title ?? 'Plan'}</ChatToolCardTitle>
      </ChatToolCardHeader>
      <ChatToolCardContent>
        <div className='flex flex-col gap-2 text-sm'>
          {overview ? <MarkdownViewer className='text-muted-foreground'>{overview}</MarkdownViewer> : undefined}

          {todos.length > 0 ? (
            <ul className='flex flex-col gap-1'>
              {todos.map((todo, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- Stable content
                <li key={index} className='flex min-w-0 items-start gap-2 text-xs text-muted-foreground'>
                  <input
                    type='checkbox'
                    checked={todo.checked}
                    readOnly
                    className='mt-0.5 size-3.5 shrink-0 rounded-sm'
                  />
                  <span className='min-w-0 flex-1 wrap-break-word'>{todo.text}</span>
                </li>
              ))}
            </ul>
          ) : undefined}

          <FileLink path={targetFile} className='inline-flex items-center gap-1 text-xs text-primary hover:underline'>
            <ExternalLink className='size-3' />
            View Plan
          </FileLink>
        </div>
      </ChatToolCardContent>
    </ChatToolCard>
  );
}
