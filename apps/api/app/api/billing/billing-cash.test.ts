import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- Stripe wire fixtures use provider field names. */
import type { Stripe } from 'stripe';
import { qualifyStripeCashProjection } from '#api/billing/billing-cash.service.js';
import type { CashDisputeSource } from '#api/billing/billing-cash.service.js';

const refund = (
  input: Partial<Stripe.Refund> & Pick<Stripe.Refund, 'id' | 'amount' | 'status'>,
): Pick<
  Stripe.Refund,
  | 'amount'
  | 'balance_transaction'
  | 'charge'
  | 'currency'
  | 'customer'
  | 'id'
  | 'metadata'
  | 'payment_intent'
  | 'status'
> => ({
  object: 'refund',
  balance_transaction: `txn_${input.id}`,
  charge: 'ch_1',
  created: 1,
  currency: 'usd',
  customer: 'cus_1',
  customer_account: null,
  metadata: {},
  payment_intent: 'pi_1',
  payment_method: null,
  reason: 'requested_by_customer',
  receipt_number: null,
  source_transfer_reversal: null,
  ...input,
});

const base = {
  stripeAccountId: 'acct_1',
  livemode: false,
  customerId: 'cus_1',
  paymentIntentId: 'pi_1',
  chargeId: 'ch_1',
  currency: 'usd',
  originalPrincipalMinor: 2000n,
  originalTaxMinor: 200n,
  refundPagesComplete: true,
  disputes: [],
};

