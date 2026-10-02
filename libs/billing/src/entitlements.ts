import type { BillingTier } from '#billing-tier.js';

/**
 * Subscription lifecycle status mirrored from Stripe / Better Auth.
 * @public
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'none';

/**
 * Feature entitlements derived from a subscriber's billing tier.
 * Shape matches `docs/research/stripe-billing-tiers-and-entitlements.md` Finding 1.
 * @public
 */
export type Entitlements = {
  readonly tier: BillingTier;
  readonly status: SubscriptionStatus;
  readonly canUseProKernels: boolean;
  readonly canCreatePrivateShares: boolean;
  readonly canSyncFiles: boolean;
  readonly canConnectGitHub: boolean;
  readonly canConnectEnterpriseGit: boolean;
  readonly apiCadGatewayMonthlyLimit: number;
  readonly conversionApiMonthlyLimit: number;
  readonly currentPeriodEnd: Date | undefined;
  readonly cancelAtPeriodEnd: boolean;
};

const freeEntitlements = {
  canUseProKernels: false,
  canCreatePrivateShares: false,
  canSyncFiles: false,
  canConnectGitHub: false,
  canConnectEnterpriseGit: false,
  apiCadGatewayMonthlyLimit: 1000,
  conversionApiMonthlyLimit: 0,
} as const;

const proEntitlements = {
  canUseProKernels: true,
  canCreatePrivateShares: true,
  canSyncFiles: true,
  canConnectGitHub: true,
  canConnectEnterpriseGit: false,
  apiCadGatewayMonthlyLimit: 30_000,
  conversionApiMonthlyLimit: 50_000,
} as const;

/**
 * Synthesises an {@link Entitlements} projection from a billing tier.
 * Used as the MVP fallback before `GET /v1/billing/entitlements` ships.
 *
 * @param tier - The subscriber's billing tier
 * @returns A fully-populated entitlements object
 * @public
 * @example <caption>Project entitlements for a Pro subscriber</caption>
 * ```typescript
 * import { entitlementsFromTier } from '@taucad/billing';
 *
 * const entitlements = entitlementsFromTier('pro');
 * entitlements.canUseProKernels; // true
 * ```
 */
export const entitlementsFromTier = (tier: BillingTier): Entitlements => {
  switch (tier) {
    case 'free': {
      return {
        tier,
        status: 'none',
        ...freeEntitlements,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
      };
    }

    case 'pro': {
      return {
        tier,
        status: 'active',
        ...proEntitlements,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
      };
    }

    case 'enterprise': {
      return {
        tier,
        status: 'active',
        ...proEntitlements,
        canConnectEnterpriseGit: true,
        apiCadGatewayMonthlyLimit: Number.POSITIVE_INFINITY,
        conversionApiMonthlyLimit: Number.POSITIVE_INFINITY,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
      };
    }
  }
};
