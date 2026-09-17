import { Skeleton } from '@taucad/ui/components/skeleton';
import { defaultPanelState } from '#constants/editor.constants.js';
import { ChatPaneSkeleton } from '#routes/w.$workspace.$project/focused-chat-gate.js';

const { chatWidth, workbenchWidth } = defaultPanelState.desktopLayout;

/**
 * The project workspace while its editor state loads: the desktop lanes at
 * their default widths — chat, viewer, workbench — so the window never shows
 * a blank page and the lanes appear where they will stay. The viewer lane is
 * its resting background; the viewer draws its own progress once mounted.
 *
 * @param props - Whether the workspace is in its compact (two-lane) layout.
 * @returns The skeleton.
 */
export function WorkspaceSkeleton({ isCompact }: { readonly isCompact: boolean }): React.JSX.Element {
  return (
    <div
      role='status'
      aria-busy='true'
      aria-label='Opening project'
      data-testid='workspace-skeleton'
      className='flex size-full bg-background'
    >
      <div className='h-full shrink-0 border-r border-border' style={{ width: chatWidth }}>
        <ChatPaneSkeleton variant='loading' />
      </div>
      <div className='h-full min-w-0 flex-1' />
      {isCompact ? null : (
        <div
          aria-hidden='true'
          className='flex h-full shrink-0 flex-col border-l border-border'
          style={{ width: workbenchWidth }}
        >
          <div className='flex h-9 shrink-0 items-center gap-2 px-3'>
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-4 w-16' />
          </div>
          <div className='min-h-0 flex-1' />
        </div>
      )}
    </div>
  );
}

/**
 * The mobile workspace while its editor state loads: the viewer's resting
 * background and the tab bar's footprint, so the drawer and tabs arrive in
 * place.
 *
 * @returns The skeleton.
 */
export function MobileWorkspaceSkeleton(): React.JSX.Element {
  return (
    <div
      role='status'
      aria-busy='true'
      aria-label='Opening project'
      data-testid='workspace-skeleton'
      className='absolute inset-0 size-full bg-background md:hidden'
    >
      <div
        aria-hidden='true'
        className='fixed right-0 bottom-0 left-0 z-50 flex h-11 items-center gap-1 rounded-t-xl border-t bg-sidebar px-2'
      >
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className='h-6 flex-1' />
        ))}
      </div>
    </div>
  );
}
