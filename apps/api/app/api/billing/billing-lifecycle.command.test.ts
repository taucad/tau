import { describe, expect, it } from 'vitest';
import type { Stripe } from 'stripe';
import { mockDeep } from 'vitest-mock-extended';
import { ZodError } from 'zod';
import type { DatabaseService } from '#database/database.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { assertRefundKey, runBillingLifecycleCommand } from '#api/billing/billing-lifecycle.command.js';
import { maximumRefundReasonLength } from '#api/billing/billing-cash.service.js';

describe('protected lifecycle command boundary', () => {
  it('rejects uncollecting mutations and malformed requests before database or provider work', async () => {
    const database = mockDeep<DatabaseService>();
    const sourceStripe = createBillingStripeClient({ secretKey: 'rk_test_unconfigured' });
    const input = {
      database,
      sourceStripe,
      environment: 'prod-us',
      stripeAccountId: 'acct_test',
      livemode: true,
    } as const;
    await expect(
      runBillingLifecycleCommand({
        ...input,
        request: {
          operation: 'reload-work',
          environment: 'prod-us',
          limit: 1,
        },
      }),
    ).rejects.toThrow('write key and an enabled collection');
    // A write key without an enabled collection is still refused.
    await expect(
      runBillingLifecycleCommand({
        ...input,
        protectedStripe: createBillingStripeClient({ secretKey: 'sk_live_unconfigured' }),
        request: { operation: 'execute-refund', environment: 'prod-us', intentId: 'ri_1', reviewActorId: 'op' },
      }),
    ).rejects.toThrow('write key and an enabled collection');
    await expect(
      runBillingLifecycleCommand({
        ...input,
        request: {
          operation: 'monitor-tax',
          environment: 'staging',
          asOf: '2026-09-06T00:00:00Z',
        },
      }),
    ).rejects.toThrow('environment mismatch');
    await expect(
      runBillingLifecycleCommand({
        ...input,
        request: {
          operation: 'prepare-refund',
          environment: 'prod-us',
          requestedPrincipalMinor: '-1',
        },
      }),
    ).rejects.toThrow();
    expect(database.database.transaction).not.toHaveBeenCalled();
    expect(database.database.select).not.toHaveBeenCalled();
  });

  it('should reject the retired supplier sweep as an unknown operation before database work', async () => {
    const database = mockDeep<DatabaseService>();

    const sweep = runBillingLifecycleCommand({
      database,
      sourceStripe: createBillingStripeClient({ secretKey: 'rk_test_unconfigured' }),
      environment: 'staging',
      stripeAccountId: 'acct_test',
      livemode: false,
      request: { operation: 'sweep-supplier', environment: 'staging', pageSize: 100, unresolvedMaximumAge: 0 },
    });

    await expect(sweep).rejects.toThrow(ZodError);
    await expect(sweep).rejects.toThrow(/invalid_union|Invalid input/u);
    expect(database.database.transaction).not.toHaveBeenCalled();
    expect(database.database.select).not.toHaveBeenCalled();
  });
});

