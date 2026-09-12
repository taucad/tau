import type { BillingTier } from '#billing-tier.js';

/**
 * First-party subscription lifecycle display status.
 * @public
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'none';

/**
 * Feature entitlements derived from a subscriber's billing tier.
 * Shape matches `docs/research/stripe-billing-tiers-and-entitlements.md` Finding 1
 * plus the adversarial-review extensions (Finding 1 extensions 1–3, Finding 8b).
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
  /** Advisory saved-card availability; preparing a payment freezes the actual method. */
  readonly hasPaymentMethod: boolean;
  /** Advisory brand and last4; only the owned payment quote identifies the card to charge. */
  readonly paymentMethod: { readonly brand: string; readonly last4: string } | undefined;
  // GeoSpec verification family (vision-policy commercial core, AD13). Populated
  // per tier from day one so BillingSettings can render them as Coming Soon;
  // enforcement lands with GeoSpec Cloud.
  readonly canUseHostedGeoSpecValidation: boolean;
  readonly geospecValidationMonthlyLimit: number;
  readonly geospecConcurrentRuns: number;
  readonly canUseGeoSpecCiApi: boolean;
  readonly canCreateGeoSpecEvidenceReports: boolean;
  readonly geospecEvidenceRetentionDays: number;
  /**
   * Data-flywheel consent (AD15): whether this account's runs may enter the
   * training corpus. Free: user-controlled opt-in, default false. Pro/Enterprise:
   * always false (no-train guarantee).
   */
  readonly trainingConsent: boolean;
  readonly currentPeriodEnd: Date | undefined;
  readonly paidThrough: Date | undefined;
  readonly graceEndsAt: Date | undefined;
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
  hasPaymentMethod: false,
  paymentMethod: undefined,
  canUseHostedGeoSpecValidation: true,
  geospecValidationMonthlyLimit: 25,
  geospecConcurrentRuns: 1,
  canUseGeoSpecCiApi: false,
  canCreateGeoSpecEvidenceReports: false,
  geospecEvidenceRetentionDays: 0,
  trainingConsent: false,
} as const;

const proEntitlements = {
  canUseProKernels: true,
  canCreatePrivateShares: true,
  canSyncFiles: true,
  canConnectGitHub: true,
  canConnectEnterpriseGit: false,
  apiCadGatewayMonthlyLimit: 30_000,
  conversionApiMonthlyLimit: 50_000,
  hasPaymentMethod: false,
  paymentMethod: undefined,
  canUseHostedGeoSpecValidation: true,
  geospecValidationMonthlyLimit: 1000,
  geospecConcurrentRuns: 2,
  canUseGeoSpecCiApi: true,
  canCreateGeoSpecEvidenceReports: false,
  geospecEvidenceRetentionDays: 30,
  trainingConsent: false,
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
        paidThrough: undefined,
        graceEndsAt: undefined,
        cancelAtPeriodEnd: false,
      };
    }

    case 'pro': {
      return {
        tier,
        status: 'active',
        ...proEntitlements,
        currentPeriodEnd: undefined,
        paidThrough: undefined,
        graceEndsAt: undefined,
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
        // Enterprise defaults; per-customer overrides come from `subscription_extension`
        // at projection time (Q28), not from this static fallback.
        geospecValidationMonthlyLimit: Number.POSITIVE_INFINITY,
        geospecConcurrentRuns: 4,
        canCreateGeoSpecEvidenceReports: true,
        geospecEvidenceRetentionDays: 365,
        currentPeriodEnd: undefined,
        paidThrough: undefined,
        graceEndsAt: undefined,
        cancelAtPeriodEnd: false,
      };
    }
  }
};
