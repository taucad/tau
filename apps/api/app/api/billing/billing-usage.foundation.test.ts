import { seedPaidPurchase, fulfillPaidFixture } from '#testing/billing-payment.fixture.js';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingBudget,
  billingBudgetFunding,
  billingBudgetHold,
  billingOwnerBinding,
  billingPolicyActivation,
  creditAccount,
  creditOperation,
  creditTransaction,
  supplierCostEvidence,
  user,
} from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import type { QualifiedAdmissionInput } from '#api/billing/credit-ledger.types.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const firstClient = postgres(databaseUrl, { max: 1 });
const secondClient = postgres(databaseUrl, { max: 1 });
const database = drizzle(firstClient, { schema });
const secondDatabase = drizzle(secondClient, { schema });
const policyService = new BillingPolicyService({ database });
const ledger = new CreditLedgerService({ database }, policyService);
const secondPolicyService = new BillingPolicyService({ database: secondDatabase });
const secondLedger = new CreditLedgerService({ database: secondDatabase }, secondPolicyService);
const usage = new BillingUsageService(
  { database },
  new ConfigService(
    Object.fromEntries([
      ['BILLING_ENVIRONMENT', 'development'],
      ['BILLING_USAGE_CURSOR_SECRET', 'c03-test-cursor-secret-is-at-least-32-bytes'],
    ]),
  ),
);
const required = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`${label} missing`);
  }
  return value;
};
afterAll(async () => Promise.all([firstClient.end(), secondClient.end()]));

