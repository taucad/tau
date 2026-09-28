import { useCallback, useMemo, useState } from 'react';
import { ChevronRight, Circle, CircleCheck, CircleDot, ListChecks } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { parseTodoList, todoListPath } from '@taucad/chat';
import type { TodoItem, TodoItemStatus } from '@taucad/chat';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { useChatContext } from '#hooks/use-chat.js';
import { useFileContent } from '#hooks/use-file-content.js';

const collapsedStorageKey = (chatId: string): string => `tau:chat-todo-collapsed:${chatId}`;

const readCollapsed = (chatId: string): boolean => {
  try {
    return globalThis.localStorage.getItem(collapsedStorageKey(chatId)) !== 'false';
  } catch {
    return true;
  }
};

const writeCollapsed = (chatId: string, collapsed: boolean): void => {
  try {
    globalThis.localStorage.setItem(collapsedStorageKey(chatId), String(collapsed));
  } catch {
    // Remembering the fold is best effort; a blocked store must not break the list.
  }
};

/** Status glyphs shared by the list above the composer and the transcript card. */
export const todoStatusIcons: Record<TodoItemStatus, LucideIcon> = {
  pending: Circle,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
  in_progress: CircleDot,
  done: CircleCheck,
};

/** Screen-reader prefix for a status glyph. */
export const todoStatusLabels: Record<TodoItemStatus, string> = {
  pending: 'pending',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
  in_progress: 'in progress',
  done: 'done',
};

const decoder = new TextDecoder();

function TodoRow({ item }: { readonly item: TodoItem }): React.JSX.Element {
  const Icon = todoStatusIcons[item.status];
  return (
    <li
      className={cn(
        'flex items-start gap-2 py-0.5 text-xs',
        item.status === 'in_progress' ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon
        aria-hidden='true'
        className={cn(
          'mt-0.5 size-3 shrink-0',
          item.status === 'done' && 'text-success',
          item.status === 'in_progress' && 'text-primary',
        )}
      />
      <span className='min-w-0 flex-1 wrap-break-word'>
        <span className='sr-only'>{todoStatusLabels[item.status]}: </span>
        <span className={cn(item.status === 'done' && 'line-through')}>{item.title}</span>
        {item.note === undefined ? undefined : <span className='block text-muted-foreground'>{item.note}</span>}
      </span>
    </li>
  );
}

/**
 * The agent's task list for this chat, read live from `.tau/chats/<chatId>/todo.yaml` (D8).
 *
 * One glanceable line while the agent works — "3 of 5 done · Slice the pyramid"
 * — that discloses the whole list on request. The file is the only state: the
 * `update_todos` tool writes it, the project filesystem publishes the change,
 * and nothing renders until a list exists. Only the fold is remembered, per
 * chat and per device.
 */
export function ChatTodoList(): React.JSX.Element | undefined {
  const { activeChatId } = useChatContext();
  const content = useFileContent(todoListPath(activeChatId));
  const items = useMemo(() => {
    if (content.kind !== 'text') {
      return undefined;
    }
    const parsed = parseTodoList(decoder.decode(content.content));
    return parsed.success && parsed.list.items.length > 0 ? parsed.list.items : undefined;
  }, [content]);
  const [isOpen, setIsOpen] = useState(() => !readCollapsed(activeChatId));
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      writeCollapsed(activeChatId, !open);
    },
    [activeChatId],
  );

  if (items === undefined) {
    return undefined;
  }

  const done = items.filter((item) => item.status === 'done').length;
  const current = items.find((item) => item.status === 'in_progress');
  const summary = `${String(done)} of ${String(items.length)} done${current ? ` · ${current.title}` : ''}`;

  return (
    <Collapsible
      open={isOpen}
      className='mx-2 -mb-3 rounded-t-lg border border-b-0 bg-muted/40 pb-3'
      onOpenChange={handleOpenChange}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='relative flex h-auto min-h-8 w-full min-w-0 items-center justify-start gap-1.5 rounded-t-lg px-2 py-1.5 text-left font-normal text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:z-10'
        >
          <ListChecks aria-hidden='true' className='size-3.5 shrink-0' />
          <span className='sr-only'>Tasks: </span>
          <span className='flex min-w-0 flex-1 gap-1 text-xs' title={summary}>
            <span className='shrink-0'>
              {done} of {items.length} done
            </span>
            {current ? <span className='truncate'> · {current.title}</span> : null}
          </span>
          <ChevronRight
            aria-hidden='true'
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
              isOpen && 'rotate-90',
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul
          aria-label='Tasks'
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable list must be keyboard reachable (WCAG 2.1.1)
          tabIndex={0}
          className='flex max-h-[min(12rem,25cqh)] scroll-shadows-y flex-col gap-1 overflow-y-auto overscroll-contain border-t px-2 pt-2 pb-3 focus-visible:focus-outline'
        >
          {items.map((item) => (
            <TodoRow key={item.id} item={item} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
