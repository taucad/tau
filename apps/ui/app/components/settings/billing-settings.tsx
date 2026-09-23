import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink, Plus } from 'lucide-react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party settings surface owns the direct billing client contract
import { formatCreditAtoms, tauPlanCatalog } from '@taucad/billing';
import type { Entitlements } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { createPaymentRequestId, createPortalAction, followPaymentRedirect } from '#lib/billing-payment-client.js';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { TierBadge } from '#components/tier-badge.js';
import { TopupModal } from '#components/billing/topup-modal.js';
import { PlanCards } from '#components/billing/plan-cards.js';
import { AutoReloadSettings } from '#components/billing/auto-reload-settings.js';
import { AccountClosureSettings } from '#components/billing/account-closure-settings.js';

const proPlan = tauPlanCatalog.find((entry) => entry.id === 'pro');
const proMonthlyPriceLabel = `${proPlan?.priceLabel ?? ''}${proPlan?.priceSubLabel ?? ''}`;

const formatRenewalDate = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const formatMonthlyLimit = (limit: number): string =>
  Number.isFinite(limit) ? `${limit.toLocaleString()}/mo` : 'Custom';

/**
 * One entitlement/quota row (T10/T14): quotas render with a Coming Soon badge
 * until their surfaces ship — the numbers are contractual copy, not live caps.
 */
function QuotaRow({
  label,
  value,
  isComingSoon,
}: {
  readonly label: string;
  readonly value: string;
  readonly isComingSoon?: boolean;
}): React.JSX.Element {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='flex items-center gap-2'>
        {value}
        {isComingSoon ? (
          <Badge variant='outline' className='text-xs'>
            Coming Soon
          </Badge>
        ) : undefined}
      </span>
    </div>
  );
}

/** Paid-tier quota + verification entitlement list (T10/T14). */
function PaidTierQuotas({ entitlements }: { readonly entitlements: Entitlements }): React.JSX.Element {
  return (
    <div className='flex flex-col gap-1.5 border-t pt-3'>
      <QuotaRow
        label='API CAD Gateway'
        value={formatMonthlyLimit(entitlements.apiCadGatewayMonthlyLimit)}
        isComingSoon
      />
      <QuotaRow
        label='3D Conversion API'
        value={formatMonthlyLimit(entitlements.conversionApiMonthlyLimit)}
        isComingSoon
      />
      <QuotaRow
        label='Hosted GeoSpec validation'
        value={formatMonthlyLimit(entitlements.geospecValidationMonthlyLimit)}
        isComingSoon
      />
      {entitlements.canCreateGeoSpecEvidenceReports ? (
        <QuotaRow
          label='Signed evidence reports'
          value={`${entitlements.geospecEvidenceRetentionDays.toLocaleString()}-day retention`}
          isComingSoon
        />
      ) : undefined}
    </div>
  );
}

