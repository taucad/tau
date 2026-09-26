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
  /** The end of the last paid subscription period: the renewal date, or the access end once cancelled. */
  readonly paidThrough: Date | undefined;
  readonly graceEndsAt: Date | undefined;
  readonly cancelAtPeriodEnd: boolean;
  /** Whether this deployment can take a payment now; purchase controls stay disabled while it is false. */
  readonly paymentCollectionAvailable: boolean;
};

/**
 * Tau Cloud storage each plan includes, per account (charter D16, EQ2): every
 * project the account owns draws on the one allowance. The Hosted Remote's
 * quota, the plan catalogue and the Sync region all read this table, so the
 * figure a refusal quotes is the figure the plan advertised.
 * @public
 */
export const storageLimitBytesByTier: Readonly<Record<BillingTier, number>> = {
  free: 1024 ** 3,
  pro: 10 * 1024 ** 3,
  enterprise: 100 * 1024 ** 3,
};

/**
 * A plan allowance as a person reads it: binary steps with decimal names and no
 * trailing `.0`, so 1 GiB is `1 GB` wherever it is quoted.
 *
 * @param bytes - A storage allowance in bytes.
 * @returns The allowance with its unit, e.g. `1 GB` or `2.5 GB`.
 * @public
 */
export const formatStorageLimit = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const step = bytes <= 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = Math.max(bytes, 0) / 1024 ** step;
  return `${Number.isInteger(value) ? String(value) : value.toFixed(1)} ${units[step] ?? 'B'}`;
};

/**
 * What the free tier is entitled to once free sync is open (D16, EQ2): backup
 * to Tau Cloud within its allowance, publishing (which shares `canSyncFiles`)
 * and a GitHub connection.
 */
const freeEntitlements = {
  canUseProKernels: false,
  canCreatePrivateShares: false,
  canSyncFiles: true,
  canConnectGitHub: true,
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
 * Free sync is a launch gate (charter D23): until a deployment opens it, the
 * free tier projects `canSyncFiles` and `canConnectGitHub` as `false`, so the
 * default is the closed answer everywhere this is called without the flag —
 * including a browser's fallback before the server has answered.
 *
 * @param tier - The subscriber's billing tier
 * @param options - Deployment gates; `freeTierSync` opens the free tier's sync.
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
export const entitlementsFromTier = (
  tier: BillingTier,
  options: Readonly<{ freeTierSync?: boolean }> = {},
): Entitlements => {
  switch (tier) {
    case 'free': {
      return {
        tier,
        status: 'none',
        ...freeEntitlements,
        ...(options.freeTierSync === true ? {} : { canSyncFiles: false, canConnectGitHub: false }),
        paidThrough: undefined,
        graceEndsAt: undefined,
        cancelAtPeriodEnd: false,
        paymentCollectionAvailable: false,
      };
    }

    case 'pro': {
      return {
        tier,
        status: 'active',
        ...proEntitlements,
        paidThrough: undefined,
        graceEndsAt: undefined,
        cancelAtPeriodEnd: false,
        paymentCollectionAvailable: false,
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
        paidThrough: undefined,
        graceEndsAt: undefined,
        cancelAtPeriodEnd: false,
        paymentCollectionAvailable: false,
      };
    }
  }
};