const createFixture = async () => {
  const suffix = randomUUID();
  const environment = 'development';
  const userId = `usage-user-${suffix}`;
  const sku = `usage-sku-${suffix}`;
  const meterContractId = `usage-meter-${suffix}`;
  const spendBudgetId = `usage-spend-${suffix}`;
  const riskBudgetId = `usage-risk-${suffix}`;
  const spendFundingId = `usage-spend-funding-${suffix}`;
  const riskFundingId = `usage-risk-funding-${suffix}`;
  await database
    .insert(user)
    .values({ id: userId, name: 'Usage owner', email: `${suffix}@test.invalid`, emailVerified: true });
  await database.insert(billingBudgetFunding).values([
    { id: spendFundingId, environment, kind: 'spend', scope: suffix, fundedLifetime: 1_000_000n },
    { id: riskFundingId, environment, kind: 'risk', scope: suffix, fundedLifetime: 1_000_000n },
  ]);
  await database.insert(billingBudget).values([
    {
      id: spendBudgetId,
      environment,
      fundingId: spendFundingId,
      kind: 'spend',
      scope: suffix,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
    {
      id: riskBudgetId,
      environment,
      fundingId: riskFundingId,
      kind: 'risk',
      scope: suffix,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
  ]);
  const rateId = `usage-rate-${suffix}`;
  const cacheShortRateId = `usage-cache-short-${suffix}`;
  const cacheLongRateId = `usage-cache-long-${suffix}`;
  const cacheReadRateId = `usage-cache-read-${suffix}`;
  const outputRateId = `usage-output-${suffix}`;
  qualifiedMeterContracts.set(
    meterContractId,
    new Set(['uncached_input:', 'cache_write:5m', 'cache_write:1h', 'cache_read:', 'output:']),
  );
  const policy = validateCommercialPolicy({
    schemaVersion: 1,
    environment,
    markupBps: 0,
    offers: [
      {
        offerId: `usage-pro-${suffix}`,
        kind: 'pro_monthly',
        currency: 'usd',
        principalMinor: '1',
        grantCreditAtoms: '1',
        ceilingCreditAtoms: '1',
      },
      {
        offerId: `usage-top-up-${suffix}`,
        kind: 'top_up',
        currency: 'usd',
        minimumPrincipalMinor: '1',
        maximumPrincipalMinor: '1',
        creditAtomsPerPrincipalMinor: '1',
      },
    ],
    promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    policyVersion: `usage-${suffix}`,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
    rates: [
      {
        rateId,
        meterContractId,
        dimension: 'uncached_input',
        tier: null,
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
      {
        rateId: cacheShortRateId,
        meterContractId,
        dimension: 'cache_write',
        tier: '5m',
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
      {
        rateId: cacheLongRateId,
        meterContractId,
        dimension: 'cache_write',
        tier: '1h',
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
      {
        rateId: cacheReadRateId,
        meterContractId,
        dimension: 'cache_read',
        tier: null,
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
      {
        rateId: outputRateId,
        meterContractId,
        dimension: 'output',
        tier: null,
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
    ],
    routes: [
      {
        routeId: `usage-route-${suffix}`,
        sku,
        meterContractId,
        rateIds: [rateId, cacheShortRateId, cacheLongRateId, cacheReadRateId, outputRateId],
        enabled: true,
        spendBudgetId,
        riskBudgetId,
      },
    ],
  });
  const activationId = `usage-activation-${suffix}`;
  await seedBillingFixturePolicy({ database, policy: policy.policy, activationId });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId: userId });
  const { purchaseId } = await seedPaidPurchase({ database, accountId, environment, atoms: 1000n });
  await fulfillPaidFixture({
    database,
    ledger,
    source: 'purchased',
    accountId,
    causeId: purchaseId,
  });
  const replica = { schemaVersion: 1, meterContractIds: policy.policy.fleet.meterContractIds };
  return { userId, accountId, sku, meterContractId, spendBudgetId, riskBudgetId, activationId, replica };
};

const admission = (fixture: Awaited<ReturnType<typeof createFixture>>, key: string): QualifiedAdmissionInput => ({
  environment: 'development',
  authUserId: fixture.userId,
  surface: 'chat',
  attemptKey: key,
  requestDigest: `sha256:${key}`,
  requestKeyVersion: 1,
  category: 'llm',
  modelId: 'historical-model',
  modelDisplayName: 'Historical Model',
  providerId: 'provider-test',
  activity: 'agent',
  projectHint: 'project-deleted-later',
  chatHint: 'chat-hint',
  sku: fixture.sku,
  maximumQuantities: [
    { dimension: 'uncached_input', tier: null, quantity: 10n },
    { dimension: 'cache_write', tier: '5m', quantity: 0n },
    { dimension: 'cache_write', tier: '1h', quantity: 0n },
    { dimension: 'cache_read', tier: null, quantity: 0n },
    { dimension: 'output', tier: null, quantity: 0n },
  ],
  supplierMaximumPicoUsd: 10n,
  replica: fixture.replica,
  executionDeadline: new Date(Date.now() + 300_000),
});

describe('BillingUsageService PostgreSQL foundation', () => {
  it('should expose admission holds at a new revision without creating a synthetic journal row', async () => {
    const fixture = await createFixture();
    const before = await usage.getBalance({ authUserId: fixture.userId, rawQuery: {} });
    const admitted = await ledger.admitOperation(admission(fixture, 'hold-revision'));
    expect(admitted.status).toBe('admitted');
    const after = await usage.getBalance({
      authUserId: fixture.userId,
      rawQuery: { minRevision: (BigInt(before.snapshotRevision) + 1n).toString() },
    });
    expect(BigInt(after.snapshotRevision)).toBe(BigInt(before.snapshotRevision) + 1n);
    expect(required(after.balance ?? undefined, 'available balance').purchasedHeldCreditAtoms).toBe('10');
    expect(after.journalTotals).toEqual(before.journalTotals);
    const replay = await ledger.admitOperation(admission(fixture, 'hold-revision'));
    expect(replay.status).toBe('replay');
    const replayBalance = await usage.getBalance({ authUserId: fixture.userId, rawQuery: {} });
    expect(replayBalance.snapshotRevision).toBe(after.snapshotRevision);
  });

  it('should page immutable signed history and expose corrections only at a new snapshot', async () => {
    const fixture = await createFixture();
    const receipts = [];
    const later = await Promise.all(
      ['later-settled', 'later-released', 'later-absorbed'].map(async (key) => {
        const admitted = await ledger.admitOperation({
          ...admission(fixture, key),
          ...(key === 'later-settled'
            ? { modelId: 'second-model', modelDisplayName: 'Second Model', activity: 'completion' }
            : {}),
        });
        if (admitted.status !== 'admitted') {
          throw new Error('later operation was not admitted');
        }
        return { key, admitted };
      }),
    );
    for (const key of ['history-a', 'history-b']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential financial operations establish deterministic account revisions
      const admitted = await ledger.admitOperation(admission(fixture, key));
      if (admitted.status !== 'admitted') {
        throw new Error('usage operation was not admitted');
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- dispatch intent establishes immutable range membership before execution
      expect(await ledger.markDispatchIntent(admitted.operationId, admitted.generation)).toBe(true);
      receipts.push(
        // oxlint-disable-next-line eslint/no-await-in-loop -- terminal revisions must be ordered for cursor assertions
        await ledger.terminalizeOperation({
          operationId: admitted.operationId,
          accountId: fixture.accountId,
          requestDigest: `sha256:${key}`,
          expectedGeneration: admitted.generation,
          evidence: {
            kind: 'final_usage',
            usageOccurredAt: new Date(0),
            executionStatus: 'succeeded',
            meterItems: [
              { dimension: 'uncached_input', tier: null, quantity: key === 'history-a' ? 10n : 1n },
              { dimension: 'cache_write', tier: '5m', quantity: 0n },
              { dimension: 'cache_write', tier: '1h', quantity: 0n },
              { dimension: 'cache_read', tier: null, quantity: 0n },
              { dimension: 'output', tier: null, quantity: 0n },
            ],
            normalizationEvidence: { version: 'test-v1', providerRequestId: `request-${key}`, fields: { input: '1' } },
          },
          resolvedAt: new Date(),
        }),
      );
    }
    const page1 = await usage.getUsage({ authUserId: fixture.userId, rawQuery: { range: 'all_time', pageSize: '1' } });
    expect(page1.totals).toMatchObject({ accountDeltaCreditAtoms: '-11', netUsedCreditAtoms: '11', eventCount: '2' });
    expect(page1.rows?.items).toHaveLength(1);
    expect(page1.rows?.items[0]).toMatchObject({
      kind: 'base',
      model: { id: 'historical-model', displayName: 'Historical Model', providerId: 'provider-test' },
      activity: { kind: 'agent', projectHint: 'project-deleted-later' },
      executionStatus: 'succeeded',
      meteringStatus: 'complete',
    });
    const cursor = required(page1.rows?.nextCursor ?? undefined, 'rows cursor');
    const correctionId = `usage-compensation-${randomUUID()}`;
    await secondLedger.applyCompensation({
      accountId: fixture.accountId,
      originalTransactionId: receipts[0]!.baseTransactionId,
      compensationId: correctionId,
      atoms: 9n,
      occurredAt: new Date(),
    });
    await secondLedger.applyCompensation({
      accountId: fixture.accountId,
      originalTransactionId: receipts[0]!.baseTransactionId,
      compensationId: `usage-compensation-${randomUUID()}`,
      atoms: 1n,
      occurredAt: new Date(),
    });
    await expect(
      secondLedger.applyCompensation({
        accountId: fixture.accountId,
        originalTransactionId: receipts[0]!.baseTransactionId,
        compensationId: `usage-compensation-excess-${randomUUID()}`,
        atoms: 1n,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow('exceeds original charge');
    for (const { key, admitted } of later) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- second connection commits distinct post-snapshot terminal revisions
      await secondLedger.terminalizeOperation({
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: `sha256:${key}`,
        expectedGeneration: admitted.generation,
        evidence:
          key === 'later-released'
            ? { kind: 'provider_rejected', executionStatus: 'rejected' }
            : key === 'later-absorbed'
              ? { kind: 'absorbed_unknown', executionStatus: 'failed' }
              : {
                  kind: 'final_usage',
                  usageOccurredAt: new Date(0),
                  executionStatus: 'succeeded',
                  meterItems: [
                    { dimension: 'uncached_input', tier: null, quantity: 1n },
                    { dimension: 'cache_write', tier: '5m', quantity: 0n },
                    { dimension: 'cache_write', tier: '1h', quantity: 0n },
                    { dimension: 'cache_read', tier: null, quantity: 0n },
                    { dimension: 'output', tier: null, quantity: 0n },
                  ],
                },
        resolvedAt: new Date(),
      });
    }
    const page2 = await usage.getUsage({
      authUserId: fixture.userId,
      rawQuery: { range: 'all_time', pageSize: '1', collection: 'rows', cursor },
    });
    expect(page2.snapshotRevision).toBe(page1.snapshotRevision);
    expect(page2.totals).toEqual(page1.totals);
    expect(page2.rows?.items).toHaveLength(1);
    await expect(
      usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', pageSize: '1', collection: 'days', cursor },
      }),
    ).rejects.toThrow('billing cursor');
    await expect(
      usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', pageSize: '1', collection: 'rows', cursor: `${cursor.slice(0, -1)}x` },
      }),
    ).rejects.toThrow('billing cursor');
    await expect(
      usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', pageSize: '1', collection: 'rows', cursor, models: ['other-model'] },
      }),
    ).rejects.toThrow('billing cursor');
    await expect(
      usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', timezone: 'Pacific/Auckland', pageSize: '1', collection: 'rows', cursor },
      }),
    ).rejects.toThrow('billing cursor');
    await expect(
      usage.getUsage({
        authUserId: `wrong-${randomUUID()}`,
        rawQuery: { range: 'all_time', pageSize: '1', collection: 'rows', cursor },
      }),
    ).rejects.toThrow('billing cursor');
    const fresh = await usage.getUsage({ authUserId: fixture.userId, rawQuery: { range: 'all_time' } });
    expect(fresh.totals).toMatchObject({ accountDeltaCreditAtoms: '-2', netUsedCreditAtoms: '2', eventCount: '7' });
    expect(fresh.rows?.items.filter(({ kind }) => kind === 'correction')).toHaveLength(2);
    const correctionDeltas = fresh.rows?.items
      .filter((item) => item.kind === 'correction')
      .map((item) => BigInt(item.accountDeltaCreditAtoms))
      .sort((left, right) => Number(left - right));
    expect(correctionDeltas).toEqual([1n, 9n]);
    expect(correctionDeltas?.map((delta) => -delta)).toEqual([-1n, -9n]);
    expect(fresh.days?.items.reduce((sum, item) => sum + BigInt(item.accountDeltaCreditAtoms), 0n)).toBe(-2n);
    expect(fresh.days?.items.reduce((sum, item) => sum + BigInt(item.eventCount), 0n)).toBe(7n);
    for (const collection of ['days', 'models', 'activities'] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each independently signed collection cursor is exercised in turn
      const groupedPage1 = await usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', pageSize: '1', collection },
      });
      const grouped = groupedPage1[collection];
      if (!grouped || grouped.nextCursor === null) {
        throw new Error(`${collection} continuation missing`);
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- continuation must retain the independently captured snapshot
      const groupedPage2 = await usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', pageSize: '1', collection, cursor: grouped.nextCursor },
      });
      expect(groupedPage2.snapshotRevision).toBe(groupedPage1.snapshotRevision);
      expect(groupedPage2.totals).toEqual(groupedPage1.totals);
      expect(groupedPage2[collection]?.items).toHaveLength(1);
    }
    const balancePage = await usage.getBalance({ authUserId: fixture.userId, rawQuery: { pageSize: '1' } });
    const balanceHistory = required(balancePage.history ?? undefined, 'available balance history');
    if (balancePage.availability.state !== 'available' || balanceHistory.nextCursor === null) {
      throw new Error('balance history continuation missing');
    }
    const balancePage2 = await usage.getBalance({
      authUserId: fixture.userId,
      rawQuery: { pageSize: '1', historyCursor: balanceHistory.nextCursor },
    });
    expect(balancePage2).toMatchObject({
      snapshotRevision: balancePage.snapshotRevision,
      journalTotals: balancePage.journalTotals,
    });
    const correctionPage = await usage.getOperationReceipt({
      authUserId: fixture.userId,
      operationId: receipts[0]!.operationId,
      rawQuery: { pageSize: '1' },
    });
    expect(correctionPage).toMatchObject({
      state: 'terminal',
      correctionTotalCreditAtoms: '10',
      corrections: { items: [expect.objectContaining({ kind: 'correction' })], complete: false },
    });
    if (correctionPage.state !== 'terminal' || correctionPage.corrections.nextCursor === null) {
      throw new Error('correction continuation missing');
    }
    const correctionPage2 = await usage.getOperationReceipt({
      authUserId: fixture.userId,
      operationId: receipts[0]!.operationId,
      rawQuery: { pageSize: '1', correctionCursor: correctionPage.corrections.nextCursor },
    });
    expect(correctionPage2).toMatchObject({
      state: 'terminal',
      correctionTotalCreditAtoms: '10',
      corrections: { items: [expect.objectContaining({ kind: 'correction' })], complete: true, nextCursor: null },
    });
    const receiptBeforeSupplier = await usage.getOperationReceipt({
      authUserId: fixture.userId,
      operationId: receipts[1]!.operationId,
      rawQuery: {},
    });
    const supplierSourceId = `supplier-object-${randomUUID()}`;
    expect(
      await ledger.appendSupplierEvidence({
        operationId: receipts[1]!.operationId,
        environment: 'development',
        provider: 'provider-test',
        credentialAccount: `credential-${randomUUID()}`,
        sourceObjectId: supplierSourceId,
        sourceRevision: 'final-1',
        payloadDigest: `sha256:${randomUUID()}`,
        currency: 'usd',
        numerator: 1n,
        denominator: 1_000_000_000_000n,
        completeness: 'complete',
        finality: 'final',
        receivedAt: new Date(),
      }),
    ).toBe('inserted');
    const [supplierEvidence] = await database
      .select()
      .from(supplierCostEvidence)
      .where(eq(supplierCostEvidence.sourceObjectId, supplierSourceId));
    expect(
      await ledger.finalizeSupplier({
        evidenceId: required(supplierEvidence, 'supplier evidence').id,
        operationId: receipts[1]!.operationId,
        accountId: fixture.accountId,
        requestDigest: 'sha256:history-b',
        expectedGeneration: 1n,
      }),
    ).toBe('final');
    const receiptAfterSupplier = await usage.getOperationReceipt({
      authUserId: fixture.userId,
      operationId: receipts[1]!.operationId,
      rawQuery: {},
    });
    expect(receiptAfterSupplier.state).toBe('terminal');
    expect(receiptBeforeSupplier.state).toBe('terminal');
    if (receiptAfterSupplier.state === 'terminal' && receiptBeforeSupplier.state === 'terminal') {
      expect(receiptAfterSupplier.receipt).toEqual(receiptBeforeSupplier.receipt);
    }
    const wrongOwnerId = `wrong-${randomUUID()}`;
    await expect(
      usage.getOperationReceipt({ authUserId: wrongOwnerId, operationId: receipts[1]!.operationId, rawQuery: {} }),
    ).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'authority_unavailable',
      ownerId: wrongOwnerId,
      snapshotRevision: '0',
    });
    await expect(
      usage.getUsage({
        authUserId: fixture.userId,
        rawQuery: { range: 'all_time', minRevision: (BigInt(fresh.snapshotRevision) + 1n).toString() },
      }),
    ).resolves.toMatchObject({ availability: { state: 'unavailable', reason: 'revision_unavailable' }, totals: null });
  });

  it('should return an honest empty snapshot without creating financial identity', async () => {
    const userId = `unbound-${randomUUID()}`;
    await database.insert(user).values({ id: userId, name: 'Unbound', email: `${userId}@test.invalid` });
    const [before] = await secondDatabase.execute(sql`select count(*)::int count from billing.credit_account`);
    const empty = await usage.getUsage({ authUserId: userId, rawQuery: {} });
    expect(empty).toMatchObject({
      ownerId: userId,
      snapshotRevision: '0',
      availability: { state: 'available' },
      totals: { eventCount: '0' },
    });
    const [after] = await secondDatabase.execute(sql`select count(*)::int count from billing.credit_account`);
    expect(after?.['count']).toBe(before?.['count']);
  });

  it('should preserve tiered cache-write meters and truthful unknown-time coverage', async () => {
    const fixture = await createFixture();
    const cacheRequest = {
      ...admission(fixture, 'tiered-cache'),
      maximumQuantities: [
        { dimension: 'uncached_input', tier: null, quantity: 0n },
        { dimension: 'cache_write', tier: '5m', quantity: 100n },
        { dimension: 'cache_write', tier: '1h', quantity: 200n },
        { dimension: 'cache_read', tier: null, quantity: 0n },
        { dimension: 'output', tier: null, quantity: 0n },
      ],
    };
    const cached = await ledger.admitOperation(cacheRequest);
    if (cached.status !== 'admitted') {
      throw new Error('cache operation was not admitted');
    }
    await ledger.markDispatchIntent(cached.operationId, cached.generation);
    await ledger.terminalizeOperation({
      operationId: cached.operationId,
      accountId: fixture.accountId,
      requestDigest: cacheRequest.requestDigest,
      expectedGeneration: cached.generation,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(0),
        executionStatus: 'succeeded',
        meterItems: [
          { dimension: 'cache_write', tier: '1h', quantity: 200n },
          { dimension: 'uncached_input', tier: null, quantity: 0n },
          { dimension: 'cache_write', tier: '5m', quantity: 100n },
          { dimension: 'cache_read', tier: null, quantity: 0n },
          { dimension: 'output', tier: null, quantity: 0n },
        ],
      },
      resolvedAt: new Date(),
    });
    const unknown = await ledger.admitOperation(admission(fixture, 'unknown-time'));
    if (unknown.status !== 'admitted') {
      throw new Error('unknown-time operation was not admitted');
    }
    await ledger.terminalizeOperation({
      operationId: unknown.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:unknown-time',
      expectedGeneration: unknown.generation,
      evidence: {
        kind: 'absorbed_unknown',
        executionStatus: 'failed',
        meterItems: [{ dimension: 'output', tier: null, quantity: 2n }],
        reasoningTokens: 1n,
        normalizationEvidence: { version: 'partial-v1', fields: { output: '2', reasoning: '1' } },
      },
      resolvedAt: new Date(),
    });
    const allTime = await usage.getUsage({ authUserId: fixture.userId, rawQuery: { range: 'all_time' } });
    const cacheRow = allTime.rows?.items.find(({ operationId }) => operationId === cached.operationId);
    expect(cacheRow).toMatchObject({
      kind: 'base',
      tokens: { cacheWrite: '300', inputTotal: '300' },
      meterItems: [
        { dimension: 'cache_write', tier: '1h', quantity: '200' },
        { dimension: 'uncached_input', quantity: '0' },
        { dimension: 'cache_write', tier: '5m', quantity: '100' },
        { dimension: 'cache_read', quantity: '0' },
        { dimension: 'output', quantity: '0' },
      ],
    });
    expect(allTime.rows?.items.find(({ operationId }) => operationId === unknown.operationId)).toMatchObject({
      timingStatus: 'unavailable',
      usageOccurredAt: null,
      meteringStatus: 'partial',
      tokens: {
        status: 'partial',
        uncachedInput: null,
        cacheRead: null,
        cacheWrite: null,
        inputTotal: null,
        output: '2',
        reasoning: '1',
      },
    });
    expect(allTime.coverage.excludedUnknownTimeCount).toBe('0');
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2))
      .toISOString()
      .slice(0, 10);
    const bounded = await usage.getUsage({
      authUserId: fixture.userId,
      rawQuery: { range: 'custom', startDate, endDate, timezone: 'Pacific/Auckland' },
    });
    expect(bounded.availability).toEqual({ state: 'partial', reason: 'source_incomplete' });
    expect(bounded.coverage.excludedUnknownTimeCount).toBe('1');
    expect(bounded.rows?.items.some(({ operationId }) => operationId === unknown.operationId)).toBe(false);
  });

  it('should expose coherent pre-C03 history without inventing missing legacy evidence', async () => {
    const fixture = await createFixture();
    const operationId = `legacy-operation-${randomUUID()}`;
    const transactionId = `legacy-transaction-${randomUUID()}`;
    const spendHoldId = `legacy-spend-hold-${randomUUID()}`;
    const riskHoldId = `legacy-risk-hold-${randomUUID()}`;
    const activationId = await database
      .select({ id: billingPolicyActivation.id, policyId: billingPolicyActivation.policyId })
      .from(billingPolicyActivation)
      .where(eq(billingPolicyActivation.id, fixture.activationId))
      .limit(1)
      .then((rows) => required(rows[0], 'legacy fixture activation'));
    await database.transaction(async (transaction) => {
      const account = await transaction
        .select()
        .from(creditAccount)
        .where(eq(creditAccount.id, fixture.accountId))
        .for('update')
        .then((rows) => required(rows[0], 'legacy fixture account'));
      const revision = account.revision + 1n;
      await transaction.insert(creditOperation).values({
        id: operationId,
        accountId: fixture.accountId,
        environment: 'development',
        surface: 'chat',
        attemptKey: `legacy-attempt-${randomUUID()}`,
        requestDigest: `sha256:legacy-${randomUUID()}`,
        requestKeyVersion: 1,
        category: 'llm',
        modelId: 'legacy-model-id',
        historyVersion: null,
        modelDisplayName: null,
        providerId: null,
        projectHint: null,
        chatHint: null,
        admittedAt: null,
        dispatchIntentAt: null,
        sku: fixture.sku,
        pinnedTariff: [],
        maximumQuantities: [],
        activity: 'legacy-unclassified',
        policyId: activationId.policyId,
        activationId: activationId.id,
        meterContractId: fixture.meterContractId,
        authorizedAtoms: 0n,
        promoHeldAtoms: 0n,
        planHeldAtoms: 0n,
        purchasedHeldAtoms: 0n,
        spendBudgetHoldId: spendHoldId,
        riskBudgetHoldId: riskHoldId,
        dispatchState: 'accepted',
        customerState: 'pending',
        supplierState: 'final',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        usageOccurredAt: null,
      });
      await transaction.insert(billingBudgetHold).values([
        {
          id: spendHoldId,
          budgetId: fixture.spendBudgetId,
          operationId,
          initialBound: 0n,
          remainingHeld: 0n,
          consumed: 0n,
          finalityState: 'final',
        },
        {
          id: riskHoldId,
          budgetId: fixture.riskBudgetId,
          operationId,
          initialBound: 0n,
          remainingHeld: 0n,
          consumed: 0n,
          finalityState: 'final',
        },
      ]);
      await transaction.insert(creditTransaction).values({
        id: transactionId,
        accountId: fixture.accountId,
        revision,
        kind: 'operation_resolution',
        operationId,
        promoDeltaAtoms: 0n,
        planDeltaAtoms: 0n,
        purchasedDeltaAtoms: 0n,
        debtDeltaAtoms: 0n,
        accountDeltaAtoms: 0n,
        balanceAfterAtoms: account.promoAtoms + account.planAtoms + account.purchasedAtoms - account.debtAtoms,
        occurredAt: new Date('2020-01-01T00:00:00.000Z'),
      });
      await transaction.update(creditAccount).set({ revision }).where(eq(creditAccount.id, fixture.accountId));
      await transaction
        .update(creditOperation)
        .set({
          customerState: 'released',
          resolvedAt: new Date('2020-01-01T00:00:00.000Z'),
          terminalRevision: revision,
          baseTransactionId: transactionId,
          chargedAtoms: 0n,
        })
        .where(eq(creditOperation.id, operationId));
    });
    const allTime = await usage.getUsage({ authUserId: fixture.userId, rawQuery: { range: 'all_time' } });
    expect(allTime.availability).toEqual({ state: 'partial', reason: 'legacy_coverage' });
    expect(allTime.coverage).toMatchObject({ complete: true, detailComplete: false, excludedUnknownTimeCount: '0' });
    const legacyRow = required(
      allTime.rows?.items.find((row) => row.operationId === operationId),
      'legacy usage row',
    );
    expect(legacyRow).toMatchObject({
      kind: 'base',
      historyVersion: null,
      model: { id: 'legacy-model-id', displayName: null, providerId: null },
      activity: { kind: 'other', projectHint: null, chatHint: null },
      usageOccurredAt: null,
      timingStatus: 'unavailable',
      executionStatus: 'unknown',
      meteringStatus: 'unavailable',
      meterItems: [],
      tokens: {
        status: 'unavailable',
        uncachedInput: null,
        cacheRead: null,
        cacheWrite: null,
        inputTotal: null,
        output: null,
      },
    });
    const receipt = await usage.getOperationReceipt({
      authUserId: fixture.userId,
      operationId,
      rawQuery: {},
    });
    expect(receipt).toMatchObject({ state: 'terminal', receipt: legacyRow });
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2))
      .toISOString()
      .slice(0, 10);
    const bounded = await usage.getUsage({
      authUserId: fixture.userId,
      rawQuery: { range: 'custom', startDate, endDate, timezone: 'UTC' },
    });
    expect(bounded.availability).toEqual({ state: 'partial', reason: 'legacy_coverage' });
    expect(bounded.coverage).toMatchObject({ complete: false, detailComplete: false, excludedUnknownTimeCount: '1' });
    expect(bounded.rows?.items.some((row) => row.operationId === operationId)).toBe(false);
    const filtered = await usage.getUsage({
      authUserId: fixture.userId,
      rawQuery: { range: 'all_time', models: ['different-model'] },
    });
    expect(filtered.availability).toEqual({ state: 'available', reason: null });
    expect(filtered.coverage).toMatchObject({ complete: true, detailComplete: true, excludedUnknownTimeCount: '0' });
    expect(filtered.totals).toMatchObject({ accountDeltaCreditAtoms: '0', netUsedCreditAtoms: '0', eventCount: '0' });
    expect(filtered.rows?.items).toEqual([]);
  });

  it('should use bounded production keyset plans for representative first and continuation pages', async () => {
    const fixture = await createFixture();
    const baseTransactions: string[] = [];
    for (let index = 0; index < 128; index += 1) {
      const key = `plan-${index.toString().padStart(3, '0')}`;
      // oxlint-disable-next-line eslint/no-await-in-loop -- real ledger revisions and account locks establish representative durable history
      const admitted = await ledger.admitOperation(admission(fixture, key));
      if (admitted.status !== 'admitted') {
        throw new Error(`representative operation ${key} was not admitted`);
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- production dispatch precedes each terminal financial mutation
      await ledger.markDispatchIntent(admitted.operationId, admitted.generation);
      // oxlint-disable-next-line eslint/no-await-in-loop -- terminal revisions intentionally form one account's ordered keyset
      const receipt = await ledger.terminalizeOperation({
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: `sha256:${key}`,
        expectedGeneration: admitted.generation,
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(),
          executionStatus: 'succeeded',
          meterItems: [
            { dimension: 'uncached_input', tier: null, quantity: 1n },
            { dimension: 'cache_write', tier: '5m', quantity: 0n },
            { dimension: 'cache_write', tier: '1h', quantity: 0n },
            { dimension: 'cache_read', tier: null, quantity: 0n },
            { dimension: 'output', tier: null, quantity: 0n },
          ],
        },
        resolvedAt: new Date(),
      });
      baseTransactions.push(receipt.baseTransactionId);
    }
    for (const [index, originalTransactionId] of baseTransactions.slice(0, 64).entries()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each correction is a real capped financial mutation against a distinct base receipt
      await ledger.applyCompensation({
        accountId: fixture.accountId,
        originalTransactionId,
        compensationId: `plan-compensation-${index}-${randomUUID()}`,
        atoms: 1n,
        occurredAt: new Date(),
      });
    }
    await database.execute(sql`analyze billing.credit_operation, billing.credit_transaction`);
    const firstPage = await usage.getUsage({
      authUserId: fixture.userId,
      rawQuery: { range: 'all_time', collection: 'rows', pageSize: '32' },
    });
    const continuationCursor = required(firstPage.rows?.nextCursor ?? undefined, 'representative rows cursor');
    const continuationPage = await usage.getUsage({
      authUserId: fixture.userId,
      rawQuery: {
        range: 'all_time',
        collection: 'rows',
        pageSize: '32',
        cursor: continuationCursor,
      },
    });
    expect(firstPage.totals).toEqual({
      accountDeltaCreditAtoms: '-64',
      netUsedCreditAtoms: '64',
      eventCount: '192',
    });
    expect(continuationPage.snapshotRevision).toBe(firstPage.snapshotRevision);
    expect(continuationPage.totals).toEqual(firstPage.totals);
    const firstIds = new Set(
      firstPage.rows?.items.map((item) => (item.kind === 'base' ? item.baseTransactionId : item.transactionId)),
    );
    expect(
      continuationPage.rows?.items.every(
        (item) => !firstIds.has(item.kind === 'base' ? item.baseTransactionId : item.transactionId),
      ),
    ).toBe(true);
    const firstPlanLines = await usage.explainUsageRowsForTest({
      authUserId: fixture.userId,
      rawQuery: { range: 'all_time', collection: 'rows', pageSize: '32' },
    });
    const firstPlan = firstPlanLines.join('\n');
    const continuationPlanLines = await usage.explainUsageRowsForTest({
      authUserId: fixture.userId,
      rawQuery: {
        range: 'all_time',
        collection: 'rows',
        pageSize: '32',
        cursor: continuationCursor,
      },
    });
    const continuationPlan = continuationPlanLines.join('\n');
    console.info('[billing-usage.foundation] representative FIRST production rows plan\n%s', firstPlan);
    console.info('[billing-usage.foundation] representative CONTINUATION production rows plan\n%s', continuationPlan);
    for (const plan of [firstPlan, continuationPlan]) {
      expect(plan).toContain('credit_operation');
      expect(plan).toContain('credit_transaction c');
      // The existing partial index proves its predicate without a redundant Filter node.
      expect(plan).toMatch(
        /kind = 'compensation'|Index (?:Only )?Scan using credit_transaction_corrections on credit_transaction c/u,
      );
      // PostgreSQL may correctly prefer a sequential scan for this small fixture. Pin the
      // customer-visible page bound and the amount of work actually performed instead of
      // requiring one named index or planner strategy.
      expect(plan).toMatch(/Limit\b[^\n]*actual time=[^\n]*\brows=33\b/u);
      expect(plan).toContain('actual time=');
      expect(plan).toContain('Buffers:');
      expect(plan).not.toContain('Offset');
      const executedRows = [...plan.matchAll(/\bactual time=[^)]*?\brows=(\d+)\b/gu)].map((match) => Number(match[1]));
      expect(executedRows.length).toBeGreaterThan(0);
      expect(Math.max(...executedRows)).toBeLessThanOrEqual(256);
    }
  }, 60_000);

  it('should deny every history surface after binding revocation while the account remains open', async () => {
    const fixture = await createFixture();
    const admitted = await ledger.admitOperation(admission(fixture, 'revoked-owner'));
    if (admitted.status !== 'admitted') {
      throw new Error('revocation operation was not admitted');
    }
    await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, fixture.accountId));
    expect(await usage.getUsage({ authUserId: fixture.userId, rawQuery: {} })).toMatchObject({
      availability: { state: 'unavailable', reason: 'authority_unavailable' },
    });
    await database.update(creditAccount).set({ status: 'open' }).where(eq(creditAccount.id, fixture.accountId));
    await database
      .update(billingOwnerBinding)
      .set({ revokedAt: new Date() })
      .where(eq(billingOwnerBinding.accountId, fixture.accountId));
    expect(await usage.getUsage({ authUserId: fixture.userId, rawQuery: {} })).toMatchObject({
      availability: { state: 'unavailable', reason: 'authority_unavailable' },
    });
    await expect(usage.getBalance({ authUserId: fixture.userId, rawQuery: {} })).resolves.toMatchObject({
      availability: { state: 'unavailable', reason: 'authority_unavailable' },
      snapshotRevision: '0',
      balance: null,
      journalTotals: null,
      history: null,
    });
    await expect(
      usage.getOperationReceipt({ authUserId: fixture.userId, operationId: admitted.operationId, rawQuery: {} }),
    ).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'authority_unavailable',
      snapshotRevision: '0',
      operationId: admitted.operationId,
    });
  });

  it('should replace an unfunded subject when the principal later receives a binding', async () => {
    const userId = `generation-${randomUUID()}`;
    await database.insert(user).values({ id: userId, name: 'Generation', email: `${userId}@test.invalid` });
    const unfunded = await usage.getUsage({ authUserId: userId, rawQuery: {} });
    const accountId = await ledger.ensureAccountBinding({ environment: 'development', authUserId: userId });
    const bound = await usage.getUsage({ authUserId: userId, rawQuery: {} });
    expect(bound.subjectId).toBe(accountId);
    expect(bound.subjectId).not.toBe(unfunded.subjectId);
    const wrongEnvironmentUsage = new BillingUsageService(
      { database },
      new ConfigService(
        Object.fromEntries([
          ['BILLING_ENVIRONMENT', 'staging'],
          ['BILLING_USAGE_CURSOR_SECRET', 'c03-test-cursor-secret-is-at-least-32-bytes'],
        ]),
      ),
    );
    const wrongEnvironment = await wrongEnvironmentUsage.getUsage({ authUserId: userId, rawQuery: {} });
    expect(wrongEnvironment).toMatchObject({ environment: 'staging', totals: { eventCount: '0' } });
    expect(wrongEnvironment.subjectId).not.toBe(accountId);
    await expect(usage.getUsage({ authUserId: userId, rawQuery: { pageSize: '101' } })).rejects.toThrow('pageSize');
    await expect(usage.getUsage({ authUserId: userId, rawQuery: { minRevision: '9'.repeat(79) } })).rejects.toThrow();
  });
});

