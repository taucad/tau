import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingBudget,
  billingBudgetFunding,
  billingBudgetHold,
  billingInvocationEvidence,
  billingOperationException,
  billingPurchase,
  billingPolicyHead,
  billingPromotionIssuance,
  billingRoutePause,
  billingReversalCase,
  creditAccount,
  creditOperation,
  supplierCostEvidence,
  user,
} from '#database/schema.js';
import { allocateSources, creditDebtFirst, CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { seedPaidPurchase, fulfillPaidFixture } from '#testing/billing-payment.fixture.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import type { CommercialPolicy } from '#api/billing/billing-policy.js';
import type {
  AccountSnapshot,
  QualifiedAdmissionInput,
  TerminalEvidence,
  SupplierEvidenceInput,
} from '#api/billing/credit-ledger.types.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const firstClient = postgres(databaseUrl, { max: 1 });
const secondClient = postgres(databaseUrl, { max: 1 });
const firstDatabase = drizzle(firstClient, { schema });
const secondDatabase = drizzle(secondClient, { schema });
const firstPolicyService = new BillingPolicyService({
  database: firstDatabase,
});
const secondPolicyService = new BillingPolicyService({
  database: secondDatabase,
});
const firstLedger = new CreditLedgerService({ database: firstDatabase }, firstPolicyService);
const secondLedger = new CreditLedgerService({ database: secondDatabase }, secondPolicyService);
const required = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`${label} missing`);
  }
  return value;
};

afterAll(async () => Promise.all([firstClient.end(), secondClient.end()]));

