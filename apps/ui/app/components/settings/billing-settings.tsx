import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, LoaderCircle, Plus } from 'lucide-react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party settings surface owns the direct billing client contract
import {
  formatCreditAtomsDisplay,
  formatMonthlyPrice,
  monthlyCreditsFromBalance,
  tauPlanCatalog,
} from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { createPaymentRequestId, createPortalAction, followPaymentRedirect } from '#lib/billing-payment-client.js';
import { formatCredits } from '@taucad/ui-core/utils/credits.utils';
import { Button } from '@taucad/ui/components/button';
import { CardContent } from '@taucad/ui/components/card';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { PaymentMethod } from '@taucad/ui-kit/components/payment-method';
import {
  BillingInlineError,
  BillingNotice,
  BillingStatusBadge,
  formatBillingDate,
} from '#components/billing/billing-primitives.js';
import { MonthlyCreditsMeter } from '#components/billing/monthly-credits-meter.js';
import { TopupModal } from '#components/billing/topup-modal.js';
import { PlanCards } from '#components/billing/plan-cards.js';
import { AutoReloadSettings } from '#components/billing/auto-reload-settings.js';
import { CancelPlanSettings } from '#components/billing/cancel-plan-settings.js';
import { useBillingBinding } from '#components/billing/use-billing-binding.js';

const proPlan = tauPlanCatalog.find((entry) => entry.id === 'pro');
const proMonthlyPriceLabel = formatMonthlyPrice(proPlan?.priceLabel ?? '');
const enterpriseEmail = 'enterprise@tau.new';
/** One message for every way the subscription page can fail to open: the customer's next step is the same. */
const portalNotOpenedMessage = 'Couldn’t open the subscription page. Try again.';
const usedBeforePurchased = 'Monthly credits are used before purchased credits.';
const tierName = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' } as const;

/** A balance as a heading: `1,200 credits`, or `Less than 1 credit` for a remainder too small to show. */
const formatBalance = (atoms: bigint): string =>
  formatCreditAtomsDisplay(atoms) === '<1' ? 'Less than 1 credit' : formatCredits(atoms);

/** Credits on hold, as the sentence every billing surface uses for them. */
const formatHeld = (atoms: bigint): string =>
  `${formatCreditAtomsDisplay(atoms)} more are on hold for work in progress.`;

