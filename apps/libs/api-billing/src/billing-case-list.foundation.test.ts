import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@taucad/api-database/schema';
import { listFinancialCases } from '#billing-case-list.js';
import { createOperationsGaugeSource } from '#cli/billing-command.operations.js';
import { runBillingLifecycleCommand } from '#billing-lifecycle.command.js';
import { createBillingStripeClient } from '#billing-stripe.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const database = drizzle(adminClient, { schema });
afterAll(async () => adminClient.end());

const twoDays = 2 * 24 * 60 * 60;
const caseRow = (input: {
  readonly scope: { readonly environment: string; readonly stripeAccountId: string; readonly livemode: boolean };
  readonly id: string;
  readonly kind: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly accountId?: string;
}) => ({
  ...input.scope,
  id: input.id,
  kind: input.kind,
  dedupeKey:
    input.accountId === undefined
      ? `${input.kind}:${input.sourceId}`
      : `${input.kind}:${input.sourceId}:${input.accountId}`,
  accountId: input.accountId,
  sourceType: input.sourceType,
  sourceId: input.sourceId,
  currency: 'usd',
  knownAmountMinor: 2000n,
  evidence: { customer: null },
  owner: 'billing-operations',
  nextStep: 'qualify_source_and_resolve',
  firstEffectiveAt: new Date(),
});

