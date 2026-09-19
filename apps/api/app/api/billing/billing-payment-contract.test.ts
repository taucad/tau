import { describe, expect, it } from 'vitest';
import { noChargeEvidenceSchema, paymentOfferSnapshotSchema } from '#api/billing/billing-payment-contract.js';

const offer = {
  version: 'payment-offer-v1',
  policyId: 'policy',
  offerId: 'topup',
  environment: 'development',
  accountId: 'account',
  stripeAccountId: 'acct_fixture',
  livemode: false,
  currency: 'usd',
  principalMinor: '2500',
  taxMinor: '250',
  grossMinor: '2750',
  maximumGrossMinor: '2750',
  creditAtoms: '25000000',
  ceilingCreditAtoms: null,
  stripePriceId: null,
  stripeProductId: 'prod_fixture',
  quantity: 1,
  term: 'one_time',
  taxBasis: 'stripe_tax',
  paymentMethod: null,
};

describe('immutable payment evidence contracts', () => {
  it('preserves separate principal, tax, total and granted atoms', () => {
    expect(paymentOfferSnapshotSchema.parse(offer)).toEqual(offer);
  });

  it.each([
    { ...offer, principalMinor: 'bad' },
    { ...offer, grossMinor: '2500' },
    { ...offer, maximumGrossMinor: '2749' },
    { ...offer, creditAtoms: '0' },
    { ...offer, term: 'month' },
    { ...offer, ceilingCreditAtoms: '50000000' },
  ])('rejects malformed or inconsistent commercial terms without throwing during safeParse', (input) => {
    expect(paymentOfferSnapshotSchema.safeParse(input).success).toBe(false);
  });

  it('requires canceled source evidence with all three monetary quantities zero', () => {
    const proof = {
      version: 'stripe-no-charge-v1',
      status: 'canceled',
      paymentIntentId: 'pi_fixture',
      customerId: 'cus_fixture',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      amountReceived: '0',
      amountCapturable: '0',
      chargeId: null,
      amountCaptured: '0',
      sourceDigest: 'a'.repeat(64),
      observedAt: '2026-09-06T00:00:00.000Z',
    };
    expect(noChargeEvidenceSchema.parse(proof)).toEqual(proof);
    for (const field of ['amountReceived', 'amountCapturable', 'amountCaptured']) {
      expect(noChargeEvidenceSchema.safeParse({ ...proof, [field]: '1' }).success).toBe(false);
    }
    expect(noChargeEvidenceSchema.safeParse({ ...proof, status: 'requires_payment_method' }).success).toBe(false);
  });
});