/** Billing overview: the plan, monthly credits, purchased credits, auto-reload and cancellation. */
export function BillingSettings(): React.JSX.Element {
  const entitlements = useEntitlements();
  const credits = useCredits();
  const availableBalance = credits?.balance ?? undefined;
  const queryClient = useQueryClient();
  const isBalanceLoading = useIsFetching({ queryKey: ['billing', 'credits'] }) > 0;
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const binding = useBillingBinding();
  const generation = `${apiBaseUrl ?? ''}|${environment ?? ''}|${userId ?? ''}`;
  /* oxlint-disable react/refs -- monotonic generation refs synchronously fence stale owner and API responses */
  const scopeRef = useRef({ key: generation, value: 0 });
  if (scopeRef.current.key !== generation) {
    scopeRef.current = { key: generation, value: scopeRef.current.value + 1 };
  }
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [portalError, setPortalError] = useState<string>();
  const stateGenerationRef = useRef(scopeRef.current.value);
  const stateIsCurrent = stateGenerationRef.current === scopeRef.current.value;
  /* oxlint-enable react/refs */
  const [isTopupOpen, setIsTopupOpen] = useState(false);

  const openPortal = async (): Promise<void> => {
    if (binding === undefined) {
      setPortalError(portalNotOpenedMessage);
      return;
    }
    setIsRedirecting(true);
    stateGenerationRef.current = scopeRef.current.value;
    const startedGeneration = scopeRef.current.value;
    setPortalError(undefined);
    try {
      const action = await createPortalAction(binding, {
        requestId: createPaymentRequestId(),
        returnPath: `${globalThis.location.pathname}${globalThis.location.search}`,
      });
      if (scopeRef.current.value !== startedGeneration) {
        return;
      }
      followPaymentRedirect(action);
      if (action.state !== 'redirect_required') {
        setPortalError(portalNotOpenedMessage);
      }
    } catch {
      if (scopeRef.current.value === startedGeneration) {
        setPortalError(portalNotOpenedMessage);
      }
    } finally {
      if (scopeRef.current.value === startedGeneration) {
        setIsRedirecting(false);
      }
    }
  };

  const isPaidTier = entitlements.isResolved && entitlements.tier !== 'free';
  const monthly =
    availableBalance && entitlements.isResolved
      ? monthlyCreditsFromBalance(availableBalance, entitlements.tier)
      : undefined;
  const purchased = availableBalance
    ? BigInt(availableBalance.purchasedCreditAtoms) - BigInt(availableBalance.purchasedHeldCreditAtoms)
    : 0n;
  const availablePurchased =
    availableBalance && BigInt(availableBalance.debtCreditAtoms) === 0n && purchased > 0n ? purchased : 0n;

  const hasDebt = availableBalance !== undefined && BigInt(availableBalance.debtCreditAtoms) > 0n;
  const isCanceled = entitlements.cancelAtPeriodEnd && entitlements.paidThrough !== undefined;
  const isPastDue = entitlements.status === 'past_due';
  const isPortalBusy = stateIsCurrent && isRedirecting;
  const planName = entitlements.isResolved ? tierName[entitlements.tier] : undefined;
  /* The line under the plan name: the price, then the one date or state that matters now. */
  const planDetail = [
    entitlements.tier === 'pro' ? proMonthlyPriceLabel : entitlements.tier === 'enterprise' ? 'Custom plan' : undefined,
    isPastDue
      ? 'Payment due'
      : entitlements.paidThrough
        ? `${entitlements.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${formatBillingDate(entitlements.paidThrough)}`
        : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
  const openTopup = (): void => {
    setIsTopupOpen(true);
  };
  const portalButton = (label: string): React.JSX.Element => (
    <Button
      variant='outline'
      size='sm'
      disabled={isPortalBusy}
      onClick={async () => {
        await openPortal();
      }}
    >
      {label}
      <ExternalLink aria-hidden='true' className='size-3' />
    </Button>
  );
  const purchasedHeld = BigInt(availableBalance?.purchasedHeldCreditAtoms ?? '0');
  const promoHeld = BigInt(availableBalance?.promoHeldCreditAtoms ?? '0');

  return (
    <div className='flex flex-col gap-8 pb-4'>
      {isPastDue ? (
        <BillingNotice tone='warning' role='alert' action={portalButton('Update payment method')}>
          We couldn’t charge your card. Update your payment method within 7 days to keep {planName ?? 'your plan'}. Your
          credits aren’t affected.
        </BillingNotice>
      ) : undefined}
      {isCanceled ? (
        <BillingNotice action={portalButton('Resume plan')}>
          Your {planName ?? 'paid'} plan ends on {formatBillingDate(entitlements.paidThrough)}. You can resume it any
          time before then.
        </BillingNotice>
      ) : undefined}
      {hasDebt ? (
        <BillingNotice
          tone='warning'
          role='alert'
          action={
            <Button size='sm' disabled={binding === undefined} onClick={openTopup}>
              Add credits
            </Button>
          }
        >
          You’ve used {formatCredits(BigInt(availableBalance.debtCreditAtoms))} more than you had. Add credits to keep
          using AI. Your projects are safe.
        </BillingNotice>
      ) : undefined}
      {availableBalance && BigInt(availableBalance.pendingIssuanceCreditAtoms) > 0n ? (
        <p role='status' className='flex items-center gap-2 text-sm text-muted-foreground'>
          <LoaderCircle aria-hidden='true' className='size-4 animate-spin motion-reduce:animate-none' />
          Adding {formatCredits(BigInt(availableBalance.pendingIssuanceCreditAtoms))} to your balance…
        </p>
      ) : undefined}
      <SettingsItem settingId='plan'>
        <h2 className='mb-3 text-sm font-medium'>Plan</h2>
        <SettingsSectionCard>
          <CardContent className='flex flex-col gap-3 text-sm'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              {planName === undefined ? (
                <div role='status' aria-busy='true' className='flex flex-col gap-2'>
                  <span className='sr-only'>Loading plan…</span>
                  <Skeleton aria-hidden='true' className='h-3.5 w-18' />
                  <Skeleton aria-hidden='true' className='h-3 w-48' />
                </div>
              ) : (
                <div className='flex flex-col gap-1'>
                  <span className='flex flex-wrap items-center gap-2 font-medium'>
                    Tau {planName}
                    {isPastDue ? (
                      <BillingStatusBadge tone='warning'>Payment failed</BillingStatusBadge>
                    ) : isCanceled ? (
                      <BillingStatusBadge>Canceled</BillingStatusBadge>
                    ) : undefined}
                  </span>
                  {isPaidTier && planDetail ? <span className='text-muted-foreground'>{planDetail}</span> : undefined}
                </div>
              )}
              {isPaidTier ? portalButton('Manage subscription') : undefined}
            </div>
            {stateIsCurrent && portalError ? <BillingInlineError>{portalError}</BillingInlineError> : undefined}
            {entitlements.tier === 'enterprise' ? (
              <span className='text-muted-foreground'>
                To change your plan, email{' '}
                <a href={`mailto:${enterpriseEmail}`} className='text-foreground underline'>
                  {enterpriseEmail}
                </a>
                .
              </span>
            ) : undefined}
            {isPaidTier && entitlements.paymentMethod ? (
              <div className='flex items-center justify-between gap-4 border-t pt-3'>
                <span className='text-muted-foreground'>Payment method</span>
                <PaymentMethod method={entitlements.paymentMethod} />
              </div>
            ) : undefined}
            {entitlements.isResolved && entitlements.tier === 'free' ? (
              // The free state shows the full plan grid: the same component and catalogue as the public pricing page.
              <PlanCards currentTier='free' className='pt-2' isFeatureListScrollable />
            ) : undefined}
          </CardContent>
        </SettingsSectionCard>
      </SettingsItem>

      {monthly !== undefined || (entitlements.isResolved && entitlements.tier !== 'free') ? (
        <SettingsItem settingId='plan-limits'>
          <h2 className='mb-3 text-sm font-medium'>Monthly credits</h2>
          <SettingsSectionCard>
            <CardContent className='flex flex-col gap-3'>
              <MonthlyCreditsMeter
                className='p-0 text-sm'
                monthlyHeldCreditAtoms={BigInt(availableBalance?.planHeldCreditAtoms ?? '0')}
                state={
                  monthly ? { status: 'ready', monthly } : { status: isBalanceLoading ? 'loading' : 'unavailable' }
                }
              />
              {monthly === undefined && isBalanceLoading ? (
                <Skeleton aria-hidden='true' className='h-3 w-3/5' />
              ) : (
                <p className='text-xs text-muted-foreground'>
                  {monthly !== undefined && monthly.scaleCreditAtoms > 0n
                    ? `${formatCreditAtomsDisplay(monthly.availableCreditAtoms)} of ${formatCredits(monthly.scaleCreditAtoms)} left this month. ${usedBeforePurchased}`
                    : usedBeforePurchased}
                </p>
              )}
            </CardContent>
          </SettingsSectionCard>
        </SettingsItem>
      ) : undefined}

      {availableBalance && BigInt(availableBalance.promoGrantCreditAtoms) > 0n ? (
        <div>
          <h2 className='mb-3 text-sm font-medium'>Promotional credits</h2>
          <SettingsSectionCard>
            <CardContent className='flex flex-col gap-1 text-sm'>
              <span className='font-medium tabular-nums'>
                {formatBalance(hasDebt ? 0n : BigInt(availableBalance.promoGrantCreditAtoms) - promoHeld)}
              </span>
              {promoHeld > 0n ? (
                <span className='text-xs text-muted-foreground'>{formatHeld(promoHeld)}</span>
              ) : undefined}
            </CardContent>
          </SettingsSectionCard>
        </div>
      ) : undefined}
      <SettingsItem settingId='credit-balance'>
        <h2 className='mb-3 text-sm font-medium'>Purchased credits</h2>
        <SettingsSectionCard>
          <CardContent className='flex flex-col gap-3 text-sm'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              {availableBalance ? (
                <div className='flex flex-col gap-1'>
                  <span className='font-medium tabular-nums' data-testid='credit-balance'>
                    {formatBalance(availablePurchased)}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {purchasedHeld > 0n ? `${formatHeld(purchasedHeld)} ` : ''}
                    Purchased credits never expire.
                  </span>
                </div>
              ) : isBalanceLoading ? (
                <div role='status' aria-busy='true' className='flex flex-col gap-2'>
                  <span className='sr-only'>Loading balance…</span>
                  <Skeleton aria-hidden='true' className='h-3.5 w-24' />
                  <Skeleton aria-hidden='true' className='h-3 w-40' />
                </div>
              ) : (
                <div role='alert' className='flex flex-col gap-1'>
                  <span className='font-medium'>Couldn’t load your balance</span>
                  <span className='text-xs text-muted-foreground'>
                    Your credits are safe. This is a display problem.
                  </span>
                </div>
              )}
              <div className='flex flex-wrap items-center gap-2'>
                {availableBalance !== undefined || isBalanceLoading ? undefined : (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      void queryClient.invalidateQueries({ queryKey: ['billing', 'credits'] });
                    }}
                  >
                    Try again
                  </Button>
                )}
                {/* Buying stays available when the balance cannot be shown: the purchase does not depend on this read. */}
                <Button variant='outline' size='sm' disabled={binding === undefined} onClick={openTopup}>
                  <Plus className='size-4' />
                  Add credits
                </Button>
              </div>
            </div>
          </CardContent>
        </SettingsSectionCard>
      </SettingsItem>

      <SettingsItem settingId='automatic-reload'>
        <AutoReloadSettings binding={binding} />
      </SettingsItem>
      {entitlements.tier === 'pro' && !entitlements.cancelAtPeriodEnd ? (
        <CancelPlanSettings binding={binding} paidThrough={entitlements.paidThrough} />
      ) : undefined}

      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} />
    </div>
  );
}
