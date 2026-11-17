/**
 * The persistent safe-mode bar (desktop resilient startup blueprint, D0; R12). Shown for the whole page load that
 * started in safe mode, on the web (`?safe=1`) and on desktop, and says why it started. Safe mode is never stored: the
 * next normal start drops the bar.
 */
import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Why this load started in safe mode. `requested`: the person asked for it; `unhealthy-launches`: the watchdog did. */
export type SafeModeReason = 'requested' | 'unhealthy-launches';

const reasonCopy: Record<SafeModeReason, string> = {
  requested: 'You started Tau in safe mode. Only Home is open; other folders are not connected.',
  'unhealthy-launches': 'Tau did not start properly last time, so it started in safe mode. Only Home is open.',
};

/**
 * The safe-mode bar.
 *
 * @param props - Why safe mode started, and an optional action (desktop: the recovery panel).
 * @returns The bar.
 * @public
 */
export function SafeModeBar({
  reason,
  children,
}: {
  readonly reason: SafeModeReason;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      role='status'
      aria-label='Safe mode'
      data-slot='safe-mode-bar'
      className='fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t bg-background/95 px-4 py-2 text-sm backdrop-blur'
    >
      <ShieldAlert aria-hidden className='size-4 shrink-0 text-feature' />
      <span className='font-medium'>Safe mode</span>
      <span className='text-muted-foreground'>{reasonCopy[reason]}</span>
      {children ?? (
        /* A document load without the parameter is a normal start. */
        <a href='/' className='underline underline-offset-2'>
          Restart normally
        </a>
      )}
    </div>
  );
}
