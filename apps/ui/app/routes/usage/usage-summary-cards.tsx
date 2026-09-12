import { Bot, Coins, Lock, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party usage surface owns the direct billing client contract
import { formatCreditAtoms, formatCreditAtomsDisplay } from '@taucad/billing';
import type { WireBalanceExplanation, WireUsageSnapshot } from '@taucad/billing';

type UsageSummaryCardsProps = {
  readonly snapshot: WireUsageSnapshot;
  /** Undefined while the authoritative balance is unavailable — never rendered as zero. */
  readonly balance: WireBalanceExplanation | undefined;
};

/** One labelled balance category; zero categories stay hidden to keep the card readable. */
function BalanceLine({ label, atoms }: { readonly label: string; readonly atoms: string }): React.JSX.Element {
  return (
    <span>
      {label}: {formatCreditAtomsDisplay(BigInt(atoms))}
    </span>
  );
}

/**
 * Credits-first range summary. Every figure comes from the server snapshot or
 * the authoritative balance; nothing is aggregated from local chats.
 */
export function UsageSummaryCards({ snapshot, balance }: UsageSummaryCardsProps): React.JSX.Element {
  const { totals } = snapshot;
  const models = snapshot.models?.items ?? [];
  const categories = balance?.balance;

  const reserved =
    categories === undefined || categories === null
      ? undefined
      : BigInt(categories.promoHeldCreditAtoms) +
        BigInt(categories.planHeldCreditAtoms) +
        BigInt(categories.purchasedHeldCreditAtoms);

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Credits used</CardTitle>
          <Coins className='size-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          {totals ? (
            <>
              <div className='text-2xl font-bold' data-testid='credits-used'>
                {formatCreditAtomsDisplay(BigInt(totals.netUsedCreditAtoms))} credits
              </div>
              <p className='text-xs text-muted-foreground'>
                Exactly {formatCreditAtoms(BigInt(totals.netUsedCreditAtoms))} credits across {totals.eventCount}{' '}
                {totals.eventCount === '1' ? 'action' : 'actions'}
              </p>
            </>
          ) : (
            <div className='text-sm text-muted-foreground'>Usage unavailable for this range</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Available balance</CardTitle>
          <Wallet className='size-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          {categories ? (
            <>
              <div className='text-2xl font-bold' data-testid='available-balance'>
                {formatCreditAtomsDisplay(BigInt(categories.eligibleAvailableCreditAtoms))} credits
              </div>
              <div className='flex flex-col text-xs text-muted-foreground'>
                <BalanceLine label='Paid plan' atoms={categories.planGrantCreditAtoms} />
                <BalanceLine label='Purchased' atoms={categories.purchasedCreditAtoms} />
                <BalanceLine label='Promotional' atoms={categories.promoGrantCreditAtoms} />
                <BalanceLine label='Pending issuance' atoms={categories.pendingIssuanceCreditAtoms} />
                <BalanceLine label='Debt' atoms={categories.debtCreditAtoms} />
              </div>
            </>
          ) : (
            <div className='text-sm text-muted-foreground'>Balance unavailable</div>
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
            <>
              <div className='text-2xl font-bold tabular-nums' data-testid='reserved-credits'>
                {formatCreditAtomsDisplay(reserved)} credits
              </div>
              {/* ponytail: the total is what the reader needs here — the
               * balance card already breaks the same three sources down. */}
              <p className='text-xs text-muted-foreground'>
                {reserved === 0n
                  ? 'Nothing held for work in flight'
                  : 'Held for work in flight; released when each turn settles'}
              </p>
            </>
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
  );
}
