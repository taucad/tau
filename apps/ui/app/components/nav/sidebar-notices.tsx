import { useCallback, useId, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import { ArrowUpRight, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

/**
 * The one place the sidebar shows notices: the band between the navigation and the account
 * footer. Each child is a self-gating notice that renders nothing while it has nothing to say,
 * and the band collapses when every child is quiet. Children stack in the order given, so
 * the most persistent notice goes first and the most urgent (an update) sits last, nearest the
 * footer, where it has always been.
 *
 * A new notice is a component that gates itself and composes {@link SidebarNotice} (directly, or through
 * {@link SidebarNoticeCard}); it is added here, not placed beside the footer on its own.
 */
export function SidebarNotices({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div data-slot='sidebar-notices' className='flex flex-col gap-1 p-1 empty:hidden'>
      {children}
    </div>
  );
}

/*
 * Every notice is composed from the same three parts, so the stack reads as one family and lines up by construction:
 * - SidebarNotice, the bordered shell with a 4px inset;
 * - SidebarNoticeTile, the accent tile, its corners concentric with the shell's (the shell's radius less inset and border);
 * - SidebarNoticeHeader and SidebarNoticeCorner: the header row starts at the shell's inner edge, and the corner is its
 *   top-right 24px slot, so the card's close button and the update's chevron share one position wherever the header
 *   sits in its notice;
 * - SidebarNoticeActions, the action row, right-aligned on the same inner edge in every notice.
 */

/** The shell every notice uses. Children are laid out by the notice; the corner slot is absolutely placed. */
export function SidebarNotice({
  labelledBy,
  className,
  children,
}: {
  readonly labelledBy: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        'relative rounded-lg border border-sidebar-border bg-background p-(--notice-inset) text-sidebar-foreground [--notice-inset:0.25rem]',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The radius of anything that sits one inset inside the shell, concentric with the shell's border. */
export const sidebarNoticeInnerRadius = 'rounded-[calc(var(--radius-lg)-var(--notice-inset)-1px)]';

/** The accent tile behind a notice's glyph. Size it from the notice: a square spanning the card, or one row high. */
export function SidebarNoticeTile({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-sidebar-accent text-foreground',
        sidebarNoticeInnerRadius,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A notice's header row: the positioning context for {@link SidebarNoticeCorner}, starting at the shell's inner edge. */
export function SidebarNoticeHeader({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <div className={cn('relative', className)}>{children}</div>;
}

/**
 * The header's top-right slot, holding a 16px glyph centred in 24px. The header starts one inset inside the shell's
 * border, so the slot sits equally far from the shell's top (when the header is first) and right edges.
 */
export function SidebarNoticeCorner({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'absolute top-0 right-0 flex size-6 items-center justify-center text-muted-foreground [&_svg]:size-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A notice's action row: right-aligned on the shell's inner edge. A secondary link takes `mr-auto` to sit left. */
export function SidebarNoticeActions({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={cn('flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-1', className)}>{children}</div>
  );
}

/** A notice's title: medium text, the same in every notice; one truncated line unless a notice lets it wrap. */
export const sidebarNoticeTitle = 'truncate text-sm leading-5 font-medium';

export type SidebarNoticeAction = {
  readonly label: string;
  readonly href: string;
  /** Opens in a new tab, so the workspace stays open. */
  readonly opensInNewTab?: boolean;
  readonly onClick?: () => void;
};

/**
 * The call-to-action notice: a square tile, a title, an optional line of detail, one link action and a close button
 * in the corner slot.
 */
export function SidebarNoticeCard({
  title,
  detail,
  icon,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
}: {
  readonly title: string;
  readonly detail?: string;
  /** The tile's glyph, drawn in the current text colour. */
  readonly icon: React.ReactNode;
  readonly action: SidebarNoticeAction;
  readonly onDismiss: () => void;
  readonly dismissLabel?: string;
}): React.JSX.Element {
  const titleId = useId();
  return (
    <SidebarNotice labelledBy={titleId}>
      <SidebarNoticeHeader className='flex items-center gap-3'>
        {/* A fixed square that sets the card's height: a two-line title and the action (70px) fit beside it, so the tile
          spans the card without its width depending on how the title wraps. */}
        <SidebarNoticeTile className='size-18 [&_svg]:size-6'>{icon}</SidebarNoticeTile>
        {/* Stretched to the tile's height, so the action's bottom inset matches every other notice's. */}
        <div className='flex min-w-0 flex-1 flex-col items-start justify-between gap-1.5 self-stretch'>
          {/* Only the title keeps clear of the close button; the action runs under it to the shared right edge. */}
          <div className='max-w-full min-w-0 pr-6'>
            <p id={titleId} className={cn(sidebarNoticeTitle, 'whitespace-normal')}>
              {title}
            </p>
            {detail ? <p className='text-xs leading-4 text-muted-foreground'>{detail}</p> : undefined}
          </div>
          <SidebarNoticeActions>
            <Button asChild size='xs' variant='outline'>
              <a
                href={action.href}
                target={action.opensInNewTab ? '_blank' : undefined}
                rel={action.opensInNewTab ? 'noopener noreferrer' : undefined}
                onClick={action.onClick}
              >
                {action.label}
                {action.opensInNewTab ? <ArrowUpRight className='size-3' aria-hidden /> : undefined}
              </a>
            </Button>
          </SidebarNoticeActions>
        </div>
        <SidebarNoticeCorner>
          <Button
            variant='ghost'
            size='icon-xs'
            className='text-muted-foreground'
            aria-label={dismissLabel}
            onClick={(event) => {
              focusAfterDismiss(event.currentTarget);
              onDismiss();
            }}
          >
            <X className='size-4' />
          </Button>
        </SidebarNoticeCorner>
      </SidebarNoticeHeader>
    </SidebarNotice>
  );
}

/**
 * Keep keyboard focus in the sidebar when a notice goes away: on the next notice's first control, else the first
 * control of the account footer.
 *
 * @param from - The control that dismissed the notice.
 */
const focusAfterDismiss = (from: HTMLElement): void => {
  const next =
    from.closest('section')?.nextElementSibling?.querySelector<HTMLElement>('button, a[href]') ??
    from
      .closest('[data-slot=sidebar]')
      ?.querySelector<HTMLElement>('[data-slot=sidebar-footer] button, [data-slot=sidebar-footer] a[href]');
  next?.focus();
};

const dismissalKey = (id: string): string => `tau.sidebar-notice.${id}.dismissed`;
const dismissalTopic = new Topic<void>({ name: 'sidebar-notice-dismissal' });

/** Dismissals made on this page, so the X still works when storage is blocked or full. */
const sessionDismissals = new Set<string>();

const readDismissed = (id: string): boolean => {
  if (sessionDismissals.has(id)) {
    return true;
  }
  try {
    return globalThis.localStorage.getItem(dismissalKey(id)) !== null;
  } catch {
    // A blocked store shows the notice; dismissing it then lasts for the page.
    return false;
  }
};

const subscribeDismissals = (listener: () => void): (() => void) => {
  const unsubscribe = dismissalTopic.subscribe(listener);
  // Another tab dismissing the notice hides it here too.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key.startsWith('tau.sidebar-notice.')) {
      listener();
    }
  };
  globalThis.addEventListener('storage', onStorage);
  return () => {
    unsubscribe();
    globalThis.removeEventListener('storage', onStorage);
  };
};

/** The server never knows a device's dismissals, so it renders no notice and the client decides after hydration. */
const serverDismissed = (): boolean => true;

/**
 * A per-device "don't show this again" flag for one sidebar notice.
 *
 * ponytail: `localStorage`, not a cookie or the account. A dismissal belongs to the device (the
 * desktop offer on a laptop says nothing about a work machine), is never server-rendered and
 * never rides a request.
 *
 * @param id - The notice's stable id; changing it shows the notice again to everyone.
 * @returns Whether this device dismissed the notice (true during SSR), and the function that dismisses it.
 */
export function useSidebarNoticeDismissal(id: string): readonly [isDismissed: boolean, dismiss: () => void] {
  const isDismissed = useSyncExternalStore(subscribeDismissals, () => readDismissed(id), serverDismissed);
  const dismiss = useCallback(() => {
    try {
      globalThis.localStorage.setItem(dismissalKey(id), new Date().toISOString());
    } catch {
      // Blocked or full storage: remember it for this page only.
      sessionDismissals.add(id);
    }
    dismissalTopic.emit();
  }, [id]);
  return [isDismissed, dismiss] as const;
}
