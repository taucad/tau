import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import { defaultPanelState } from '#constants/editor.constants.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { sidebarDefaultOpen, sidebarPreferredWidth } from '#constants/sidebar.constants.js';
import { ChatPaneSkeleton } from '#routes/w.$workspace.$project/focused-chat-gate.js';

const { chatWidth, workbenchWidth } = defaultPanelState.desktopLayout;

/**
 * The one placeholder for every state before the live workspace: the desktop
 * lanes at their default widths — chat, viewer, workbench — or, at mobile
 * width, the viewer's resting background and the tab bar's footprint. Opening a
 * project is then one skeleton that fills in rather than a sequence of blanks
 * and spinners, and the lanes appear where they will stay. The viewer lane is
 * its resting background; the viewer draws its own progress once mounted.
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

  return (
    <div
      role='status'
      aria-busy='true'
      aria-label='Opening project'
      data-testid='workspace-skeleton'
      className={cn(
        '@container flex bg-background max-md:absolute max-md:inset-0',
        /* Above the shell nothing sizes this mount, so it takes the window itself. */
        withShellFrame ? 'h-dvh w-full' : 'size-full',
      )}
    >
      {withShellFrame && isSidebarOpen ? (
        <div
          aria-hidden='true'
          className='hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar md:block'
          style={{ width: sidebarPreferredWidth }}
        />
      ) : null}
      <div className='hidden h-full shrink-0 border-r border-border md:block' style={{ width: chatWidth }}>
        <ChatPaneSkeleton variant='loading' />
      </div>
      <div className='h-full min-w-0 flex-1' />
      <div
        aria-hidden='true'
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
      <div
        aria-hidden='true'
        className='fixed right-0 bottom-0 left-0 z-50 flex h-11 items-center gap-1 rounded-t-xl border-t bg-sidebar px-2 md:hidden'
      >
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className='h-6 flex-1' />
        ))}
      </div>
    </div>
  );
}
