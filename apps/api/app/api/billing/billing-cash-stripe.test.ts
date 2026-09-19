import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- Stripe wire fixtures use provider field names. */
import type { Stripe } from 'stripe';
import {
  createStripeRefundOnce,
  listStripeBalancePage,
  listStripeRefundPage,
} from '#api/billing/billing-cash-stripe.js';

describe('billing cash Stripe transport', () => {
  it('creates one closed reviewed refund with the durable idempotency identity', async () => {
    const create = vi.fn().mockResolvedValue({ id: 're_1', object: 'refund' });
    const stripe: { refunds: Pick<Stripe['refunds'], 'create'> } = { refunds: { create } };
    await expect(
      createStripeRefundOnce(stripe, {
        chargeId: 'ch_1',
        amountMinor: 500n,
        reason: 'requested_by_customer',
        metadata: { tau_refund_intent_id: 'refund-1', tau_reversal_case_id: 'case-1' },
        idempotencyKey: 'refund-leg-1',
      }),
    ).resolves.toMatchObject({ id: 're_1' });
    expect(create).toHaveBeenCalledWith(
      {
        charge: 'ch_1',
        amount: 500,
        reason: 'requested_by_customer',
        metadata: { tau_refund_intent_id: 'refund-1', tau_reversal_case_id: 'case-1' },
      },
      { idempotencyKey: 'refund-leg-1' },
    );
  });

  it('rejects unsafe amounts and metadata before provider execution', async () => {
    const create = vi.fn();
    const stripe: { refunds: Pick<Stripe['refunds'], 'create'> } = { refunds: { create } };
    await expect(
      createStripeRefundOnce(stripe, {
        chargeId: 'ch_1',
        amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        reason: 'requested_by_customer',
        metadata: { tau_refund_intent_id: 'refund-1', unexpected: 'case-1' },
        idempotencyKey: 'refund-leg-1',
      }),
    ).rejects.toThrow('refund amount');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns exact bounded cursors and rejects pagination without progress', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'txn_1' }], has_more: true })
      .mockResolvedValueOnce({ data: [], has_more: true })
      .mockResolvedValueOnce({ data: [{ id: 'txn_1' }], has_more: true });
    const stripe: { balanceTransactions: Pick<Stripe['balanceTransactions'], 'list'> } = {
      balanceTransactions: { list },
    };
    await expect(listStripeBalancePage(stripe, { created: { gte: 1, lt: 2 } })).resolves.toMatchObject({
      hasMore: true,
      nextCursor: 'txn_1',
    });
    await expect(listStripeBalancePage(stripe, { created: { gte: 1, lt: 2 } })).rejects.toThrow('no progress');
    await expect(listStripeBalancePage(stripe, { created: { gte: 1, lt: 2 }, startingAfter: 'txn_1' })).rejects.toThrow(
      'no progress',
    );
  });

  it('rejects mixed refund filters without provider execution', async () => {
    const list = vi.fn();
    const stripe: { refunds: Pick<Stripe['refunds'], 'list'> } = { refunds: { list } };
    await expect(
      listStripeRefundPage(stripe, {
        created: { gte: 1, lt: 2 },
        chargeId: 'ch_1',
        paymentIntentId: 'pi_1',
      }),
    ).rejects.toThrow('one source filter');
    expect(list).not.toHaveBeenCalled();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end Stripe wire fixtures */
