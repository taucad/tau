import { useSyncExternalStore } from 'react';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import { defaultPanelState } from '#constants/editor.constants.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { sidebarDefaultOpen, sidebarPreferredWidth } from '#constants/sidebar.constants.js';
import { ChatPaneSkeleton } from '#routes/w.$workspace.$project/focused-chat-gate.js';

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
 * Which arrangement shows is CSS, not a hook: this renders before hydration,
 * where no measured width exists yet and a JavaScript guess paints the wrong
 * layout first. The workbench lane hides at the width the live layout drops it
 * (`compactWorkspaceWidth`) through a container query, so it follows the
 * workspace's own width rather than the window's.
 *
 * @param properties - `withShellFrame` for the gates that render above the app
 *   shell, where nothing has mounted yet: the skeleton then owns the window —
 *   the viewport's height, and a stand-in at the sidebar's resting width so the
 *   lanes do not shift when the shell arrives. Inside the shell, leave it off.
 * @returns The skeleton.
 */
export function WorkspaceSkeleton({
  withShellFrame = false,
}: {
  readonly withShellFrame?: boolean;
} = {}): React.JSX.Element {
  /* The shell's own source for the sidebar's resting state, so a collapsed sidebar gets no stand-in. */
  const [isSidebarOpen] = useCookie(cookieName.sidebarOp, sidebarDefaultOpen);
  const isDelayed = useSyncExternalStore(subscribeToNothing, isWithinRevealDelay, holdOnServer);

  return (
    <div
      role='status'
      aria-busy='true'
      aria-label='Opening project'
      data-testid='workspace-skeleton'
      className={cn(
        '@container bg-background max-md:absolute max-md:inset-0',
        /* Above the shell nothing sizes this mount, so it takes the window itself. */
        withShellFrame ? 'h-dvh w-full' : 'size-full',
      )}
    >
      <div
        aria-hidden='true'
        data-slot='workspace-skeleton-lanes'
        className={cn(
          'flex size-full',
          isDelayed &&
            'animate-in duration-300 fill-mode-both [animation-delay:300ms] fade-in motion-reduce:animate-none',
        )}
      >
        {withShellFrame && isSidebarOpen ? (
          <div
            className='hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar md:block'
            style={{ width: sidebarPreferredWidth }}
          />
        ) : null}
        <div className='hidden h-full shrink-0 border-r border-border md:block' style={{ width: chatWidth }}>
          <ChatPaneSkeleton variant='loading' />
        </div>
        <div className='h-full min-w-0 flex-1' />
        <div
          /* 1120px is `compactWorkspaceWidth` in `chat-interface-desktop.tsx`; Tailwind needs the literal. */
          className='hidden h-full shrink-0 flex-col border-l border-border @min-[1120px]:flex'
          style={{ width: workbenchWidth }}
        >
          <div className='flex h-9 shrink-0 items-center gap-2 px-3'>
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-4 w-16' />
          </div>
          <div className='min-h-0 flex-1' />
        </div>
        <div className='fixed right-0 bottom-0 left-0 z-50 flex h-11 items-center gap-1 rounded-t-xl border-t bg-sidebar px-2 md:hidden'>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className='h-6 flex-1' />
          ))}
        </div>
      </div>
    </div>
  );
}
