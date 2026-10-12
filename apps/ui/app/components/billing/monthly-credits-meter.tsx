import { useId } from 'react';
import { creditAtomsPerCredit } from '@taucad/billing';
import type { MonthlyCredits } from '@taucad/billing';
import { Progress } from '@taucad/ui/components/progress';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';

/** What the meter can show: a settled balance, a first read, or a failed read. */
export type MonthlyCreditsMeterState =
  | { readonly status: 'ready'; readonly monthly: MonthlyCredits }
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' };

/** Below this share of the scale the bar takes the warning colour. */
const lowFraction = 0.1;

/** Whole credits, rounded down so the meter never promises a credit that is not there. */
const formatWholeCredits = (atoms: bigint): string => {
  const whole = atoms / creditAtomsPerCredit;
  return whole === 0n && atoms > 0n ? '<1' : whole.toLocaleString();
};

/**
 * Monthly credits left, as a labelled bar. Purchased credits are deliberately
 * absent: they never expire and are reported only in Billing.
 */
export function MonthlyCreditsMeter({ state }: { readonly state: MonthlyCreditsMeterState }): React.JSX.Element {
  const labelId = useId();
  const monthly = state.status === 'ready' ? state.monthly : undefined;
  const isLow = monthly !== undefined && monthly.fraction < lowFraction;
  const available = monthly === undefined ? undefined : formatWholeCredits(monthly.availableCreditAtoms);

  return (
    <div data-slot='monthly-credits' className='flex flex-col gap-1.5 px-2 py-1.5 text-xs'>
      <div className='flex items-baseline justify-between gap-2'>
        <span id={labelId} className='text-muted-foreground'>
          Monthly credits
        </span>
        {state.status === 'loading' ? (
          <Skeleton className='h-3 w-12' />
        ) : state.status === 'unavailable' ? (
          <span className='text-muted-foreground'>Unavailable</span>
        ) : (
          <span className={cn('font-medium tabular-nums', isLow && 'text-warning')}>{available} left</span>
        )}
      </div>
      {state.status === 'unavailable' ? undefined : (
        <Progress
          aria-labelledby={labelId}
          aria-busy={state.status === 'loading' ? true : undefined}
          aria-valuetext={
            monthly === undefined
              ? 'Loading'
              : `${available ?? ''} of ${formatWholeCredits(monthly.scaleCreditAtoms)} monthly credits left`
          }
          value={monthly === undefined ? 0 : Math.round(monthly.fraction * 100)}
          className={cn('h-1.5', isLow && '[&>[data-slot=progress-indicator]]:bg-warning')}
        />
      )}
    </div>
  );
}
