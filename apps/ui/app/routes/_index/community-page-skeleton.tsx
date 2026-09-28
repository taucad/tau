import { Skeleton } from '@taucad/ui/components/skeleton';
import { PageContent } from '#components/layout/page-content.js';
import { cookieName } from '#constants/cookie.constants.js';
import { sidebarDefaultOpen, sidebarPreferredWidth } from '#constants/sidebar.constants.js';
import { useCookie } from '#hooks/use-cookie.js';

/*
 * ponytail: the grid classes repeat `projectGridClassName` (`components/project-grid.tsx`) instead of importing
 * it, because the root gate renders this and that module would pull the card and preview graph into every page.
 */
const gridClassName = 'grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

/**
 * What `/community` shows while the root file-manager mount starts, which is
 * also its server render: the shell's frame and the explorer's shape — title
 * row, kernel shelf and the first cards — so the gallery fills in instead of
 * appearing from a blank window (lane C P6).
 *
 * It renders above the app shell, so like `WorkspaceSkeleton withShellFrame`
 * it owns the window and stands in for the sidebar at its resting width.
 *
 * @returns The skeleton.
 */
export function CommunityPageSkeleton(): React.JSX.Element {
  /* The shell's own source for the sidebar's resting state, so a collapsed sidebar gets no stand-in. */
  const [isSidebarOpen] = useCookie(cookieName.sidebarOp, sidebarDefaultOpen);

  return (
    <div role='status' aria-busy='true' aria-label='Opening examples' className='flex h-dvh w-full bg-background'>
      {isSidebarOpen ? (
        <div
          className='hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar md:block'
          style={{ width: sidebarPreferredWidth }}
        />
      ) : null}
      <div aria-hidden='true' className='min-w-0 flex-1 overflow-hidden'>
        <div className='h-12 md:h-9' />
        <PageContent className='space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-3'>
            <Skeleton className='h-9 w-44' />
            <div className='flex w-full items-center gap-2 sm:w-auto'>
              <Skeleton className='h-9 grow sm:w-72' />
              <Skeleton className='h-9 w-28' />
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className='h-13 w-40 rounded-md sm:w-56' />
            ))}
          </div>
          <div className={gridClassName}>
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className='overflow-hidden rounded-xl border'>
                <Skeleton className='aspect-4/3 w-full rounded-none' />
                <div className='p-3'>
                  <Skeleton className='h-4 w-3/4' />
                </div>
              </div>
            ))}
          </div>
        </PageContent>
      </div>
    </div>
  );
}