/**
 * Billing tab of the Settings dialog (ui-patterns doc Sections A–C, B1 slice):
 * current plan + status, renewal date, Stripe-hosted management surfaces via
 * the Better Auth stripe client plugin. The credit-balance card and top-up
 * affordance land with the B2/B3 phases.
 */
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

  const isPaidTier = entitlements.tier !== 'free';

  return (
    <div className='flex flex-col gap-4 py-4'>
      {entitlements.status === 'past_due' ? (
        <div className='rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm'>
          Payment failed — update your card to restore Pro. Your credits are safe.
        </div>
      ) : undefined}
      {entitlements.cancelAtPeriodEnd && entitlements.paidThrough ? (
        <div className='rounded-md border border-border bg-muted/40 px-3 py-2 text-sm'>
          Pro until {formatRenewalDate(entitlements.paidThrough)} — reactivate any time from Manage Subscription.
        </div>
      ) : undefined}

      <SettingsItem settingId='plan'>
        <SettingsSectionCard>
          <CardHeader className='flex flex-row items-center justify-between space-y-0'>
            <CardTitle className='flex items-center gap-2 text-base'>
              Current plan
              {entitlements.isResolved ? <TierBadge tier={entitlements.tier} /> : undefined}
              {entitlements.status === 'past_due' ? <Badge variant='outline'>Past due</Badge> : undefined}
            </CardTitle>
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
                Manage Subscription
                <ExternalLink className='size-3' />
              </Button>
            ) : undefined}
            {stateIsCurrent && portalError ? <span className='text-xs text-warning'>{portalError}</span> : undefined}
          </CardHeader>
          <CardContent className='flex flex-col gap-2 text-sm text-muted-foreground'>
            {entitlements.isResolved ? undefined : (
              <span role='status' aria-busy='true'>
                Loading plan…
              </span>
            )}
            {entitlements.tier === 'pro' ? <span>{proMonthlyPriceLabel}</span> : undefined}
            {entitlements.tier === 'enterprise' ? (
              <>
                <span>Custom plan — contact enterprise@tau.new for changes.</span>
                {availableBalance && BigInt(availableBalance.planGrantCreditAtoms) > 0n ? (
                  <span>Plan credits: {formatCreditAtoms(BigInt(availableBalance.planGrantCreditAtoms))}</span>
                ) : undefined}
                <div>
                  <Button asChild variant='outline' size='sm'>
                    <a href='mailto:enterprise@tau.new'>Contact your Tau team</a>
                  </Button>
                </div>
              </>
            ) : undefined}
            {isPaidTier && entitlements.paidThrough && !entitlements.cancelAtPeriodEnd ? (
              <span>Renews on {formatRenewalDate(entitlements.paidThrough)}</span>
            ) : undefined}
            {isPaidTier ? <PaidTierQuotas entitlements={entitlements} /> : undefined}
            {entitlements.isResolved && entitlements.tier === 'free' ? (
              // U2/T7: the free state shows the full plan grid — same catalogue
              // as the landing pricing section, "Current plan" pinned to Free.
              <PlanCards currentTier='free' className='pt-2' isFeatureListScrollable />
            ) : undefined}
          </CardContent>
        </SettingsSectionCard>
      </SettingsItem>

      <SettingsItem settingId='credit-balance'>
        <SettingsSectionCard>
          <CardHeader className='flex flex-row items-center justify-between space-y-0'>
            <CardTitle className='text-base'>Credit balance</CardTitle>
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                disabled={binding === undefined}
                onClick={() => {
                  setIsTopupOpen(true);
                }}
              >
                <Plus className='size-3.5' />
                Add credits
              </Button>
              {availableBalance ? (
                <span className='font-mono text-lg' data-testid='credit-balance'>
                  {formatCreditAtoms(BigInt(availableBalance.eligibleAvailableCreditAtoms))}
                </span>
              ) : undefined}
            </div>
          </CardHeader>
          {availableBalance ? (
            <CardContent className='flex flex-col gap-1 text-sm text-muted-foreground'>
              {BigInt(availableBalance.netBalanceCreditAtoms) < 0n ? (
                <span className='text-warning'>
                  Your balance is negative — add credits to resume AI usage. Your projects are unaffected.
                </span>
              ) : undefined}
              {BigInt(availableBalance.purchasedCreditAtoms) > 0n ? (
                <span>
                  {formatCreditAtoms(BigInt(availableBalance.planGrantCreditAtoms))} from your plan +{' '}
                  {formatCreditAtoms(BigInt(availableBalance.purchasedCreditAtoms))} purchased (never expire)
                </span>
              ) : undefined}
              {BigInt(availableBalance.planHeldCreditAtoms) + BigInt(availableBalance.purchasedHeldCreditAtoms) > 0n ? (
                <span>
                  {formatCreditAtoms(
                    BigInt(availableBalance.planHeldCreditAtoms) + BigInt(availableBalance.purchasedHeldCreditAtoms),
                  )}{' '}
                  held for active work
                </span>
              ) : undefined}
              {BigInt(availableBalance.netBalanceCreditAtoms) >= 0n &&
              BigInt(availableBalance.eligibleAvailableCreditAtoms) === 0n ? (
                <span>No credits yet. Add credits to start using AI.</span>
              ) : undefined}
            </CardContent>
          ) : isBalanceLoading ? (
            <CardContent className='text-sm text-muted-foreground' role='status' aria-busy='true'>
              Loading balance…
            </CardContent>
          ) : (
            <CardContent className='flex items-center justify-between gap-2 text-sm text-muted-foreground'>
              <span role='alert'>Balance unavailable.</span>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ['billing', 'credits'] });
                }}
              >
                Retry
              </Button>
            </CardContent>
          )}
        </SettingsSectionCard>
      </SettingsItem>

      <SettingsItem settingId='automatic-reload'>
        <AutoReloadSettings binding={binding} />
      </SettingsItem>
      <SettingsItem settingId='close-account'>
        <AccountClosureSettings binding={binding} />
      </SettingsItem>

      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} />
    </div>
  );
}
