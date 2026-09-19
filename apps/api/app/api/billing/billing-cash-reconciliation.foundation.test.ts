import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { cashProjectionDigest, cashProjectionEvidenceSchema } from '#api/billing/billing-payment-contract.js';
import {
  BillingCashReconciliationService,
  assertNewCollectionCashScope,
} from '#api/billing/billing-cash-reconciliation.service.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const database = drizzle(adminClient, { schema });
afterAll(async () => adminClient.end());

describe('cash reconciliation foundation', () => {
  it('retains one immutable fact with complete coverage in overlapping scans', async () => {
    const firstScan = randomUUID();
    const secondScan = randomUUID();
    const common = {
      environment: 'development',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      currency: 'usd',
      windowStart: new Date('2026-01-02T00:00:00Z'),
      windowEnd: new Date('2026-01-03T00:00:00Z'),
      lookbackStart: new Date('2026-01-01T00:00:00Z'),
    };
    await database.insert(schema.billingCashScan).values([
      { id: firstScan, ...common },
      {
        id: secondScan,
        ...common,
        windowStart: new Date('2026-01-02T01:00:00Z'),
        windowEnd: new Date('2026-01-03T01:00:00Z'),
      },
    ]);
    const factId = randomUUID();
    await database.insert(schema.billingCashFact).values({
      id: factId,
      scanId: firstScan,
      environment: 'development',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      sourceType: 'balance_transaction',
      sourceId: `txn_${randomUUID()}`,
      sourceCreatedAt: new Date('2026-01-02T12:00:00Z'),
      currency: 'usd',
      amountMinor: 500n,
      feeMinor: 20n,
      netMinor: 480n,
      objectDigest: '1'.repeat(64),
      evidence: { status: 'available' },
    });
    await database.insert(schema.billingCashScanFact).values([
      { scanId: firstScan, factId },
      { scanId: secondScan, factId },
    ]);
    const facts = await database.select().from(schema.billingCashFact).where(eq(schema.billingCashFact.id, factId));
    const coverage = await database
      .select()
      .from(schema.billingCashScanFact)
      .where(eq(schema.billingCashScanFact.factId, factId));
    expect(facts).toHaveLength(1);
    expect(coverage.map((row) => row.scanId).sort()).toEqual([firstScan, secondScan].sort());
  });

  it('rejects omitted and unsorted source coverage before a money mutation', () => {
    const evidence = {
      version: 'stripe-cash-projection-v1',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      customerId: 'cus_1',
      paymentIntentId: 'pi_1',
      chargeId: 'ch_1',
      currency: 'usd',
      originalPrincipalMinor: '500',
      originalTaxMinor: '0',
      originalGrossMinor: '500',
      principalLossMinor: '0',
      taxLossMinor: '0',
      grossLossMinor: '0',
      refundIds: ['re_2', 're_1'],
      disputeIds: [],
      balanceTransactionIds: [],
    };
    expect(cashProjectionEvidenceSchema.safeParse(evidence).success).toBe(false);
    expect(() => cashProjectionDigest({ ...evidence, refundIds: ['re_1', 're_2'], omitted: true })).toThrow();
  });
  it('pauses new collection for the account a purchase-lane case names and for no other', async () => {
    const accountId = randomUUID();
    const independentAccountId = randomUUID();
    await database.insert(schema.creditAccount).values([
      { id: accountId, environment: 'development' },
      { id: independentAccountId, environment: 'development' },
    ]);
    await database.insert(schema.billingFinancialCase).values({
      id: randomUUID(),
      environment: 'development',
      stripeAccountId: 'acct_scope_fixture',
      livemode: false,
      kind: 'entitlement_source_disagreement',
      dedupeKey: `subscription:${accountId}`,
      accountId,
      sourceType: 'subscription',
      sourceId: accountId,
      evidence: { reasons: ['subscription_status_mismatch'] },
      owner: 'billing-operations',
      nextStep: 'qualify_source_entitlement_and_realign',
      firstEffectiveAt: new Date(),
    });
    const scope = { environment: 'development', stripeAccountId: 'acct_scope_fixture', livemode: false } as const;

    await expect(assertNewCollectionCashScope({ database }, scope, accountId)).rejects.toThrow('cash_scope_attention');
    await expect(assertNewCollectionCashScope({ database }, scope, independentAccountId)).resolves.toBeUndefined();
  });

  it('lets an operator re-scope an unattributed case only once its owned successor exists, then resolve it', async () => {
    const stripeAccountId = `acct_operator_${randomUUID()}`;
    const scope = { environment: 'development', stripeAccountId, livemode: false } as const;
    const accountId = randomUUID();
    const bystanderId = randomUUID();
    await database.insert(schema.creditAccount).values([
      { id: accountId, environment: 'development' },
      { id: bystanderId, environment: 'development' },
    ]);
    const sourceId = `re_${randomUUID()}`;
    const row = (id: string, owner: string | undefined) => ({
      id,
      ...scope,
      kind: 'refund_unresolved',
      dedupeKey: owner === undefined ? `refund_unresolved:${sourceId}` : `refund_unresolved:${sourceId}:${owner}`,
      accountId: owner,
      sourceType: 'refund',
      sourceId,
      evidence: {},
      owner: 'billing-operations',
      nextStep: 'qualify_source_and_resolve',
      firstEffectiveAt: new Date(),
    });
    const unattributed = randomUUID();
    await database.insert(schema.billingFinancialCase).values(row(unattributed, undefined));
    const operator = new BillingCashReconciliationService({ database }, {} as unknown as Stripe, scope);
    const request = {
      environment: 'development',
      caseId: unattributed,
      disposition: 'rescoped',
      reviewActorId: 'operator_fixture',
      reason: 'CL12 re-scope',
    } as const;
    // An unattributed case still pauses new collection for everyone on this Stripe account.
    await expect(assertNewCollectionCashScope({ database }, scope, bystanderId)).rejects.toThrow(
      'cash_scope_attention',
    );
    await expect(operator.resolveCaseByOperator(request)).rejects.toThrow('case_rescope_unowned');

    const owned = randomUUID();
    await database.insert(schema.billingFinancialCase).values(row(owned, accountId));
    await expect(operator.resolveCaseByOperator(request)).resolves.toEqual({
      caseId: unattributed,
      before: 'open',
      after: 'resolved',
    });
    await expect(assertNewCollectionCashScope({ database }, scope, bystanderId)).resolves.toBeUndefined();
    await expect(assertNewCollectionCashScope({ database }, scope, accountId)).rejects.toThrow('cash_scope_attention');

    await expect(
      operator.resolveCaseByOperator({ ...request, caseId: owned, disposition: 'resolved', reason: 'refund reviewed' }),
    ).resolves.toEqual({ caseId: owned, before: 'open', after: 'resolved' });
    await expect(assertNewCollectionCashScope({ database }, scope, accountId)).resolves.toBeUndefined();
    const [resolved] = await database
      .select()
      .from(schema.billingFinancialCase)
      .where(eq(schema.billingFinancialCase.id, owned));
    expect(resolved?.resolutionEvidence).toEqual({
      disposition: 'resolved',
      reviewActorId: 'operator_fixture',
      reason: 'refund reviewed',
      previousState: 'open',
    });
  });
});
