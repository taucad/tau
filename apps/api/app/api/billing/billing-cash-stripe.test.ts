import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- Stripe wire fixtures use provider field names. */
import type { Stripe } from 'stripe';
import { listStripeBalancePage, listStripeRefundPage } from '#api/billing/billing-cash-stripe.js';

describe('billing cash Stripe transport', () => {
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
