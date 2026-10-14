import { useRef, useState } from 'react';
import { CornerDownRight, GripVertical, ListEnd, MoreVertical, Paperclip, Pencil, Trash2 } from 'lucide-react';
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
  readonly onMove: (id: string, beforeId: string | undefined) => Promise<void>;
  readonly onRetry: () => void;
};

/** Saved messages waiting for the current turn, attached above the composer. */
export function ChatMessageQueueView({
  items,
  sendingId,
  error,
  onEdit,
  onSteer,
  onMove,
  onRetry,
}: ChatMessageQueueProps): React.JSX.Element | undefined {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const pointer = useRef<{ id: string; startY: number; beforeId?: string; moved: boolean } | undefined>(undefined);
  const [drag, setDrag] = useState<{ id: string; beforeId?: string }>();
  const [editing, setEditing] = useState<string>();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ id: string; label: string }>();
  const [actionError, setActionError] = useState<{
    message: string;
    id: string;
    label: string;
    operation: () => Promise<void>;
  }>();
  const reorderLocked =
    editing !== undefined ||
    sendingId !== undefined ||
    items.some((item) => item.command !== undefined || item.steer !== undefined);
  const visibleError = items.some((item) => item.id === actionError?.id) ? actionError : undefined;
  if (items.length === 0 && error === undefined && visibleError === undefined) {
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
      <ul className='m-0 list-none divide-y divide-border/50 p-0'>
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
          const statusLabel =
            item.steer !== undefined && error !== undefined ? 'Steer failed' : busy ? busyLabel : undefined;
          const locked = busy || pending !== undefined || item.command !== undefined || item.steer !== undefined;
          return (
            <li
              key={item.id}
              aria-busy={busy}
              ref={(element) => {
                if (element === null) {
                  rows.current.delete(item.id);
                } else {
                  rows.current.set(item.id, element);
                }
              }}
              className={cn('relative min-w-0 px-2 py-0.5', drag?.id === item.id && 'bg-accent/30')}
            >
              {drag !== undefined &&
              (drag.beforeId === item.id || (drag.beforeId === undefined && index === items.length - 1)) ? (
                <span
                  aria-hidden='true'
                  className={cn(
                    'pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-muted-foreground',
                    drag.beforeId === item.id ? 'top-0' : 'bottom-0',
                  )}
                />
              ) : null}
              <div className='flex min-w-0 items-center gap-2 @max-[14rem]/message-queue:flex-wrap'>
                <Button
                  variant='ghost'
                  size='icon-xs'
                  className={cn(
                    'group/handle cursor-grab touch-none text-muted-foreground/90 active:cursor-grabbing',
                    drag?.id === item.id && 'cursor-grabbing bg-accent/50 text-accent-foreground',
                  )}
                  aria-label={`Reorder queued message ${String(index + 1)}`}
                  title='Drag to reorder, or use the up and down arrow keys'
                  disabled={locked || reorderLocked || items.length < 2}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointer.current = { id: item.id, startY: event.clientY, moved: false };
                  }}
                  onPointerMove={(event) => {
                    const { current } = pointer;
                    if (current?.id !== item.id || (Math.abs(event.clientY - current.startY) < 4 && !current.moved)) {
                      return;
                    }
                    const beforeId = items.find((entry) => {
                      const bounds = rows.current.get(entry.id)?.getBoundingClientRect();
                      return (
                        entry.id !== item.id && bounds !== undefined && event.clientY < (bounds.top + bounds.bottom) / 2
                      );
                    })?.id;
                    pointer.current = { ...current, moved: true, beforeId };
                    const scroller = event.currentTarget.closest('section');
                    const bounds = scroller?.getBoundingClientRect();
                    const inside =
                      bounds !== undefined &&
                      event.clientX >= bounds.left &&
                      event.clientX <= bounds.right &&
                      event.clientY >= bounds.top &&
                      event.clientY <= bounds.bottom;
                    setDrag(inside && beforeId !== items[index + 1]?.id ? { id: item.id, beforeId } : undefined);
                    if (
                      scroller !== null &&
                      bounds !== undefined &&
                      event.clientX >= bounds.left &&
                      event.clientX <= bounds.right
                    ) {
                      if (event.clientY < bounds.top + 24) {
                        scroller.scrollBy(0, -16);
                      } else if (event.clientY > bounds.bottom - 24) {
                        scroller.scrollBy(0, 16);
                      }
                    }
                  }}
                  onPointerUp={(event) => {
                    const { current } = pointer;
                    pointer.current = undefined;
                    setDrag(undefined);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    const bounds = event.currentTarget.closest('section')?.getBoundingClientRect();
                    const inside =
                      bounds !== undefined &&
                      event.clientX >= bounds.left &&
                      event.clientX <= bounds.right &&
                      event.clientY >= bounds.top &&
                      event.clientY <= bounds.bottom;
                    if (
                      current?.moved &&
                      inside &&
                      !locked &&
                      !reorderLocked &&
                      current.beforeId !== items[index + 1]?.id
                    ) {
                      act(item.id, 'Moving…', async () => onMove(item.id, current.beforeId));
                    }
                  }}
                  onPointerCancel={() => {
                    pointer.current = undefined;
                    setDrag(undefined);
                  }}
                  onLostPointerCapture={() => {
                    pointer.current = undefined;
                    setDrag(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      pointer.current = undefined;
                      setDrag(undefined);
                    }
                    if (locked || reorderLocked) {
                      return;
                    }
                    if (event.key === 'ArrowUp' && index > 0) {
                      event.preventDefault();
                      act(item.id, 'Moving…', async () => onMove(item.id, items[index - 1]?.id));
                    } else if (event.key === 'ArrowDown' && index < items.length - 1) {
                      event.preventDefault();
                      act(item.id, 'Moving…', async () => onMove(item.id, items[index + 2]?.id));
                    }
                  }}
                >
                  {busy ? (
                    <Loader className='size-3.5 motion-reduce:animate-none' />
                  ) : (
                    <>
                      <ListEnd
                        aria-hidden='true'
                        className={cn(
                          'size-3.5 group-hover/handle:hidden group-focus-visible/handle:hidden',
                          drag?.id === item.id && 'hidden',
                        )}
                      />
                      <GripVertical
                        aria-hidden='true'
                        className={cn(
                          'size-3.5 group-hover/handle:block group-focus-visible/handle:block',
                          drag?.id === item.id ? 'block' : 'hidden',
                        )}
                      />
                    </>
                  )}
                </Button>
                <span className='min-w-0 flex-1 truncate text-xs' title={content}>
                  {content || 'Attached files'}
                </span>
                {attachments > 0 ? (
                  <span
                    aria-label={`${String(attachments)} attachments`}
                    className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'
                  >
                    <Paperclip aria-hidden='true' className='size-3.5' />
                    {attachments}
                  </span>
                ) : null}
                <div className='flex shrink-0 items-center gap-0.5 text-muted-foreground/90 @max-[14rem]/message-queue:basis-full @max-[14rem]/message-queue:flex-wrap @max-[14rem]/message-queue:justify-end'>
                  <Button
                    variant='ghost'
                    size='xs'
                    className={cn(
                      'gap-1 px-1 font-normal has-[>svg]:px-1',
                      statusLabel !== undefined && 'disabled:opacity-100',
                    )}
                    aria-label='Steer'
                    disabled={locked}
                    title='Interrupt the current turn and send this message'
                    onClick={() => {
                      act(item.id, 'Steering…', async () => onSteer(item.id));
                    }}
                  >
                    {statusLabel === undefined ? (
                      <>
                        <CornerDownRight aria-hidden='true' className='size-3.5' />
                        Steer
                      </>
                    ) : (
                      <span role='status'>{statusLabel}</span>
                    )}
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    aria-label={`Delete queued message ${String(index + 1)}`}
                    disabled={locked}
                    onClick={() => {
                      act(item.id, 'Removing…', async () => onEdit(item.id, undefined));
                    }}
                  >
                    <Trash2 className='size-3.5' />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        aria-label={`Options for queued message ${String(index + 1)}`}
                        disabled={locked}
                      >
                        <MoreVertical className='size-3.5' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem
                        onSelect={() => {
                          setText(content);
                          setEditing(item.id);
                        }}
                      >
                        <Pencil className='size-3.5' />
                        Edit message
                      </DropdownMenuItem>
                      {index > 0 ? (
                        <DropdownMenuItem
                          disabled={reorderLocked}
                          onSelect={() => {
                            act(item.id, 'Moving…', async () => onMove(item.id, items[index - 1]?.id));
                          }}
                        >
                          Move up
                        </DropdownMenuItem>
                      ) : null}
                      {index < items.length - 1 ? (
                        <DropdownMenuItem
                          disabled={reorderLocked}
                          onSelect={() => {
                            act(item.id, 'Moving…', async () => onMove(item.id, items[index + 2]?.id));
                          }}
                        >
                          Move down
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
      {visibleError !== undefined || error !== undefined ? (
        <div role='alert' className='flex items-start gap-2 px-2 py-2 text-xs text-muted-foreground'>
          <span className='min-w-0 flex-1 self-center wrap-anywhere'>{visibleError?.message ?? error}</span>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              if (visibleError === undefined) {
                onRetry();
              } else {
                act(visibleError.id, visibleError.label, visibleError.operation);
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