afterEach(async (context) => {
  if (context.task.result?.state === 'fail') {
    const diagnostic = await firstClient`select clock_timestamp()::text as clock,
      h.current_activation_id, h.observed_activation_id, h.pending_activation_id,
      o.effective_at::text as observed_effective, o.created_at::text as observed_created,
      c.id as candidate_id, c.effective_at::text as candidate_effective, c.created_at::text as candidate_created
      from billing.billing_policy_head h
      left join billing.billing_policy_activation o on o.id = h.observed_activation_id
      left join lateral (select a.* from billing.billing_policy_activation a
        where a.environment = h.environment and a.effective_at <= transaction_timestamp()
          and not exists (select from billing.billing_policy_activation_cancellation x where x.activation_id = a.id)
        order by a.effective_at desc, a.created_at desc limit 1) c on true
      where h.environment = 'development'`;
    console.error('C03 failed policy observation', context.task.name, JSON.stringify(diagnostic));
  }
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let ledgerHeadRevision = 0n;
let ledgerHeadActivation: string | undefined;
const ledgerMeterContracts: string[] = [];

const createFixture = async (
  assets?: {
    promoAtoms: bigint;
    planAtoms: bigint;
    purchasedAtoms: bigint;
  },
  rate?: { numerator: string; denominator: string },
  // oxlint-disable-next-line typescript/no-restricted-types -- fixture meter tiers mirror explicit persisted null
  partitions?: Array<{ dimension: string; tier: string | null; numerator: string; denominator: string }>,
) => {
  const rateConfig = rate ?? { numerator: '1', denominator: '1' };
  const partitionRates = partitions ?? [{ dimension: 'uncached_input', tier: null, ...rateConfig }];
  const initialAssets = assets ?? {
    promoAtoms: 30_000n,
    planAtoms: 50_000n,
    purchasedAtoms: 70_000n,
  };
  const suffix = randomUUID();
  const environment: QualifiedAdmissionInput['environment'] = 'development';
  const userId = `user-${suffix}`;
  const activationId = `activation-${suffix}`;
  const spendFundingId = `spend-funding-${suffix}`;
  const riskFundingId = `risk-funding-${suffix}`;
  const spendBudgetId = `spend-budget-${suffix}`;
  const riskBudgetId = `risk-budget-${suffix}`;
  const promotionProgramId = `promo-${suffix}`;
  const promotionFundingId = `promo-funding-${suffix}`;
  const promotionBudgetId = `promo-budget-${suffix}`;
  const now = new Date();
  const promotionPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const promotionPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const start = new Date('2020-01-01T00:00:00.000Z');
  const end = new Date('2030-01-01T00:00:00.000Z');
  const sku = `sku-${suffix}`;
  const meterContractId = `meter-${suffix}`;
  ledgerMeterContracts.push(meterContractId);
  qualifiedMeterContracts.set(
    meterContractId,
    new Set(partitionRates.map((item) => `${item.dimension}:${item.tier ?? ''}`)),
  );
  const validated = validateCommercialPolicy({
    schemaVersion: 1,
    environment,
    policyVersion: suffix,
    markupBps: 0,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
    rates: partitionRates.map((partition) => ({
      rateId: partitionRates.length === 1 ? `rate-${suffix}` : `rate-${partition.dimension}-${suffix}`,
      meterContractId,
      dimension: partition.dimension,
      tier: partition.tier,
      unit: 'token',
      referenceNumeratorPicoUsd: '1',
      denominatorUnits: '1',
      retailOverride: { numeratorCreditAtoms: partition.numerator, denominatorUnits: partition.denominator },
    })),
    routes: [
      {
        routeId: `route-${suffix}`,
        sku,
        meterContractId,
        rateIds: partitionRates.map((partition) =>
          partitionRates.length === 1 ? `rate-${suffix}` : `rate-${partition.dimension}-${suffix}`,
        ),
        enabled: true,
        spendBudgetId,
        riskBudgetId,
      },
    ],
    offers: [
      {
        offerId: `pro-${suffix}`,
        kind: 'pro_monthly',
        currency: 'usd',
        principalMinor: '1',
        grantCreditAtoms: '1',
        ceilingCreditAtoms: '1',
      },
      {
        offerId: `top-${suffix}`,
        kind: 'top_up',
        currency: 'usd',
        minimumPrincipalMinor: '1',
        maximumPrincipalMinor: '1',
        creditAtomsPerPrincipalMinor: '1',
      },
    ],
    promotionalIssuance: {
      enabled: true,
      budgetCreditAtoms: '50',
      offer: {
        promotionProgramId,
        period: 'month',
        eligibility: 'verified_account',
        grantCreditAtoms: '100',
        accountCeilingCreditAtoms: '50',
        budgetId: promotionBudgetId,
      },
    },
  });
  await firstDatabase.insert(user).values({
    id: userId,
    name: 'Ledger Test',
    email: `${suffix}@test.invalid`,
    emailVerified: true,
  });
  await firstDatabase.insert(billingBudgetFunding).values([
    {
      id: spendFundingId,
      environment,
      kind: 'spend',
      scope: suffix,
      fundedLifetime: 1_000_000n,
    },
    {
      id: riskFundingId,
      environment,
      kind: 'risk',
      scope: suffix,
      fundedLifetime: 1_000_000n,
    },
    {
      id: promotionFundingId,
      environment,
      kind: 'promotion_issuance',
      scope: promotionProgramId,
      fundedLifetime: 50n,
    },
  ]);
  await firstDatabase.insert(billingBudget).values([
    {
      id: spendBudgetId,
      environment,
      fundingId: spendFundingId,
      kind: 'spend',
      scope: suffix,
      periodStart: start,
      periodEnd: end,
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
    {
      id: riskBudgetId,
      environment,
      fundingId: riskFundingId,
      kind: 'risk',
      scope: suffix,
      periodStart: start,
      periodEnd: end,
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
    {
      id: promotionBudgetId,
      environment,
      fundingId: promotionFundingId,
      kind: 'promotion_issuance',
      scope: promotionProgramId,
      periodStart: promotionPeriodStart,
      periodEnd: promotionPeriodEnd,
      quantum: 'credit_atoms',
      approvedCap: 50n,
    },
  ]);
  const publication = await seedBillingFixturePolicy({
    database: firstDatabase,
    policy: validated.canonicalContent,
    activationId,
  });
  ledgerHeadRevision = publication.headRevision;
  ledgerHeadActivation = activationId;
  const accountId = await firstLedger.ensureAccountBinding({
    environment,
    authUserId: userId,
  });
  await firstDatabase.update(creditAccount).set(initialAssets).where(eq(creditAccount.id, accountId));
  return {
    environment,
    userId,
    accountId,
    activationId,
    spendBudgetId,
    riskBudgetId,
    sku,
    meterContractId,
    promotionProgramId,
    promotionBudgetId,
    promotionPeriodStart,
    promotionPeriodEnd,
    canonicalPolicy: validated.policy,
    now,
  };
};

const admission = (fixture: Fixture, attemptKey: string, authorizedAtoms: bigint): QualifiedAdmissionInput => {
  qualifiedMeterContracts.set(fixture.meterContractId, new Set(['uncached_input:']));
  return {
    environment: fixture.environment,
    authUserId: fixture.userId,
    surface: 'chat',
    attemptKey,
    requestDigest: `sha256:${attemptKey}`,
    requestKeyVersion: 1,
    category: 'llm',
    modelId: 'test-model',
    activity: 'test',
    sku: fixture.sku,
    maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: authorizedAtoms }],
    supplierMaximumPicoUsd: authorizedAtoms,
    replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
    executionDeadline: new Date(Date.now() + 300_000),
  };
};

const publishFixturePolicy = async (
  fixture: Fixture,
  policy: CommercialPolicy,
  effectiveAt?: Date,
): Promise<string> => {
  const [head] = await firstDatabase
    .select()
    .from(billingPolicyHead)
    .where(eq(billingPolicyHead.environment, fixture.environment));
  const current = required(head, 'development policy head');
  const activationId = `activation-${randomUUID()}`;
  const published = await firstPolicyService.publishPolicy({
    policyJson: JSON.stringify(policy),
    environment: fixture.environment,
    activationId,
    jobKey: `job-${randomUUID()}`,
    expectedHeadRevision: current.revision,
    expectedPredecessorActivationId: current.currentActivationId ?? undefined,
    effectiveAt,
    replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
  });
  ledgerHeadRevision = published.headRevision;
  ledgerHeadActivation = activationId;
  return activationId;
};

describe('CreditLedgerService PostgreSQL foundation', () => {
  it('should roll back every fixture policy write when its activation conflicts', async () => {
    const fixture = await createFixture();
    const [before] = await firstDatabase
      .select()
      .from(billingPolicyHead)
      .where(eq(billingPolicyHead.environment, fixture.environment));
    const policyVersion = randomUUID();
    await expect(
      seedBillingFixturePolicy({
        database: firstDatabase,
        policy: { ...fixture.canonicalPolicy, policyVersion },
        activationId: fixture.activationId,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    const [after] = await firstDatabase
      .select()
      .from(billingPolicyHead)
      .where(eq(billingPolicyHead.environment, fixture.environment));
    expect(after).toEqual(before);
    expect(
      await firstDatabase
        .select()
        .from(schema.billingPolicy)
        .where(eq(schema.billingPolicy.policyVersion, policyVersion)),
    ).toEqual([]);
  });

  it('should bootstrap one stable binding across two independent connections', async () => {
    const suffix = randomUUID();
    const userId = `user-${suffix}`;
    await firstDatabase.insert(user).values({ id: userId, name: 'Race', email: `${suffix}@test.invalid` });
    const ids = await Promise.all([
      firstLedger.ensureAccountBinding({
        environment: 'development',
        authUserId: userId,
      }),
      secondLedger.ensureAccountBinding({
        environment: 'development',
        authUserId: userId,
      }),
    ]);
    expect(new Set(ids).size).toBe(1);
  });

  it.each(['revoked', 'closed'])('does not recreate a %s financial owner', async (state) => {
    const userId = `user-${randomUUID()}`;
    await firstDatabase.insert(user).values({ id: userId, name: 'Closed owner', email: `${userId}@test.invalid` });
    const accountId = await firstLedger.ensureAccountBinding({ environment: 'development', authUserId: userId });
    if (state === 'revoked') {
      await firstDatabase
        .update(schema.billingOwnerBinding)
        .set({ revokedAt: new Date() })
        .where(eq(schema.billingOwnerBinding.accountId, accountId));
    } else {
      await firstDatabase.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, accountId));
    }
    await expect(
      firstLedger.ensureAccountBinding({ environment: 'development', authUserId: userId }),
    ).rejects.toMatchObject({ status: 403, message: 'Financial owner is revoked or closed' });
    const bindings = await firstDatabase
      .select()
      .from(schema.billingOwnerBinding)
      .where(eq(schema.billingOwnerBinding.authUserId, userId));
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.accountId).toBe(accountId);
  });

  it('denies new funded work for an unresolved cash case and resumes after resolution', async () => {
    const fixture = await createFixture();
    const caseId = randomUUID();
    await firstDatabase.insert(schema.billingFinancialCase).values({
      id: caseId,
      environment: fixture.environment,
      stripeAccountId: 'acct_fixture',
      livemode: false,
      accountId: fixture.accountId,
      kind: 'missing_local_payment',
      dedupeKey: caseId,
      sourceType: 'charge',
      sourceId: `ch_${caseId}`,
      evidence: {},
      owner: 'finance',
      nextStep: 'reconcile',
      firstEffectiveAt: new Date(),
    });
    expect(await firstLedger.admitOperation(admission(fixture, 'cash-paused', 1n))).toEqual({
      status: 'denied',
      reason: 'account_restricted',
    });
    await firstDatabase
      .update(schema.billingFinancialCase)
      .set({
        state: 'resolved',
        resolvedAt: new Date(),
        resolutionEvidence: { fixture: true },
      })
      .where(eq(schema.billingFinancialCase.id, caseId));
    expect(await firstLedger.admitOperation(admission(fixture, 'cash-resumed', 1n))).toMatchObject({
      status: 'admitted',
    });
  });

  it('restricts only the account a cash case names and keeps admitting other customers', async () => {
    const fixture = await createFixture();
    const stripeAccountId = `acct_scope_${randomUUID()}`;
    await firstDatabase.insert(schema.billingStripeCustomer).values({
      id: randomUUID(),
      accountId: fixture.accountId,
      environment: fixture.environment,
      stripeAccountId,
      livemode: false,
      stripeCustomerId: `cus_${randomUUID()}`,
    });
    const caseIds = [randomUUID(), randomUUID()];
    const openCase = async (id: string, accountId: string | undefined): Promise<void> => {
      await firstDatabase.insert(schema.billingFinancialCase).values({
        id,
        environment: fixture.environment,
        stripeAccountId,
        livemode: false,
        accountId,
        kind: 'refund_unresolved',
        dedupeKey: id,
        sourceType: 'refund',
        sourceId: `re_${id}`,
        evidence: {},
        owner: 'finance',
        nextStep: 'reconcile',
        firstEffectiveAt: new Date(),
      });
    };
    try {
      // Another customer's unattributed refund once denied every account holding a Stripe Customer here.
      await openCase(caseIds[0] ?? '', undefined);
      expect(await firstLedger.admitOperation(admission(fixture, 'scope-unattributed', 1n))).toMatchObject({
        status: 'admitted',
      });
      await openCase(caseIds[1] ?? '', fixture.accountId);
      expect(await firstLedger.admitOperation(admission(fixture, 'scope-owned', 1n))).toEqual({
        status: 'denied',
        reason: 'account_restricted',
      });
    } finally {
      await firstDatabase
        .update(schema.billingFinancialCase)
        .set({ state: 'resolved', resolvedAt: new Date(), resolutionEvidence: { fixture: true } })
        .where(inArray(schema.billingFinancialCase.id, caseIds));
    }
  });

  it('should preserve source holds, normalize reversal debt, and replay terminal receipts', async () => {
    const fixture = await createFixture();
    const admittedA = await firstLedger.admitOperation(admission(fixture, 'attempt-a', 100_000n));
    const admittedB = await secondLedger.admitOperation(admission(fixture, 'attempt-b', 40_000n));
    expect(admittedA).toMatchObject({
      status: 'admitted',
      authorized: {
        promoAtoms: 30_000n,
        planAtoms: 50_000n,
        purchasedAtoms: 20_000n,
      },
    });
    expect(admittedB).toMatchObject({
      status: 'admitted',
      authorized: { promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 40_000n },
    });
    if (admittedA.status !== 'admitted' || admittedB.status !== 'admitted') {
      throw new Error('operations were not admitted');
    }
    expect(await firstLedger.admitOperation(admission(fixture, 'attempt-a', 100_000n))).toMatchObject({
      status: 'replay',
      operationId: admittedA.operationId,
    });

    const purchaseId = `purchase-${randomUUID()}`;
    const reversalId = `reversal-${randomUUID()}`;
    await firstDatabase.insert(billingPurchase).values({
      id: purchaseId,
      accountId: fixture.accountId,
      sourceIdentity: purchaseId,
      offerSnapshot: {},
      creditAtoms: 70_000n,
      state: 'paid',
    });
    await firstDatabase.insert(billingReversalCase).values({
      id: reversalId,
      accountId: fixture.accountId,
      purchaseId,
      originalAtoms: 70_000n,
      source: 'purchased',
    });
    expect(
      await firstLedger.applyReversalMutation({
        accountId: fixture.accountId,
        caseId: reversalId,
        source: 'purchased',
        targetReversedAtoms: 30_000n,
        occurredAt: fixture.now,
      }),
    ).toBe(true);
    let [state] = await firstDatabase.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(state).toMatchObject({
      promoAtoms: 30_000n,
      planAtoms: 50_000n,
      purchasedAtoms: 60_000n,
      debtAtoms: 20_000n,
      promoHeldAtoms: 30_000n,
      planHeldAtoms: 50_000n,
      purchasedHeldAtoms: 60_000n,
    });
    const debtBlocked = await firstLedger.admitOperation(admission(fixture, 'debt-blocked', 1n));
    expect(debtBlocked.status).toBe('denied');

    const receiptA = await firstLedger.terminalizeOperation({
      operationId: admittedA.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:attempt-a',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: fixture.now,
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 60_000n }],
      },
      resolvedAt: fixture.now,
    });
    expect(receiptA.sourceDeltas).toEqual({
      promoAtoms: -30_000n,
      planAtoms: -50_000n,
      purchasedAtoms: 0n,
    });
    expect(
      await firstLedger.terminalizeOperation({
        operationId: admittedA.operationId,
        accountId: fixture.accountId,
        requestDigest: 'sha256:attempt-a',
        expectedGeneration: 1n,
        evidence: { kind: 'provider_rejected' },
        resolvedAt: fixture.now,
      }),
    ).toEqual(receiptA);
    const afterSettlement = await firstDatabase
      .select()
      .from(creditAccount)
      .where(eq(creditAccount.id, fixture.accountId));
    state = afterSettlement[0];
    expect(state).toMatchObject({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 60_000n,
      debtAtoms: 0n,
      purchasedHeldAtoms: 40_000n,
    });

    const receiptB = await firstLedger.terminalizeOperation({
      operationId: admittedB.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:attempt-b',
      expectedGeneration: 1n,
      evidence: { kind: 'provider_rejected' },
      resolvedAt: fixture.now,
    });
    expect(receiptB).toMatchObject({
      customerState: 'released',
      chargedAtoms: 0n,
    });
    const compensationId = `comp-${randomUUID()}`;
    expect(
      await firstLedger.applyCompensation({
        accountId: fixture.accountId,
        originalTransactionId: receiptA.baseTransactionId,
        compensationId,
        atoms: 10_000n,
        occurredAt: fixture.now,
      }),
    ).toBe(true);
    expect(
      await firstLedger.applyCompensation({
        accountId: fixture.accountId,
        originalTransactionId: receiptA.baseTransactionId,
        compensationId,
        atoms: 10_000n,
        occurredAt: fixture.now,
      }),
    ).toBe(false);
    await expect(
      firstLedger.applyCompensation({
        accountId: fixture.accountId,
        originalTransactionId: receiptA.baseTransactionId,
        compensationId: randomUUID(),
        atoms: receiptA.chargedAtoms + 1n,
        occurredAt: fixture.now,
      }),
    ).rejects.toThrow('exceeds original charge');
    const afterCompensation = await firstDatabase
      .select()
      .from(creditAccount)
      .where(eq(creditAccount.id, fixture.accountId));
    state = afterCompensation[0];
    // The charge spent promotional credit first, so compensation refills promo rather than minting purchased credit.
    expect(state).toMatchObject({
      promoAtoms: 10_000n,
      purchasedAtoms: 60_000n,
      debtAtoms: 0n,
      purchasedHeldAtoms: 0n,
    });
    const [compensation] = await firstDatabase
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.id, compensationId));
    expect(compensation).toMatchObject({ promoDeltaAtoms: 10_000n, planDeltaAtoms: 0n, purchasedDeltaAtoms: 0n });
  });

  it('should decode compensation sums and credit distinct partials exactly up to the original charge', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 100n });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'partial-compensation', 60n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    const receipt = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:partial-compensation',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: fixture.now,
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 60n }],
      },
      resolvedAt: fixture.now,
    });
    expect(receipt.chargedAtoms).toBe(60n);
    const purchaseId = randomUUID();
    const caseId = randomUUID();
    await firstDatabase.insert(billingPurchase).values({
      id: purchaseId,
      accountId: fixture.accountId,
      sourceIdentity: purchaseId,
      offerSnapshot: {},
      creditAtoms: 50n,
      state: 'paid',
    });
    await firstDatabase
      .insert(billingReversalCase)
      .values({ id: caseId, accountId: fixture.accountId, purchaseId, originalAtoms: 50n, source: 'purchased' });
    await firstLedger.applyReversalMutation({
      accountId: fixture.accountId,
      caseId,
      source: 'purchased',
      targetReversedAtoms: 50n,
      occurredAt: fixture.now,
    });
    const firstPartial = {
      accountId: fixture.accountId,
      originalTransactionId: receipt.baseTransactionId,
      compensationId: randomUUID(),
      atoms: 20n,
      occurredAt: fixture.now,
    };
    expect(await firstLedger.applyCompensation(firstPartial)).toBe(true);
    const [rawAggregate] = await firstDatabase
      .select({
        total: sql<unknown>`coalesce(sum(${schema.creditTransaction.accountDeltaAtoms}), 0)`,
      })
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.correctionOf, receipt.baseTransactionId));
    expect(typeof rawAggregate?.total).toBe('string');
    expect(rawAggregate?.total).toBe('20');
    const [firstState] = await firstDatabase
      .select()
      .from(creditAccount)
      .where(eq(creditAccount.id, fixture.accountId));
    expect(firstState).toMatchObject({ purchasedAtoms: 10n, debtAtoms: 0n });
    expect(await firstLedger.applyCompensation(firstPartial)).toBe(false);
    await expect(firstLedger.applyCompensation({ ...firstPartial, atoms: 21n })).rejects.toThrow(
      'owner or payload mismatch',
    );
    const secondPartial = { ...firstPartial, compensationId: randomUUID(), atoms: 40n };
    expect(await secondLedger.applyCompensation(secondPartial)).toBe(true);
    expect(await firstLedger.applyCompensation(secondPartial)).toBe(false);
    await expect(
      firstLedger.applyCompensation({ ...firstPartial, compensationId: randomUUID(), atoms: 1n }),
    ).rejects.toThrow('exceeds original charge');
    const other = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 0n });
    await expect(firstLedger.applyCompensation({ ...firstPartial, accountId: other.accountId })).rejects.toThrow(
      'owner or payload mismatch',
    );
    const journals = await firstDatabase
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.correctionOf, receipt.baseTransactionId));
    expect(journals).toHaveLength(2);
    expect(journals.find(({ id }) => id === firstPartial.compensationId)).toMatchObject({
      accountDeltaAtoms: 20n,
      purchasedDeltaAtoms: 10n,
      debtDeltaAtoms: -10n,
      promoDeltaAtoms: 0n,
      planDeltaAtoms: 0n,
    });
    expect(journals.find(({ id }) => id === secondPartial.compensationId)).toMatchObject({
      accountDeltaAtoms: 40n,
      purchasedDeltaAtoms: 40n,
      debtDeltaAtoms: 0n,
      promoDeltaAtoms: 0n,
      planDeltaAtoms: 0n,
    });
    expect(journals.reduce((total, row) => total + row.accountDeltaAtoms, 0n)).toBe(receipt.chargedAtoms);
    const [finalState] = await firstDatabase
      .select()
      .from(creditAccount)
      .where(eq(creditAccount.id, fixture.accountId));
    expect(finalState).toMatchObject({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 50n,
      debtAtoms: 0n,
      promoHeldAtoms: 0n,
      planHeldAtoms: 0n,
      purchasedHeldAtoms: 0n,
      revision: (firstState?.revision ?? 0n) + 1n,
    });
  });

  it('should serialize competing admissions through the account row', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 100n,
    });
    const results = await Promise.all([
      firstLedger.admitOperation(admission(fixture, 'race-a', 70n)),
      secondLedger.admitOperation(admission(fixture, 'race-b', 70n)),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual(['admitted', 'denied']);
    const [state] = await firstDatabase.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(required(state, 'account').purchasedHeldAtoms).toBe(70n);
  });

  it('should replay a simultaneous same-key admission after capacity is fully held', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 50n,
    });
    const request = admission(fixture, 'same-key-race', 50n);
    const results = await Promise.all([firstLedger.admitOperation(request), secondLedger.admitOperation(request)]);
    expect(results.map(({ status }) => status).sort()).toEqual(['admitted', 'replay']);
    const operationIds = results.flatMap((result) => (result.status === 'denied' ? [] : [result.operationId]));
    expect(new Set(operationIds).size).toBe(1);
    await expect(firstLedger.admitOperation({ ...request, requestDigest: 'sha256:changed' })).rejects.toThrow('digest');
    const otherUserId = `wrong-owner-${randomUUID()}`;
    await firstDatabase
      .insert(user)
      .values({ id: otherUserId, name: 'Wrong Owner', email: `${otherUserId}@test.invalid` });
    const otherAccountId = await firstLedger.ensureAccountBinding({
      environment: fixture.environment,
      authUserId: otherUserId,
    });
    await expect(
      firstLedger.terminalizeOperation({
        operationId: required(operationIds[0], 'operation id'),
        accountId: otherAccountId,
        requestDigest: request.requestDigest,
        expectedGeneration: 1n,
        evidence: { kind: 'provider_rejected' },
        resolvedAt: new Date(),
      }),
    ).rejects.toThrow('account');
  });

  it('should retain absorbed lifetime exposure until linked final supplier evidence', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 200n,
    });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'absorbed', 100n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    const absorbedReceipt = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:absorbed',
      expectedGeneration: 1n,
      evidence: { kind: 'absorbed_unknown' },
      resolvedAt: fixture.now,
    });
    const [operation] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, admitted.operationId));
    const [riskHold] = await firstDatabase
      .select()
      .from(billingBudgetHold)
      .where(eq(billingBudgetHold.id, required(operation, 'operation').riskBudgetHoldId));
    expect(riskHold).toMatchObject({
      remainingHeld: 0n,
      consumed: 100n,
      finalityState: 'absorbed',
    });
    const sourceObjectId = `source-${randomUUID()}`;
    expect(
      await firstLedger.appendSupplierEvidence({
        operationId: admitted.operationId,
        environment: fixture.environment,
        provider: 'test',
        credentialAccount: 'test',
        sourceObjectId,
        sourceRevision: '1',
        payloadDigest: 'sha256:evidence',
        currency: 'usd',
        numerator: 60n,
        denominator: 1_000_000_000_000n,
        completeness: 'complete',
        finality: 'final',
        receivedAt: fixture.now,
      }),
    ).toBe('inserted');
    const [evidence] = await firstDatabase
      .select()
      .from(supplierCostEvidence)
      .where(eq(supplierCostEvidence.sourceObjectId, sourceObjectId));
    expect(
      await firstLedger.finalizeSupplier({
        evidenceId: required(evidence, 'evidence').id,
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: 'sha256:absorbed',
        expectedGeneration: 1n,
      }),
    ).toBe('final');
    const [riskBudget] = await firstDatabase
      .select()
      .from(billingBudget)
      .where(eq(billingBudget.id, fixture.riskBudgetId));
    const [riskFunding] = await firstDatabase
      .select()
      .from(billingBudgetFunding)
      .where(eq(billingBudgetFunding.id, required(riskBudget, 'risk budget').fundingId));
    expect(riskBudget).toMatchObject({ held: 0n, consumed: 60n });
    expect(riskFunding).toMatchObject({ held: 0n, consumed: 60n });
    const successorBudgetId = `successor-${randomUUID()}`;
    await firstDatabase.insert(billingBudget).values({
      id: successorBudgetId,
      environment: fixture.environment,
      fundingId: required(riskBudget, 'risk budget').fundingId,
      kind: 'risk',
      scope: required(riskBudget, 'risk budget').scope,
      periodStart: new Date('2030-01-01T00:00:00.000Z'),
      periodEnd: new Date('2031-01-01T00:00:00.000Z'),
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    });
    const [successorBudget] = await firstDatabase
      .select()
      .from(billingBudget)
      .where(eq(billingBudget.id, successorBudgetId));
    expect(successorBudget).toMatchObject({ held: 0n, consumed: 0n });
    const lateReplay = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:absorbed',
      expectedGeneration: 1n,
      evidence: { kind: 'provider_rejected' },
      resolvedAt: new Date(),
    });
    expect(lateReplay).toEqual(absorbedReceipt);
  });

  it('should normalize a purchased reversal across eligible plan credit without debt', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 50n, purchasedAtoms: 0n });
    const caseId = `reversal-${randomUUID()}`;
    const purchaseId = `purchase-${randomUUID()}`;
    await firstDatabase.insert(billingPurchase).values({
      id: purchaseId,
      accountId: fixture.accountId,
      sourceIdentity: `source-${purchaseId}`,
      offerSnapshot: {},
      creditAtoms: 30n,
      state: 'paid',
    });
    await firstDatabase.insert(billingReversalCase).values({
      id: caseId,
      accountId: fixture.accountId,
      purchaseId,
      source: 'purchased',
      originalAtoms: 30n,
      netAppliedAtoms: 0n,
    });
    expect(
      await firstLedger.applyReversalMutation({
        accountId: fixture.accountId,
        caseId,
        source: 'purchased',
        targetReversedAtoms: 30n,
        occurredAt: new Date(),
      }),
    ).toBe(true);
    const [account] = await firstDatabase.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(account).toMatchObject({ promoAtoms: 0n, planAtoms: 20n, purchasedAtoms: 0n, debtAtoms: 0n });

    const promoFixture = await createFixture({ promoAtoms: 50n, planAtoms: 50n, purchasedAtoms: 0n });
    const promoCaseId = `promo-reversal-${randomUUID()}`;
    const promoPurchaseId = `purchase-${randomUUID()}`;
    await firstDatabase.insert(billingPurchase).values({
      id: promoPurchaseId,
      accountId: promoFixture.accountId,
      sourceIdentity: `source-${promoPurchaseId}`,
      offerSnapshot: {},
      creditAtoms: 30n,
      state: 'paid',
    });
    await firstDatabase.insert(billingReversalCase).values({
      id: promoCaseId,
      accountId: promoFixture.accountId,
      purchaseId: promoPurchaseId,
      source: 'purchased',
      originalAtoms: 30n,
      netAppliedAtoms: 0n,
    });
    await firstLedger.applyReversalMutation({
      accountId: promoFixture.accountId,
      caseId: promoCaseId,
      source: 'purchased',
      targetReversedAtoms: 30n,
      occurredAt: new Date(),
    });
    const [promoAccount] = await firstDatabase
      .select()
      .from(creditAccount)
      .where(eq(creditAccount.id, promoFixture.accountId));
    expect(promoAccount).toMatchObject({ promoAtoms: 20n, planAtoms: 50n, purchasedAtoms: 0n, debtAtoms: 0n });
  });

  it('should reject unpaid purchase grants and validate paid replay payloads', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 0n });
    const { purchaseId, proof } = await seedPaidPurchase({
      database: firstDatabase,
      accountId: fixture.accountId,
      environment: fixture.environment,
      atoms: 25n,
      prepared: true,
    });
    const grant = { accountId: fixture.accountId, causeId: purchaseId };
    await expect(firstLedger.fulfillPaidPurchase(grant)).rejects.toThrow('not paid');
    await firstDatabase
      .update(billingPurchase)
      .set({ state: 'paid_unfulfilled', ...proof })
      .where(eq(billingPurchase.id, purchaseId));
    const receipt = await fulfillPaidFixture({
      database: firstDatabase,
      ledger: firstLedger,
      source: 'purchased',
      ...grant,
    });
    expect(receipt.grantedAtoms).toBe(25n);
    expect(await firstLedger.fulfillPaidPurchase(grant)).toEqual(receipt);
    await expect(firstLedger.fulfillPaidPurchase({ ...grant, accountId: 'other-account' })).rejects.toThrow();
  });

  it('should issue a ceiling-limited promotion whole or zero under a global budget race', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 0n,
    });
    const suffix = randomUUID();
    const secondUserId = `promo-user-${suffix}`;
    await firstDatabase.insert(user).values({
      id: secondUserId,
      name: 'Promo Race',
      email: `${secondUserId}@test.invalid`,
      emailVerified: true,
    });
    const secondAccountId = await secondLedger.ensureAccountBinding({
      environment: fixture.environment,
      authUserId: secondUserId,
    });
    const base = {
      environment: fixture.environment,
      promotionProgramId: fixture.promotionProgramId,
      periodStart: fixture.promotionPeriodStart,
      periodEnd: fixture.promotionPeriodEnd,
      entitlementAtoms: 100n,
      accountCeilingAtoms: 50n,
      budgetId: fixture.promotionBudgetId,
      occurredAt: fixture.now,
      enabled: true,
      replica: {
        schemaVersion: 1,
        meterContractIds: ledgerMeterContracts,
      },
    };
    qualifiedMeterContracts.set(fixture.meterContractId, new Set(['uncached_input:']));
    const issued = await Promise.all([
      firstLedger.applyPromotionIssuance({
        ...base,
        accountId: fixture.accountId,
      }),
      secondLedger.applyPromotionIssuance({
        ...base,
        accountId: secondAccountId,
      }),
    ]);
    expect(issued.sort((a, b) => Number(a) - Number(b))).toEqual([false, true]);
    const accounts = await firstDatabase
      .select()
      .from(creditAccount)
      .where(eq(creditAccount.environment, fixture.environment));
    const winners = accounts
      .filter(({ id }) => id === fixture.accountId || id === secondAccountId)
      .map(({ promoAtoms }) => promoAtoms)
      .sort((a, b) => Number(a - b));
    expect(winners).toEqual([0n, 50n]);
    const winnerAccountId = required(
      accounts.find(({ id, promoAtoms }) => (id === fixture.accountId || id === secondAccountId) && promoAtoms === 50n),
      'promotion winner',
    ).id;
    const activate = async (policy: unknown): Promise<string> => {
      const validatedPolicy = validateCommercialPolicy(policy);
      const activationId = `activation-${randomUUID()}`;
      await firstPolicyService.publishPolicy({
        policyJson: validatedPolicy.canonicalContent,
        environment: fixture.environment,
        activationId,
        jobKey: randomUUID(),
        expectedHeadRevision: ledgerHeadRevision,
        expectedPredecessorActivationId: ledgerHeadActivation,
        replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
      });
      ledgerHeadRevision += 1n;
      ledgerHeadActivation = activationId;
      return activationId;
    };
    const offActivationId = await activate({
      ...fixture.canonicalPolicy,
      policyVersion: randomUUID(),
      promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    });
    expect(await firstLedger.applyPromotionIssuance({ ...base, accountId: fixture.accountId })).toBe(false);
    const { purchaseId: paidDuringOffId } = await seedPaidPurchase({
      database: firstDatabase,
      accountId: fixture.accountId,
      environment: fixture.environment,
      atoms: 5n,
    });
    const paidDuringOff = await fulfillPaidFixture({
      database: firstDatabase,
      ledger: firstLedger,
      source: 'purchased',
      accountId: fixture.accountId,
      causeId: paidDuringOffId,
    });
    expect(paidDuringOff.grantedAtoms).toBe(5n);
    const futureActivationId = `activation-${randomUUID()}`;
    await firstPolicyService.publishPolicy({
      policyJson: JSON.stringify({ ...fixture.canonicalPolicy, policyVersion: randomUUID() }),
      environment: fixture.environment,
      activationId: futureActivationId,
      jobKey: `future-${randomUUID()}`,
      expectedHeadRevision: ledgerHeadRevision,
      expectedPredecessorActivationId: offActivationId,
      effectiveAt: new Date(Date.now() + 3_600_000),
      replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
    });
    ledgerHeadRevision += 1n;
    ledgerHeadActivation = futureActivationId;
    expect(await firstLedger.applyPromotionIssuance({ ...base, accountId: fixture.accountId })).toBe(false);
    await firstPolicyService.cancelPendingActivation({
      environment: fixture.environment,
      activationId: futureActivationId,
      jobKey: `cancel-${randomUUID()}`,
      expectedHeadRevision: ledgerHeadRevision,
    });
    ledgerHeadRevision += 1n;
    ledgerHeadActivation = offActivationId;
    const replayBudgetId = fixture.promotionBudgetId;
    const [originalBudget] = await firstDatabase
      .select()
      .from(billingBudget)
      .where(eq(billingBudget.id, replayBudgetId));
    const { fundingId } = required(originalBudget, 'promotion budget');
    // The fixture owner approves additional funding; neither lifetime nor period consumption is reset.
    await firstDatabase
      .update(billingBudgetFunding)
      .set({ fundedLifetime: 150n })
      .where(eq(billingBudgetFunding.id, fundingId));
    await firstDatabase.update(billingBudget).set({ approvedCap: 150n }).where(eq(billingBudget.id, replayBudgetId));
    const [fundedBudget] = await firstDatabase.select().from(billingBudget).where(eq(billingBudget.id, replayBudgetId));
    expect(fundedBudget).toMatchObject({ approvedCap: 150n, consumed: 50n, held: 0n });
    await activate({
      ...fixture.canonicalPolicy,
      policyVersion: randomUUID(),
      promotionalIssuance: {
        enabled: true,
        budgetCreditAtoms: '100',
        offer: {
          ...fixture.canonicalPolicy.promotionalIssuance.offer,
          budgetId: replayBudgetId,
          accountCeilingCreditAtoms: '100',
        },
      },
    });
    expect(
      await firstLedger.applyPromotionIssuance({
        ...base,
        budgetId: replayBudgetId,
        accountCeilingAtoms: 100n,
        accountId: winnerAccountId,
      }),
    ).toBe(false);
    const issuanceRows = await firstDatabase
      .select()
      .from(billingPromotionIssuance)
      .where(eq(billingPromotionIssuance.accountId, winnerAccountId));
    expect(issuanceRows).toHaveLength(1);
  });

  it('should cap an actual retail overrun, retain its evidence, and pause the route', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 200n,
    });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'overrun', 100n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    const receipt = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:overrun',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: fixture.now,
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 150n }],
      },
      resolvedAt: fixture.now,
    });
    expect(receipt).toMatchObject({ chargedAtoms: 100n });
    const [operation] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, admitted.operationId));
    expect(operation).toMatchObject({
      actualRetailAtoms: 150n,
      chargedAtoms: 100n,
      supplierState: 'unresolved',
    });
    const pauses = await firstDatabase
      .select()
      .from(billingRoutePause)
      .where(eq(billingRoutePause.operationId, admitted.operationId));
    expect(pauses).toHaveLength(1);
    expect(
      await firstDatabase
        .select()
        .from(billingOperationException)
        .where(eq(billingOperationException.operationId, admitted.operationId)),
    ).toEqual([
      expect.objectContaining({
        kind: 'customer_bound',
        observedNumerator: '150',
        observedDenominator: 1n,
        maximum: 100n,
      }),
    ]);
    const pausedAdmission = await firstLedger.admitOperation(admission(fixture, 'paused', 1n));
    expect(pausedAdmission.status).toBe('denied');
  });

  it('should pin an admitted tariff across a later policy activation', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 100n,
    });
    const oldAdmission = await firstLedger.admitOperation(admission(fixture, 'old-policy', 10n));
    if (oldAdmission.status !== 'admitted') {
      throw new Error('old policy operation was not admitted');
    }
    const nextActivationId = `activation-${randomUUID()}`;
    const nextPolicy = validateCommercialPolicy({
      ...fixture.canonicalPolicy,
      policyVersion: randomUUID(),
      rates: fixture.canonicalPolicy.rates.map((rate) => ({
        ...rate,
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '2' },
      })),
    });
    await firstPolicyService.publishPolicy({
      policyJson: nextPolicy.canonicalContent,
      environment: fixture.environment,
      activationId: nextActivationId,
      jobKey: randomUUID(),
      expectedHeadRevision: ledgerHeadRevision,
      expectedPredecessorActivationId: ledgerHeadActivation,
      replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
    });
    ledgerHeadRevision += 1n;
    ledgerHeadActivation = nextActivationId;
    const oldReceipt = await firstLedger.terminalizeOperation({
      operationId: oldAdmission.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:old-policy',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 10n }],
      },
      resolvedAt: new Date(),
    });
    expect(oldReceipt.chargedAtoms).toBe(10n);
    const nextAdmission = await firstLedger.admitOperation(admission(fixture, 'new-policy', 10n));
    if (nextAdmission.status !== 'admitted') {
      throw new Error('new policy operation was not admitted');
    }
    const [nextOperation] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, nextAdmission.operationId));
    expect(nextOperation?.authorizedAtoms).toBe(5n);
  });

  it('should retain a supplier-only overrun without changing the customer receipt', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 200n });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'supplier-overrun', 100n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    const receipt = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:supplier-overrun',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 50n }],
      },
      resolvedAt: new Date(),
    });
    await firstLedger.appendSupplierEvidence({
      operationId: admitted.operationId,
      environment: fixture.environment,
      provider: 'test',
      credentialAccount: 'supplier-overrun',
      sourceObjectId: randomUUID(),
      sourceRevision: '1',
      payloadDigest: 'sha256:supplier-overrun',
      currency: 'usd',
      numerator: 150n,
      denominator: 1_000_000_000_000n,
      completeness: 'complete',
      finality: 'final',
      receivedAt: new Date(),
    });
    const [evidence] = await firstDatabase
      .select()
      .from(supplierCostEvidence)
      .where(eq(supplierCostEvidence.payloadDigest, 'sha256:supplier-overrun'));
    expect(
      await firstLedger.finalizeSupplier({
        evidenceId: required(evidence, 'evidence').id,
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: 'sha256:supplier-overrun',
        expectedGeneration: 1n,
      }),
    ).toBe('unresolved');
    const replay = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:supplier-overrun',
      expectedGeneration: 1n,
      evidence: { kind: 'provider_rejected' },
      resolvedAt: new Date(),
    });
    expect(replay).toEqual(receipt);
    const [operation] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, admitted.operationId));
    const [riskHold] = await firstDatabase
      .select()
      .from(billingBudgetHold)
      .where(eq(billingBudgetHold.id, required(operation, 'operation').riskBudgetHoldId));
    expect(operation?.supplierState).toBe('unresolved');
    expect(riskHold).toMatchObject({ initialBound: 100n, remainingHeld: 100n, consumed: 0n });
    const pauses = await firstDatabase
      .select()
      .from(billingRoutePause)
      .where(eq(billingRoutePause.operationId, admitted.operationId));
    expect(pauses).toHaveLength(1);
  });

  it('should preserve and cap retail evidence above signed 64-bit storage', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 100n,
    });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'huge-retail', 100n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    const actual = 10_000_000_000_000_000_000n;
    const receipt = await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:huge-retail',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: actual }],
      },
      resolvedAt: new Date(),
    });
    expect(receipt.chargedAtoms).toBe(100n);
    const [operation] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, admitted.operationId));
    expect(operation).toMatchObject({
      actualRetailAtoms: actual,
      inputTokens: null,
      supplierState: 'unresolved',
    });
    expect(operation?.meterItems?.[0]?.quantity).toBe(actual.toString());
  });

  it('should round exact PostgreSQL terminal prices half-up, including zero', async () => {
    const verifyRounding = async (numerator: string, denominator: string, expected: bigint): Promise<void> => {
      const fixture = await createFixture(
        { promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 10n },
        { numerator, denominator },
      );
      const attemptKey = `round-${numerator}-${denominator}`;
      const admitted = await firstLedger.admitOperation(admission(fixture, attemptKey, 1n));
      if (admitted.status !== 'admitted') {
        throw new Error('rounding operation was not admitted');
      }
      const receipt = await firstLedger.terminalizeOperation({
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: `sha256:${attemptKey}`,
        expectedGeneration: 1n,
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(),
          meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 1n }],
        },
        resolvedAt: new Date(),
      });
      expect(receipt.chargedAtoms).toBe(expected);
      const replay = await firstLedger.terminalizeOperation({
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: `sha256:${attemptKey}`,
        expectedGeneration: 1n,
        evidence: { kind: 'provider_rejected' },
        resolvedAt: new Date(),
      });
      expect(replay).toEqual(receipt);
    };
    await verifyRounding('49', '100', 0n);
    await verifyRounding('1', '2', 1n);
    await verifyRounding('3', '2', 2n);
  });

  it('should reject an old-time admission after a lower tariff publishes while preserving the pinned operation', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 100n });
    const pinned = await firstLedger.admitOperation(admission(fixture, 'r3-pinned', 10n));
    if (pinned.status !== 'admitted') {
      throw new Error('pinned operation was not admitted');
    }
    const lowerPolicy: CommercialPolicy = {
      ...fixture.canonicalPolicy,
      policyVersion: randomUUID(),
      rates: fixture.canonicalPolicy.rates.map((rate) => ({
        ...rate,
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '2' },
      })),
    };
    await secondDatabase.transaction(async (oldTransaction) => {
      const oldDatabase = Object.assign(oldTransaction, { $client: secondDatabase.$client });
      const oldPolicyService = new BillingPolicyService({ database: oldDatabase });
      const oldLedger = new CreditLedgerService({ database: oldDatabase }, oldPolicyService);
      await oldDatabase.execute(sql`select transaction_timestamp()`);
      await publishFixturePolicy(fixture, lowerPolicy);
      await expect(oldLedger.admitOperation(admission(fixture, 'r3-old-price', 10n))).rejects.toThrow(
        'billing policy temporal regression',
      );
    });
    const receipt = await firstLedger.terminalizeOperation({
      operationId: pinned.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:r3-pinned',
      expectedGeneration: 1n,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 10n }],
      },
      resolvedAt: new Date(),
    });
    expect(receipt.chargedAtoms).toBe(10n);
    const fresh = await firstLedger.admitOperation(admission(fixture, 'r3-fresh-price', 10n));
    expect(fresh).toMatchObject({
      status: 'admitted',
      authorized: { promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 5n },
    });
  });

  it('should not revive a disabled promotion through an old transaction snapshot', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 0n });
    const promotionInput = {
      environment: fixture.environment,
      accountId: fixture.accountId,
      promotionProgramId: fixture.promotionProgramId,
      periodStart: fixture.promotionPeriodStart,
      periodEnd: fixture.promotionPeriodEnd,
      entitlementAtoms: 100n,
      accountCeilingAtoms: 50n,
      budgetId: fixture.promotionBudgetId,
      occurredAt: fixture.now,
      enabled: true,
      replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
    };
    await secondDatabase.transaction(async (oldTransaction) => {
      const oldDatabase = Object.assign(oldTransaction, { $client: secondDatabase.$client });
      const oldPolicyService = new BillingPolicyService({ database: oldDatabase });
      const oldLedger = new CreditLedgerService({ database: oldDatabase }, oldPolicyService);
      await oldDatabase.execute(sql`select transaction_timestamp()`);
      await publishFixturePolicy(fixture, {
        ...fixture.canonicalPolicy,
        policyVersion: randomUUID(),
        promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
      });
      await expect(oldLedger.applyPromotionIssuance(promotionInput)).rejects.toThrow(
        'billing policy temporal regression',
      );
    });
    expect(await firstLedger.applyPromotionIssuance(promotionInput)).toBe(false);
    const issuances = await firstDatabase
      .select()
      .from(billingPromotionIssuance)
      .where(eq(billingPromotionIssuance.accountId, fixture.accountId));
    expect(issuances).toHaveLength(0);
  });

  it('should roll back a scheduled observation when admission validation fails', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 100n });
    await firstPolicyService.selectEffectivePolicy({
      environment: fixture.environment,
      replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
    });
    const [before] = await firstDatabase
      .select()
      .from(billingPolicyHead)
      .where(eq(billingPolicyHead.environment, fixture.environment));
    const priorObserved = required(before, 'observed policy head').observedActivationId;
    const [deadlineRow] = await firstDatabase.execute(
      sql`select clock_timestamp() + interval '100 milliseconds' as at`,
    );
    const effectiveAt = new Date(String(required(deadlineRow, 'scheduled deadline')['at']));
    const scheduledActivationId = await publishFixturePolicy(
      fixture,
      { ...fixture.canonicalPolicy, policyVersion: randomUUID() },
      effectiveAt,
    );
    let eligible = false;
    const observationDeadline = performance.now() + 5000;
    for (let check = 0; check < 500 && !eligible && performance.now() < observationDeadline; check += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- synchronize to the database clock without retrying business work
      const [clock] = await firstDatabase.execute(
        sql`select clock_timestamp() >= ${effectiveAt.toISOString()}::timestamptz as eligible`,
      );
      eligible = Boolean(required(clock, 'database clock')['eligible']);
      if (!eligible) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- yield so 500 fast local observations cannot exhaust before the 100ms activation
        await delay(1);
      }
    }
    expect(eligible).toBe(true);
    await firstDatabase.transaction(async (transaction) => {
      const transactionDatabase = Object.assign(transaction, { $client: firstDatabase.$client });
      const transactionPolicyService = new BillingPolicyService({ database: transactionDatabase });
      const transactionLedger = new CreditLedgerService({ database: transactionDatabase }, transactionPolicyService);
      await expect(
        transactionLedger.admitOperation({
          ...admission(fixture, 'r3-invalid-admission', 1n),
          maximumQuantities: [],
        }),
      ).rejects.toThrow('Maximum meter quantities do not match the qualified contract');
      const [inside] = await transaction
        .select()
        .from(billingPolicyHead)
        .where(eq(billingPolicyHead.environment, fixture.environment));
      expect(required(inside, 'policy head after failed admission').observedActivationId).toBe(priorObserved);
    });
    const [after] = await firstDatabase
      .select()
      .from(billingPolicyHead)
      .where(eq(billingPolicyHead.environment, fixture.environment));
    expect(required(after, 'policy head after transaction commit').observedActivationId).toBe(priorObserved);
    expect(after?.currentActivationId).toBe(scheduledActivationId);
  });

  it('should freeze reporting time at dispatch intent before terminal evidence', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 10n });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'history-time', 1n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    await expect(
      firstClient.begin(async (transaction) => {
        await transaction`set local role tau_billing_runtime`;
        await transaction`update billing.credit_operation set execution_status = 'succeeded'
        where id = ${admitted.operationId}`;
      }),
    ).rejects.toThrow('operation evidence requires terminal transition');
    expect(await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation)).toBe(true);
    const [dispatched] = await firstClient`select usage_occurred_at::text as at,
      to_jsonb(o)->>'admitted_at' as admitted, to_jsonb(o)->>'dispatch_intent_at' as dispatched
      from billing.credit_operation o where id = ${admitted.operationId}`;
    expect(dispatched!['at']).toEqual(expect.any(String));
    expect(dispatched!['admitted']).toEqual(expect.any(String));
    expect(dispatched!['dispatched']).toEqual(expect.any(String));
    expect(await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation)).toBe(false);
    await firstLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:history-time',
      expectedGeneration: admitted.generation,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 1n }],
      },
      resolvedAt: new Date(),
    });
    const [terminal] = await firstClient`select usage_occurred_at::text as at
      from billing.credit_operation where id = ${admitted.operationId}`;
    expect(terminal!['at']).toBe(dispatched!['at']);
  });

  it('should preserve absorbed partial evidence and admission time for an undispatched release', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 10n });
    const partial = await firstLedger.admitOperation(admission(fixture, 'history-partial', 1n));
    if (partial.status !== 'admitted') {
      throw new Error('partial operation was not admitted');
    }
    await firstLedger.markDispatchIntent(partial.operationId, partial.generation);
    const result = await firstLedger.terminalizeOperation({
      operationId: partial.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:history-partial',
      expectedGeneration: partial.generation,
      evidence: {
        kind: 'absorbed_unknown',
        executionStatus: 'cancelled',
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 10_000_000_000_000_000_000n }],
        normalizationEvidence: { version: 'history-v1', fields: { observed: '10000000000000000000' } },
      },
      resolvedAt: new Date(),
    });
    expect(result.chargedAtoms).toBe(0n);
    const [stored] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, partial.operationId));
    expect(stored).toMatchObject({
      meteringStatus: 'partial',
      executionStatus: 'cancelled',
      inputTokens: null,
      meterItems: [{ quantity: '10000000000000000000' }],
      normalizationEvidence: { version: 'history-v1', fields: { observed: '10000000000000000000' } },
    });
    await expect(
      firstClient.begin(async (transaction) => {
        await transaction`set local role tau_billing_runtime`;
        await transaction`update billing.credit_operation set execution_status = 'succeeded' where id = ${partial.operationId}`;
      }),
    ).rejects.toThrow('immutable terminal receipt');
    const release = await firstLedger.admitOperation(admission(fixture, 'history-release', 1n));
    if (release.status !== 'admitted') {
      throw new Error('release operation was not admitted');
    }
    await firstLedger.terminalizeOperation({
      operationId: release.operationId,
      accountId: fixture.accountId,
      requestDigest: 'sha256:history-release',
      expectedGeneration: release.generation,
      evidence: { kind: 'provider_rejected' },
      resolvedAt: new Date(),
    });
    const [released] = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.id, release.operationId));
    expect(released?.usageOccurredAt).toEqual(released?.admittedAt);
    expect(released).toMatchObject({
      dispatchIntentAt: null,
      executionStatus: 'rejected',
      meteringStatus: 'unavailable',
    });
  });

  it('should claim lost acknowledgements once and fence the prior generation', async () => {
    const fixture = await createFixture({
      promoAtoms: 0n,
      planAtoms: 0n,
      purchasedAtoms: 100n,
    });
    const admitted = await firstLedger.admitOperation(admission(fixture, 'lost-ack', 50n));
    if (admitted.status !== 'admitted') {
      throw new Error('operation was not admitted');
    }
    await firstDatabase
      .update(creditOperation)
      .set({ dueAt: new Date(0) })
      .where(eq(creditOperation.id, admitted.operationId));
    const scopedClaim = {
      environment: fixture.environment,
      category: 'llm',
      accountId: fixture.accountId,
      pool: 'primary',
      limit: 100,
    } satisfies Parameters<CreditLedgerService['claimDueOperations']>[0];
    const [left, right] = await Promise.all([
      firstLedger.claimDueOperations(scopedClaim),
      secondLedger.claimDueOperations(scopedClaim),
    ]);
    const targetClaims = [...left, ...right].filter(({ operationId }) => operationId === admitted.operationId);
    expect(targetClaims).toHaveLength(1);
    expect(targetClaims[0]?.generation).toBe(2n);
    await expect(
      firstLedger.terminalizeOperation({
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: 'sha256:lost-ack',
        expectedGeneration: 1n,
        evidence: { kind: 'provider_rejected' },
        resolvedAt: new Date(),
      }),
    ).rejects.toThrow('Stale');
  });
});

