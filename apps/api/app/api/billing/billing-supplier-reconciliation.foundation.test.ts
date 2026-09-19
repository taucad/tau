/* oxlint-disable no-await-in-loop -- bounded sweep pages must run in order */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingBudget,
  billingBudgetFunding,
  billingFinancialCase,
  creditAccount,
  creditOperation,
  creditTransaction,
  supplierCostEvidence,
  user,
} from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingSupplierReconciliationService } from '#api/billing/billing-supplier-reconciliation.service.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import { seedPaidPurchase, fulfillPaidFixture } from '#testing/billing-payment.fixture.js';
import type { QualifiedAdmissionInput } from '#api/billing/credit-ledger.types.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const client = postgres(databaseUrl, { max: 2, prepare: false });
const database = drizzle(client, { schema });
const policyService = new BillingPolicyService({ database });
const ledger = new CreditLedgerService({ database }, policyService);
const config = { environment: 'development', stripeAccountId: 'acct_fixture', livemode: false } as const;
const reconciliation = new BillingSupplierReconciliationService({ database }, config);
afterAll(async () => client.end());

const required = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`${label} missing`);
  }
  return value;
};

/** One admitted, terminalized operation whose supplier facts each test then shapes. */
const createFixture = async () => {
  const suffix = randomUUID();
  const environment = 'development';
  const userId = `supplier-user-${suffix}`;
  const sku = `supplier-sku-${suffix}`;
  const meterContractId = `supplier-meter-${suffix}`;
  const spendBudgetId = `supplier-spend-${suffix}`;
  const riskBudgetId = `supplier-risk-${suffix}`;
  const spendFundingId = `supplier-spend-funding-${suffix}`;
  const riskFundingId = `supplier-risk-funding-${suffix}`;
  const providerId = `provider-${suffix}`;
  const credentialAccount = `credential-${suffix}`;
  await database
    .insert(user)
    .values({ id: userId, name: 'Supplier owner', email: `${suffix}@test.invalid`, emailVerified: true });
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
  const rateId = `supplier-rate-${suffix}`;
  qualifiedMeterContracts.set(meterContractId, new Set(['uncached_input:']));
  const policy = validateCommercialPolicy({
    schemaVersion: 1,
    environment,
    markupBps: 0,
    offers: [
      {
        offerId: `supplier-pro-${suffix}`,
        kind: 'pro_monthly',
        currency: 'usd',
        principalMinor: '1',
        grantCreditAtoms: '1',
        ceilingCreditAtoms: '1',
      },
      {
        offerId: `supplier-top-up-${suffix}`,
        kind: 'top_up',
        currency: 'usd',
        minimumPrincipalMinor: '1',
        maximumPrincipalMinor: '1',
        creditAtomsPerPrincipalMinor: '1',
      },
    ],
    promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    policyVersion: `supplier-${suffix}`,
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
    ],
    routes: [
      {
        routeId: `supplier-route-${suffix}`,
        sku,
        meterContractId,
        rateIds: [rateId],
        enabled: true,
        spendBudgetId,
        riskBudgetId,
      },
    ],
  });
  await seedBillingFixturePolicy({ database, policy: policy.policy, activationId: `supplier-activation-${suffix}` });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId: userId });
  const { purchaseId } = await seedPaidPurchase({ database, accountId, environment, atoms: 1000n });
  await fulfillPaidFixture({ database, ledger, source: 'purchased', accountId, causeId: purchaseId });
  return {
    userId,
    accountId,
    sku,
    providerId,
    credentialAccount,
    replica: { schemaVersion: 1, meterContractIds: policy.policy.fleet.meterContractIds },
  };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const admission = (fixture: Fixture, key: string): QualifiedAdmissionInput => ({
  environment: 'development',
  authUserId: fixture.userId,
  surface: 'chat',
  attemptKey: key,
  requestDigest: `sha256:${key}`,
  requestKeyVersion: 1,
  category: 'llm',
  modelId: 'supplier-model',
  modelDisplayName: 'Supplier Model',
  providerId: fixture.providerId,
  activity: 'agent',
  sku: fixture.sku,
  maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: 10n }],
  supplierMaximumPicoUsd: 10n,
  replica: fixture.replica,
  executionDeadline: new Date(Date.now() + 300_000),
  invocation: {
    contractVersion: 'supplier-contract-v1',
    credentialAccount: fixture.credentialAccount,
    supplierRatesValidUntil: null,
    supplierRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
    executionTimeout: 300_000,
  },
});

