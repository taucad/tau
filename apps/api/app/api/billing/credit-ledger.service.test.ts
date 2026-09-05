import { describe, expect, it } from 'vitest';
import type { AccountBalances } from '#api/billing/credit-ledger.service.js';
import { applyMonthlyGrant, applyRefundClawback, applyTopupCredit } from '#api/billing/credit-ledger.service.js';

const account = (overrides: Partial<AccountBalances> = {}): AccountBalances => ({
  grantBalanceMicro: 0n,
  topupBalanceMicro: 0n,
  reservedMicro: 0n,
  monthlyGrantMicro: 0n,
  rolloverCeilingMicro: 0n,
  ...overrides,
});

const proGrant = { monthlyGrantMicro: 20_000_000n, rolloverCeilingMicro: 40_000_000n };

describe('applyMonthlyGrant', () => {
  it('should grant the full monthly allotment onto an empty account', () => {
    const result = applyMonthlyGrant(account(), proGrant);

    expect(result.grantBalanceMicro).toBe(20_000_000n);
    expect(result.topupBalanceMicro).toBe(0n);
    expect(result.monthlyGrantMicro).toBe(20_000_000n);
    expect(result.rolloverCeilingMicro).toBe(40_000_000n);
    expect(result.lastGrantedAt).toBeInstanceOf(Date);
  });

  it('should roll over an unspent balance up to the 2x ceiling (S4)', () => {
    const result = applyMonthlyGrant(account({ grantBalanceMicro: 20_000_000n }), proGrant);

    expect(result.grantBalanceMicro).toBe(40_000_000n);
  });

  it('should clip accrual at the ceiling when the balance is already high', () => {
    const result = applyMonthlyGrant(account({ grantBalanceMicro: 35_000_000n }), proGrant);

    expect(result.grantBalanceMicro).toBe(40_000_000n);
  });

  it('should never confiscate an existing balance when the ceiling drops below it', () => {
    const result = applyMonthlyGrant(account({ grantBalanceMicro: 40_000_000n }), {
      monthlyGrantMicro: 500_000n,
      rolloverCeilingMicro: 1_000_000n,
    });

    expect(result.grantBalanceMicro).toBe(40_000_000n);
  });

  it('should net an incoming grant against debt (Q37 interplay)', () => {
    const result = applyMonthlyGrant(account({ grantBalanceMicro: -5_000_000n }), proGrant);

    expect(result.grantBalanceMicro).toBe(15_000_000n);
  });

  it('should leave the top-up balance untouched by the ceiling', () => {
    const result = applyMonthlyGrant(
      account({ grantBalanceMicro: 40_000_000n, topupBalanceMicro: 99_000_000n }),
      proGrant,
    );

    expect(result.topupBalanceMicro).toBe(99_000_000n);
  });
});

describe('applyTopupCredit', () => {
  it('should credit the top-up balance without any ceiling (S19)', () => {
    const result = applyTopupCredit(
      account({ topupBalanceMicro: 500_000_000n, grantBalanceMicro: 40_000_000n }),
      25_000_000n,
    );

    expect(result.topupBalanceMicro).toBe(525_000_000n);
    expect(result.grantBalanceMicro).toBe(40_000_000n);
  });
});

describe('applyRefundClawback', () => {
  it('should claw an unspent refund back from the top-up balance first (S45)', () => {
    const result = applyRefundClawback(
      account({ topupBalanceMicro: 25_000_000n, grantBalanceMicro: 10_000_000n }),
      25_000_000n,
    );

    expect(result.topupBalanceMicro).toBe(0n);
    expect(result.grantBalanceMicro).toBe(10_000_000n);
  });

  it('should drive the account negative when refunded credits were already spent (S46)', () => {
    const result = applyRefundClawback(
      account({ topupBalanceMicro: 5_000_000n, grantBalanceMicro: 2_000_000n }),
      25_000_000n,
    );

    expect(result.topupBalanceMicro).toBe(0n);
    expect(result.grantBalanceMicro).toBe(-18_000_000n);
    expect(result.grantBalanceMicro + result.topupBalanceMicro).toBe(-18_000_000n);
  });
});
