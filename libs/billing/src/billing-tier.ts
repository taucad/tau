/**
 * Canonical billing tier identifiers for Tau subscriptions.
 * @public
 */
export type BillingTier = 'free' | 'pro' | 'enterprise';

/**
 * All billing tiers in ascending privilege order.
 * @public
 */
export const billingTiers = ['free', 'pro', 'enterprise'] as const satisfies readonly BillingTier[];

const tierRank: Record<BillingTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

/**
 * Returns whether `currentTier` meets or exceeds `requiredTier`.
 *
 * @param currentTier - The subscriber's active tier
 * @param requiredTier - The minimum tier required for a feature
 * @returns `true` when the current tier is sufficient
 * @public
 * @example <caption>Compare subscriber tier against a feature requirement</caption>
 * ```typescript
 * import { tierMeets } from '@taucad/billing';
 *
 * tierMeets('pro', 'pro'); // true
 * tierMeets('free', 'pro'); // false
 * ```
 */
export const tierMeets = (currentTier: BillingTier, requiredTier: BillingTier): boolean =>
  tierRank[currentTier] >= tierRank[requiredTier];
