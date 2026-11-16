import { Skeleton } from '@taucad/ui/components/skeleton';
import { PageContent } from '#components/layout/page-content.js';
import { sidebarPreferredWidth } from '@taucad/ui-core/constants/sidebar.constants';

import { projectGridClassName } from '#components/project-grid-layout.js';

/**
 * What `/community` shows while the root file-manager mount starts, which is
 * also its server render: the shell's frame and the explorer's shape — title
 * row, kernel shelf and the first cards — so the gallery fills in instead of
 * appearing from a blank window (lane C P6).
 *
 * It renders above the app shell, so it owns the window and stands in for the sidebar at its resting width. The
 * markup is the same for every visitor; a sidebar stored closed drops the stand-in through the client-facts head
 * script's `data-sidebar-closed` on `<html>` (`#lib/client-facts`), before first paint and after it alike.
 *
 * @returns The skeleton.
 */
export function CommunityPageSkeleton(): React.JSX.Element {
  return (
    <div role='status' aria-busy='true' aria-label='Opening examples' className='flex h-dvh w-full bg-background'>
      <div
        data-slot='sidebar-stand-in'
        className='hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar md:block [:root[data-sidebar-closed]_&]:md:hidden'
        style={{ width: sidebarPreferredWidth }}
      />
      <div aria-hidden='true' className='min-w-0 flex-1 overflow-hidden'>
        <div
          data-slot='titlebar-spacer'
          className='h-12 md:hidden [:root[data-sidebar-closed]_&]:md:block [:root[data-sidebar-closed]_&]:md:h-9'
        />
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
          <div className={projectGridClassName}>
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