describe('credit ledger source arithmetic', () => {
  const account = (overrides: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
    accountId: 'account',
    promoAtoms: 20n,
    planAtoms: 30n,
    purchasedAtoms: 50n,
    debtAtoms: 0n,
    promoHeldAtoms: 5n,
    planHeldAtoms: 10n,
    purchasedHeldAtoms: 20n,
    revision: 1n,
    ...overrides,
  });
  it('should allocate only unheld sources in order', () => {
    expect(allocateSources(account(), 60n)).toEqual({
      promoAtoms: 15n,
      planAtoms: 20n,
      purchasedAtoms: 25n,
    });
  });
  it('should repay debt before creating value', () => {
    expect(creditDebtFirst(12n, 20n)).toEqual({
      debtDeltaAtoms: -12n,
      assetAtoms: 8n,
    });
  });
});

const readInvocationOperation = async (operationId: string) => {
  const [row] = await firstDatabase.select().from(creditOperation).where(eq(creditOperation.id, operationId));
  return required(row, 'operation');
};
const readInvocationAccount = async (accountId: string) => {
  const [row] = await firstDatabase.select().from(creditAccount).where(eq(creditAccount.id, accountId));
  return required(row, 'account');
};

const fundedInvocation = (fixture: Fixture, key: string): QualifiedAdmissionInput => ({
  ...admission(fixture, key, 10n),
  surface: 'gateway',
  invocation: {
    contractVersion: 'controlled-v1',
    credentialAccount: 'controlled-account',
    supplierRatesValidUntil: null,
    executionTimeout: 300_000,
    supplierRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
    supplierValuation: {
      version: 'supplier-valuation-v1',
      sourceRevision: 'controlled-valuation-v1',
      longContextMinimumInputTokens: null,
      baseRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
      longContextRates: null,
    },
  },
});

