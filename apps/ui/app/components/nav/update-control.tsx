import { useId } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import {
  SidebarNotice,
  SidebarNoticeCorner,
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
 * Its details open in place, inside the notice, so the stack grows upward and nothing above it is covered. Opening
 * never moves focus, so a reveal while someone types leaves the editor focused.
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
    <SidebarNotice labelledBy={titleId}>
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
        <ChevronRight aria-hidden className={cn('transition-transform', isOpen && 'rotate-90')} />
      </SidebarNoticeCorner>
      {isOpen ? (
        <div id={detailsId} role='region' aria-label='Tau update' className='px-1 pt-2 pb-1'>
          {version ? <p className='text-xs leading-4 text-muted-foreground'>{version}</p> : undefined}
          <p className='mt-1 text-xs leading-4 text-muted-foreground'>{detail}</p>
          {/* Wraps the action under the link when a narrow sidebar cannot fit both on one line. */}
          <div className='mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1'>
            {releasePage ? (
              <Button asChild variant='ghost' size='xs' className='-ml-2'>
                <a href={releasePage} target='_blank' rel='noopener noreferrer'>
                  What’s new
                  <ArrowUpRight className='size-3' />
                </a>
              </Button>
            ) : (
              <span />
            )}
            {action ? (
              <Button
                size='xs'
                variant={action.variant}
                disabled={action.busy}
                className='ml-auto'
                onClick={action.onClick}
              >
                {action.busy ? <Loader className='size-3' /> : undefined}
                {action.busy ? 'Please wait…' : action.label}
              </Button>
            ) : undefined}
          </div>
        </div>
      ) : undefined}
      <span className='sr-only' role='status' aria-live='polite'>
        {title}
      </span>
    </SidebarNotice>
  );
}
