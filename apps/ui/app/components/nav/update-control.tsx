import { useEffect, useId, useRef } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
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
  /** What the button says while busy, naming the work under way ("Saving…"). */
  readonly busyLabel?: string;
  readonly onClick: () => void;
};

/**
 * The sidebar notice shared by every "a newer Tau is available" surface. Desktop and browser differ only in copy and
 * the action they wire in, so both read as the same notice in the same place: the last entry of `SidebarNotices`.
 *
 * Its details open in place below its header, inside the notice, so the stack grows and nothing above it is covered.
 * Opening never moves focus, so a reveal while someone types leaves the editor focused.
 */
export function UpdateControl({
  title,
  version,
  detail,
  icon: Icon,
  isFailed = false,
  releasePage,
  releaseLabel = 'What’s new',
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
  /** The link's label; **Download Tau** when the link is the download page rather than release notes. */
  readonly releaseLabel?: string;
  readonly action?: UpdateControlAction;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const titleId = useId();
  const detailsId = useId();
  /* A live region that mounts already filled is often not announced, so the title is written into it after mount. */
  const statusRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (statusRef.current) {
      statusRef.current.textContent = title;
    }
  }, [title]);
  return (
    <SidebarNotice labelledBy={titleId}>
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
          <ChevronRight aria-hidden className={cn('transition-transform', isOpen && 'rotate-90')} />
        </SidebarNoticeCorner>
      </SidebarNoticeHeader>
      {isOpen ? (
        <div id={detailsId} role='group' aria-label='Tau update' className='pt-2'>
          {/* Text sits one step inside the actions, which keep the shared right edge. */}
          <div className='px-1'>
            {version ? <p className='text-xs leading-4 text-muted-foreground'>{version}</p> : undefined}
            <p className='mt-1 text-xs leading-4 text-muted-foreground'>{detail}</p>
          </div>
          {/* Wraps the action under the link when a narrow sidebar cannot fit both on one line. */}
          <SidebarNoticeActions className='mt-3'>
            {/* "What's new" sits on the shell's inner edge, its label in line with the text above. */}
            {releasePage ? (
              <Button asChild variant='ghost' size='xs' className='mr-auto px-1 has-[>svg]:px-1'>
                <a href={releasePage} target='_blank' rel='noopener noreferrer'>
                  {releaseLabel}
                  <ArrowUpRight className='size-3' />
                </a>
              </Button>
            ) : undefined}
            {action ? (
              <Button size='xs' variant={action.variant} disabled={action.busy} onClick={action.onClick}>
                {action.busy ? <Loader className='size-3' /> : undefined}
                {action.busy ? (action.busyLabel ?? action.label) : action.label}
              </Button>
            ) : undefined}
          </SidebarNoticeActions>
        </div>
      ) : undefined}
      <span ref={statusRef} className='sr-only' role='status' aria-live='polite' />
    </SidebarNotice>
  );
}
