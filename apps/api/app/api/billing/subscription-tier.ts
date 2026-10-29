import type { BillingTier } from '@taucad/billing';
import type { subscription } from '#database/schema.js';

/** The subscription fields that decide an owner's tier. */
export type TierSubscription = Pick<
  typeof subscription.$inferSelect,
  'plan' | 'paidThrough' | 'failedRenewalInvoiceId' | 'graceEndsAt'
>;

/**
 * A subscription's plan as a tier. Fails closed: an unrecognised plan name grants nothing.
 *
 * @param plan - The subscription's plan name.
 * @returns The tier.
 */
export const planToTier = (plan: string): BillingTier => {
  if (plan === 'pro') {
    return 'pro';
  }
  if (plan === 'enterprise') {
    return 'enterprise';
  }
  return 'free';
};

/**
 * The subscription that decides an account's tier, and the tier it grants: the first one paid or in
 * renewal grace, otherwise the first one (`free`). `BillingService` and the storage accounting
 * scheduler both project tiers through this, so a quota band uses the plan a push is checked against.
 *
 * @param rows - The account's subscriptions in this environment, newest `paid_through` first.
 * @param now - Epoch milliseconds.
 * @returns The deciding subscription, if any, and the tier.
 */
export const subscriptionTierOf = <Row extends TierSubscription>(
  rows: readonly Row[],
  now: number,
): { readonly relevant: Row | undefined; readonly tier: BillingTier } => {
  const relevant =
    rows.find(
      (row) =>
        (row.paidThrough !== null && now < row.paidThrough.getTime()) ||
        (row.failedRenewalInvoiceId !== null && row.graceEndsAt !== null && now < row.graceEndsAt.getTime()),
    ) ?? rows[0];
  const paid =
    relevant?.paidThrough !== null && relevant?.paidThrough !== undefined && now < relevant.paidThrough.getTime();
  const grace =
    relevant?.failedRenewalInvoiceId !== null &&
    relevant?.failedRenewalInvoiceId !== undefined &&
    relevant.graceEndsAt !== null &&
    now < relevant.graceEndsAt.getTime();
  return { relevant, tier: relevant && (paid || grace) ? planToTier(relevant.plan) : 'free' };
};
