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

  it('should list financial cases with the read key alone, since list-cases changes nothing', async () => {
    const database = mockDeep<DatabaseService>();
    const firstSeenAt = new Date('2026-11-08T01:45:00Z');
    // The stored row carries evidence and its dedupe key; the listing must leave both out.
    const stored = {
      id: 'case_1',
      environment: 'staging',
      stripeAccountId: 'acct_test',
      livemode: false,
      kind: 'missing_local_payment',
      dedupeKey: 'missing_local_payment:pi_1',
      accountId: null,
      sourceType: 'payment_intent',
      sourceId: 'pi_1',
      currency: 'usd',
      knownAmountMinor: 2000n,
      evidence: { customer: null, description: '(created by Stripe CLI)' },
      owner: 'billing-operations',
      nextStep: 'qualify_source_and_resolve',
      state: 'open',
      firstEffectiveAt: firstSeenAt,
      firstSeenAt,
      lastSeenAt: firstSeenAt,
      deadlineAt: null,
      resolvedAt: null,
      resolutionEvidence: null,
      ageSeconds: 90_000,
    };
    database.database.query.billingFinancialCase.findMany.mockResolvedValue([stored]);

    const listed = await runBillingLifecycleCommand({
      database,
      sourceStripe: createBillingStripeClient({ secretKey: 'rk_test_unconfigured' }),
      environment: 'staging',
      stripeAccountId: 'acct_test',
      livemode: false,
      request: {
        operation: 'list-cases',
        environment: 'staging',
        state: ['open', 'attention'],
        attributed: 'any',
        limit: 100,
      },
    });

    expect(listed).toEqual({
      cases: [
        {
          id: 'case_1',
          kind: 'missing_local_payment',
          state: 'open',
          attributed: false,
          accountId: null,
          sourceType: 'payment_intent',
          sourceId: 'pi_1',
          currency: 'usd',
          knownAmountMinor: 2000n,
          owner: 'billing-operations',
          nextStep: 'qualify_source_and_resolve',
          deadlineAt: null,
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          ageSeconds: 90_000,
        },
      ],
    });
    expect(database.database.query.billingFinancialCase.findMany).toHaveBeenCalledOnce();
    expect(database.database.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'an unknown key', change: { customer: 'cus_1' } },
    { name: 'a limit below 1', change: { limit: 0 } },
    { name: 'a limit above 100', change: { limit: 101 } },
    { name: 'an attribution outside any, true and false', change: { attributed: 'yes' } },
    { name: 'an empty state filter', change: { state: [] } },
  ])('should reject a list-cases request with $name before database work', async ({ change }) => {
    const database = mockDeep<DatabaseService>();

    const listing = runBillingLifecycleCommand({
      database,
      sourceStripe: createBillingStripeClient({ secretKey: 'rk_test_unconfigured' }),
      environment: 'staging',
      stripeAccountId: 'acct_test',
      livemode: false,
      request: {
        operation: 'list-cases',
        environment: 'staging',
        state: ['open', 'attention'],
        attributed: false,
        limit: 100,
        ...change,
      },
    });

    await expect(listing).rejects.toThrow(ZodError);
    expect(database.database.query.billingFinancialCase.findMany).not.toHaveBeenCalled();
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
