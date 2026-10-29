import type { TierAssurance } from '#api/billing/subscription-tier.js';

/** Injection token for the source of an account's established billing tier. */
export const tierAssuranceKey = Symbol('tierAssurance');

/**
 * Where the purpose authority learns an account's tier. Tau Cloud reads the
 * billing projection; a self-hosted API has no subscription ledger, so it can
 * establish no tier at all.
 */
export type TierAssuranceSource = {
  getTierAssurance(userId: string): Promise<TierAssurance>;
};
