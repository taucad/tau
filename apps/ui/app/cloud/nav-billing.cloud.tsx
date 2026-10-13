import { ChartColumn, CreditCard, Plus, Sparkles } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { buttonVariants } from '@taucad/ui/components/button';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { formatCreditAtomsDisplay, monthlyCreditsFromBalance } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { MonthlyCreditsMeter } from '#components/billing/monthly-credits-meter.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { formatCredits } from '#utils/credits.utils.js';
import { ProBadge } from '#components/tier-badge.js';
import type { NavRoute } from '#constants/route.constants.js';

export const billingNavRoutes: NavRoute[] = [
  {
    title: 'Usage',
    url: '/usage',
    icon: ChartColumn,
  },
];

export function NavBillingItem(): React.JSX.Element {
  const { tier, isResolved } = useEntitlements();
  const { open: openSettings } = useSettingsDialog();
  // Until the plan is known, show the neutral Billing entry so a Pro customer is never asked to upgrade.
  return isResolved && tier === 'free' ? (
    <DropdownMenuItem
      onSelect={() => {
        openSettings('billing');
      }}
    >
      <Sparkles />
      Upgrade to Pro
      <ProBadge className='ml-auto' />
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem
      onSelect={() => {
        openSettings('billing');
      }}
    >
      <CreditCard />
      Billing
    </DropdownMenuItem>
  );
}

/**
 * Opens Billing on its credit balance, where Add credits lives. A menu item, so
 * it takes part in the menu's keyboard navigation, drawn as a button.
 */
function AddCreditsItem(): React.JSX.Element {
  const { open: openSettings } = useSettingsDialog();
  return (
    <DropdownMenuItem
      className={cn(buttonVariants({ variant: 'outline', size: 'xs' }), 'mt-1 w-full')}
      onSelect={() => {
        openSettings('billing', 'credit-balance');
      }}
    >
      <Plus />
      Add credits
    </DropdownMenuItem>
  );
}

/**
 * Monthly credits meter for the top of the account menu. Shown once the plan is
 * known, with purchased credits reported separately from the monthly allowance.
 * When monthly credits run low it offers Add credits under the bar.
 */
export function NavCreditsMeter(): React.JSX.Element | undefined {
  const { tier, isResolved } = useEntitlements();
  const credits = useCredits();
  const isBalanceLoading = useIsFetching({ queryKey: ['billing', 'credits'] }) > 0;
  if (!isResolved) {
    return undefined;
  }
  if (credits?.balance) {
    const monthly = monthlyCreditsFromBalance(credits.balance, tier);
    const purchased =
      BigInt(credits.balance.debtCreditAtoms) > 0n
        ? 0n
        : BigInt(credits.balance.purchasedCreditAtoms) - BigInt(credits.balance.purchasedHeldCreditAtoms);
    const availablePurchased = purchased > 0n ? purchased : 0n;
    if (monthly === undefined && BigInt(credits.balance.purchasedCreditAtoms) === 0n) {
      return undefined;
    }
    return monthly === undefined ? (
      <div className='flex flex-col gap-2 px-2 py-2 text-xs'>
        <div className='flex items-baseline justify-between gap-2'>
          <span className='text-muted-foreground'>Purchased credits</span>
          <span className='font-medium tabular-nums'>{formatCreditAtomsDisplay(availablePurchased)}</span>
        </div>
        {BigInt(credits.balance.purchasedHeldCreditAtoms) > 0n ? (
          <p className='text-muted-foreground'>
            {formatCredits(BigInt(credits.balance.purchasedHeldCreditAtoms))} reserved for active work
          </p>
        ) : undefined}
      </div>
    ) : (
      <MonthlyCreditsMeter
        state={{ status: 'ready', monthly }}
        purchasedCreditAtoms={BigInt(credits.balance.purchasedCreditAtoms) > 0n ? availablePurchased : undefined}
        purchasedHeldCreditAtoms={BigInt(credits.balance.purchasedHeldCreditAtoms)}
        monthlyHeldCreditAtoms={BigInt(credits.balance.planHeldCreditAtoms)}
        isInMenu
        addCredits={<AddCreditsItem />}
      />
    );
  }
  // Free accounts have no plan grant, so an unknown balance shows nothing rather than a placeholder.
  if (tier === 'free') {
    return undefined;
  }
  return (
    <MonthlyCreditsMeter
      isInMenu
      state={{
        status: credits === undefined && isBalanceLoading ? 'loading' : 'unavailable',
      }}
    />
  );
}
