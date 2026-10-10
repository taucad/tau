import { describe, expect, it } from 'vitest';
import { checkoutSession, evidenceStamp, isWatchedPaymentPath } from '#support/checkout.js';

describe('evidenceStamp', () => {
  it('should print the UTC minute as the program files evidence', () => {
    expect(evidenceStamp(new Date('2026-10-09T09:12:59.000Z'))).toBe('2026-10-09-0912');
  });
});

describe('checkoutSession', () => {
  it('should find the test-mode session id in a hosted Checkout URL', () => {
    expect(checkoutSession('https://checkout.stripe.com/c/pay/cs_test_a1B2c3#fid')).toBe('cs_test_a1B2c3');
    expect(checkoutSession('https://checkout.stripe.com/c/pay/cs_live_a1')).toBe('no Checkout session id');
  });
});

describe('isWatchedPaymentPath', () => {
  const action = '3be00fe2-dd3e-46a4-b510-cb076b4a1c68';
  const other = '8bae6bed-5c33-4f0f-88b9-3137ca65b880';

  it("should keep only the named action's reads and recovers, not a later row's", () => {
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${action}`, action)).toBe(true);
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${action}/recover`, action)).toBe(true);
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${other}`, action)).toBe(false);
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${other}/recover`, action)).toBe(false);
  });

  it('should watch every action for a row that registers before its action exists', () => {
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${action}`)).toBe(true);
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${other}/recover`)).toBe(true);
  });

  it('should ignore the other billing routes whatever the scope', () => {
    expect(isWatchedPaymentPath('/v1/billing/payment-actions/topup')).toBe(true);
    expect(isWatchedPaymentPath('/v1/billing/payment-actions/topup', action)).toBe(false);
    expect(isWatchedPaymentPath('/v1/billing/payment-actions')).toBe(false);
    expect(isWatchedPaymentPath(`/v1/billing/payment-actions/${action}/cancel`, action)).toBe(false);
    expect(isWatchedPaymentPath('/v1/billing/credits')).toBe(false);
  });
});
