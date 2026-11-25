import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader } from '@taucad/ui/components/loader';
import { ChevronRight, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

/** What a row learns from the activity group it sits in. */
export type ActivityRow = {
  /** The group's only row: it stands as the group's own line, outside any container. */
  readonly isSole: boolean;
  /** The turn has ended, so a row left running draws no motion. */
  readonly isSettled: boolean;
  /** Registers one open row with the group; the returned function releases it. */
  readonly holdOpen: () => () => void;
};

const ActivityRowContext = createContext<ActivityRow | undefined>(undefined);

/**
 * The activity group around a row, when there is one.
 *
 * @returns The group's facts, or `undefined` for a row that stands outside every group.
 */
export const useActivityRow = (): ActivityRow | undefined => use(ActivityRowContext);

/**
 * Tells the surrounding activity group that this row's disclosure is open, so a reader who opened the only row keeps
 * it in view when the group gains a second row and a header.
 *
 * @param isOpen - Whether the row's own disclosure is open.
 * @returns The group's facts, or `undefined` for a row that stands outside every group.
 */
export const useActivityRowDisclosure = (isOpen: boolean): ActivityRow | undefined => {
  const row = use(ActivityRowContext);
  const holdOpen = row?.holdOpen;
  useEffect(() => (isOpen ? holdOpen?.() : undefined), [isOpen, holdOpen]);
  return row;
};

/**
 * Detaches descendants from the surrounding activity group: a disclosure nested inside a row's detail is not a row.
 *
 * @param properties - The detail to detach.
 * @returns The detail, outside the group's row context.
 */
export function ActivityRowBoundary({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <ActivityRowContext value={undefined}>{children}</ActivityRowContext>;
}

/** The surface an opened activity line reveals: the group's rows, or a lone row's detail. */
export const activityContainerClassName = 'mt-0.5 mb-1.5 overflow-hidden rounded-lg border bg-background';

/** The shared disclosure chevron: always visible, because a touch screen has no hover to reveal it. */
export const activityChevronClassName =
  'size-3 shrink-0 opacity-60 transition-[opacity,transform] duration-200 group-hover/chat-tool-trigger:opacity-100 group-focus-visible/chat-tool-trigger:opacity-100 motion-reduce:transition-none';

type ChatActivityGroupProps = {
  readonly summary: string;
  /** The rows, each wrapped in a {@link ChatActivityRow}. */
  readonly children: React.ReactNode;
  readonly icon?: LucideIcon;
  /** A row inside is still running; a collapsed header shows that instead of its family icon. */
  readonly hasActiveRows?: boolean;
  /** The group holds exactly one row, which then stands as the group's line and names itself. */
  readonly isSole?: boolean;
  /** The turn has ended; rows left running draw no motion. */
  readonly isSettled?: boolean;
  /** The group's root, for a host that points at this group (the product tour). */
  readonly anchorRef?: React.Ref<HTMLDivElement>;
  /** Called when the person opens the group, or its only row. */
  readonly onOpen?: () => void;
};

/**
 * One muted line over a chronological group of activity rows.
 *
 * The line never opens itself: running, failed, finished and reloaded groups all rest closed, so a turn keeps its
 * height while tools arrive. Opening it reveals one bordered container with a row per item.
 *
 * @param properties - The summary, rows and live state of the group.
 * @returns The group's line and, once the person opens it, its rows.
 */
export function ChatActivityGroup({
  summary,
  children,
  icon: Icon = Wrench,
  hasActiveRows = false,
  isSole = false,
  isSettled = false,
  anchorRef,
  onOpen,
}: ChatActivityGroupProps): React.JSX.Element {
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const [openRows, setOpenRows] = useState(0);
  const [wasSole, setWasSole] = useState(isSole);
  if (wasSole !== isSole) {
    setWasSole(isSole);
    /* A reader inside the only row keeps it: the group that forms around it starts open. */
    if (wasSole && openRows > 0 && userOpen === undefined) {
      setUserOpen(true);
    }
  }
  const isOpen = userOpen ?? false;
  const isBusy = hasActiveRows && !isOpen;
  const hasOpenSoleRow = isSole && openRows > 0;

  useEffect(() => {
    if (hasOpenSoleRow) {
      onOpen?.();
    }
  }, [hasOpenSoleRow, onOpen]);

  const holdOpen = useCallback(() => {
    setOpenRows((count) => count + 1);
    return () => {
      setOpenRows((count) => count - 1);
    };
  }, []);
  const row = useMemo<ActivityRow>(() => ({ isSole, isSettled, holdOpen }), [isSole, isSettled, holdOpen]);

  return (
    <ActivityRowContext value={row}>
      <Collapsible
        ref={anchorRef}
        open={isSole || isOpen}
        data-slot='activity-group'
        onOpenChange={(isNowOpen) => {
          setUserOpen(isNowOpen);
          if (isNowOpen) {
            onOpen?.();
          }
        }}
      >
        {isSole ? undefined : (
          <CollapsibleTrigger asChild>
            <Button
              variant='ghost'
              size='xs'
              aria-busy={isBusy || undefined}
              className='group/chat-tool-trigger -ml-2 flex w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden font-normal text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent pointer-coarse:min-h-8'
            >
              {isBusy ? (
                <Loader data-slot='activity-group-spinner' className='size-3 shrink-0' />
              ) : (
                <Icon aria-hidden='true' className='size-3 shrink-0' />
              )}
              <span className='min-w-0 truncate'>{summary}</span>
              <ChevronRight
                aria-hidden='true'
                className={cn(activityChevronClassName, 'group-data-[state=open]/chat-tool-trigger:rotate-90')}
              />
            </Button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <div
            role={isSole ? undefined : 'region'}
            aria-label={isSole ? undefined : `${summary} details`}
            data-slot='activity-rows'
            className={cn(
              'flex min-w-0 flex-col',
              !isSole && activityContainerClassName,
              !isSole && '[&>:not(:empty)~:not(:empty)]:border-t',
            )}
          >
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </ActivityRowContext>
  );
}

/**
 * One item of an activity group. Inside the container it is a padded cell; as the group's only row it is the line.
 *
 * @param properties - The row's own line and detail.
 * @returns The row.
 */
export function ChatActivityRow({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const row = use(ActivityRowContext);
  return (
    <div data-slot='activity-row' className={cn('min-w-0', row?.isSole === false && 'px-2.5 py-0.5 empty:hidden')}>
      {children}
    </div>
  );
}
