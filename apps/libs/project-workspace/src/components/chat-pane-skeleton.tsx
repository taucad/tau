import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';

/**
 * Renders a low-fidelity placeholder shaped like the chat panel chrome
 * (header bar -> scrolling message stubs -> composer frame) while the
 * editor machine is running `ensureFocusedChatActor` to re-establish the
 * focused-chat invariant at runtime (e.g. after the user deletes the
 * last chat).
 *
 * Scoped to the chat pane only — every other pane in
 * `<ChatInterfaceDesktop>` keeps its own loading behaviour, so the user
 * never sees the editor shell flash or remount.
 */
export function ChatPaneSkeleton({
  variant,
  composer,
  decorationClassName,
}: {
  readonly variant: 'loading' | 'ensuring';
  /**
   * What the composer frame holds: a native input that already takes text, adopted by the live composer
   * (progressive loading P4). Without it the frame is empty.
   */
  readonly composer?: React.ReactNode;
  /** Classes for the stand-in header and messages only, such as an entrance the composer frame must not wait for. */
  readonly decorationClassName?: string;
}): React.JSX.Element {
  return (
    <div
      className='flex size-full flex-col bg-sidebar/50'
      data-slot='floating-panel'
      data-testid={`chat-pane-skeleton-${variant}`}
      aria-busy='true'
      aria-label={variant === 'loading' ? 'Loading editor state…' : 'Preparing chat session…'}
    >
      <div
        aria-hidden='true'
        className={cn('flex h-10 shrink-0 items-center gap-2 border-b px-3', decorationClassName)}
      >
        <Skeleton className='h-5 w-32' />
        <Skeleton className='ml-auto h-5 w-5 rounded-full' />
      </div>
      <div
        aria-hidden='true'
        className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 py-4', decorationClassName)}
      >
        <Skeleton className='h-16 w-3/4 self-start rounded-md' />
        <Skeleton className='h-12 w-2/3 self-end rounded-md' />
        <Skeleton className='h-20 w-4/5 self-start rounded-md' />
      </div>
      {/* The composer is drawn where and as the live one rests (the empty composer's 82 px frame, F18),
       * not as a pulsing block, so it stays still when the pane arrives and only its contents fill in. */}
      <div className='mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'>
        <div
          data-testid='chat-pane-skeleton-composer'
          className='flex min-h-20.5 w-full flex-col rounded-2xl border bg-background shadow-md has-[textarea:focus-visible]:focus-outline'
        >
          {composer}
        </div>
      </div>
    </div>
  );
}