describe('LLM durable evidence and fenced recovery', () => {
  it.each([3n, 11n])(
    'should recover retained usage %s and preserve supplier overrun evidence after a foreground crash',
    async (quantity) => {
      const fixture = await createFixture();
      const request = fundedInvocation(fixture, randomUUID());
      const admitted = await firstLedger.admitOperation(request);
      expect(admitted.status).toBe('admitted');
      if (admitted.status !== 'admitted') {
        throw new Error('Invocation was not admitted');
      }
      expect(await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation)).toBe(true);
      expect(await firstLedger.getDispatchTimeRemaining(admitted.operationId, admitted.generation)).toBeGreaterThan(0);
      const identity = {
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: request.requestDigest,
      };
      const evidence: TerminalEvidence = {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity }],
      };
      await expect(
        firstLedger.terminalizeOperation({
          ...identity,
          expectedGeneration: admitted.generation,
          evidence,
          resolvedAt: new Date(),
        }),
      ).rejects.toThrow('durably recorded');
      await firstLedger.recordInvocationEvidence({ ...identity, evidence });
      await firstLedger.recordInvocationEvidence({ ...identity, evidence });
      expect(
        await firstDatabase
          .select()
          .from(billingInvocationEvidence)
          .where(eq(billingInvocationEvidence.operationId, admitted.operationId)),
      ).toHaveLength(1);
      await firstDatabase
        .update(creditOperation)
        .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(creditOperation.id, admitted.operationId));
      const recovery = await secondLedger.recoverDueLlmOperations({ environment: fixture.environment, limit: 100 });
      expect(recovery.failedOperationIds).not.toContain(admitted.operationId);
      expect(await firstLedger.getDispatchTimeRemaining(admitted.operationId, admitted.generation)).toBe(0);
      const row = await readInvocationOperation(admitted.operationId);
      expect(row).toMatchObject({
        customerState: 'settled',
        chargedAtoms: quantity > 10n ? 10n : quantity,
        supplierState: quantity > 10n ? 'unresolved' : 'preliminary',
        generation: 2n,
      });
      await expect(
        firstLedger.terminalizeOperation({
          ...identity,
          expectedGeneration: admitted.generation,
          evidence,
          resolvedAt: new Date(),
        }),
      ).rejects.toThrow('Stale credit operation generation');
      const supplierRows = await firstDatabase
        .select()
        .from(supplierCostEvidence)
        .where(eq(supplierCostEvidence.operationId, admitted.operationId));
      expect(supplierRows).toHaveLength(1);
      expect(supplierRows[0]).toMatchObject({
        numerator: quantity,
        denominator: 1_000_000_000_000n,
        finality: 'preliminary',
      });
      if (quantity > 10n) {
        const pauses = await firstDatabase
          .select()
          .from(billingRoutePause)
          .where(eq(billingRoutePause.operationId, admitted.operationId));
        expect(pauses).toHaveLength(1);
        expect(pauses[0]?.reason).toBe('supplier_bound_exceeded');
      }

      expect(
        await firstDatabase
          .select()
          .from(billingBudgetHold)
          .where(eq(billingBudgetHold.operationId, admitted.operationId)),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ remainingHeld: 10n, consumed: 0n })]));
    },
  );

  it.each([false, true])(
    'should recover cancellation with supplier risk preserved when dispatched=%s',
    async (dispatched) => {
      const fixture = await createFixture();
      const request = fundedInvocation(fixture, randomUUID());
      const admitted = await firstLedger.admitOperation(request);
      if (admitted.status !== 'admitted') {
        throw new Error('Invocation was not admitted');
      }
      const identity = {
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: request.requestDigest,
      };
      if (dispatched) {
        expect(await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation)).toBe(true);
      }
      const before = await readInvocationAccount(fixture.accountId);
      if (dispatched) {
        await firstLedger.recordInvocationEvidence({
          ...identity,
          evidence: {
            kind: 'absorbed_unknown',
            executionStatus: 'unknown',
            meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 2n }],
            normalizationEvidence: {
              version: 'partial-v1',
              providerRequestId: 'partial-request',
              fields: { input: '2' },
            },
          },
        });
      }
      await firstLedger.recordCancellation(identity);
      expect(await readInvocationAccount(fixture.accountId)).toEqual(before);
      await firstDatabase
        .update(creditOperation)
        .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(creditOperation.id, admitted.operationId));
      await secondLedger.recoverDueLlmOperationsForOwner({
        environment: fixture.environment,
        authUserId: fixture.userId,
        activity: 'agent',
      });
      const row = await readInvocationOperation(admitted.operationId);
      expect(row).toMatchObject({
        customerState: dispatched ? 'absorbed' : 'released',
        chargedAtoms: 0n,
        supplierState: dispatched ? 'unresolved' : 'final',
      });
      const holds = await firstDatabase
        .select()
        .from(billingBudgetHold)
        .where(eq(billingBudgetHold.operationId, admitted.operationId));
      expect(holds).toHaveLength(2);
      if (dispatched) {
        expect(row.normalizationEvidence).toEqual({
          version: 'partial-v1',
          providerRequestId: 'partial-request',
          fields: { input: '2' },
        });
        expect(row.meterItems).toEqual([expect.objectContaining({ dimension: 'uncached_input', quantity: '2' })]);
        expect(holds.find((hold) => hold.id === row.spendBudgetHoldId)).toMatchObject({
          remainingHeld: 10n,
          consumed: 0n,
        });
        expect(holds.find((hold) => hold.id === row.riskBudgetHoldId)).toMatchObject({
          remainingHeld: 0n,
          consumed: 10n,
        });
      } else {
        expect(holds.every((hold) => hold.remainingHeld === 0n && hold.consumed === 0n)).toBe(true);
      }
      await firstLedger.recordInvocationEvidence({
        ...identity,
        evidence: {
          kind: 'final_usage',
          usageOccurredAt: new Date(),
          meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 5n }],
        },
      });
      expect(await readInvocationOperation(admitted.operationId)).toEqual(row);
    },
  );

  it('should enforce one shared 64-primary-invocation account bound across independent replicas', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 1000n });
    const attempts = Array.from({ length: 72 }, (_, index) => ({
      ...fundedInvocation(fixture, randomUUID()),
      activity: index % 2 === 0 ? 'agent' : 'unrecognized-public-activity',
    }));
    const results = await Promise.all(
      attempts.map(async (request, index) => (index % 2 === 0 ? firstLedger : secondLedger).admitOperation(request)),
    );
    expect(results.filter((result) => result.status === 'admitted')).toHaveLength(64);
    expect(results.filter((result) => result.status === 'denied')).toEqual(
      Array.from({ length: 8 }, () => ({ status: 'denied', reason: 'concurrency_unavailable' })),
    );
    const helperRequest = { ...fundedInvocation(fixture, randomUUID()), activity: 'title' };
    const helper = await firstLedger.admitOperation(helperRequest);
    expect(helper.status).toBe('admitted');
    if (helper.status !== 'admitted') {
      throw new Error('Helper invocation was not admitted');
    }
    await firstLedger.recordInvocationEvidence({
      operationId: helper.operationId,
      accountId: fixture.accountId,
      requestDigest: helperRequest.requestDigest,
      evidence: { kind: 'provider_rejected' },
    });
    await firstLedger.terminalizeOperation({
      operationId: helper.operationId,
      accountId: fixture.accountId,
      requestDigest: helperRequest.requestDigest,
      expectedGeneration: helper.generation,
      evidence: { kind: 'provider_rejected' },
      resolvedAt: new Date(),
    });
    const account = await readInvocationAccount(fixture.accountId);
    expect(account).toMatchObject({
      purchasedAtoms: 1000n,
      purchasedHeldAtoms: 640n,
      promoHeldAtoms: 0n,
      planHeldAtoms: 0n,
    });
    const admittedPrimaryIds = results.flatMap((result) => (result.status === 'admitted' ? [result.operationId] : []));
    await firstDatabase
      .update(creditOperation)
      .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
      .where(inArray(creditOperation.id, admittedPrimaryIds));
    const recovery = await secondLedger.recoverDueLlmOperationsForOwner({
      environment: fixture.environment,
      authUserId: fixture.userId,
      activity: 'agent',
    });
    expect(recovery).toEqual({
      pool: 'primary',
      claimed: 64,
      resolved: 64,
      pending: 0,
      remainingDue: 0,
      leasedDue: 0,
      oldestDueAgeMilliseconds: undefined,
      failedOperationIds: [],
    });
    await expect(
      firstLedger.admitOperation({ ...fundedInvocation(fixture, randomUUID()), activity: 'agent' }),
    ).resolves.toMatchObject({ status: 'admitted' });
    expect(await readInvocationAccount(fixture.accountId)).toMatchObject({ purchasedHeldAtoms: 10n });
  });

  it('should isolate 64 pending helpers from primary advisory and atomic admission', async () => {
    const fixture = await createFixture({ promoAtoms: 0n, planAtoms: 0n, purchasedAtoms: 1000n });
    const helpers = await Promise.all(
      Array.from({ length: 64 }, async (_, index) =>
        (index % 2 === 0 ? firstLedger : secondLedger).admitOperation({
          ...fundedInvocation(fixture, randomUUID()),
          activity: index % 2 === 0 ? 'title' : 'commit',
        }),
      ),
    );
    expect(helpers.filter((result) => result.status === 'admitted')).toHaveLength(64);
    const eligibility = {
      environment: fixture.environment,
      authUserId: fixture.userId,
      sku: fixture.sku,
      replica: { schemaVersion: 1, meterContractIds: ledgerMeterContracts },
      executionTimeout: 300_000,
      minimumOutput: 10n,
      minimumSupplierPicoUsd: 10n,
    };
    await expect(firstLedger.inputCountEligibility({ ...eligibility, activity: 'title' })).resolves.toEqual({
      status: 'denied',
      reason: 'concurrency_unavailable',
    });
    await expect(firstLedger.inputCountEligibility({ ...eligibility, activity: 'agent' })).resolves.toMatchObject({
      status: 'eligible',
    });
    await expect(
      firstLedger.admitOperation({ ...fundedInvocation(fixture, randomUUID()), activity: 'title' }),
    ).resolves.toEqual({ status: 'denied', reason: 'concurrency_unavailable' });
    const primary = await firstLedger.admitOperation({
      ...fundedInvocation(fixture, randomUUID()),
      activity: 'agent',
    });
    expect(primary).toMatchObject({ status: 'admitted' });
    if (primary.status !== 'admitted') {
      throw new Error('Primary invocation was not admitted');
    }
    expect(await readInvocationAccount(fixture.accountId)).toMatchObject({ purchasedHeldAtoms: 650n });
    await firstDatabase
      .update(creditOperation)
      .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(creditOperation.accountId, fixture.accountId));
    await expect(
      firstLedger.recoverDueLlmOperationsForOwner({
        environment: fixture.environment,
        authUserId: 'unbound-user',
        activity: 'title',
      }),
    ).resolves.toEqual({
      pool: 'helper',
      claimed: 0,
      resolved: 0,
      pending: 0,
      remainingDue: 0,
      leasedDue: 0,
      failedOperationIds: [],
    });
    const helperRecovery = await secondLedger.recoverDueLlmOperationsForOwner({
      environment: fixture.environment,
      authUserId: fixture.userId,
      activity: 'title',
    });
    expect(helperRecovery).toEqual({
      pool: 'helper',
      claimed: 64,
      resolved: 64,
      pending: 0,
      remainingDue: 0,
      leasedDue: 0,
      oldestDueAgeMilliseconds: undefined,
      failedOperationIds: [],
    });
    expect(await readInvocationOperation(primary.operationId)).toMatchObject({ customerState: 'pending' });
    await expect(
      secondLedger.recoverDueLlmOperationsForOwner({
        environment: fixture.environment,
        authUserId: fixture.userId,
        activity: 'agent',
      }),
    ).resolves.toMatchObject({ pool: 'primary', claimed: 1, resolved: 1, remainingDue: 0, leasedDue: 0 });
    expect(await readInvocationAccount(fixture.accountId)).toMatchObject({ purchasedHeldAtoms: 0n });
  });

  it('should report due work leased by another scoped claimant without taking it', async () => {
    const fixture = await createFixture();
    const admitted = await firstLedger.admitOperation({
      ...fundedInvocation(fixture, randomUUID()),
      activity: 'agent',
    });
    if (admitted.status !== 'admitted') {
      throw new Error('Invocation was not admitted');
    }
    await firstDatabase
      .update(creditOperation)
      .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(creditOperation.id, admitted.operationId));
    await expect(
      firstLedger.claimDueOperations({
        environment: fixture.environment,
        category: 'llm',
        accountId: fixture.accountId,
        pool: 'primary',
        limit: 1,
      }),
    ).resolves.toHaveLength(1);
    const recovery = await secondLedger.recoverDueLlmOperationsForOwner({
      environment: fixture.environment,
      authUserId: fixture.userId,
      activity: 'agent',
    });
    expect(recovery).toMatchObject({
      pool: 'primary',
      claimed: 0,
      resolved: 0,
      remainingDue: 1,
      leasedDue: 1,
      failedOperationIds: [],
    });
    expect(typeof recovery.oldestDueAgeMilliseconds).toBe('number');
  });
});