/** Admits, records supplier evidence exactly as the invocation service does, then terminalizes. */
const terminalOperation = async (
  fixture: Fixture,
  key: string,
  supplier?: { provider?: string; credentialAccount?: string; sourceObjectId?: string; numerator?: bigint },
): Promise<{ operationId: string; evidenceId: string | undefined }> => {
  const admitted = await ledger.admitOperation(admission(fixture, key));
  if (admitted.status !== 'admitted') {
    throw new Error(`admission refused: ${admitted.status}`);
  }
  let evidenceId: string | undefined;
  if (supplier !== undefined) {
    const sourceObjectId = supplier.sourceObjectId ?? admitted.operationId;
    expect(
      await ledger.appendSupplierEvidence({
        operationId: admitted.operationId,
        environment: 'development',
        provider: supplier.provider ?? fixture.providerId,
        credentialAccount: supplier.credentialAccount ?? fixture.credentialAccount,
        sourceObjectId,
        sourceRevision: 'final-1',
        payloadDigest: `sha256:${randomUUID()}`,
        currency: 'usd',
        numerator: supplier.numerator ?? 1n,
        denominator: 1_000_000_000_000n,
        completeness: 'complete',
        finality: 'final',
        receivedAt: new Date(),
      }),
    ).toBe('inserted');
    const [evidence] = await database
      .select({ id: supplierCostEvidence.id })
      .from(supplierCostEvidence)
      .where(
        and(
          eq(supplierCostEvidence.operationId, admitted.operationId),
          eq(supplierCostEvidence.sourceObjectId, sourceObjectId),
        ),
      );
    evidenceId = required(evidence, 'supplier evidence').id;
    expect(
      await ledger.finalizeSupplier({
        evidenceId,
        operationId: admitted.operationId,
        accountId: fixture.accountId,
        requestDigest: `sha256:${key}`,
        expectedGeneration: admitted.generation,
      }),
    ).toBe('final');
  }
  const evidence = {
    kind: 'final_usage',
    usageOccurredAt: new Date(),
    executionStatus: 'succeeded',
    meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 1n }],
    normalizationEvidence: { version: 'test-v1', providerRequestId: `request-${key}`, fields: { input: '1' } },
  } as const;
  // A pinned invocation makes durable invocation evidence a terminalization precondition.
  await ledger.recordInvocationEvidence({
    operationId: admitted.operationId,
    accountId: fixture.accountId,
    requestDigest: `sha256:${key}`,
    evidence,
  });
  await ledger.terminalizeOperation({
    operationId: admitted.operationId,
    accountId: fixture.accountId,
    requestDigest: `sha256:${key}`,
    expectedGeneration: admitted.generation,
    evidence,
    resolvedAt: new Date(),
  });
  return { operationId: admitted.operationId, evidenceId };
};

/** Runs complete bounded passes; peer suites leave their own operations in this database. */
const sweepAll = async (/** Milliseconds. */ unresolvedMaximumAge: number): Promise<number> => {
  let casesOpened = 0;
  for (let page = 0; page < 50; page += 1) {
    const result = await reconciliation.sweepSupplierUsage({ pageSize: 200, unresolvedMaximumAge });
    casesOpened += result.casesOpened;
    if (result.done) {
      return casesOpened;
    }
  }
  throw new Error('supplier sweep did not finish a bounded pass');
};

