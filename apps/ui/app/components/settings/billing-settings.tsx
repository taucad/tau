import { useEffect, useRef, useState } from 'react';
import { CreditCard, ExternalLink, Plus } from 'lucide-react';
import { formatMicroUsd } from '@taucad/billing';
import type { Entitlements } from '@taucad/billing';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { authClient } from '#lib/auth-client.js';
import { toast } from '#components/ui/sonner.js';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { TierBadge } from '#components/tier-badge.js';
import { TopupModal } from '#components/billing/topup-modal.js';
import { PlanCards } from '#components/billing/plan-cards.js';

const proMonthlyPriceLabel = '$20.00 per month';

const formatRenewalDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

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
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const seenGrantIdsRef = useRef<Set<string> | undefined>(undefined);

  // Q26: the server claims each 80%/95% marker exactly once per grant cycle,
  // so surfacing whatever arrives is already cross-tab/device deduplicated.
  useEffect(() => {
    if (!credits) {
      return;
    }
    for (const notification of credits.notifications) {
      if (notification === 'grant-80') {
        toast("You've used 80% of this month's credits. Top up if you need more headroom.");
      }
      if (notification === 'grant-95') {
        toast.warning("You're almost out of credits. Add more to avoid interruption.");
      }
    }
  }, [credits]);

  // U11: a renewal lands as a fresh `monthly_grant` journal line on refetch —
  // the first fetch only seeds the baseline (no toast for history).
  useEffect(() => {
    if (!credits) {
      return;
    }
    const grantIds = new Set(
      credits.transactions.filter((entry) => entry.reason === 'monthly_grant').map((entry) => entry.id),
    );
    const seen = seenGrantIdsRef.current;
    if (seen === undefined) {
      seenGrantIdsRef.current = grantIds;
      return;
    }
    if ([...grantIds].some((id) => !seen.has(id))) {
      toast(`Your monthly credit grant just landed — balance is now $${formatMicroUsd(credits.balanceMicro)}.`);
    }
    seenGrantIdsRef.current = grantIds;
  }, [credits]);

  const openPortal = async (): Promise<void> => {
    setIsRedirecting(true);
    try {
      await authClient.subscription.billingPortal({ returnUrl: globalThis.location.href });
    } finally {
      setIsRedirecting(false);
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
      {entitlements.cancelAtPeriodEnd && entitlements.currentPeriodEnd ? (
        <div className='rounded-md border border-border bg-muted/40 px-3 py-2 text-sm'>
          Pro until {formatRenewalDate(entitlements.currentPeriodEnd)} — reactivate any time from Manage Subscription.
        </div>
      ) : undefined}

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle className='flex items-center gap-2 text-base'>
            Current plan
            <TierBadge tier={entitlements.tier} />
            {entitlements.status === 'past_due' ? <Badge variant='outline'>Past due</Badge> : undefined}
          </CardTitle>
          {isPaidTier ? (
            <Button variant='outline' size='sm' disabled={isRedirecting} onClick={() => void openPortal()}>
              <CreditCard className='size-4' />
              Manage Subscription
              <ExternalLink className='size-3' />
            </Button>
          ) : undefined}
        </CardHeader>
        <CardContent className='flex flex-col gap-2 text-sm text-muted-foreground'>
          {entitlements.tier === 'pro' ? <span>{proMonthlyPriceLabel}</span> : undefined}
          {entitlements.tier === 'enterprise' ? (
            <>
              <span>Custom plan — contact enterprise@tau.new for changes.</span>
              {credits && credits.monthlyGrantMicro > 0n ? (
                <span>Monthly credit allotment: ${formatMicroUsd(credits.monthlyGrantMicro)}</span>
              ) : undefined}
              <div>
                <Button asChild variant='outline' size='sm'>
                  <a href='mailto:enterprise@tau.new'>Contact your Tau team</a>
                </Button>
              </div>
            </>
          ) : undefined}
          {isPaidTier && entitlements.currentPeriodEnd && !entitlements.cancelAtPeriodEnd ? (
            <span>Renews on {formatRenewalDate(entitlements.currentPeriodEnd)}</span>
          ) : undefined}
          {isPaidTier ? <PaidTierQuotas entitlements={entitlements} /> : undefined}
          {entitlements.tier === 'free' ? (
            // U2/T7: the free state shows the full plan grid — same catalogue
            // as the landing pricing section, "Current plan" pinned to Free.
            <PlanCards currentTier='free' className='pt-2' />
          ) : undefined}
        </CardContent>
      </Card>

      {credits ? (
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0'>
            <CardTitle className='text-base'>Credit balance</CardTitle>
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setIsTopupOpen(true);
                }}
              >
                <Plus className='size-3.5' />
                Add credits
              </Button>
              <span className='font-mono text-lg' data-testid='credit-balance'>
                ${formatMicroUsd(credits.balanceMicro)}
              </span>
            </div>
          </CardHeader>
          <CardContent className='flex flex-col gap-1 text-sm text-muted-foreground'>
            {credits.balanceMicro < 0n ? (
              <span className='text-warning'>
                Your balance is negative — add credits to resume AI usage. Your projects are unaffected.
              </span>
            ) : undefined}
            {credits.topupBalanceMicro > 0n ? (
              <span>
                ${formatMicroUsd(credits.grantBalanceMicro)} from your monthly grant + $
                {formatMicroUsd(credits.topupBalanceMicro)} from credit packs (never expire)
              </span>
            ) : undefined}
            {credits.reservedMicro > 0n ? (
              <span>${formatMicroUsd(credits.reservedMicro)} reserved by an active chat</span>
            ) : undefined}
            {credits.monthlyGrantMicro > 0n ? (
              // AD10 has no expiry event — the NEXT grant is clipped at the ceiling.
              <span>
                Next ${formatMicroUsd(credits.monthlyGrantMicro)} grant tops the balance up to at most $
                {formatMicroUsd(credits.rolloverCeilingMicro)} of grant credit.
              </span>
            ) : undefined}
          </CardContent>
        </Card>
      ) : undefined}

      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} />
    </div>
  );
}