it('should retain a preliminary supplier overrun and pause before invoice finality without changing money', async () => {
  const fixture = await createFixture();
  const request = fundedInvocation(fixture, randomUUID());
  const admitted = await firstLedger.admitOperation(request);
  if (admitted.status !== 'admitted') {
    throw new Error('Invocation was not admitted');
  }
  const before = await firstDatabase.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
  const input: SupplierEvidenceInput = {
    operationId: admitted.operationId,
    environment: fixture.environment,
    provider: 'controlled',
    credentialAccount: 'controlled-account',
    sourceObjectId: randomUUID(),
    sourceRevision: 'response-v1',
    payloadDigest: randomUUID(),
    currency: 'usd',
    numerator: 21n,
    denominator: 2_000_000_000_000n,
    completeness: 'complete',
    finality: 'preliminary',
    receivedAt: new Date(),
  };
  expect(await firstLedger.appendSupplierEvidence(input)).toBe('inserted');
  expect(await secondLedger.appendSupplierEvidence(input)).toBe('replay');
  expect(await firstDatabase.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId))).toEqual(
    before,
  );
  expect(
    await firstDatabase
      .select()
      .from(billingOperationException)
      .where(eq(billingOperationException.operationId, admitted.operationId)),
  ).toEqual([
    expect.objectContaining({
      kind: 'supplier_bound',
      observedNumerator: '21000000000000',
      observedDenominator: 2_000_000_000_000n,
      maximum: 10n,
    }),
  ]);
  expect(
    await firstDatabase.select().from(billingRoutePause).where(eq(billingRoutePause.operationId, admitted.operationId)),
  ).toHaveLength(1);
  const [retained] = await firstDatabase
    .select()
    .from(supplierCostEvidence)
    .where(eq(supplierCostEvidence.sourceObjectId, input.sourceObjectId));
  const evidence = required(retained, 'evidence');
  await expect(
    firstLedger.finalizeSupplier({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: request.requestDigest,
      expectedGeneration: admitted.generation,
      evidenceId: evidence.id,
    }),
  ).rejects.toThrow('Qualified final supplier evidence not found');
});

