import { describe, expect, it } from 'vitest';
import { paymentActionRequestSchema, wirePaymentActionSchema } from '#payment-action-wire.js';

const action = {
  version: 'payment-action-v1',
  actionId: 'purchase',
  environment: 'development',
  ownerId: 'user',
  subjectId: 'account',
  purpose: 'manual_topup',
  state: 'prepared',
  frozen: {
    offerId: 'offer',
    currency: 'usd',
    principalMinor: '2500',
    taxMinor: '250',
    grossMinor: '2750',
    maximumGrossMinor: '2750',
    creditAtoms: '25000000',
    paymentMethod: null,
  },
  redirectUrl: null,
  attention: null,
  receipt: null,
  updatedAt: '2026-09-06T00:00:00.000Z',
};

describe('payment transport boundaries', () => {
  it('keeps received funds distinct from fulfilled issuance, including zero issuance', () => {
    expect(wirePaymentActionSchema.parse({ ...action, state: 'funds_received' }).receipt).toBeNull();
    const receipt = { receiptId: 'journal', grantedCreditAtoms: '0', revision: '1', chargedPaymentMethod: null };
    expect(wirePaymentActionSchema.parse({ ...action, state: 'fulfilled', receipt }).receipt).toEqual(receipt);
    expect(wirePaymentActionSchema.safeParse({ ...action, state: 'fulfilled' }).success).toBe(false);
    expect(wirePaymentActionSchema.safeParse({ ...action, receipt }).success).toBe(false);
  });

  it('rejects inconsistent totals and malformed numeric input safely', () => {
    expect(wirePaymentActionSchema.parse(action)).toEqual(action);
    for (const grossMinor of ['2500', 'bad']) {
      expect(wirePaymentActionSchema.safeParse({ ...action, frozen: { ...action.frozen, grossMinor } }).success).toBe(
        false,
      );
    }
  });

  it.each(['https://other.test', '//other.test', String.raw`/\other.test`, '/\t/other.test', '/\n/other.test'])(
    'rejects external or normalized external return paths: %s',
    (returnPath) => {
      expect(paymentActionRequestSchema.safeParse({ requestId: 'request', returnPath }).success).toBe(false);
    },
  );

  it('accepts a local return with query and rejects caller-supplied ownership', () => {
    const request = { requestId: 'request', returnPath: '/settings?tab=billing' };
    expect(paymentActionRequestSchema.parse(request)).toEqual(request);
    expect(paymentActionRequestSchema.safeParse({ ...request, ownerId: 'other' }).success).toBe(false);
  });
});
