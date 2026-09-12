import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '#database/schema.js';
import { BillingJournalReconciliationService } from '#api/billing/billing-journal-reconciliation.service.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });

/*
 * The sweep covers a whole environment and this suite shares one database, so the fixture claims a
 * slice of `development` that no peer file can enter: account identifiers sort after every other
 * fixture's, and every movement is dated far in the future. `rewindCheckpoint` then parks both
 * cursors immediately before that slice, which makes each run's totals exactly this file's.
 * `prod-eu`/`prod-us` belong to the protections suite and `staging` must stay policy-free for the
 * policy suite, so a private environment is not available.
 */
const accountPrefix = 'zzz-journal';
const sliceStart = new Date('2099-01-01T00:00:00.000Z');
let movementIndex = 0;
const nextOccurredAt = (): Date => {
  movementIndex += 1;
  return new Date(sliceStart.getTime() + movementIndex * 60_000);
};
const environment = 'development';
const config = { environment, stripeAccountId: 'acct_journal_foundation', livemode: false } as const;
const recordedDrift: number[] = [];
const recordedAccounts: number[] = [];
const reconciliation = new BillingJournalReconciliationService(
  { database: runtimeDatabase },
  {
    billingLedgerDrift: {
      record(value: number) {
        recordedDrift.push(value);
      },
    },
    billingDriftedAccounts: {
      record(value: number) {
        recordedAccounts.push(value);
      },
    },
  },
  config,
);

let policyId = '';
let activationId = '';
const spendBudgetId = `journal-spend-${randomUUID()}`;
const riskBudgetId = `journal-risk-${randomUUID()}`;

/**
 * A pending operation that authorizes nothing.
 *
 * `require_operation_holds` is a deferred constraint trigger, so the operation and its two
 * budget holds must land in one transaction.
 */