describe('financial case listing foundation', () => {
  describe('list-cases scope and filters', () => {
    const scope = { environment: 'staging', stripeAccountId: `acct_list_${randomUUID()}`, livemode: false } as const;
    const accountId = randomUUID();
    const unattributedId = randomUUID();
    const attributedId = randomUUID();
    const resolvedId = randomUUID();
    const foreignScopeId = randomUUID();
    const paymentIntentId = `pi_${randomUUID()}`;
    const disputeId = `dp_${randomUUID()}`;

    beforeAll(async () => {
      await database.insert(schema.creditAccount).values({ id: accountId, environment: 'staging' });
      await database.insert(schema.billingFinancialCase).values([
        {
          ...caseRow({
            scope,
            id: unattributedId,
            kind: 'missing_local_payment',
            sourceType: 'payment_intent',
            sourceId: paymentIntentId,
          }),
          firstSeenAt: sql`clock_timestamp() - interval '2 days'`,
          lastSeenAt: sql`clock_timestamp() - interval '1 day'`,
        },
        caseRow({
          scope,
          id: attributedId,
          kind: 'dispute_unresolved',
          sourceType: 'dispute',
          sourceId: disputeId,
          accountId,
        }),
        {
          ...caseRow({
            scope,
            id: resolvedId,
            kind: 'refund_unresolved',
            sourceType: 'refund',
            sourceId: `re_${randomUUID()}`,
          }),
          state: 'resolved',
          resolvedAt: new Date(),
          resolutionEvidence: { disposition: 'resolved', reviewActorId: 'operator_fixture', reason: 'seeded' },
        },
        caseRow({
          scope: { ...scope, stripeAccountId: `acct_other_${randomUUID()}` },
          id: foreignScopeId,
          kind: 'missing_local_payment',
          sourceType: 'payment_intent',
          sourceId: `pi_${randomUUID()}`,
        }),
      ]);
    });

    it('should list the open cases of the configured scope oldest first, without evidence', async () => {
      const listed = await listFinancialCases({ database }, scope, {
        state: ['open', 'attention'],
        attributed: 'any',
        limit: 100,
      });

      const [stored] = await database
        .select()
        .from(schema.billingFinancialCase)
        .where(eq(schema.billingFinancialCase.id, unattributedId));
      const [oldest, newest] = listed.cases;
      const { ageSeconds, ...listing } = oldest ?? { ageSeconds: undefined };
      expect(listed.cases.map((row) => row.id)).toEqual([unattributedId, attributedId]);
      expect(listing).toEqual({
        id: unattributedId,
        kind: 'missing_local_payment',
        state: 'open',
        attributed: false,
        accountId: null,
        sourceType: 'payment_intent',
        sourceId: paymentIntentId,
        currency: 'usd',
        knownAmountMinor: 2000n,
        owner: 'billing-operations',
        nextStep: 'qualify_source_and_resolve',
        deadlineAt: null,
        firstSeenAt: stored?.firstSeenAt,
        lastSeenAt: stored?.lastSeenAt,
      });
      expect(ageSeconds).toBeGreaterThanOrEqual(twoDays);
      expect(ageSeconds).toBeLessThan(twoDays + 600);
      expect(newest).toEqual(
        expect.objectContaining({ id: attributedId, kind: 'dispute_unresolved', attributed: true, accountId }),
      );
      expect(newest?.ageSeconds).toBeLessThan(600);
    });

    it('should filter the listing by attribution and honour the limit', async () => {
      const filter = { state: ['open', 'attention'], limit: 100 } as const;

      const unattributed = await listFinancialCases({ database }, scope, { ...filter, attributed: false });
      const attributed = await listFinancialCases({ database }, scope, { ...filter, attributed: true });
      const oldest = await listFinancialCases({ database }, scope, { ...filter, attributed: 'any', limit: 1 });

      expect(unattributed.cases.map((row) => row.id)).toEqual([unattributedId]);
      expect(attributed.cases.map((row) => row.id)).toEqual([attributedId]);
      expect(oldest.cases.map((row) => row.id)).toEqual([unattributedId]);
    });
  });

  it('should read the hourly gauge groups by kind and attribution with the oldest case age', async () => {
    // The gauge counts the whole environment, which other suites share, so the read is compared before and after.
    const gauge = createOperationsGaugeSource(adminClient, 'staging');
    const group = (rows: ReadonlyArray<Record<string, unknown>>, kind: string, attributed: boolean) =>
      rows.find((row) => row['kind'] === kind && row['attributed'] === attributed);
    const scope = { environment: 'staging', stripeAccountId: `acct_gauge_${randomUUID()}`, livemode: false } as const;
    const accountId = randomUUID();
    await database.insert(schema.creditAccount).values({ id: accountId, environment: 'staging' });
    const before = await gauge.openCases();
    await database.insert(schema.billingFinancialCase).values([
      {
        ...caseRow({
          scope,
          id: randomUUID(),
          kind: 'missing_local_payment',
          sourceType: 'payment_intent',
          sourceId: `pi_${randomUUID()}`,
        }),
        firstSeenAt: sql`clock_timestamp() - interval '2 days'`,
      },
      caseRow({
        scope,
        id: randomUUID(),
        kind: 'dispute_unresolved',
        sourceType: 'dispute',
        sourceId: `dp_${randomUUID()}`,
        accountId,
      }),
    ]);

    const after = await gauge.openCases();

    const unattributedBefore = Number(group(before, 'missing_local_payment', false)?.['open'] ?? 0);
    const attributedBefore = Number(group(before, 'dispute_unresolved', true)?.['open'] ?? 0);
    expect(group(after, 'missing_local_payment', false)).toEqual(
      expect.objectContaining({ open: unattributedBefore + 1 }),
    );
    expect(group(after, 'missing_local_payment', false)?.['oldestAgeSeconds']).toBeGreaterThanOrEqual(twoDays);
    expect(group(after, 'dispute_unresolved', true)).toEqual(expect.objectContaining({ open: attributedBefore + 1 }));
    expect(group(after, 'dispute_unresolved', true)?.['oldestAgeSeconds']).toBeGreaterThanOrEqual(0);
  });

  it('should close an unattributed case with resolve-case resolved through the lifecycle command alone', async () => {
    const scope = { environment: 'staging', stripeAccountId: `acct_resolve_${randomUUID()}`, livemode: false } as const;
    const caseId = randomUUID();
    await database.insert(schema.billingFinancialCase).values(
      caseRow({
        scope,
        id: caseId,
        kind: 'missing_local_payment',
        sourceType: 'payment_intent',
        sourceId: `pi_${randomUUID()}`,
      }),
    );
    // The read key alone: no write key and no collection, as an operator holds outside a collecting deployment.
    const lifecycle = async (request: Record<string, unknown>) =>
      runBillingLifecycleCommand({
        database: { database },
        sourceStripe: createBillingStripeClient({ secretKey: 'rk_test_unconfigured' }),
        ...scope,
        request: { environment: scope.environment, ...request },
      });
    const listCases = { operation: 'list-cases', state: ['open', 'attention'], attributed: false, limit: 100 };
    const resolveCase = {
      operation: 'resolve-case',
      caseId,
      disposition: 'resolved',
      reviewActorId: 'operator_fixture',
      reason: 'foreign cash: Stripe CLI drill 2026-11-07',
    };

    await expect(lifecycle(listCases)).resolves.toEqual({
      cases: [expect.objectContaining({ id: caseId, attributed: false, state: 'open' })],
    });
    await expect(lifecycle(resolveCase)).resolves.toEqual({ caseId, before: 'open', after: 'resolved' });
    await expect(lifecycle(listCases)).resolves.toEqual({ cases: [] });
    await expect(lifecycle(resolveCase)).resolves.toEqual({ caseId, before: 'resolved', after: 'resolved' });
    const [resolved] = await database
      .select()
      .from(schema.billingFinancialCase)
      .where(eq(schema.billingFinancialCase.id, caseId));
    expect(resolved).toEqual(
      expect.objectContaining({
        state: 'resolved',
        accountId: null,
        resolutionEvidence: {
          disposition: 'resolved',
          reviewActorId: 'operator_fixture',
          reason: 'foreign cash: Stripe CLI drill 2026-11-07',
          previousState: 'open',
        },
      }),
    );
  });
});
