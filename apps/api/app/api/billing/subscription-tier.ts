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
export const planToTier = (plan: string): BillingTier => recognisedTier(plan) ?? 'free';

/**
 * The tier a plan name names, or `undefined` when this build does not
 * recognise it. `planToTier` answers `free` for both that case and an account
 * with no subscription: the right answer for access, since it grants nothing,
 * but not the same evidence.
 *
 * @param plan - The subscription's plan name.
 * @returns The tier, or `undefined` when the name is unrecognised.
 */
export const recognisedTier = (plan: string): BillingTier | undefined => {
  if (plan === 'pro') {
    return 'pro';
  }
  if (plan === 'enterprise') {
    return 'enterprise';
  }
  return undefined;
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

/**
 * A tier together with whether it was established affirmatively (blueprint T04).
 *
 * `assured` is false only when something was in the way of an answer: a plan
 * name this build does not recognise, or a build with no financial
 * environment. It is true for an account that simply has no subscription,
 * which is a known free account. Callers that need the entitlement
 * established — the reuse and training purposes — refuse without it.
 */
export type TierAssurance = Readonly<{ tier: BillingTier; assured: boolean }>;

/**
 * The deciding subscription's tier, with its assurance.
 *
 * @param rows - The account's subscriptions in this environment, newest `paid_through` first.
 * @param now - Epoch milliseconds.
 * @returns The tier and whether it was established affirmatively.
 */
export const subscriptionTierAssuranceOf = <Row extends TierSubscription>(
  rows: readonly Row[],
  now: number,
): TierAssurance => {
  const { relevant, tier } = subscriptionTierOf(rows, now);
  if (tier !== 'free') {
    return { tier, assured: true };
  }
  /* `free` from a deciding subscription whose plan name is unrecognised is a
   * fallback, not an entitlement anyone established. */
  const unrecognised = relevant !== undefined && recognisedTier(relevant.plan) === undefined;
  return { tier: 'free', assured: !unrecognised };
};
