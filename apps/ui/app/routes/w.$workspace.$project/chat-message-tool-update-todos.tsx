import { ListChecks, XCircle } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { cn } from '@taucad/ui/utils/cn';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardList,
  ChatToolCardListItem,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { todoStatusIcons, todoStatusLabels } from '#components/chat/chat-todo-list.js';

type UpdateTodosInvocation = ToolInvocation<typeof toolName.updateTodos>;

/** "· 3 of 5 done · Slice the pyramid": counts from the answer, the next item from the list it wrote. */
const summaryOf = (part: Extract<UpdateTodosInvocation, { state: 'output-available' }>): string => {
  const { counts } = part.output;
  const total = counts.pending + counts.in_progress + counts.done;
  const next =
    part.input.items.find((item) => item.status === 'in_progress') ??
    part.input.items.find((item) => item.status === 'pending');
  return `· ${String(counts.done)} of ${String(total)} done${next ? ` · ${next.title}` : ''}`;
};

/**
 * The transcript's record of one task-list update (D8).
 *
 * Starts folded on its summary line — "Tasks · 3 of 5 done · Slice the
 * pyramid" — and discloses the list as written on request. The live list
 * lives above the composer; this card is the history.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `update_todos` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolUpdateTodos({ part }: { readonly part: UpdateTodosInvocation }): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={ListChecks} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Updating'>
                <ChatToolDescription>tasks…</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={ListChecks} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Tasks'>
                <ChatToolDescription>{summaryOf(part)}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent>
            <ChatToolCardList maxHeight='max-h-48'>
              {part.input.items.map((item) => (
                <ChatToolCardListItem
                  key={item.id}
                  icon={todoStatusIcons[item.status]}
                  iconClassName={cn(
                    item.status === 'done' && 'text-success',
                    item.status === 'in_progress' && 'text-primary',
                  )}
                >
                  <span className='sr-only'>{todoStatusLabels[item.status]}: </span>
                  <span className={cn(item.status === 'done' && 'line-through opacity-70')}>{item.title}</span>
                </ChatToolCardListItem>
              ))}
            </ChatToolCardList>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='task list' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.updateTodos} state: ${part.state}`);
    }
  }
}
