import { Skeleton } from '@taucad/ui/components/skeleton';

/**
 * Renders a low-fidelity placeholder shaped like the chat panel chrome
 * (header bar -> scrolling message stubs -> textarea footer) while the
 * editor machine is running `ensureFocusedChatActor` to re-establish the
 * focused-chat invariant at runtime (e.g. after the user deletes the
 * last chat).
 *
 * Scoped to the chat pane only — every other pane in
 * `<ChatInterfaceDesktop>` keeps its own loading behaviour, so the user
 * never sees the editor shell flash or remount.
 */
export function ChatPaneSkeleton({ variant }: { readonly variant: 'loading' | 'ensuring' }): React.JSX.Element {
  return (
    <div
      className='flex size-full flex-col bg-sidebar/50'
      data-slot='floating-panel'
      data-testid={`chat-pane-skeleton-${variant}`}
      aria-busy='true'
      aria-label={variant === 'loading' ? 'Loading editor state…' : 'Preparing chat session…'}
    >
      <div className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
        <Skeleton className='h-5 w-32' />
        <Skeleton className='ml-auto h-5 w-5 rounded-full' />
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 py-4'>
        <Skeleton className='h-16 w-3/4 self-start rounded-md' />
        <Skeleton className='h-12 w-2/3 self-end rounded-md' />
        <Skeleton className='h-20 w-4/5 self-start rounded-md' />
      </div>
      <div className='mx-2 mb-2 shrink-0'>
        <Skeleton className='h-20 w-full rounded-sm' />
      </div>
    </div>
  );
}
