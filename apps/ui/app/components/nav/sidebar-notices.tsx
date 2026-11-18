import { useCallback, useId, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import { ArrowUpRight, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';

/**
 * The one place the sidebar shows notices: the band between the navigation and the account
 * footer. Each child is a self-gating notice that renders nothing while it has nothing to say,
 * and the band collapses when every child is quiet. Children stack in the order given, so
 * the most persistent notice goes first and the most urgent (an update) sits last, nearest the
 * footer, where it has always been.
 *
 * A new notice is a component that gates itself and renders a {@link SidebarNoticeCard} (or,
 * for a status control such as the update row, its own sidebar row); it is added here, not
 * placed beside the footer on its own.
 */
export function SidebarNotices({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div data-slot='sidebar-notices' className='flex flex-col gap-1 p-1 empty:hidden'>
      {children}
    </div>
  );
}

export type SidebarNoticeAction = {
  readonly label: string;
  readonly href: string;
  /** Opens in a new tab, so the workspace stays open. */
  readonly opensInNewTab?: boolean;
  readonly onClick?: () => void;
};

/**
 * The promotional card shape: an icon tile, a title, an optional line of detail, one action and
 * a dismiss button. Status notices with their own popover (the update row) keep their row
 * shape instead.
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
    <section
      aria-labelledby={titleId}
      className='relative flex items-stretch gap-3 rounded-lg border border-sidebar-border bg-background p-(--notice-inset) text-sidebar-foreground [--notice-inset:0.25rem]'
    >
      {/* Full height, its corners concentric with the card's: the card's radius less its border and inset. */}
      <div
        aria-hidden
        className='flex w-12 shrink-0 items-center justify-center rounded-[calc(var(--radius-lg)-var(--notice-inset)-1px)] bg-sidebar-accent text-foreground [&_svg]:size-5'
      >
        {icon}
      </div>
      <div className='flex min-w-0 flex-1 flex-col items-start gap-1.5 py-1'>
        <div className='min-w-0 pr-5'>
          <p id={titleId} className='text-sm leading-5 font-medium'>
            {title}
          </p>
          {detail ? <p className='text-xs leading-4 text-muted-foreground'>{detail}</p> : undefined}
        </div>
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
      </div>
      <Button
        variant='ghost'
        size='icon-xs'
        /* Centred on the title line, and in one column with the update row's chevron below: the row's 1px border and
           6px padding put its 16px chevron's centre 15px in, so this 24px button sits 2px inside the border. */
        className='absolute top-1.5 right-0.5 text-muted-foreground'
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        <X />
      </Button>
    </section>
  );
}

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
    sessionDismissals.add(id);
    try {
      globalThis.localStorage.setItem(dismissalKey(id), new Date().toISOString());
    } catch {
      // Persistence is best-effort; the notice still hides for this page.
    }
    dismissalTopic.emit();
  }, [id]);
  return [isDismissed, dismiss] as const;
}
