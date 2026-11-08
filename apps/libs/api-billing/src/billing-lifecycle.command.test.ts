import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { ZodError } from 'zod';
import type { DatabaseService } from '@taucad/api-database';
import { createBillingStripeClient } from '#billing-stripe.js';
import { runBillingLifecycleCommand } from '#billing-lifecycle.command.js';

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
        request: { operation: 'reload-work', environment: 'prod-us', limit: 1 },
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
          operation: 'requalify-charge',
          environment: 'prod-us',
          maximumRefundPages: -1,
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

  it.each(['prepare-refund', 'execute-refund', 'recover-refund'])(
    'should reject the retired %s operation before database work, since refunds are made in the Stripe Dashboard',
    async (operation) => {
      const database = mockDeep<DatabaseService>();

      const refund = runBillingLifecycleCommand({
        database,
        sourceStripe: createBillingStripeClient({ secretKey: 'rk_live_unconfigured_read' }),
        environment: 'prod-us',
        stripeAccountId: 'acct_test',
        livemode: true,
        request: { operation, environment: 'prod-us', intentId: 'intent_1', reviewActorId: 'operator_1' },
      });

      await expect(refund).rejects.toThrow(ZodError);
      expect(database.database.transaction).not.toHaveBeenCalled();
      expect(database.database.select).not.toHaveBeenCalled();
    },
  );
});
