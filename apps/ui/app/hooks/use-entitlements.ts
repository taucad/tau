import type { KernelId } from '@taucad/types/constants';
import { entitlementsFromTier, getKernelRequiredTier, tierMeets } from '@taucad/billing';
import type { BillingTier, Entitlements } from '@taucad/billing';

/**
 * Returns the current user's billing entitlements.
 *
 * MVP: hardcoded free tier. Swap-in point for `GET /v1/billing/entitlements`
 * (see `docs/research/stripe-billing-tiers-and-entitlements.md` T8).
 */
export const useEntitlements = (): Entitlements => entitlementsFromTier('free');

/**
 * Resolves tier requirements and unlock state for a CAD kernel.
 */
export const useKernelTierRequirement = (
  kernelId: KernelId,
): {
  readonly requiredTier: BillingTier;
  readonly isUnlocked: boolean;
  readonly isPro: boolean;
} => {
  const entitlements = useEntitlements();
  const requiredTier = getKernelRequiredTier(kernelId);

  return {
    requiredTier,
    isUnlocked: tierMeets(entitlements.tier, requiredTier),
    isPro: requiredTier === 'pro',
  };
};