it('should execute a bounded recovery batch through the built DB-only runtime-role command', async () => {
  const fixture = await createFixture();
  const admitted = await firstLedger.admitOperation(fundedInvocation(fixture, randomUUID()));
  if (admitted.status !== 'admitted') {
    throw new Error('Invocation was not admitted');
  }
  await firstDatabase
    .update(creditOperation)
    .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(creditOperation.id, admitted.operationId));
  expect(await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation)).toBe(false);
  const childEnvironment: Record<string, string | undefined> = {};
  childEnvironment['PATH'] = process.env['PATH'];
  childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
  childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
  childEnvironment['BILLING_ENVIRONMENT'] = fixture.environment;
  const child = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, '../../../dist/billing-command.js'),
      'recover-llm',
      '--environment',
      fixture.environment,
      '--limit',
      '100',
    ],
    {
      // The DB-only child deliberately excludes AppModule environment and provider credentials.
      env: childEnvironment as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  expect(child.error).toBeUndefined();
  expect(child.stderr).toBe('');
  expect(child.status).toBe(0);
  expect(JSON.parse(child.stdout)).toMatchObject({ failedOperationIds: [] });
  const operation = await readInvocationOperation(admitted.operationId);
  expect(operation).toMatchObject({ customerState: 'released', supplierState: 'final', chargedAtoms: 0n });
});

