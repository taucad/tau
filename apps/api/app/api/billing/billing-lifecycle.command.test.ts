import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { DatabaseService } from '#database/database.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { runBillingLifecycleCommand } from '#api/billing/billing-lifecycle.command.js';

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
});
