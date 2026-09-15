import { useState } from 'react';
import { Coins } from 'lucide-react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party chat surface owns the direct billing client contract
import { formatCreditAtomsDisplay } from '@taucad/billing';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { useModelEstimates } from '@taucad/billing/hooks/use-model-estimates';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { TopupModal } from '#components/billing/topup-modal.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';

/** Spend tiers a reader chooses between, cheapest first. @public */
export const modelTiers = ['Fast', 'Balanced', 'Frontier'] as const;

/** @public */
export type ModelTier = (typeof modelTiers)[number];

/**
 * Names the spend tier of a catalogue route from its published output price.
 *
 * The thresholds reproduce the tier table in
 * `docs/research/billing-admission-hold-redesign.md` ("How a user consumes
 * tiers"): Luna, Haiku and Gemini Flash are Fast; Terra, Sonnet and Gemini Pro
 * are Balanced; Astra, Sol, Opus and Fable are Frontier. Output price is the
 * discriminator because it dominates a turn's authorized maximum.
 *
 * @public
 */
export const modelTier = (outputCostPerMillion: number): ModelTier => {
  if (outputCostPerMillion < 8) {
    return 'Fast';
  }
  if (outputCostPerMillion <= 15) {
    return 'Balanced';
  }
  return 'Frontier';
};

/** What one typical turn on a route costs, and how many the balance covers. @public */
export type CreditAffordance = {
  /** Credits admission would authorize for one typical turn. */
  readonly credits: string;
  /** Whole typical turns the available balance covers; `undefined` when the balance is unreadable. */
  readonly turns: number | undefined;
};

/**
 * Joins the published per-route hold estimate to the authoritative balance.
 *
 * The catalogue model id is the billing route id (`catalogRouteIds` in
 * `billable-model-qualification.ts`), so no second mapping is needed. Both
 * reads are advisory: an unavailable estimate returns `undefined` and the
 * caller shows no number rather than a guess, and an unreadable balance leaves
 * `turns` undefined rather than rendering a failed read as "0 turns left".
 *
 * @public
 */
export const useCreditAffordance = (): ((modelId: string) => CreditAffordance | undefined) => {
  const estimates = useModelEstimates();
  const balance = useCredits();
  const available = balance?.balance ?? undefined;
  return (modelId: string): CreditAffordance | undefined => {
    const route = estimates?.routes.find((entry) => entry.routeId === modelId);
    if (route === undefined) {
      return undefined;
    }
    const hold = BigInt(route.typicalHoldAtoms);
    if (hold <= 0n) {
      return undefined;
    }
    return {
      credits: formatCreditAtomsDisplay(hold),
      turns: available === undefined ? undefined : Number(BigInt(available.eligibleAvailableCreditAtoms) / hold),
    };
  };
};

/**
 * Composer chip: available credits, the amount reserved by work in flight, and
 * the existing top-up flow behind a tap. Collapses when the balance is
 * unreadable (signed out, offline) so a failed read never reads as zero.
 *
 * @public
 */
export function CreditBalanceChip({ className }: { readonly className?: string }): React.JSX.Element | undefined {
  const balance = useCredits();
  const entitlements = useEntitlements();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const categories = balance?.balance;

  if (categories === undefined || categories === null) {
    return undefined;
  }

  const availableLabel = formatCreditAtomsDisplay(BigInt(categories.eligibleAvailableCreditAtoms));
  const reserved =
    BigInt(categories.promoHeldCreditAtoms) +
    BigInt(categories.planHeldCreditAtoms) +
    BigInt(categories.purchasedHeldCreditAtoms);
  const reservedLabel = formatCreditAtomsDisplay(reserved);

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        className={cn('h-7 rounded-full text-muted-foreground hover:text-foreground', className)}
        aria-label={`Credits: ${availableLabel} available, ${reservedLabel} reserved. Add credits.`}
        onClick={() => {
          if (entitlements.hasPaymentMethod) {
            setIsTopupOpen(true);
          } else {
            openSettingsDialog('billing');
          }
        }}
      >
        <Coins className='size-4 shrink-0' aria-hidden='true' />
        <span className='text-xs tabular-nums'>{availableLabel}</span>
        {reserved > 0n ? <span className='text-xs tabular-nums opacity-70'>· {reservedLabel} held</span> : null}
      </Button>
      {/* ponytail: mounted only while open — TopupModal reads unresolved payment
       * actions on mount, and the chip lives in every composer. */}
      {isTopupOpen ? <TopupModal isOpen onOpenChange={setIsTopupOpen} /> : undefined}
    </>
  );
}