it('should recover only the authenticated original attempt without creating an account or changing credit', async () => {
  const fixture = await createFixture();
  const key = randomUUID();
  const request = { ...admission(fixture, key), surface: 'gateway' };
  const admitted = await ledger.admitOperation(request);
  if (admitted.status !== 'admitted') {
    throw new Error('Expected admitted invocation');
  }
  const before = await database.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
  const recovered = await usage.getAttemptReceipt({
    authUserId: fixture.userId,
    surface: 'gateway',
    attemptKey: key,
    rawQuery: {},
  });
  expect(recovered).toMatchObject({ state: 'pending', operationId: admitted.operationId });
  expect(
    await usage.getAttemptReceipt({
      authUserId: 'unfunded-unknown-owner',
      surface: 'gateway',
      attemptKey: key,
      rawQuery: {},
    }),
  ).toEqual({ state: 'not_found' });
  expect(
    await usage.getAttemptReceipt({
      authUserId: fixture.userId,
      surface: 'commit_name',
      attemptKey: key,
      rawQuery: {},
    }),
  ).toEqual({ state: 'not_found' });
  expect(await database.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId))).toEqual(before);
  expect(
    await database
      .select()
      .from(billingOwnerBinding)
      .where(eq(billingOwnerBinding.authUserId, 'unfunded-unknown-owner')),
  ).toHaveLength(0);
  await expect(
    usage.getAttemptReceipt({
      authUserId: fixture.userId,
      surface: 'gateway',
      attemptKey: key,
      rawQuery: { ownerId: fixture.userId },
    }),
  ).rejects.toThrow();
});
