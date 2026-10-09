import { wireCreditBalanceSchema } from '@taucad/billing';
import { describe, expect, it } from 'vitest';
import { describeReads, heldAtoms, returnPath, summaryTaxMinor } from '#support/payments.js';

const get = (state: string) => ({ method: 'GET', path: '/v1/billing/payment-actions/a1', status: 200, state });
const recover = (status: number, state?: string) => ({
  method: 'POST',
  path: '/v1/billing/payment-actions/a1/recover',
  status,
  state,
});

describe('returnPath', () => {
  it('should credit the webhook when the first read already shows the payment accepted', () => {
    expect(returnPath([get('fulfilled')])).toBe('webhook');
    expect(returnPath([get('funds_received')])).toBe('webhook');
  });

  it('should credit recover when the page found the session unpaid and recover moved it on', () => {
    expect(returnPath([get('redirect_required'), recover(200, 'fulfilled')])).toBe('recover');
  });

  it('should report an unpaid or refused return as unsettled', () => {
    expect(returnPath([get('redirect_required'), recover(200, 'redirect_required')])).toBe('unsettled');
    expect(returnPath([get('redirect_required'), recover(409)])).toBe('unsettled');
    expect(returnPath([])).toBe('unsettled');
  });
});

describe('describeReads', () => {
  it('should list each read with its state and request id', () => {
    expect(describeReads([{ ...get('fulfilled'), requestId: 'req_1' }])).toBe(
      'return page read GET action 200 fulfilled (req_1)',
    );
    expect(describeReads([])).toBe('the return page made no payment-action reads');
  });
});

describe('heldAtoms', () => {
  const balance = wireCreditBalanceSchema.parse({
    schemaVersion: 1,
    environment: 'staging',
    subjectId: 'subject-1',
    revision: '11',
    asOf: '2026-10-09T17:08:59.000Z',
    promoGrantCreditAtoms: '0',
    planGrantCreditAtoms: '0',
    purchasedCreditAtoms: '4949515',
    debtCreditAtoms: '0',
    promoHeldCreditAtoms: '0',
    planHeldCreditAtoms: '0',
    purchasedHeldCreditAtoms: '244100',
    pendingIssuanceCreditAtoms: '0',
    eligibleAvailableCreditAtoms: '4705415',
    netBalanceCreditAtoms: '4949515',
  });

  it('should add the atoms every source holds for running operations', () => {
    expect(heldAtoms({ balance })).toBe(244_100n);
    expect(heldAtoms({ balance: { ...balance, promoHeldCreditAtoms: '5', planHeldCreditAtoms: '7' } })).toBe(244_112n);
    expect(heldAtoms({ balance: { ...balance, purchasedHeldCreditAtoms: '0' } })).toBe(0n);
  });

  it('should hold nothing when the ledger could not answer', () => {
    expect(heldAtoms({ balance: null })).toBe(0n);
  });
});

describe('summaryTaxMinor', () => {
  it('should read a zero, a positive or an absent tax line', () => {
    expect(summaryTaxMinor('Subtotal $5.00 Tax $0.00 Total due $5.00')).toBe(0);
    expect(summaryTaxMinor('Subtotal US$5.00 GST (15%) US$0.75 Total US$5.75')).toBe(75);
    expect(summaryTaxMinor('Tau credits $5.00 Total due today $5.00')).toBe(0);
  });
});
