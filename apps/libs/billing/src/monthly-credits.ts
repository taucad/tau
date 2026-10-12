import type { BillingTier } from '#billing-tier.js';
import { creditAtomsPerCredit } from '#credit-atoms.js';
import type { WireCreditBalance } from '#financial-wire.js';

/**
 * Credits each plan grants per billing period, in credit atoms. Free carries no
 * plan grant (charter D1) and Enterprise allotments are contract-specific, so
 * neither has a fixed figure. Matches the Pro card's "2,000 credits every month".
 * @public
 */
export const monthlyPlanCreditAtomsByTier: Readonly<Record<BillingTier, bigint | undefined>> = {
  free: undefined,
  pro: 2000n * creditAtomsPerCredit,
  enterprise: undefined,
};

/**
 * The recurring (plan and promotion) share of a balance, kept apart from
 * purchased credits, which never expire and are reported only in Billing.
 * @public
 */
export type MonthlyCredits = {
  /** Unheld monthly credit atoms the account can spend now; zero while in debt. */
  readonly availableCreditAtoms: bigint;
  /** The bar's full scale: the plan allotment, else the monthly assets on hand. */
  readonly scaleCreditAtoms: bigint;
  /** Available share of the scale, clamped to 0–1 (rollover can exceed one allotment). */
  readonly fraction: number;
};

/**
 * Derives the monthly credits meter from an authoritative balance.
 *
 * @param balance - The account's current three-source balance.
 * @param tier - The account's resolved billing tier.
 * @returns The monthly figures, or `undefined` when the account has no monthly credits to show.
 * @public
 * @example <caption>Meter a Pro balance</caption>
 * ```typescript
 * import { monthlyCreditsFromBalance } from '@taucad/billing';
 * import type { WireCreditBalance } from '@taucad/billing';
 *
 * declare const balance: WireCreditBalance;
 * monthlyCreditsFromBalance(balance, 'pro')?.fraction;
 * ```
 */
export const monthlyCreditsFromBalance = (
  balance: WireCreditBalance,
  tier: BillingTier,
): MonthlyCredits | undefined => {
  const assets = BigInt(balance.planGrantCreditAtoms) + BigInt(balance.promoGrantCreditAtoms);
  const held = BigInt(balance.planHeldCreditAtoms) + BigInt(balance.promoHeldCreditAtoms);
  const allotment = monthlyPlanCreditAtomsByTier[tier];
  if (allotment === undefined && assets === 0n) {
    return undefined;
  }
  const availableCreditAtoms = BigInt(balance.debtCreditAtoms) > 0n ? 0n : assets - held;
  const scaleCreditAtoms = allotment ?? assets;
  const fraction =
    scaleCreditAtoms === 0n ? 0 : Math.min(1, Number((availableCreditAtoms * 10_000n) / scaleCreditAtoms) / 10_000);
  return { availableCreditAtoms, scaleCreditAtoms, fraction };
};