it('should reject expired supplier rates using database admission time despite a regressed process clock', async () => {
  const fixture = await createFixture();
  const request = fundedInvocation(fixture, randomUUID());
  if (!request.invocation) {
    throw new Error('Invocation missing');
  }
  request.invocation.supplierRatesValidUntil = '2021-01-01T00:00:00.000Z';
  const processClock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2020-01-01T00:00:00.000Z'));
  try {
    expect(await firstLedger.admitOperation(request)).toEqual({ status: 'denied', reason: 'policy_unavailable' });
  } finally {
    processClock.mockRestore();
  }
  expect(
    await firstDatabase.select().from(creditOperation).where(eq(creditOperation.accountId, fixture.accountId)),
  ).toEqual([]);
});

it('should convert exact USD evidence to pico-USD once before consuming supplier budgets', async () => {
  const fixture = await createFixture();
  const budgetIds = [fixture.spendBudgetId, fixture.riskBudgetId];
  const budgets = await firstDatabase.select().from(billingBudget).where(inArray(billingBudget.id, budgetIds));
  await firstDatabase
    .update(billingBudgetFunding)
    .set({ fundedLifetime: 20_000_000_000n })
    .where(
      inArray(
        billingBudgetFunding.id,
        budgets.map(({ fundingId }) => fundingId),
      ),
    );
  await firstDatabase
    .update(billingBudget)
    .set({ approvedCap: 20_000_000_000n })
    .where(inArray(billingBudget.id, budgetIds));
  const request = { ...admission(fixture, randomUUID(), 1000n), supplierMaximumPicoUsd: 10_000_000_000n };
  const admitted = await firstLedger.admitOperation(request);
  if (admitted.status !== 'admitted') {
    throw new Error('Invocation was not admitted');
  }
  await firstLedger.appendSupplierEvidence({
    operationId: admitted.operationId,
    environment: fixture.environment,
    provider: 'controlled',
    credentialAccount: 'controlled-account',
    sourceObjectId: admitted.operationId,
    sourceRevision: 'final-usd',
    payloadDigest: 'sha256:one-cent',
    currency: 'usd',
    numerator: 1n,
    denominator: 100n,
    completeness: 'complete',
    finality: 'final',
    receivedAt: new Date(),
  });
  const [retained] = await firstDatabase
    .select()
    .from(supplierCostEvidence)
    .where(eq(supplierCostEvidence.operationId, admitted.operationId));
  expect(required(retained, 'evidence')).toMatchObject({ numerator: 1n, denominator: 100n, currency: 'usd' });
  expect(
    await firstLedger.finalizeSupplier({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: request.requestDigest,
      expectedGeneration: admitted.generation,
      evidenceId: required(retained, 'evidence').id,
    }),
  ).toBe('final');
  const holds = await firstDatabase
    .select()
    .from(billingBudgetHold)
    .where(eq(billingBudgetHold.operationId, admitted.operationId));
  expect(holds).toHaveLength(2);
  expect(holds.every(({ consumed, remainingHeld }) => consumed === 10_000_000_000n && remainingHeld === 0n)).toBe(true);
});

it('should serialize supplier route pauses with admissions even when no pause row existed', async () => {
  const fixture = await createFixture();
  const original = await firstLedger.admitOperation(fundedInvocation(fixture, randomUUID()));
  if (original.status !== 'admitted') {
    throw new Error('Invocation was not admitted');
  }
  const [firstBackend] = await firstClient<Array<{ pid: number }>>`select pg_backend_pid() as pid`;
  const [secondBackend] = await secondClient<Array<{ pid: number }>>`select pg_backend_pid() as pid`;
  const observer = postgres(databaseUrl, { max: 2 });
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const blocking = observer.begin(async (tx) => {
    await tx`select id from billing.billing_budget_funding where id =
      (select funding_id from billing.billing_budget where id = ${fixture.spendBudgetId}) for update`;
    locked.resolve();
    await release.promise;
  });
  const pending: Array<Promise<unknown>> = [blocking];
  try {
    await locked.promise;
    const admissionResult = firstLedger.admitOperation(fundedInvocation(fixture, randomUUID()));
    pending.push(admissionResult);
    await vi.waitFor(
      async () => {
        const [state] =
          await observer`select wait_event_type from pg_stat_activity where pid = ${required(firstBackend, 'first backend').pid}`;
        expect(state?.['wait_event_type']).toBe('Lock');
      },
      { timeout: 5000 },
    );
    const pauseResult = secondLedger.appendSupplierEvidence({
      operationId: original.operationId,
      environment: fixture.environment,
      provider: 'controlled',
      credentialAccount: 'controlled-account',
      sourceObjectId: original.operationId,
      sourceRevision: 'racing-overrun',
      payloadDigest: 'sha256:racing-overrun',
      currency: 'usd',
      numerator: 11n,
      denominator: 1_000_000_000_000n,
      completeness: 'complete',
      finality: 'preliminary',
      receivedAt: new Date(),
    });
    pending.push(pauseResult);
    await vi.waitFor(
      async () => {
        const [state] =
          await observer`select wait_event from pg_stat_activity where pid = ${required(secondBackend, 'second backend').pid}`;
        expect(state?.['wait_event']).toBe('advisory');
      },
      { timeout: 5000 },
    );
    release.resolve();
    await blocking;
    expect(await admissionResult).toMatchObject({ status: 'admitted' });
    expect(await pauseResult).toBe('inserted');
    expect(await firstLedger.admitOperation(fundedInvocation(fixture, randomUUID()))).toEqual({
      status: 'denied',
      reason: 'policy_unavailable',
    });
  } finally {
    release.resolve();
    await Promise.allSettled(pending);
    await observer.end();
  }
});

it.each([
  { quantity: 3n, basis: true, numerator: 3n },
  { quantity: 7n, basis: true, numerator: 14n },
  { quantity: 3n, basis: false, numerator: 0n },
])('recovers actual tariff without reinterpreting legacy supplier maximum: $quantity / $basis', async (sample) => {
  const fixture = await createFixture();
  const request = fundedInvocation(fixture, randomUUID());
  if (!request.invocation) {
    throw new Error('Missing invocation');
  }
  request.supplierMaximumPicoUsd = 20n;
  request.invocation.supplierRates[0]!.numeratorPicoUsd = '2';
  if (sample.basis) {
    request.invocation.supplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'controlled-context-v1',
      longContextMinimumInputTokens: '5',
      baseRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
      longContextRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' }],
    };
  } else {
    delete request.invocation.supplierValuation;
  }
  const admitted = await firstLedger.admitOperation(request);
  if (admitted.status !== 'admitted') {
    throw new Error('Expected admission');
  }
  await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation);
  const identity = {
    operationId: admitted.operationId,
    accountId: fixture.accountId,
    requestDigest: request.requestDigest,
  };
  await firstLedger.recordInvocationEvidence({
    ...identity,
    evidence: {
      kind: 'final_usage',
      usageOccurredAt: new Date(),
      meterItems: [{ dimension: 'uncached_input', tier: null, quantity: sample.quantity }],
    },
  });
  await firstDatabase
    .update(creditOperation)
    .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(creditOperation.id, admitted.operationId));
  const recovery = await secondLedger.recoverDueLlmOperations({ environment: fixture.environment, limit: 100 });
  expect(recovery.failedOperationIds).not.toContain(admitted.operationId);
  const operation = await readInvocationOperation(admitted.operationId);
  expect(operation.chargedAtoms).toBe(sample.quantity);
  const costs = await firstDatabase
    .select()
    .from(supplierCostEvidence)
    .where(eq(supplierCostEvidence.operationId, admitted.operationId));
  expect(costs).toHaveLength(sample.basis ? 1 : 0);
  if (sample.basis) {
    expect(BigInt(costs[0]!.numerator) * 1_000_000_000_000n).toBe(sample.numerator * costs[0]!.denominator);
  }
  const holds = await firstDatabase
    .select()
    .from(billingBudgetHold)
    .where(eq(billingBudgetHold.operationId, admitted.operationId));
  expect(holds.every((hold) => hold.remainingHeld === 20n && hold.consumed === 0n)).toBe(true);
});

