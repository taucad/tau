import { useState } from 'react';
import { CornerDownRight, ListEnd, MoreHorizontal, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';
import { Textarea } from '@taucad/ui/components/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import type { QueuedChatMessage } from '#db/chat-message-queue-store.js';

export type ChatMessageQueueProps = {
  readonly items: readonly QueuedChatMessage[];
  readonly sendingId?: string;
  readonly error?: string;
  readonly onEdit: (id: string, text: string | undefined) => Promise<void>;
  readonly onSteer: (id: string) => Promise<void>;
  readonly onMoveFirst: (id: string) => Promise<void>;
  readonly onRetry: () => void;
};

/** Saved messages waiting for the current turn, attached above the composer. */
export function ChatMessageQueueView({
  items,
  sendingId,
  error,
  onEdit,
  onSteer,
  onMoveFirst,
  onRetry,
}: ChatMessageQueueProps): React.JSX.Element | undefined {
  const [editing, setEditing] = useState<string>();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ id: string; label: string }>();
  const [actionError, setActionError] = useState<{
    message: string;
    id: string;
    label: string;
    operation: () => Promise<void>;
  }>();
  if (items.length === 0 && error === undefined && actionError === undefined) {
    return undefined;
  }
  const act = (id: string, label: string, operation: () => Promise<void>): void => {
    setPending({ id, label });
    setActionError(undefined);
    // async-iife: bootstrap — keep the row intact and report a failed filesystem action.
    void (async () => {
      try {
        await operation();
        setEditing(undefined);
      } catch (error) {
        setActionError({ message: error instanceof Error ? error.message : String(error), id, label, operation });
      } finally {
        setPending(undefined);
      }
    })();
  };
  return (
    <section
      aria-label='Queued messages'
      className='@container/message-queue max-h-64 min-w-0 overflow-y-auto overscroll-contain'
    >
      <ul className='m-0 list-none p-0'>
        {items.map((item, index) => {
          const content = item.message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
          const attachments = item.message.parts.filter((part) => part.type === 'file').length;
          const busy =
            sendingId === item.id || pending?.id === item.id || (item.steer !== undefined && error === undefined);
          const busyLabel =
            pending?.id === item.id ? pending.label : item.steer === undefined ? 'Sending…' : 'Steering…';
          const locked = busy || pending !== undefined || item.command !== undefined || item.steer !== undefined;
          return (
            <li key={item.id} aria-busy={busy} className='min-w-0 px-2 py-1'>
              <div className='flex min-w-0 items-center gap-2 @max-[14rem]/message-queue:flex-wrap'>
                {busy ? (
                  <Loader className='size-4 shrink-0 text-muted-foreground motion-reduce:animate-none' />
                ) : (
                  <ListEnd aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                )}
                <span className='min-w-0 flex-1 truncate text-sm' title={content}>
                  {content || 'Attached files'}
                </span>
                {attachments > 0 ? (
                  <span
                    aria-label={`${String(attachments)} attachments`}
                    className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'
                  >
                    <Paperclip aria-hidden='true' className='size-3' />
                    {attachments}
                  </span>
                ) : null}
                <div className='flex shrink-0 items-center gap-1 text-muted-foreground @max-[14rem]/message-queue:basis-full @max-[14rem]/message-queue:flex-wrap @max-[14rem]/message-queue:justify-end'>
                  <Button
                    variant='ghost'
                    size='xs'
                    className={cn('rounded-full font-normal', busy && 'disabled:opacity-100')}
                    aria-label='Steer'
                    disabled={locked}
                    title='Interrupt the current turn and send this message'
                    onClick={() => {
                      act(item.id, 'Steering…', async () => onSteer(item.id));
                    }}
                  >
                    {busy ? (
                      <span role='status'>{busyLabel}</span>
                    ) : (
                      <>
                        <CornerDownRight aria-hidden='true' className='size-4' />
                        Steer
                      </>
                    )}
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    className='rounded-full'
                    aria-label={`Delete queued message ${String(index + 1)}`}
                    disabled={locked}
                    onClick={() => {
                      act(item.id, 'Removing…', async () => onEdit(item.id, undefined));
                    }}
                  >
                    <Trash2 className='size-4' />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        className='rounded-full'
                        aria-label={`Options for queued message ${String(index + 1)}`}
                        disabled={locked}
                      >
                        <MoreHorizontal className='size-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem
                        onSelect={() => {
                          setText(content);
                          setEditing(item.id);
                        }}
                      >
                        <Pencil className='size-4' />
                        Edit message
                      </DropdownMenuItem>
                      {index > 0 ? (
                        <DropdownMenuItem
                          onSelect={() => {
                            act(item.id, 'Moving…', async () => onMoveFirst(item.id));
                          }}
                        >
                          Move to front
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {editing === item.id ? (
                <form
                  className='mt-2 space-y-2'
                  onSubmit={(event) => {
                    event.preventDefault();
                    act(item.id, 'Saving…', async () => onEdit(item.id, text));
                  }}
                >
                  <Textarea
                    aria-label='Edit queued message'
                    value={text}
                    disabled={busy}
                    onChange={(event) => {
                      setText(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setEditing(undefined);
                      }
                    }}
                  />
                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={busy}
                      onClick={() => {
                        setEditing(undefined);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type='submit' size='sm' disabled={busy || (text.trim() === '' && attachments === 0)}>
                      Save
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      {actionError !== undefined || error !== undefined ? (
        <div role='alert' className='flex items-start gap-2 px-2 py-2 text-xs text-muted-foreground'>
          <span className='min-w-0 flex-1 self-center wrap-anywhere'>{actionError?.message ?? error}</span>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              if (actionError === undefined) {
                onRetry();
              } else {
                act(actionError.id, actionError.label, actionError.operation);
              }
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}
