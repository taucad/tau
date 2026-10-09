import { describe, expect, it } from 'vitest';
import { checkoutSession, evidenceStamp } from '#support/checkout.js';

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
