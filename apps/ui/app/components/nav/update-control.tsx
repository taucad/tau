import { useId } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { ArrowUpRight, ChevronUp } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import {
  SidebarNotice,
  SidebarNoticeActions,
  SidebarNoticeCorner,
  SidebarNoticeHeader,
  SidebarNoticeTile,
  sidebarNoticeInnerRadius,
  sidebarNoticeTitle,
} from '#components/nav/sidebar-notices.js';

export type UpdateControlAction = {
  readonly label: string;
  readonly variant: 'default' | 'outline';
  readonly busy?: boolean;
  readonly onClick: () => void;
};

/**
 * The sidebar notice shared by every "a newer Tau is available" surface. Desktop and browser differ only in copy and
 * the action they wire in, so both read as the same notice in the same place: the last entry of `SidebarNotices`.
 *
 * Its details open in place, above its header, so the stack grows upward, nothing above it is covered and the toggle
 * stays under the pointer. Opening never moves focus, so a reveal while someone types leaves the editor focused.
 */
export function UpdateControl({
  title,
  version,
  detail,
  icon: Icon,
  isFailed = false,
  releasePage,
  action,
  isOpen,
  onOpenChange,
}: {
  readonly title: string;
  readonly version?: string;
  readonly detail: string;
  readonly icon: React.ComponentType<{ readonly className?: string }>;
  readonly isFailed?: boolean;
  readonly releasePage?: string;
  readonly action?: UpdateControlAction;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const titleId = useId();
  const detailsId = useId();
  return (
    // The details open above the header, so the header and its toggle stay where they were clicked: the stack is
    // anchored to the sidebar's foot and grows upward. The DOM keeps the header first, so focus and reading order are
    // toggle, then details.
    <SidebarNotice labelledBy={titleId} className='flex flex-col-reverse'>
      <SidebarNoticeHeader>
        <button
          type='button'
          aria-label={title}
          aria-expanded={isOpen}
          aria-controls={detailsId}
          className={cn(
            'flex h-6 w-full items-center gap-2 pr-7 text-left outline-hidden hover:bg-sidebar-accent focus-visible:focus-outline',
            sidebarNoticeInnerRadius,
          )}
          onClick={() => {
            onOpenChange(!isOpen);
          }}
        >
          <SidebarNoticeTile className={cn('size-6 [&_svg]:size-4', isFailed && 'text-destructive')}>
            <Icon />
          </SidebarNoticeTile>
          <span id={titleId} className={sidebarNoticeTitle}>
            {title}
          </span>
        </button>
        <SidebarNoticeCorner className='pointer-events-none'>
          {/* Up while closed (the details open above), down while open (they fold back down). */}
          <ChevronUp aria-hidden className={cn('transition-transform', isOpen && 'rotate-180')} />
        </SidebarNoticeCorner>
      </SidebarNoticeHeader>
      {isOpen ? (
        <div id={detailsId} role='region' aria-label='Tau update' className='pt-1.5 pb-3'>
          {/* Text sits one step inside the actions, which keep the shared right edge. */}
          <div className='px-1'>
            {version ? <p className='text-xs leading-4 text-muted-foreground'>{version}</p> : undefined}
            <p className='mt-1 text-xs leading-4 text-muted-foreground'>{detail}</p>
          </div>
          {/* Wraps the action under the link when a narrow sidebar cannot fit both on one line. */}
          <SidebarNoticeActions className='mt-3'>
            {releasePage ? (
              <Button asChild variant='ghost' size='xs' className='mr-auto -ml-2'>
                <a href={releasePage} target='_blank' rel='noopener noreferrer'>
                  What’s new
                  <ArrowUpRight className='size-3' />
                </a>
              </Button>
            ) : undefined}
            {action ? (
              <Button size='xs' variant={action.variant} disabled={action.busy} onClick={action.onClick}>
                {action.busy ? <Loader className='size-3' /> : undefined}
                {action.busy ? 'Please wait…' : action.label}
              </Button>
            ) : undefined}
          </SidebarNoticeActions>
        </div>
      ) : undefined}
      <span className='sr-only' role='status' aria-live='polite'>
        {title}
      </span>
    </SidebarNotice>
  );
}
