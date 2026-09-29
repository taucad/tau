import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArchiveRestore, Trash2 } from 'lucide-react';
import type { ChatRecord } from '@taucad/chat/schemas';
import { Button } from '@taucad/ui/components/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { SearchInput } from '#components/search-input.js';

type ArchivedChatsViewProps = {
  readonly chats: readonly ChatRecord[];
  readonly isLoading: boolean;
  readonly error?: string;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onBack: () => void;
  readonly onRetry: () => void;
  readonly onUnarchive: (chat: ChatRecord) => Promise<void>;
  readonly onDelete: (chats: readonly ChatRecord[]) => Promise<void>;
};

/** Project archive presentation, shared by the history pane and local design fixtures. */
export function ArchivedChatsView({
  chats,
  isLoading,
  error,
  query,
  onQueryChange,
  onBack,
  onRetry,
  onUnarchive,
  onDelete,
}: ArchivedChatsViewProps): React.JSX.Element {
  const [confirmation, setConfirmation] = useState<ChatRecord | 'all'>();
  const [pending, setPending] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const busy = useRef(false);
  const backButton = useRef<HTMLButtonElement>(null);
  const confirmationTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButton.current?.focus();
  }, []);
  const isSettled = !isLoading && !error;
  const matches = chats.filter((chat) => chat.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const run = async (id: string, operation: () => Promise<void>): Promise<void> => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setPending(id);
    setOperationError(undefined);
    try {
      await operation();
      setConfirmation(undefined);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Could not update archived chats. Try again.');
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  };

  return (
    <section aria-label='Archived chats' className='@container flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4'>
      <div>
        <Button ref={backButton} variant='ghost' size='xs' onClick={onBack} aria-label='Back to chat'>
          <ArrowLeft aria-hidden /> Back
        </Button>
        <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-lg font-semibold'>Archived chats</h2>
          <Button
            variant='destructive'
            size='xs'
            disabled={chats.length === 0 || isLoading || Boolean(error) || pending !== undefined}
            onClick={(event) => {
              confirmationTrigger.current = event.currentTarget;
              setConfirmation('all');
            }}
          >
            <Trash2 aria-hidden /> Delete all
          </Button>
        </div>
      </div>
      <SearchInput
        value={query}
        aria-label='Search archived chats'
        placeholder='Search archived chats…'
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        onClear={() => {
          onQueryChange('');
        }}
      />
      {operationError && confirmation === undefined ? (
        <p role='alert' className='text-sm'>
          {operationError}
        </p>
      ) : null}
      {error ? (
        <div role='alert' className='flex flex-wrap items-center gap-2 text-sm'>
          <span>Could not load archived chats. {error}</span>
          <Button variant='outline' size='sm' onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
      {isLoading && chats.length === 0 ? (
        <div role='status' aria-label='Loading archived chats' aria-busy='true' className='space-y-3'>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className='h-16 w-full' />
          ))}
        </div>
      ) : null}
      {isSettled && matches.length === 0 ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {chats.length === 0 ? 'No archived chats' : 'No archived chats match your search'}
        </p>
      ) : null}
      <ul aria-label='Archived chat list' className='min-h-0 min-w-0 flex-1 divide-y overflow-y-auto'>
        {matches.map((chat) => {
          const timestamp = new Date(chat.deletedAt ?? chat.updatedAt);
          return (
            <li key={chat.id} className='flex min-w-0 flex-col gap-2 py-3 @sm:flex-row @sm:items-center'>
              <div className='min-w-0 flex-1'>
                <h3 className='text-sm font-medium [overflow-wrap:anywhere] break-words'>{chat.name}</h3>
                <time dateTime={timestamp.toISOString()} className='text-xs text-muted-foreground'>
                  {timestamp.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </div>
              <div className='flex flex-wrap items-center justify-end gap-2'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={`Delete ${chat.name}`}
                      disabled={pending !== undefined}
                      onClick={(event) => {
                        confirmationTrigger.current = event.currentTarget;
                        setConfirmation(chat);
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete chat</TooltipContent>
                </Tooltip>
                <Button
                  variant='secondary'
                  size='xs'
                  aria-label={`Unarchive ${chat.name}`}
                  aria-busy={pending === chat.id}
                  disabled={pending !== undefined}
                  onClick={() => {
                    void run(chat.id, async () => onUnarchive(chat));
                  }}
                >
                  <ArchiveRestore aria-hidden /> Unarchive
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <AlertDialog
        open={confirmation !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy.current) {
            setConfirmation(undefined);
          }
        }}
      >
        <AlertDialogContent
          className='max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto p-3 [overflow-wrap:anywhere]'
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = confirmationTrigger.current;
            const target = trigger?.isConnected && !trigger.disabled ? trigger : backButton.current;
            target?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === 'all' ? 'Delete all archived chats?' : 'Delete archived chat?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === 'all'
                ? `Delete all ${chats.length} archived chats in this project, including chats outside your search?`
                : `Delete ${confirmation?.name ?? 'this chat'}?`}{' '}
              These chats cannot be unarchived after deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {operationError ? (
            <p role='alert' className='text-sm'>
              {operationError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant='outline' size='sm' disabled={pending !== undefined}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button
              variant='destructive'
              size='sm'
              disabled={pending !== undefined}
              aria-busy={pending === 'delete'}
              onClick={() => {
                if (confirmation !== undefined) {
                  const selected = confirmation === 'all' ? chats : [confirmation];
                  void run('delete', async () => onDelete(selected));
                }
              }}
            >
              <Trash2 aria-hidden /> {confirmation === 'all' ? 'Delete all' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
