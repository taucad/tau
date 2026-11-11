import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { cn } from '@taucad/ui/utils/cn';

/*
 * The shared pieces of every billing surface. A badge, a notice, a summary
 * row or an icon beside text is defined here once, so a change to how billing
 * looks or reads is made in one place.
 */

/** Tau's billing support mailbox, shown as text so it works without a desktop mail app. */
export const supportEmail = 'help@tau.new';

/**
 * Puts an icon on the centre line of the first line of the text beside it,
 * whatever the text wraps to. The box is one line tall (`1lh`) and centres
 * the icon inside it, so the pair stays aligned at any font size.
 */
export function FirstLineIcon({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <span data-slot='first-line-icon' className={cn('flex h-lh shrink-0 items-center', className)}>
      {children}
    </span>
  );
}

/** An icon and the text it belongs to, with the icon aligned to the text's first line. */
export function IconLine({
  icon,
  children,
  className,
}: {
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <span data-slot='icon-line' className={cn('flex items-start gap-2', className)}>
      <FirstLineIcon>{icon}</FirstLineIcon>
      <span className='min-w-0'>{children}</span>
    </span>
  );
}

type BillingStatusTone = 'neutral' | 'positive' | 'warning';

/**
 * A billing state as a badge: "On", "Paused", "Canceled", "Payment failed".
 * It uses the design system's badge variants as they are. A warning adds the
 * warning glyph instead of a tinted border, so every badge keeps one outline.
 */
export function BillingStatusBadge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: BillingStatusTone;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <Badge data-tone={tone} variant={tone === 'positive' ? 'secondary' : 'outline'}>
      {tone === 'warning' ? <TriangleAlert aria-hidden='true' className='text-warning' /> : undefined}
      {children}
    </Badge>
  );
}

/**
 * A notice at the top of a billing surface: one or two plain sentences and,
 * when there is something to do about it, the button that does it.
 */
export function BillingNotice({
  tone = 'info',
  role,
  action,
  children,
  className,
}: {
  readonly tone?: 'info' | 'warning';
  readonly role?: 'alert' | 'status';
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div
      role={role}
      data-slot='billing-notice'
      data-tone={tone}
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border bg-card px-3 py-2 text-sm',
        tone === 'warning' && 'border-warning',
        className,
      )}
    >
      <IconLine
        className='min-w-48 flex-1'
        icon={
          tone === 'warning' ? (
            <TriangleAlert aria-hidden='true' className='size-4 text-warning' />
          ) : (
            <Info aria-hidden='true' className='size-4 text-muted-foreground' />
          )
        }
      >
        {children}
      </IconLine>
      {action === undefined ? undefined : <div className='flex shrink-0 items-center gap-2'>{action}</div>}
    </div>
  );
}

/** An inline problem under the control that caused it: what happened, then what to do. */
export function BillingInlineError({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <p role='alert' data-slot='billing-inline-error' className={cn('text-xs text-warning', className)}>
      <IconLine icon={<CircleAlert aria-hidden='true' className='size-3.5' />}>{children}</IconLine>
    </p>
  );
}

/** The bordered list of label and value rows used for purchase summaries and reload limits. */
export function SummaryList({ children, className, ...properties }: React.ComponentProps<'dl'>): React.JSX.Element {
  return (
    <dl
      data-slot='summary-list'
      className={cn('flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-sm', className)}
      {...properties}
    >
      {children}
    </dl>
  );
}

/** One row of a {@link SummaryList}. `emphasis='total'` draws the rule above the total. */
export function SummaryRow({
  label,
  emphasis = 'default',
  children,
}: {
  readonly label: ReactNode;
  readonly emphasis?: 'default' | 'muted' | 'total';
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot='summary-row'
      className={cn(
        'flex items-center justify-between gap-4',
        emphasis === 'muted' && 'text-muted-foreground',
        emphasis === 'total' && 'border-t pt-1.5 font-medium',
      )}
    >
      <dt>{label}</dt>
      <dd className='text-right tabular-nums'>{children}</dd>
    </div>
  );
}

/** A long date as billing prints it everywhere: `December 8, 2026`. */
export const formatBillingDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