const seedOperation = async (accountId: string): Promise<string> => {
  const id = `operation-${randomUUID()}`;
  await database.transaction(async (transaction) => {
    await transaction.insert(schema.creditOperation).values({
      id,
      accountId,
      environment,
      surface: 'chat',
      attemptKey: id,
      requestDigest: `sha256:${id}`,
      requestKeyVersion: 1,
      category: 'llm',
      modelId: 'journal-fixture-model',
      sku: 'journal-fixture-sku',
      pinnedTariff: [],
      maximumQuantities: [],
      activity: 'journal-fixture',
      policyId,
      activationId,
      meterContractId: 'journal-fixture-meter',
      authorizedAtoms: 0n,
      promoHeldAtoms: 0n,
      planHeldAtoms: 0n,
      purchasedHeldAtoms: 0n,
      spendBudgetHoldId: `spend-${id}`,
      riskBudgetHoldId: `risk-${id}`,
      dueAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await transaction.insert(schema.billingBudgetHold).values([
      {
        id: `spend-${id}`,
        budgetId: spendBudgetId,
        operationId: id,
        initialBound: 0n,
        remainingHeld: 0n,
        consumed: 0n,
        finalityState: 'final',
      },
      {
        id: `risk-${id}`,
        budgetId: riskBudgetId,
        operationId: id,
        initialBound: 0n,
        remainingHeld: 0n,
        consumed: 0n,
        finalityState: 'final',
      },
    ]);
  });
  return id;
};

const seedResolution = async (accountId: string, operationId: string, revision: bigint): Promise<string> => {
  const id = `transaction-${randomUUID()}`;
  await database.insert(schema.creditTransaction).values({
    id,
    accountId,
    operationId,
    revision,
    kind: 'operation_resolution',
    promoDeltaAtoms: 0n,
    planDeltaAtoms: 0n,
    purchasedDeltaAtoms: 0n,
    debtDeltaAtoms: 0n,
    accountDeltaAtoms: 0n,
    balanceAfterAtoms: 0n,
    occurredAt: nextOccurredAt(),
  });
  return id;
};

/** Terminalizes the operation against the resolution it already carries. */
const terminalize = async (operationId: string, resolutionId: string): Promise<void> => {
  await database
    .update(schema.creditOperation)
    .set({
      customerState: 'settled',
      baseTransactionId: resolutionId,
      terminalRevision: 1n,
      resolvedAt: new Date(),
      chargedAtoms: 0n,
    })
    .where(eq(schema.creditOperation.id, operationId));
};

/**
 * Seeds an account whose counters are stated independently of the journal that should cause them,
 * so a test can hand the sweep either a matching pair or a deliberate disagreement.
 */
const seedAccount = async (input: {
  readonly counters?: Partial<typeof schema.creditAccount.$inferInsert>;
  readonly journal?: { readonly promo?: bigint; readonly plan?: bigint; readonly purchased?: bigint };
}): Promise<string> => {
  const accountId = `${accountPrefix}-${randomUUID()}`;
  await database.insert(schema.creditAccount).values({ id: accountId, environment, revision: 2n, ...input.counters });
  const operationId = await seedOperation(accountId);
  const resolutionId = await seedResolution(accountId, operationId, 1n);
  await terminalize(operationId, resolutionId);
  if (input.journal !== undefined) {
    const promo = input.journal.promo ?? 0n;
    const plan = input.journal.plan ?? 0n;
    const purchased = input.journal.purchased ?? 0n;
    // A compensation is the cheapest authorized linked cause that can carry a balance.
    await database.insert(schema.creditTransaction).values({
      id: `transaction-${randomUUID()}`,
      accountId,
      correctionOf: resolutionId,
      revision: 2n,
      kind: 'compensation',
      promoDeltaAtoms: promo,
      planDeltaAtoms: plan,
      purchasedDeltaAtoms: purchased,
      debtDeltaAtoms: 0n,
      accountDeltaAtoms: promo + plan + purchased,
      balanceAfterAtoms: promo + plan + purchased,
      occurredAt: nextOccurredAt(),
    });
  }
  return accountId;
};

type FinancialCase = typeof schema.billingFinancialCase.$inferSelect;

const casesOf = async (accountId: string): Promise<FinancialCase[]> =>
  database
    .select()
    .from(schema.billingFinancialCase)
    .where(
      and(
        eq(schema.billingFinancialCase.environment, environment),
        eq(schema.billingFinancialCase.accountId, accountId),
      ),
    );

const kindsOf = (cases: readonly FinancialCase[]): string[] => cases.map((row) => row.kind).sort();

/** Parks both cursors immediately before this file's slice, re-reading batches already committed. */
const rewindCheckpoint = async (): Promise<void> => {
  await database
    .insert(schema.billingJournalCheckpoint)
    .values({
      id: `journal-checkpoint-${randomUUID()}`,
      ...config,
      incrementalOccurredAt: sliceStart,
      incrementalTransactionId: '',
      sweepAccountId: accountPrefix,
    })
    .onConflictDoUpdate({
      target: [
        schema.billingJournalCheckpoint.environment,
        schema.billingJournalCheckpoint.stripeAccountId,
        schema.billingJournalCheckpoint.livemode,
      ],
      set: {
        incrementalOccurredAt: sliceStart,
        incrementalTransactionId: '',
        sweepAccountId: accountPrefix,
        leaseUntil: null,
      },
    });
};

beforeAll(async () => {
  const scope = `journal-${randomUUID()}`;
  await database.insert(schema.billingBudgetFunding).values([
    { id: `funding-${spendBudgetId}`, environment, kind: 'spend', scope, fundedLifetime: 1_000_000n },
    { id: `funding-${riskBudgetId}`, environment, kind: 'risk', scope, fundedLifetime: 1_000_000n },
  ]);
  await database.insert(schema.billingBudget).values([
    {
      id: spendBudgetId,
      environment,
      fundingId: `funding-${spendBudgetId}`,
      kind: 'spend',
      scope,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
    {
      id: riskBudgetId,
      environment,
      fundingId: `funding-${riskBudgetId}`,
      kind: 'risk',
      scope,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
  ]);
  const fixtureActivationId = `journal-activation-${randomUUID()}`;
  await seedBillingFixturePolicy({
    database,
    activationId: fixtureActivationId,
    policy: {
      schemaVersion: 1,
      environment,
      policyVersion: `journal-${randomUUID()}`,
      markupBps: 0,
      fleet: { minimumSchemaVersion: 1, meterContractIds: [] },
      rates: [],
      routes: [],
      offers: [
        {
          offerId: `journal-pro-${randomUUID()}`,
          kind: 'pro_monthly',
          currency: 'usd',
          principalMinor: '1',
          grantCreditAtoms: '1',
          ceilingCreditAtoms: '1',
        },
        {
          offerId: `journal-top-up-${randomUUID()}`,
          kind: 'top_up',
          currency: 'usd',
          minimumPrincipalMinor: '1',
          maximumPrincipalMinor: '1',
          creditAtomsPerPrincipalMinor: '1',
        },
      ],
      promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    },
  });
  const [activation] = await database
    .select({ id: schema.billingPolicyActivation.id, policyId: schema.billingPolicyActivation.policyId })
    .from(schema.billingPolicyActivation)
    .where(eq(schema.billingPolicyActivation.id, fixtureActivationId));
  if (activation === undefined) {
    throw new Error('Journal fixture activation is missing');
  }
  activationId = activation.id;
  policyId = activation.policyId;
});

afterAll(async () => Promise.all([adminClient.end(), runtimeClient.end()]));

describe('journal reconciliation foundation', () => {
  // First on purpose: every later case leaves drift inside the same slice, and this one asserts
  // that a fully caused ledger reports none.
  it('should record zero drift and open no case for a ledger whose counters match their causes', async () => {
    const accountId = await seedAccount({ counters: { purchasedAtoms: 1000n }, journal: { purchased: 1000n } });

    await rewindCheckpoint();
    const report = await reconciliation.runSweep({ batchLimit: 100 });

    expect(report.maximumDriftAtoms).toBe('0');
    expect(report.driftedAccounts).toBe(0);
    expect(report.openedCases).toBe(0);
    expect(report.sweptAccounts).toBeGreaterThan(0);
    expect(await casesOf(accountId)).toEqual([]);
    expect(recordedDrift.at(-1)).toBe(0);
    expect(recordedAccounts.at(-1)).toBe(0);
  });

  it('should open a per-source balance case when two journal errors cancel in the account total', async () => {
    // Promo is 1000 too high and purchased 1000 too low; every internal total still balances.
    const accountId = await seedAccount({ counters: { promoAtoms: 1000n }, journal: { purchased: 1000n } });

    await rewindCheckpoint();
    const report = await reconciliation.runSweep({ batchLimit: 100 });

    const cases = await casesOf(accountId);
    expect(kindsOf(cases)).toEqual(['journal_balance_drift']);
    const [opened] = cases;
    expect(opened?.state).toBe('open');
    expect(opened?.owner).toBe('billing-operations');
    expect(opened?.nextStep).toBe('replay_journal_causes_then_authorize_a_linked_correction');
    expect(opened?.evidence).toMatchObject({
      promoDriftAtoms: '1000',
      purchasedDriftAtoms: '-1000',
      driftAtoms: '1000',
    });
    expect(opened?.firstEffectiveAt).toBeInstanceOf(Date);
    expect(report.maximumDriftAtoms).toBe('1000');
    expect(report.driftedAccounts).toBe(1);
    expect(recordedDrift.at(-1)).toBe(1000);
    expect(recordedAccounts.at(-1)).toBe(1);
  });

  it('should accept a held refund intent as a hold cause and case a hold that has none', async () => {
    const explained = await seedAccount({
      counters: { planAtoms: 400n, planHeldAtoms: 400n },
      journal: { plan: 400n },
    });
    const purchaseId = `purchase-${randomUUID()}`;
    const reversalCaseId = `reversal-${randomUUID()}`;
    await database.insert(schema.billingPurchase).values({
      id: purchaseId,
      accountId: explained,
      sourceIdentity: `purchase:${purchaseId}`,
      offerSnapshot: { version: 'payment-offer-v1', offerId: 'journal-fixture-topup' },
      creditAtoms: 400n,
      state: 'prepared',
    });
    await database.insert(schema.billingReversalCase).values({
      id: reversalCaseId,
      accountId: explained,
      purchaseId,
      originalAtoms: 400n,
      source: 'plan',
      environment,
    });
    await database.insert(schema.billingRefundIntent).values({
      id: `refund-${randomUUID()}`,
      accountId: explained,
      environment,
      reversalCaseId,
      requestId: `request-${randomUUID()}`,
      requestHash: '0'.repeat(64),
      requestedPrincipalMinor: 400n,
      requestedTaxMinor: 0n,
      requestedGrossMinor: 400n,
      approvedMaximumGrossMinor: 400n,
      targetReversedAtoms: 400n,
      holdAtoms: 400n,
      reviewActorId: 'journal-fixture-reviewer',
      reviewedAt: new Date(),
      reason: 'journal fixture',
      sourceDigest: '0'.repeat(64),
    });
    const unexplained = await seedAccount({
      counters: { planAtoms: 400n, planHeldAtoms: 400n },
      journal: { plan: 400n },
    });

    await rewindCheckpoint();
    await reconciliation.runSweep({ batchLimit: 100 });

    expect(await casesOf(explained)).toEqual([]);
    const held = await casesOf(unexplained);
    expect(kindsOf(held)).toEqual(['journal_hold_drift']);
    expect(held[0]?.evidence).toMatchObject({ planHoldDriftAtoms: '400', driftAtoms: '400' });
  });

  it('should refuse a duplicate resolution movement and case a resolution on a pending operation', async () => {
    const accountId = await seedAccount({});
    const operationId = await seedOperation(accountId);
    await seedResolution(accountId, operationId, 2n);

    await expect(seedResolution(accountId, operationId, 3n)).rejects.toThrow();
    const resolutions = await database
      .select({ id: schema.creditTransaction.id })
      .from(schema.creditTransaction)
      .where(
        and(
          eq(schema.creditTransaction.operationId, operationId),
          eq(schema.creditTransaction.kind, 'operation_resolution'),
        ),
      );
    expect(resolutions).toHaveLength(1);

    await rewindCheckpoint();
    await reconciliation.runSweep({ batchLimit: 100 });

    const opened = await casesOf(accountId);
    expect(kindsOf(opened)).toEqual(['journal_resolution_drift']);
    const [orphan] = opened;
    expect(orphan?.evidence).toMatchObject({ pendingOperationsWithResolution: 1 });
    expect(orphan?.nextStep).toBe('reconcile_terminal_operations_with_their_resolution_movements');
  });

  it('should reuse one case when a stale checkpoint replays a batch and resolve it once the cause is gone', async () => {
    const accountId = await seedAccount({});
    const operationId = await seedOperation(accountId);
    const resolutionId = await seedResolution(accountId, operationId, 2n);
    await rewindCheckpoint();
    await reconciliation.runSweep({ batchLimit: 100 });
    const [first] = await casesOf(accountId);
    expect(first?.kind).toBe('journal_resolution_drift');

    // A replay from cursors that have already been committed re-reads the same batch.
    await rewindCheckpoint();
    await reconciliation.runSweep({ batchLimit: 100 });

    const replayed = await casesOf(accountId);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.id).toBe(first?.id);
    expect(replayed[0]?.state).toBe('open');

    // Forward repair: the operation is terminalized against the resolution it already had.
    await terminalize(operationId, resolutionId);
    await rewindCheckpoint();
    await reconciliation.runSweep({ batchLimit: 100 });

    const [resolved] = await casesOf(accountId);
    expect(resolved?.state).toBe('resolved');
    expect(resolved?.resolutionEvidence).toMatchObject({ disposition: 'journal_reconciled' });
  });
});
