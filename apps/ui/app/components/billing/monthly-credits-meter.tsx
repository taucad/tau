import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { formatCredits } from '#utils/credits.utils.js';
import type { ReactNode } from 'react';
import { formatCreditAtomsDisplay } from '@taucad/billing';
import type { MonthlyCredits } from '@taucad/billing';
import { Progress } from '@taucad/ui/components/progress';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';

/** What the meter can show: a settled balance, a first read, or a failed read. */
export type MonthlyCreditsMeterState =
  | { readonly status: 'ready'; readonly monthly: MonthlyCredits }
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' };

/** Below this share of the scale the menu offers a top-up action. */
const lowFraction = 0.1;

type MonthlyCreditsMeterProps = {
  readonly state: MonthlyCreditsMeterState;
  readonly purchasedCreditAtoms?: bigint;
  readonly purchasedHeldCreditAtoms?: bigint;
  readonly monthlyHeldCreditAtoms?: bigint;
  readonly isInMenu?: boolean;
  readonly className?: string;
  /**
   * The way to buy more credits, shown under the bar only while monthly
   * credits are low or gone. The host supplies it so it can be a menu item.
   */
  readonly addCredits?: ReactNode;
};

/**
 * Monthly allowance as a percentage, with an optional separate purchased balance.
 */
export function MonthlyCreditsMeter({
  state,
  addCredits,
  purchasedCreditAtoms,
  purchasedHeldCreditAtoms = 0n,
  monthlyHeldCreditAtoms = 0n,
  isInMenu = false,
  className,
}: MonthlyCreditsMeterProps): React.JSX.Element {
  const labelId = useId();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const monthly = state.status === 'ready' ? state.monthly : undefined;
  // Covers "gone" too: no credits left reads as fraction 0.
  const isLow = monthly !== undefined && monthly.scaleCreditAtoms > 0n && monthly.fraction < lowFraction;
  const percentage =
    monthly === undefined || monthly.scaleCreditAtoms <= 0n
      ? 0
      : Math.max(0, Math.min(100, Number((monthly.availableCreditAtoms * 100n) / monthly.scaleCreditAtoms)));
  const available =
    monthly !== undefined && monthly.availableCreditAtoms > 0n && percentage === 0 ? '<1' : String(percentage);

  const infoTrigger = (
    <Button
      variant='ghost'
      size='icon-xs'
      aria-label='About monthly credits'
      className='shrink-0 text-muted-foreground'
      onPointerDown={(event) => {
        event.preventDefault();
      }}
      onClick={(event) => {
        event.preventDefault();
        setIsInfoOpen(true);
      }}
    >
      <Info />
    </Button>
  );

  return (
    <div data-slot='monthly-credits' className={cn('flex flex-col gap-2 px-2 py-2 text-xs', className)}>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center'>
          <span id={labelId} className='text-muted-foreground'>
            Monthly credits
          </span>
          <Tooltip open={isInfoOpen} onOpenChange={setIsInfoOpen}>
            <TooltipTrigger asChild>
              {isInMenu ? (
                <DropdownMenuItem
                  asChild
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  {infoTrigger}
                </DropdownMenuItem>
              ) : (
                infoTrigger
              )}
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-64 space-y-1 p-3 text-left'>
              {monthly ? (
                <>
                  <p className='font-medium'>{formatCredits(monthly.availableCreditAtoms)} available this month</p>
                  <p>
                    {monthly.scaleCreditAtoms > 0n
                      ? `Your plan includes ${formatCredits(monthly.scaleCreditAtoms)} per month.`
                      : 'Your monthly allowance is set by your contract.'}
                  </p>
                  {monthlyHeldCreditAtoms > 0n ? (
                    <p>{formatCredits(monthlyHeldCreditAtoms)} reserved for active work.</p>
                  ) : undefined}
                  {monthly.scaleCreditAtoms > 0n && monthly.availableCreditAtoms > monthly.scaleCreditAtoms ? (
                    <p>Includes credits carried over. The bar is capped at 100%.</p>
                  ) : undefined}
                  <p>Used before purchased credits.</p>
                </>
              ) : (
                <p>
                  {state.status === 'loading'
                    ? 'Loading monthly credits…'
                    : 'Monthly credits are unavailable. Try again in Billing.'}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
        {state.status === 'loading' ? (
          <Skeleton className='h-3 w-12' />
        ) : state.status === 'unavailable' ? (
          <span className='text-muted-foreground'>Unavailable</span>
        ) : (
          <span className='text-right font-medium tabular-nums'>
            {monthly?.scaleCreditAtoms === 0n ? 'Custom allowance' : `${available}% left`}
          </span>
        )}
      </div>
      {state.status === 'unavailable' || monthly?.scaleCreditAtoms === 0n ? undefined : (
        <Progress
          aria-labelledby={labelId}
          aria-busy={state.status === 'loading' ? true : undefined}
          aria-valuetext={monthly === undefined ? 'Loading' : `${available}% of monthly credits left`}
          value={monthly === undefined ? 0 : Math.max(0, Math.min(100, monthly.fraction * 100))}
          className={cn('h-1.5 bg-muted-foreground/20 [&>[data-slot=progress-indicator]]:bg-foreground')}
        />
      )}
      {purchasedCreditAtoms === undefined ? undefined : (
        <div className='mt-1 flex items-baseline justify-between gap-2'>
          <span className='text-muted-foreground'>Purchased credits</span>
          <span className='font-medium tabular-nums'>{formatCreditAtomsDisplay(purchasedCreditAtoms)}</span>
        </div>
      )}
      {purchasedCreditAtoms !== undefined && purchasedHeldCreditAtoms > 0n ? (
        <p className='text-muted-foreground'>{formatCredits(purchasedHeldCreditAtoms)} reserved for active work</p>
      ) : undefined}
      {isLow ? addCredits : undefined}
    </div>
  );
}
