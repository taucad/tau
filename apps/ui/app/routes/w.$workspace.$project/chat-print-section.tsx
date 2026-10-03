import { useEffect, useState } from 'react';
import { ChevronRight, CircleAlert } from 'lucide-react';
import type { PrintRequester } from '@taucad/runtime/machine';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';

/** Who the pane acts as when it creates or resolves a request. @public */
export const operator: PrintRequester = { kind: 'user', id: 'operator', label: 'You' };

/**
 * A clock that ticks once a second while mounted, for ages and staleness.
 *
 * @returns Milliseconds since the epoch, refreshed every second.
 * @public
 */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);
  return now;
};

/*
 * Rule rhythm: every rule between two Print pane blocks has 12 px of ink on each side. The parent
 * stack's gap-3 sets the space above a rule and the block's own top padding the space below it.
 * The first block of a stack draws no rule.
 */

/**
 * One flat section of the Print pane: a heading row and its content, separated
 * from its peers by a rule rather than a nested card (DESIGN, composition).
 *
 * @param properties - Heading, optional trailing content and the body.
 * @returns The section.
 */
export function PrintSection({
  title,
  aside,
  children,
  className,
  ref,
  ...properties
}: React.ComponentProps<'section'> & {
  readonly title: string;
  readonly aside?: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      ref={ref}
      aria-label={title}
      className={cn(
        'flex min-w-0 flex-col gap-2 border-t border-border/70 pt-3 first:border-t-0 first:pt-0',
        className,
      )}
      {...properties}
    >
      {/* The row keeps the heading's line height; a taller aside overhangs it instead of pushing the rule away. */}
      <div className='flex h-4 min-w-0 items-center gap-2'>
        <h3 className='min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground'>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * A section that starts folded: engineering detail on request.
 *
 * @param properties - Heading, optional summary beside it, an optional control after the trigger,
 * initial state and the body.
 * @returns The disclosure.
 */
export function PrintDisclosure({
  title,
  summary,
  aside,
  isDefaultOpen = false,
  children,
}: {
  readonly title: string;
  readonly summary?: string;
  /** Beside the trigger, never inside it: a reset is a button of its own. */
  readonly aside?: React.ReactNode;
  readonly isDefaultOpen?: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    // The 32 px trigger overhangs its text by 8 px; pt-1 and -mb-2 keep the rule rhythm at 12 px.
    <Collapsible
      defaultOpen={isDefaultOpen}
      className='-mb-2 border-t border-border/70 pt-1 first:border-t-0 first:pt-0'
    >
      <div className='flex min-w-0 items-center gap-1'>
        <CollapsibleTrigger className='group/disclosure flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-accent/50'>
          <ChevronRight
            aria-hidden
            className='size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/disclosure:rotate-90 motion-reduce:transition-none'
          />
          {/* The title keeps its width; a long summary truncates instead. */}
          <span className='shrink-0 text-xs font-medium text-muted-foreground'>{title}</span>
          <span className='min-w-0 flex-1 truncate text-right text-xs text-muted-foreground'>{summary}</span>
        </CollapsibleTrigger>
        {aside}
      </div>
      <CollapsibleContent className='flex flex-col gap-2 pb-2'>{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A label/value pair on one line; values wrap and use tabular numerals.
 *
 * @param properties - The label, the value and an optional trailing badge.
 * @returns The row.
 */
export function PrintRow({
  label,
  children,
  badge,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly badge?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs'>
      <dt className='min-w-24 text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 flex-1 break-words tabular-nums'>{children}</dd>
      {badge}
    </div>
  );
}

/**
 * A recoverable failure or a decision, kept outside any fold (DESIGN, never fold away a decision).
 *
 * @param properties - The tone and the message.
 * @returns The notice.
 */
export function PrintNotice({
  tone,
  children,
  role = 'alert',
}: {
  readonly tone: 'warning' | 'destructive' | 'neutral';
  readonly children: React.ReactNode;
  readonly role?: 'alert' | 'status';
}): React.JSX.Element {
  return (
    <div
      role={role}
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-lg border p-2 text-xs',
        tone === 'warning' && 'border-warning/30 bg-warning/10',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/10',
        tone === 'neutral' && 'border-border/70 bg-muted/30',
      )}
    >
      <CircleAlert
        aria-hidden
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          tone === 'warning' && 'text-warning',
          tone === 'destructive' && 'text-destructive',
          tone === 'neutral' && 'text-muted-foreground',
        )}
      />
      <div className='min-w-0 flex-1 break-words'>{children}</div>
    </div>
  );
}

/**
 * The "Stale" mark a monitor group wears when its observation is older than its budget.
 *
 * @returns The badge.
 */
export function StaleBadge(): React.JSX.Element {
  return (
    <span className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>
      <CircleAlert aria-hidden className='size-3 text-warning' />
      Stale
    </span>
  );
}
