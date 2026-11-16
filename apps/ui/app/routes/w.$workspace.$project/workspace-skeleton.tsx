import { useSyncExternalStore } from 'react';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import { defaultPanelState } from '@taucad/ui-core/constants/editor.constants';
import { ChatPaneSkeleton } from '@taucad/project-workspace/components/chat-pane-skeleton';
import { ProjectComposerHandOff } from '#components/chat/project-composer-hand-off.js';

const { chatWidth, workbenchWidth } = defaultPanelState.desktopLayout;

/** How long a wait has to last before the lanes are worth drawing. */
export const revealDelayMilliseconds = 300;

/*
 * One clock for the whole load, not one per element. Opening a project hands the placeholder from
 * gate to gate — Home's engine, the worker, the workspace chunk, the session — and each handover
 * mounts a fresh skeleton. A per-element entrance would restart every time, so a slow load blinked
 * its lanes in and out and spent most of the wait invisible. `performance.now()` is milliseconds
 * since this document started, so the hold is spent once per load: a skeleton that arrives inside
 * the first blink eases in, and every later one is simply there.
 */
const isWithinRevealDelay = (): boolean => performance.now() < revealDelayMilliseconds;

/** The value never changes on its own; each mount reads the clock once. */
const subscribeToNothing = (): (() => void) => {
  return () => undefined;
};

/** The server cannot know the client's clock, and its render is the first paint, so it always holds. */
const holdOnServer = (): boolean => true;

/**
 * What every state before the live workspace shows: the window's own
 * background, and — only if the wait outlasts a blink — the lanes at their
 * default widths, so opening a project is one placeholder that fills in rather
 * than a sequence of blanks and spinners.
 *
 * Held back 300ms like the editor pane's placeholder: a warm load lands on the
 * workspace without a skeleton ever appearing, and a slow one gets shape
 * instead of an empty window. The frame itself paints immediately, so the wait
 * is the right colour from the first frame in either theme. The hold is spent
 * once per load rather than once per mount — see `isWithinRevealDelay`.
 *
 * The exception is the chat lane's composer (PL6): it holds a native input that takes text from first paint, which
 * the live composer adopts, so the lane and its composer frame are drawn at once and only the stand-in header,
 * messages and other lanes wait out the blink.
 *
 * Which arrangement shows is CSS, not a hook: this renders before hydration,
 * where no measured width exists yet and a JavaScript guess paints the wrong
 * layout first. The workbench lane hides at the width the live layout drops it
 * (`compactWorkspaceWidth`) through a container query, so it follows the
 * workspace's own width rather than the window's.
 *
 * It always renders inside the app shell's content region: the shell has one tree position on every route (D24), so
 * nothing stands in for its sidebar.
 *
 * @returns The skeleton.
 */
export function WorkspaceSkeleton(): React.JSX.Element {
  const isDelayed = useSyncExternalStore(subscribeToNothing, isWithinRevealDelay, holdOnServer);
  /* The stand-ins ease in after a blink; the chat lane and its composer frame do not, because the composer takes text
   * from first paint (PL6) and a person cannot be asked to type into something not yet drawn. */
  const entrance =
    isDelayed && 'animate-in duration-300 fill-mode-both [animation-delay:300ms] fade-in motion-reduce:animate-none';

  return (
    <div
      role='status'
      aria-busy='true'
      aria-label='Opening project'
      data-testid='workspace-skeleton'
      className='@container size-full bg-background max-md:absolute max-md:inset-0'
    >
      <div data-slot='workspace-skeleton-lanes' className='flex size-full'>
        <div className='hidden h-full shrink-0 border-r border-border md:block' style={{ width: chatWidth }}>
          <ChatPaneSkeleton
            variant='loading'
            composer={<ProjectComposerHandOff />}
            decorationClassName={cn(entrance)}
          />
        </div>
        <div aria-hidden='true' className='h-full min-w-0 flex-1' />
        <div
          aria-hidden='true'
          /* 1120px is `compactWorkspaceWidth` in `chat-interface-desktop.tsx`; Tailwind needs the literal. */
          className={cn('hidden h-full shrink-0 flex-col border-l border-border @min-[1120px]:flex', entrance)}
          style={{ width: workbenchWidth }}
        >
          <div className='flex h-9 shrink-0 items-center gap-2 px-3'>
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-4 w-16' />
          </div>
          <div className='min-h-0 flex-1' />
        </div>
        <div
          aria-hidden='true'
          className={cn(
            'fixed right-0 bottom-0 left-0 z-50 flex h-11 items-center gap-1 rounded-t-xl border-t bg-sidebar px-2 md:hidden',
            entrance,
          )}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className='h-6 flex-1' />
          ))}
        </div>
      </div>
    </div>
  );
}