it.each([
  { recover: false, partitionQuantity: 4n },
  { recover: true, partitionQuantity: 4n },
  { recover: false, partitionQuantity: 6n },
  { recover: true, partitionQuantity: 6n },
])(
  'enforces joint inputs $partitionQuantity in recovery=$recover with independent retail/supplier maxima',
  async ({ recover, partitionQuantity }) => {
    const partitions = [
      { dimension: 'uncached_input', tier: null, numerator: '1', denominator: '1' },
      { dimension: 'cache_read', tier: null, numerator: '10', denominator: '1' },
      { dimension: 'cache_write', tier: '30m', numerator: '1', denominator: '1' },
      { dimension: 'output', tier: null, numerator: '1', denominator: '1' },
    ];
    const fixture = await createFixture(undefined, undefined, partitions);
    const request = fundedInvocation(fixture, randomUUID());
    qualifiedMeterContracts.set(
      fixture.meterContractId,
      new Set(partitions.map((item) => `${item.dimension}:${item.tier ?? ''}`)),
    );
    request.maximumQuantities = partitions.map((item) => ({
      dimension: item.dimension,
      tier: item.tier,
      quantity: item.dimension === 'output' ? 1n : 10n,
    }));
    request.supplierMaximumPicoUsd = 201n;
    if (!request.invocation) {
      throw new Error('Missing invocation');
    }
    request.invocation.jointInputMaximum = { version: 'joint-input-v1', quantity: '10' };
    request.invocation.supplierRates = partitions.map((item) => ({
      dimension: item.dimension,
      tier: item.tier,
      numeratorPicoUsd: item.dimension === 'cache_write' ? '20' : '1',
      denominatorUnits: '1',
    }));
    request.invocation.supplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'controlled-joint-v1',
      longContextMinimumInputTokens: null,
      baseRates: request.invocation.supplierRates,
      longContextRates: null,
    };
    await expect(firstLedger.admitOperation({ ...request, supplierMaximumPicoUsd: 202n })).rejects.toThrow(
      'independently pinned tariff',
    );
    const deniedWrites = await firstDatabase
      .select()
      .from(creditOperation)
      .where(eq(creditOperation.attemptKey, request.attemptKey));
    expect(deniedWrites).toHaveLength(0);
    const admitted = await firstLedger.admitOperation(request);
    if (admitted.status !== 'admitted') {
      throw new Error('Expected admission');
    }
    expect(admitted.authorized.promoAtoms).toBe(101n);
    await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation);
    const identity = {
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: request.requestDigest,
    };
    // Each partition is under ten; their sum is twelve. Retail remains below A.
    const evidence: TerminalEvidence = {
      kind: 'final_usage',
      usageOccurredAt: new Date(),
      meterItems: [
        { dimension: 'uncached_input', tier: null, quantity: partitionQuantity },
        { dimension: 'cache_read', tier: null, quantity: 0n },
        { dimension: 'cache_write', tier: '30m', quantity: partitionQuantity },
        { dimension: 'output', tier: null, quantity: 1n },
      ],
    };
    await firstLedger.recordInvocationEvidence({ ...identity, evidence });
    if (recover) {
      await firstDatabase
        .update(creditOperation)
        .set({ dueAt: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(creditOperation.id, admitted.operationId));
      const recovery = await secondLedger.recoverDueLlmOperations({ environment: fixture.environment, limit: 100 });
      expect(recovery.failedOperationIds).not.toContain(admitted.operationId);
    } else {
      await firstLedger.terminalizeOperation({
        ...identity,
        expectedGeneration: admitted.generation,
        evidence,
        resolvedAt: new Date(),
      });
    }
    const operation = await readInvocationOperation(admitted.operationId);
    expect(operation).toMatchObject({
      chargedAtoms: 2n * partitionQuantity + 1n,
      authorizedAtoms: 101n,
      supplierState: partitionQuantity > 5n ? 'unresolved' : recover ? 'preliminary' : 'reserved',
    });
    const exceptions = await firstDatabase
      .select()
      .from(billingOperationException)
      .where(eq(billingOperationException.operationId, admitted.operationId));
    expect(exceptions).toEqual(
      partitionQuantity > 5n
        ? [
            expect.objectContaining({
              kind: 'input_bound',
              quantum: 'input_tokens',
              observedNumerator: '12',
              maximum: 10n,
            }),
          ]
        : [],
    );
    const pauses = await firstDatabase
      .select()
      .from(billingRoutePause)
      .where(eq(billingRoutePause.operationId, admitted.operationId));
    expect(pauses[0]?.reason).toBe(partitionQuantity > 5n ? 'input_bound_exceeded' : undefined);
    const holds = await firstDatabase
      .select()
      .from(billingBudgetHold)
      .where(eq(billingBudgetHold.operationId, admitted.operationId));
    expect(holds.every((hold) => hold.remainingHeld === 201n && hold.consumed === 0n)).toBe(true);
  },
);

/*
 * Defect A of the tariff sync close-out: a route whose meter contract this replica has retired is
 * unreachable anyway, so it denies its own SKU rather than failing every billing read.
 */
it('should deny only the SKU whose meter contract this replica retired', async () => {
  const fixture = await createFixture();
  const suffix = randomUUID();
  const retiredContract = `retired-meter-${suffix}`;
  const retiredSku = `retired-sku-${suffix}`;
  const retiredRateId = `retired-rate-${suffix}`;
  ledgerMeterContracts.push(retiredContract);
  qualifiedMeterContracts.set(retiredContract, new Set(['uncached_input:']));
  const base = fixture.canonicalPolicy;
  await publishFixturePolicy(fixture, {
    ...base,
    policyVersion: `${base.policyVersion}-retired`,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [...base.fleet.meterContractIds, retiredContract] },
    rates: [
      ...base.rates,
      {
        rateId: retiredRateId,
        meterContractId: retiredContract,
        dimension: 'uncached_input',
        tier: null,
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
    ],
    routes: [
      ...base.routes,
      {
        routeId: `retired-route-${suffix}`,
        sku: retiredSku,
        meterContractId: retiredContract,
        rateIds: [retiredRateId],
        enabled: true,
        spendBudgetId: fixture.spendBudgetId,
        riskBudgetId: fixture.riskBudgetId,
      },
    ],
  });

  const request = admission(fixture, `retired-${suffix}`, 10n);
  // The catalogue drops the route after publication; the policy document keeps it.
  qualifiedMeterContracts.delete(retiredContract);
  const eligibility = {
    environment: fixture.environment,
    authUserId: fixture.userId,
    replica: request.replica,
    activity: 'agent',
    executionTimeout: 300_000,
    minimumOutput: 10n,
    minimumSupplierPicoUsd: 10n,
  };
  await expect(firstLedger.inputCountEligibility({ ...eligibility, sku: retiredSku })).resolves.toEqual({
    status: 'denied',
    reason: 'policy_unavailable',
  });
  expect(await firstLedger.admitOperation({ ...request, sku: retiredSku })).toEqual({
    status: 'denied',
    reason: 'policy_unavailable',
  });
  expect(
    await firstDatabase.select().from(creditOperation).where(eq(creditOperation.accountId, fixture.accountId)),
  ).toEqual([]);

  // The route this replica still knows is admitted from the very same policy document.
  await expect(firstLedger.inputCountEligibility({ ...eligibility, sku: fixture.sku })).resolves.toMatchObject({
    status: 'eligible',
  });
  expect(await firstLedger.admitOperation(admission(fixture, `known-${suffix}`, 10n))).toMatchObject({
    status: 'admitted',
  });
});

/*
 * Defect A on the settlement path: `settlementTariff` re-reads the operation's own pinned policy
 * inside the terminalising transaction to price a long-context turn down to its base sku. That
 * document is older than the replica reading it, so a route retired since must not strand the
 * settlement of an unrelated turn.
 */
it('should settle a long-context downgrade from a pinned policy naming a route this replica retired', async () => {
  // The base sku starts at the premium rate, so the tier split below buys no notice: Q3 judges a
  // new sku against its parent, and only the base's own decrease and the retired route are new.
  const fixture = await createFixture(undefined, { numerator: '2', denominator: '1' });
  const suffix = randomUUID();
  const longContextSku = `${fixture.sku}:long-context`;
  const retiredContract = `settle-retired-meter-${suffix}`;
  ledgerMeterContracts.push(retiredContract);
  qualifiedMeterContracts.set(retiredContract, new Set(['uncached_input:']));
  const base = fixture.canonicalPolicy;
  const rate = (
    rateId: string,
    meterContractId: string,
    numeratorCreditAtoms: string,
  ): CommercialPolicy['rates'][number] => ({
    rateId,
    meterContractId,
    dimension: 'uncached_input',
    tier: null,
    unit: 'token',
    referenceNumeratorPicoUsd: '1',
    denominatorUnits: '1',
    retailOverride: { numeratorCreditAtoms, denominatorUnits: '1' },
  });
  await publishFixturePolicy(fixture, {
    ...base,
    policyVersion: `${base.policyVersion}-tiered`,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [...base.fleet.meterContractIds, retiredContract] },
    rates: [
      ...base.rates.map((existing) => ({
        ...existing,
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      })),
      rate(`long-rate-${suffix}`, fixture.meterContractId, '2'),
      rate(`retired-rate-${suffix}`, retiredContract, '1'),
    ],
    routes: [
      ...base.routes,
      {
        routeId: `long-route-${suffix}`,
        sku: longContextSku,
        meterContractId: fixture.meterContractId,
        rateIds: [`long-rate-${suffix}`],
        enabled: true,
        spendBudgetId: fixture.spendBudgetId,
        riskBudgetId: fixture.riskBudgetId,
      },
      {
        routeId: `settle-retired-route-${suffix}`,
        sku: `settle-retired-sku-${suffix}`,
        meterContractId: retiredContract,
        rateIds: [`retired-rate-${suffix}`],
        enabled: true,
        spendBudgetId: fixture.spendBudgetId,
        riskBudgetId: fixture.riskBudgetId,
      },
    ],
  });

  // The turn is admitted on the premium tier, so its pin is the long-context rate.
  const request = { ...fundedInvocation(fixture, `tiered-${suffix}`), sku: longContextSku };
  if (!request.invocation) {
    throw new Error('Missing invocation');
  }
  request.supplierMaximumPicoUsd = 20n;
  request.invocation.supplierRates = [
    { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' },
  ];
  request.invocation.supplierValuation = {
    version: 'supplier-valuation-v1',
    sourceRevision: `controlled-context-${suffix}`,
    longContextMinimumInputTokens: '5',
    baseRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
    longContextRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '2', denominatorUnits: '1' }],
  };
  const admitted = await firstLedger.admitOperation(request);
  if (admitted.status !== 'admitted') {
    throw new Error('Invocation was not admitted');
  }
  await firstLedger.markDispatchIntent(admitted.operationId, admitted.generation);

  // Only now does the catalogue retire the unrelated route the pinned document still enables.
  qualifiedMeterContracts.delete(retiredContract);
  const identity = {
    operationId: admitted.operationId,
    accountId: fixture.accountId,
    requestDigest: request.requestDigest,
  };
  const evidence: TerminalEvidence = {
    kind: 'final_usage',
    usageOccurredAt: new Date(),
    meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 3n }],
  };
  await firstLedger.recordInvocationEvidence({ ...identity, evidence });
  await firstLedger.terminalizeOperation({
    ...identity,
    expectedGeneration: admitted.generation,
    evidence,
    resolvedAt: new Date(),
  });

  // The observed input never reached the tier, so the charge is the base sku's 1/1, not the 2/1 pin.
  expect(await readInvocationOperation(admitted.operationId)).toMatchObject({
    customerState: 'settled',
    chargedAtoms: 3n,
  });
});
