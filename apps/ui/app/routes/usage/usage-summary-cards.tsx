import { Bot, Coins, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { monthlyCreditsFromBalance } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import type { WireBalanceExplanation, WireUsageSnapshot } from '@taucad/billing';
import { MonthlyCreditsMeter } from '#components/billing/monthly-credits-meter.js';
import { formatCredits } from '#utils/credits.utils.js';

type UsageSummaryCardsProps = {
  readonly snapshot: WireUsageSnapshot;
  /** Undefined while the authoritative balance is unavailable — never rendered as zero. */
  readonly balance: WireBalanceExplanation | undefined;
};

/** Source-labelled amounts, kept separate from monthly and purchased availability. */
function BalanceLine({ label, atoms }: { readonly label: string; readonly atoms: string }): React.JSX.Element {
  return (
    <span>
      {label}: {formatCredits(BigInt(atoms))}
    </span>
  );
}

/** Current source balances and the selected range's server-authoritative usage. */
export function UsageSummaryCards({ snapshot, balance }: UsageSummaryCardsProps): React.JSX.Element {
  const { tier, isResolved } = useEntitlements();
  const { totals } = snapshot;
  const models = snapshot.models?.items ?? [];
  const categories = balance?.balance;
  const monthly = categories && isResolved ? monthlyCreditsFromBalance(categories, tier) : undefined;
  const purchased = categories
    ? BigInt(categories.debtCreditAtoms) > 0n
      ? 0n
      : BigInt(categories.purchasedCreditAtoms) - BigInt(categories.purchasedHeldCreditAtoms)
    : undefined;
  const reserved = categories
    ? BigInt(categories.planHeldCreditAtoms) +
      BigInt(categories.purchasedHeldCreditAtoms) +
      BigInt(categories.promoHeldCreditAtoms)
    : undefined;

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 md:grid-cols-2'>
        {monthly !== undefined || !isResolved || tier !== 'free' ? (
          <Card>
            <CardHeader>
              <CardTitle className='text-sm font-medium'>Plan limits</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyCreditsMeter
                className='p-0 text-sm'
                monthlyHeldCreditAtoms={BigInt(categories?.planHeldCreditAtoms ?? '0')}
                state={monthly ? { status: 'ready', monthly } : { status: isResolved ? 'unavailable' : 'loading' }}
              />
            </CardContent>
          </Card>
        ) : undefined}
        <Card>
          <CardHeader>
            <CardTitle className='text-sm font-medium'>Purchased credits</CardTitle>
          </CardHeader>
          <CardContent>
            {purchased === undefined ? (
              <p className='text-sm text-muted-foreground'>Balance unavailable</p>
            ) : (
              <>
                <div className='text-2xl font-bold tabular-nums' data-testid='purchased-balance'>
                  {formatCredits(purchased)} available
                </div>
                <p className='text-xs text-muted-foreground'>Used after monthly credits · Never expire</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {categories ? (
        <div className='flex flex-col gap-1 text-xs text-muted-foreground'>
          {BigInt(categories.promoGrantCreditAtoms) > 0n ? (
            <BalanceLine
              label='Promotional credits available'
              atoms={(BigInt(categories.debtCreditAtoms) > 0n
                ? 0n
                : BigInt(categories.promoGrantCreditAtoms) - BigInt(categories.promoHeldCreditAtoms)
              ).toString()}
            />
          ) : undefined}
          {BigInt(categories.pendingIssuanceCreditAtoms) > 0n ? (
            <BalanceLine label='Pending issuance' atoms={categories.pendingIssuanceCreditAtoms} />
          ) : undefined}
          {BigInt(categories.debtCreditAtoms) > 0n ? (
            <BalanceLine label='Outstanding credits' atoms={categories.debtCreditAtoms} />
          ) : undefined}
        </div>
      ) : undefined}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Credits used</CardTitle>
            <Coins className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {totals ? (
              <>
                <div className='text-2xl font-bold' data-testid='credits-used'>
                  {formatCredits(BigInt(totals.netUsedCreditAtoms))} used
                </div>
                <p className='text-xs text-muted-foreground'>
                  Across {totals.eventCount} {totals.eventCount === '1' ? 'action' : 'actions'} in the selected range
                </p>
              </>
            ) : (
              <div className='text-sm text-muted-foreground'>Usage unavailable for this range</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Reserved</CardTitle>
            <Lock className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {categories && reserved !== undefined ? (
              <div className='flex flex-col gap-1 text-sm tabular-nums' data-testid='reserved-credits'>
                <BalanceLine label='Monthly credits' atoms={categories.planHeldCreditAtoms} />
                <BalanceLine label='Purchased credits' atoms={categories.purchasedHeldCreditAtoms} />
                {BigInt(categories.promoHeldCreditAtoms) > 0n ? (
                  <BalanceLine label='Promotional credits' atoms={categories.promoHeldCreditAtoms} />
                ) : undefined}
                <p className='mt-1 text-xs text-muted-foreground'>
                  {reserved === 0n
                    ? 'Nothing held for work in flight'
                    : 'Held for work in flight; released when each turn settles'}
                </p>
              </div>
            ) : (
              <div className='text-sm text-muted-foreground'>Balance unavailable</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Models used</CardTitle>
            <Bot className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{models.length}</div>
            <p className='text-xs text-muted-foreground'>
              {snapshot.models?.complete === false ? 'First page of this range' : 'In the selected range'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