const casesFor = async (kind: string, dedupeKey: string) =>
  database
    .select()
    .from(billingFinancialCase)
    .where(
      and(
        eq(billingFinancialCase.environment, config.environment),
        eq(billingFinancialCase.stripeAccountId, config.stripeAccountId),
        eq(billingFinancialCase.livemode, config.livemode),
        eq(billingFinancialCase.kind, kind),
        eq(billingFinancialCase.dedupeKey, dedupeKey),
      ),
    );

describe('supplier usage reconciliation foundation', () => {
  it('accepts matched evidence and cases missing, mismatched and unmatched supplier charges', async () => {
    const fixture = await createFixture();
    const matched = await terminalOperation(fixture, `matched-${randomUUID()}`, {});
    const mismatched = await terminalOperation(fixture, `mismatched-${randomUUID()}`, {
      provider: `foreign-${randomUUID()}`,
    });
    const drifted = await terminalOperation(fixture, `drifted-${randomUUID()}`);
    // The supplier terminalizer can only reach `final` through qualified evidence; a
    // forced state is the drift an independent sweep exists to find.
    await database
      .update(creditOperation)
      .set({ supplierState: 'final' })
      .where(eq(creditOperation.id, drifted.operationId));
    const unmatchedSource = `charge-${randomUUID()}`;
    expect(
      await ledger.appendSupplierEvidence({
        environment: 'development',
        provider: fixture.providerId,
        credentialAccount: fixture.credentialAccount,
        sourceObjectId: unmatchedSource,
        sourceRevision: 'invoice-line-1',
        payloadDigest: `sha256:${randomUUID()}`,
        currency: 'usd',
        numerator: 7n,
        denominator: 1_000_000_000_000n,
        completeness: 'complete',
        finality: 'final',
        receivedAt: new Date(),
      }),
    ).toBe('inserted');

    await sweepAll(86_400_000);

    expect(await casesFor('supplier_evidence_missing', matched.operationId)).toHaveLength(0);
    expect(await casesFor('supplier_evidence_mismatched', matched.operationId)).toHaveLength(0);
    const identityCases = await casesFor('supplier_evidence_mismatched', mismatched.operationId);
    expect(identityCases).toHaveLength(1);
    expect(required(identityCases[0], 'identity case')).toMatchObject({
      state: 'open',
      accountId: fixture.accountId,
      owner: 'billing-operations',
      sourceType: 'credit_operation',
    });
    expect(required(identityCases[0], 'identity case').evidence['mismatches']).toEqual([
      { evidenceId: mismatched.evidenceId, reason: 'provider' },
    ]);
    const missingCases = await casesFor('supplier_evidence_missing', drifted.operationId);
    expect(missingCases).toHaveLength(1);
    expect(required(missingCases[0], 'missing case').nextStep).toBe(
      'recover_provider_usage_record_or_fund_as_supplier_risk',
    );
    const [unmatched] = await database
      .select({ id: supplierCostEvidence.id })
      .from(supplierCostEvidence)
      .where(eq(supplierCostEvidence.sourceObjectId, unmatchedSource));
    const unmatchedCases = await casesFor('supplier_charge_unmatched', required(unmatched, 'unmatched evidence').id);
    expect(unmatchedCases).toHaveLength(1);
    expect(required(unmatchedCases[0], 'unmatched case')).toMatchObject({ accountId: null, state: 'open' });
    expect(required(unmatchedCases[0], 'unmatched case').evidence).toMatchObject({
      allocation: 'aggregate_only',
      costPicoUsd: '7',
    });

    // Checkpoint replay: a second complete pass re-affirms without duplicating.
    await sweepAll(86_400_000);
    expect(await casesFor('supplier_evidence_mismatched', mismatched.operationId)).toHaveLength(1);
    expect(await casesFor('supplier_evidence_missing', drifted.operationId)).toHaveLength(1);
    expect(await casesFor('supplier_charge_unmatched', required(unmatched, 'unmatched evidence').id)).toHaveLength(1);
    expect(await casesFor('supplier_evidence_missing', matched.operationId)).toHaveLength(0);
  });

  it('cases an unresolved supplier state only past its bounded age', async () => {
    const fixture = await createFixture();
    const stale = await terminalOperation(fixture, `stale-${randomUUID()}`, {});
    await database
      .update(creditOperation)
      .set({ supplierState: 'unresolved' })
      .where(eq(creditOperation.id, stale.operationId));

    await sweepAll(86_400_000);
    expect(await casesFor('supplier_state_unresolved', stale.operationId)).toHaveLength(0);

    await sweepAll(0);
    const cases = await casesFor('supplier_state_unresolved', stale.operationId);
    expect(cases).toHaveLength(1);
    expect(required(cases[0], 'unresolved case')).toMatchObject({ state: 'open', accountId: fixture.accountId });
    expect(required(cases[0], 'unresolved case').evidence).toMatchObject({ supplierState: 'unresolved' });
    expect(required(cases[0], 'unresolved case').evidence['oldestEvidenceAt']).toEqual(expect.any(String));
  });

  it('reconciles an aggregate invoice total without allocating cost to any account', async () => {
    const fixture = await createFixture();
    await terminalOperation(fixture, `invoice-a-${randomUUID()}`, { numerator: 3n });
    await terminalOperation(fixture, `invoice-b-${randomUUID()}`, { numerator: 4n });
    const invoice = {
      version: 'operator-supplier-invoice-total-v1',
      environment: 'development',
      provider: fixture.providerId,
      credentialAccount: fixture.credentialAccount,
      periodStart: new Date(Date.now() - 3_600_000).toISOString(),
      periodEnd: new Date(Date.now() + 3_600_000).toISOString(),
      currency: 'usd',
      confirmedTotalPicoUsd: '7',
      tolerancePicoUsd: '0',
      source: 'operator-import:console-statement',
      importedAt: new Date().toISOString(),
    };
    const [accountBefore] = await database
      .select({ revision: creditAccount.revision, purchased: creditAccount.purchasedAtoms })
      .from(creditAccount)
      .where(eq(creditAccount.id, fixture.accountId));
    const [journalBefore] = await database
      .select({ rows: sql<string>`count(*)::text` })
      .from(creditTransaction)
      .where(eq(creditTransaction.accountId, fixture.accountId));

    const matchedTotal = await reconciliation.reconcileInvoiceTotal(invoice);
    expect(matchedTotal).toMatchObject({ status: 'matched', localEstimatePicoUsd: '7', differencePicoUsd: '0' });
    const dedupeKey = `${fixture.providerId}:${fixture.credentialAccount}:${invoice.periodStart}/${invoice.periodEnd}`;
    expect(await casesFor('supplier_invoice_total_mismatch', dedupeKey)).toHaveLength(0);

    const mismatchedTotal = await reconciliation.reconcileInvoiceTotal({
      ...invoice,
      confirmedTotalPicoUsd: '900',
    });
    expect(mismatchedTotal).toMatchObject({
      status: 'mismatched',
      localEstimatePicoUsd: '7',
      confirmedTotalPicoUsd: '900',
      differencePicoUsd: '893',
      evidenceRows: 2,
      foreignCurrencyRows: 0,
    });
    const cases = await casesFor('supplier_invoice_total_mismatch', dedupeKey);
    expect(cases).toHaveLength(1);
    expect(required(cases[0], 'invoice case')).toMatchObject({
      state: 'open',
      accountId: null,
      knownAmountMinor: null,
    });
    expect(required(cases[0], 'invoice case').evidence).toMatchObject({
      allocation: 'aggregate_only',
      invoiceSource: 'operator-import:console-statement',
      localEstimatePicoUsd: '7',
      confirmedTotalPicoUsd: '900',
    });
    const [accountAfter] = await database
      .select({ revision: creditAccount.revision, purchased: creditAccount.purchasedAtoms })
      .from(creditAccount)
      .where(eq(creditAccount.id, fixture.accountId));
    const [journalAfter] = await database
      .select({ rows: sql<string>`count(*)::text` })
      .from(creditTransaction)
      .where(eq(creditTransaction.accountId, fixture.accountId));
    expect(accountAfter).toEqual(accountBefore);
    expect(journalAfter).toEqual(journalBefore);
  });
});
