import { describe, expect, it } from 'vitest';
import type { WireCreditBalance } from '#financial-wire.js';
import { creditAtomsPerCredit } from '#credit-atoms.js';
import { monthlyCreditsFromBalance, monthlyPlanCreditAtomsByTier } from '#monthly-credits.js';
import { tauPlanCatalog } from '#tau-plan-catalog.js';

const credits = (value: number): string => (BigInt(value) * creditAtomsPerCredit).toString();

const balanceOf = (overrides: Partial<WireCreditBalance>): WireCreditBalance => ({
  schemaVersion: 1,
  environment: 'development',
  subjectId: 'subject-1',
  revision: '1',
  asOf: '2026-10-11T00:00:00.000Z',
  promoGrantCreditAtoms: '0',
  planGrantCreditAtoms: '0',
  purchasedCreditAtoms: '0',
  debtCreditAtoms: '0',
  promoHeldCreditAtoms: '0',
  planHeldCreditAtoms: '0',
  purchasedHeldCreditAtoms: '0',
  pendingIssuanceCreditAtoms: '0',
  eligibleAvailableCreditAtoms: '0',
  netBalanceCreditAtoms: '0',
  ...overrides,
});

describe('monthlyCreditsFromBalance', () => {
  it('should meter unheld plan credits against the Pro allotment and ignore purchased credits', () => {
    const monthly = monthlyCreditsFromBalance(
      balanceOf({
        planGrantCreditAtoms: credits(1500),
        planHeldCreditAtoms: credits(100),
        purchasedCreditAtoms: credits(900),
      }),
      'pro',
    );
    expect(monthly).toStrictEqual({
      availableCreditAtoms: 1400n * creditAtomsPerCredit,
      scaleCreditAtoms: 2000n * creditAtomsPerCredit,
      fraction: 0.7,
    });
  });

  it('should clamp a rolled-over balance above one allotment to a full bar', () => {
    expect(monthlyCreditsFromBalance(balanceOf({ planGrantCreditAtoms: credits(3200) }), 'pro')?.fraction).toBe(1);
  });

  it('should show nothing available while the account is in debt', () => {
    const monthly = monthlyCreditsFromBalance(
      balanceOf({ planGrantCreditAtoms: credits(10), debtCreditAtoms: '5' }),
      'pro',
    );
    expect(monthly?.availableCreditAtoms).toBe(0n);
    expect(monthly?.fraction).toBe(0);
  });

  it('should scale a contract allotment against the monthly credits on hand', () => {
    const monthly = monthlyCreditsFromBalance(
      balanceOf({
        planGrantCreditAtoms: credits(8000),
        planHeldCreditAtoms: credits(2000),
      }),
      'enterprise',
    );
    expect(monthly?.scaleCreditAtoms).toBe(8000n * creditAtomsPerCredit);
    expect(monthly?.fraction).toBe(0.75);
  });

  it('should omit the meter for an account without monthly credits', () => {
    expect(monthlyCreditsFromBalance(balanceOf({ purchasedCreditAtoms: credits(500) }), 'free')).toBeUndefined();
  });

  it('should agree with the advertised Pro grant', () => {
    const pro = tauPlanCatalog.find((entry) => entry.id === 'pro');
    const allotment = (monthlyPlanCreditAtomsByTier.pro ?? 0n) / creditAtomsPerCredit;
    expect(pro?.features).toContain(`${allotment.toLocaleString('en-US')} credits every month`);
  });
});