describe('Stripe cash source qualification', () => {
  it('converges split successful refunds from exact principal and tax allocations', () => {
    const refunds = [
      refund({ id: 're_1', amount: 300, status: 'succeeded' }),
      refund({ id: 're_2', amount: 200, status: 'succeeded' }),
    ];
    const result = qualifyStripeCashProjection({
      ...base,
      refunds,
      refundAllocations: {
        re_1: { principalMinor: 250n, taxMinor: 50n },
        re_2: { principalMinor: 150n, taxMinor: 50n },
      },
    });
    expect(result).toMatchObject({
      status: 'qualified',
      evidence: { principalLossMinor: '400', taxLossMinor: '100', grossLossMinor: '500' },
    });
  });

  it('allocates external refunds pro rata on their cumulative total and returns a full refund exactly', () => {
    const partial = [
      refund({ id: 're_b', amount: 1, status: 'succeeded', created: 2 }),
      refund({ id: 're_a', amount: 1, status: 'succeeded', created: 1 }),
    ];
    // 2 of 2200 gross: floor(2 * 2000 / 2200) = 1 principal, so rounding never drifts into extra tax.
    expect(qualifyStripeCashProjection({ ...base, refunds: partial, refundAllocations: {} })).toMatchObject({
      status: 'qualified',
      evidence: { principalLossMinor: '1', taxLossMinor: '1', grossLossMinor: '2' },
    });
    const full = [...partial, refund({ id: 're_c', amount: 2198, status: 'succeeded', created: 3 })];
    expect(qualifyStripeCashProjection({ ...base, refunds: full, refundAllocations: {} })).toMatchObject({
      status: 'qualified',
      evidence: { principalLossMinor: '2000', taxLossMinor: '200', grossLossMinor: '2200' },
    });
    // A refund Tau issued never takes the default: its reviewed split is required.
    const issued = refund({ id: 're_t', amount: 5, status: 'succeeded', metadata: { tau_refund_intent_id: 'ri_1' } });
    expect(qualifyStripeCashProjection({ ...base, refunds: [issued], refundAllocations: {} })).toEqual({
      status: 'attention',
      reason: 'refund_allocation_incomplete',
    });
  });

  it('keeps incomplete and pending refunds non-authoritative', () => {
    expect(
      qualifyStripeCashProjection({ ...base, refunds: [], refundPagesComplete: false, refundAllocations: {} }),
    ).toEqual({ status: 'pending', reason: 'incomplete_refund_pages' });
    expect(
      qualifyStripeCashProjection({
        ...base,
        refunds: [refund({ id: 're_1', amount: 500, status: 'pending' })],
        refundAllocations: { re_1: { principalMinor: 500n, taxMinor: 0n } },
      }),
    ).toEqual({ status: 'pending', reason: 'refund_not_final' });
  });

  it('does not treat warning disputes or customer withdrawal as cash loss', () => {
    const dispute = {
      id: 'dp_1',
      balance_transactions: [],
      charge: 'ch_1',
      currency: 'usd',
      livemode: false,
      payment_intent: 'pi_1',
      status: 'warning_closed',
    } satisfies CashDisputeSource;
    const result = qualifyStripeCashProjection({ ...base, refunds: [], refundAllocations: {}, disputes: [dispute] });
    expect(result).toMatchObject({ status: 'qualified', evidence: { grossLossMinor: '0' } });
  });

  it('requires explicit allocation for partial dispute withdrawals', () => {
    const dispute = {
      id: 'dp_1',
      balance_transactions: [{ id: 'txn_dp', amount: -500 }],
      charge: 'ch_1',
      currency: 'usd',
      livemode: false,
      payment_intent: 'pi_1',
      status: 'lost',
    } satisfies CashDisputeSource;
    expect(qualifyStripeCashProjection({ ...base, refunds: [], refundAllocations: {}, disputes: [dispute] })).toEqual({
      status: 'attention',
      reason: 'dispute_allocation_required',
    });
  });

  it('counts a complete withdrawal while a dispute still needs response', () => {
    const dispute = {
      id: 'dp_open',
      balance_transactions: [{ id: 'txn_open', amount: -2200 }],
      charge: 'ch_1',
      currency: 'usd',
      livemode: false,
      payment_intent: 'pi_1',
      status: 'needs_response',
    } satisfies CashDisputeSource;
    expect(
      qualifyStripeCashProjection({ ...base, refunds: [], refundAllocations: {}, disputes: [dispute] }),
    ).toMatchObject({
      status: 'qualified',
      evidence: { principalLossMinor: '2000', taxLossMinor: '200', grossLossMinor: '2200' },
    });
  });

  it('rejects stale duplicate movements across provider facts', () => {
    const duplicate = refund({ id: 're_1', amount: 300, status: 'succeeded' });
    expect(
      qualifyStripeCashProjection({
        ...base,
        refunds: [duplicate, duplicate],
        refundAllocations: { re_1: { principalMinor: 250n, taxMinor: 50n } },
      }),
    ).toEqual({ status: 'attention', reason: 'duplicate_refund' });
  });

  it('does not infer restoration from a won label without a linked restoring movement', () => {
    const dispute = {
      id: 'dp_won',
      balance_transactions: [{ id: 'txn_withdrawal', amount: -2200 }],
      charge: 'ch_1',
      currency: 'usd',
      livemode: false,
      payment_intent: 'pi_1',
      status: 'won',
    } satisfies CashDisputeSource;
    expect(
      qualifyStripeCashProjection({ ...base, refunds: [], refundAllocations: {}, disputes: [dispute] }),
    ).toMatchObject({ status: 'qualified', evidence: { grossLossMinor: '2200' } });
  });

  it('rejects a foreign currency before accepting source identities', () => {
    expect(qualifyStripeCashProjection({ ...base, currency: 'eur', refunds: [], refundAllocations: {} })).toEqual({
      status: 'attention',
      reason: 'invalid_original_cash',
    });
  });

  it('does not count an internally canceled refund as settled cash loss', () => {
    const result = qualifyStripeCashProjection({
      ...base,
      refunds: [refund({ id: 're_canceled', amount: 500, status: 'canceled', balance_transaction: null })],
      refundAllocations: {},
    });
    expect(result).toMatchObject({ status: 'qualified', evidence: { grossLossMinor: '0' } });
  });

  it('rejects one balance movement allocated to both refund and dispute', () => {
    const dispute = {
      id: 'dp_overlap',
      balance_transactions: [{ id: 'txn_re_1', amount: -300 }],
      charge: 'ch_1',
      currency: 'usd',
      livemode: false,
      payment_intent: 'pi_1',
      status: 'under_review',
    } satisfies CashDisputeSource;
    expect(
      qualifyStripeCashProjection({
        ...base,
        refunds: [refund({ id: 're_1', amount: 300, status: 'succeeded' })],
        refundAllocations: { re_1: { principalMinor: 300n, taxMinor: 0n } },
        disputes: [dispute],
        disputeAllocations: { dp_overlap: { principalMinor: 300n, taxMinor: 0n } },
      }),
    ).toEqual({ status: 'attention', reason: 'cash_movement_overlap' });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end Stripe wire fixtures */