describe('operator refund commands', () => {
  const liveCollection = { kind: 'stripe_live', monthlyPriceId: 'price_live', topupProductId: 'prod_live' } as const;
  const executeRefund = {
    operation: 'execute-refund',
    environment: 'prod-us',
    intentId: 'intent_1',
    reviewActorId: 'operator_1',
  } as const;
  const production = {
    sourceStripe: createBillingStripeClient({ secretKey: 'rk_live_unconfigured_read' }),
    collection: liveCollection,
    environment: 'prod-us',
    stripeAccountId: 'acct_test',
    livemode: true,
  } as const;

  it('should refuse execute-refund without the refund key, naming STRIPE_REFUND_SECRET_KEY, before any work', async () => {
    const database = mockDeep<DatabaseService>();
    const createStripe = mockDeep<Stripe>();
    await expect(
      runBillingLifecycleCommand({ ...production, database, protectedStripe: createStripe, request: executeRefund }),
    ).rejects.toThrow('STRIPE_REFUND_SECRET_KEY');
    expect(database.database.transaction).not.toHaveBeenCalled();
    expect(createStripe.refunds.create).not.toHaveBeenCalled();
  });

  it('should send execute-refund with the refund key and never with the create key', async () => {
    const database = mockDeep<DatabaseService>();
    // The dispatch claim the transaction would return for a prepared intent and its refund leg.
    database.database.transaction.mockResolvedValue({
      intent: { id: 'intent_1', reversalCaseId: 'case_1', requestedGrossMinor: 250n },
      leg: { id: 'leg_1', idempotencyKey: 'refund:intent_1' },
      chargeId: 'ch_1',
    });
    const linked = { set: () => ({ where: async () => [] }) };
    database.database.update.mockReturnValue(linked as unknown as ReturnType<typeof database.database.update>);
    const createStripe = mockDeep<Stripe>();
    const refundStripe = mockDeep<Stripe>();
    refundStripe.refunds.create.mockResolvedValue({ id: 're_1' } as Stripe.Response<Stripe.Refund>);
    await expect(
      runBillingLifecycleCommand({
        ...production,
        database,
        protectedStripe: createStripe,
        refundStripe,
        request: executeRefund,
      }),
    ).resolves.toEqual({ status: 'pending', refundId: 're_1' });
    expect(refundStripe.refunds.create).toHaveBeenCalledOnce();
    expect(createStripe.refunds.create).not.toHaveBeenCalled();
  });

  it('should hold prepare-refund reasons to the cap the refund service enforces', async () => {
    const database = mockDeep<DatabaseService>();
    const prepare = {
      operation: 'prepare-refund',
      environment: 'prod-us',
      accountId: 'account_1',
      reversalCaseId: 'case_1',
      requestedPrincipalMinor: '250',
      requestedTaxMinor: '0',
      approvedMaximumGrossMinor: '250',
      reviewActorId: 'operator_1',
      reviewedAt: '2026-10-09T00:00:00Z',
      requestId: 'request_1',
    } as const;
    database.database.transaction.mockResolvedValue({ intentId: 'intent_1', legId: 'leg_1' });
    await expect(
      runBillingLifecycleCommand({
        ...production,
        database,
        request: { ...prepare, reason: 'r'.repeat(maximumRefundReasonLength) },
      }),
    ).resolves.toEqual({ intentId: 'intent_1', legId: 'leg_1' });
    await expect(
      runBillingLifecycleCommand({
        ...production,
        database,
        request: { ...prepare, reason: 'r'.repeat(maximumRefundReasonLength + 1) },
      }),
    ).rejects.toThrow(ZodError);
    expect(database.database.transaction).toHaveBeenCalledOnce();
  });
});

describe('refund key guard', () => {
  const keys = { createKey: 'rk_live_create', readKey: 'rk_live_read' } as const;

  it('should accept a mode-matched refund key that differs from the create and read keys', () => {
    expect(() => {
      assertRefundKey({ refundKey: 'rk_live_refund', livemode: true, ...keys });
    }).not.toThrow();
    expect(() => {
      assertRefundKey({ refundKey: 'rk_test_refund', livemode: false, createKey: undefined, readKey: undefined });
    }).not.toThrow();
  });

  it('should refuse a refund key of the other Stripe mode', () => {
    expect(() => {
      assertRefundKey({ refundKey: 'rk_test_refund', livemode: true, ...keys });
    }).toThrow('rk_live_ restricted key');
    expect(() => {
      assertRefundKey({ refundKey: 'rk_live_refund', livemode: false, ...keys });
    }).toThrow('rk_test_ restricted key');
    expect(() => {
      assertRefundKey({ refundKey: 'sk_live_secret', livemode: true, ...keys });
    }).toThrow('rk_live_ restricted key');
  });

  it('should refuse the create key and the read key as the refund key', () => {
    expect(() => {
      assertRefundKey({ refundKey: keys.createKey, livemode: true, ...keys });
    }).toThrow('differ from the create and read keys');
    expect(() => {
      assertRefundKey({ refundKey: keys.readKey, livemode: true, ...keys });
    }).toThrow('differ from the create and read keys');
  });
});
