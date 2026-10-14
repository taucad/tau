import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink, Plus } from 'lucide-react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party settings surface owns the direct billing client contract
import { monthlyCreditsFromBalance, tauPlanCatalog } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { createPaymentRequestId, createPortalAction, followPaymentRedirect } from '#lib/billing-payment-client.js';
import { formatCredits } from '#utils/credits.utils.js';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { CardContent } from '@taucad/ui/components/card';
import { MonthlyCreditsMeter } from '#components/billing/monthly-credits-meter.js';
import { TopupModal } from '#components/billing/topup-modal.js';
import { PlanCards } from '#components/billing/plan-cards.js';
import { AutoReloadSettings } from '#components/billing/auto-reload-settings.js';
import { AccountClosureSettings } from '#components/billing/account-closure-settings.js';

const proPlan = tauPlanCatalog.find((entry) => entry.id === 'pro');
const proMonthlyPriceLabel = `${proPlan?.priceLabel ?? ''} per month USD`;

const formatRenewalDate = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/** Billing overview with separate monthly allowance and purchased credits. */
export function BillingSettings(): React.JSX.Element {
  const entitlements = useEntitlements();
  const credits = useCredits();
  const availableBalance = credits?.balance ?? undefined;
  const queryClient = useQueryClient();
  const isBalanceLoading = useIsFetching({ queryKey: ['billing', 'credits'] }) > 0;
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const binding =
    apiBaseUrl && environment && userId
      ? {
          apiBaseUrl,
          environment,
          ownerId: userId,
          ...(credits?.subjectId ? { subjectId: credits.subjectId } : {}),
        }
      : undefined;
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
      setPortalError('Billing management is unavailable.');
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
        setPortalError('Billing management is still being prepared. Try again.');
      }
    } catch {
      if (scopeRef.current.value === startedGeneration) {
        setPortalError('Could not open billing management. Try again.');
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

  return (
    <div className='flex flex-col gap-8 pb-4'>
      {entitlements.status === 'past_due' ? (
        <div className='rounded-md border border-warning/20 bg-card px-3 py-2 text-sm'>
          Payment failed — update your card to restore Pro. Your credits are safe.
        </div>
      ) : undefined}
      {entitlements.cancelAtPeriodEnd && entitlements.paidThrough ? (
        <div className='rounded-md border border-border bg-card px-3 py-2 text-sm'>
          Pro until {formatRenewalDate(entitlements.paidThrough)} — reactivate any time from Manage Subscription.
        </div>
      ) : undefined}

      {availableBalance && BigInt(availableBalance.debtCreditAtoms) > 0n ? (
        <p role='alert' className='rounded-md border border-warning/20 bg-card px-3 py-2 text-sm'>
          {formatCredits(BigInt(availableBalance.debtCreditAtoms))} outstanding. Add credits to resume AI usage. Your
          projects are unaffected.
        </p>
      ) : undefined}
      {availableBalance && BigInt(availableBalance.pendingIssuanceCreditAtoms) > 0n ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {formatCredits(BigInt(availableBalance.pendingIssuanceCreditAtoms))} pending issuance.
        </p>
      ) : undefined}
      <SettingsItem settingId='plan'>
        <h2 className='mb-3 text-sm font-medium'>Your plan</h2>
        <SettingsSectionCard>
          <CardContent className='flex flex-col gap-3 text-sm'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <div className='flex flex-col gap-1'>
                {entitlements.isResolved ? (
                  <span className='font-medium'>
                    Tau{' '}
                    {entitlements.tier === 'pro' ? 'Pro' : entitlements.tier === 'enterprise' ? 'Enterprise' : 'Free'}
                  </span>
                ) : (
                  <span role='status' aria-busy='true'>
                    Loading plan…
                  </span>
                )}
                {entitlements.tier === 'pro' ? (
                  <span className='text-muted-foreground'>{proMonthlyPriceLabel}</span>
                ) : undefined}
                {entitlements.status === 'past_due' ? <Badge variant='outline'>Past due</Badge> : undefined}
              </div>
              {isPaidTier ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={stateIsCurrent && isRedirecting}
                  onClick={async () => {
                    await openPortal();
                  }}
                >
                  <CreditCard className='size-4' />
                  Manage subscription
                  <ExternalLink className='size-3' />
                </Button>
              ) : undefined}
            </div>
            {stateIsCurrent && portalError ? (
              <span role='alert' className='text-xs text-warning'>
                {portalError}
              </span>
            ) : undefined}
            {entitlements.tier === 'enterprise' ? (
              <>
                <span>Custom plan — contact enterprise@tau.new for changes.</span>
                <div>
                  <Button asChild variant='outline' size='sm'>
                    <a href='mailto:enterprise@tau.new'>Contact your Tau team</a>
                  </Button>
                </div>
              </>
            ) : undefined}
            {isPaidTier && entitlements.paidThrough && !entitlements.cancelAtPeriodEnd ? (
              <span className='text-xs text-muted-foreground'>
                Renews on {formatRenewalDate(entitlements.paidThrough)}
              </span>
            ) : undefined}
            {entitlements.isResolved && entitlements.tier === 'free' ? (
              // U2/T7: the free state shows the full plan grid — same catalogue
              // as the landing pricing section, "Current plan" pinned to Free.
              <PlanCards currentTier='free' className='pt-2' isFeatureListScrollable />
            ) : undefined}
          </CardContent>
        </SettingsSectionCard>
      </SettingsItem>

      {monthly !== undefined || (entitlements.isResolved && entitlements.tier !== 'free') ? (
        <SettingsItem settingId='plan-limits'>
          <h2 className='mb-3 text-sm font-medium'>Plan limits</h2>
          <SettingsSectionCard>
            <CardContent className='flex flex-col gap-3'>
              <MonthlyCreditsMeter
                className='p-0 text-sm'
                monthlyHeldCreditAtoms={BigInt(availableBalance?.planHeldCreditAtoms ?? '0')}
                state={
                  monthly ? { status: 'ready', monthly } : { status: isBalanceLoading ? 'loading' : 'unavailable' }
                }
              />
              <p className='text-xs text-muted-foreground'>
                Monthly credits are used first, before your purchased credits.
              </p>
            </CardContent>
          </SettingsSectionCard>
        </SettingsItem>
      ) : undefined}

      {availableBalance && BigInt(availableBalance.promoGrantCreditAtoms) > 0n ? (
        <div>
          <h2 className='mb-3 text-sm font-medium'>Promotional credits</h2>
          <SettingsSectionCard>
            <CardContent className='space-y-2 text-sm'>
              <p>
                {formatCredits(
                  BigInt(availableBalance.debtCreditAtoms) > 0n
                    ? 0n
                    : BigInt(availableBalance.promoGrantCreditAtoms) - BigInt(availableBalance.promoHeldCreditAtoms),
                )}{' '}
                available
              </p>
              {BigInt(availableBalance.promoHeldCreditAtoms) > 0n ? (
                <p className='text-xs text-muted-foreground'>
                  {formatCredits(BigInt(availableBalance.promoHeldCreditAtoms))} reserved for active work.
                </p>
              ) : undefined}
            </CardContent>
          </SettingsSectionCard>
        </div>
      ) : undefined}
      <SettingsItem settingId='credit-balance'>
        <h2 className='mb-3 text-sm font-medium'>Credits</h2>
        <SettingsSectionCard>
          <CardContent className='flex flex-col gap-3 text-sm'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <div className='flex flex-col gap-1'>
                {availableBalance ? (
                  <>
                    <span className='font-medium tabular-nums' data-testid='credit-balance'>
                      {formatCredits(availablePurchased)} available
                    </span>
                    <span className='text-xs text-muted-foreground'>Purchased credits · Never expire</span>
                  </>
                ) : isBalanceLoading ? (
                  <span role='status' aria-busy='true' className='text-muted-foreground'>
                    Loading balance…
                  </span>
                ) : (
                  <span role='alert' className='text-muted-foreground'>
                    Balance unavailable.
                  </span>
                )}
              </div>
              <Button
                variant='outline'
                size='sm'
                disabled={binding === undefined}
                onClick={() => {
                  setIsTopupOpen(true);
                }}
              >
                <Plus className='size-4' />
                Add more
              </Button>
            </div>
            {availableBalance ? (
              BigInt(availableBalance.purchasedHeldCreditAtoms) > 0n ? (
                <p className='text-xs text-muted-foreground'>
                  {formatCredits(BigInt(availableBalance.purchasedHeldCreditAtoms))} reserved for active work.
                </p>
              ) : undefined
            ) : isBalanceLoading ? undefined : (
              <Button
                variant='outline'
                size='sm'
                className='self-start'
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ['billing', 'credits'] });
                }}
              >
                Retry
              </Button>
            )}
          </CardContent>
        </SettingsSectionCard>
      </SettingsItem>

      <SettingsItem settingId='automatic-reload'>
        <AutoReloadSettings binding={binding} />
      </SettingsItem>
      <SettingsItem settingId='close-account'>
        <AccountClosureSettings
          binding={binding}
          onReviewPayment={() => {
            setIsTopupOpen(true);
          }}
        />
      </SettingsItem>

      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} />
    </div>
  );
}
