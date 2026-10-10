import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
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
import type { QualifiedAdmissionInput, SupplierValuation, TerminalEvidence } from '#api/billing/credit-ledger.types.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const client = postgres(databaseUrl, { max: 2, prepare: false });
const database = drizzle(client, { schema });
const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
const config = { environment: 'development', stripeAccountId: 'acct_fixture', livemode: false } as const;
const reconciliation = new BillingSupplierReconciliationService({ database }, config);
afterAll(async () => client.end());

/** One pico-USD-per-token supplier valuation scaled by 1000, so each settled token meters 1000 pico-USD. */
const valuation: SupplierValuation = {
  version: 'supplier-valuation-v1',
  sourceRevision: 'fixture-rates',
  longContextMinimumInputTokens: null,
  baseRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1000', denominatorUnits: '1' }],
  longContextRates: null,
};

/** A funded account on its own route, provider and credential, so each test's meter is its own. */
const createFixture = async () => {
  const suffix = randomUUID();
  const environment = 'development';
  const userId = `supplier-user-${suffix}`;
  const sku = `supplier-sku-${suffix}`;
  const meterContractId = `supplier-meter-${suffix}`;
  await database
    .insert(user)
    .values({ id: userId, name: 'Supplier owner', email: `${suffix}@test.invalid`, emailVerified: true });
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
    routes: [{ routeId: `supplier-route-${suffix}`, sku, meterContractId, rateIds: [rateId], enabled: true }],
  });
  await seedBillingFixturePolicy({ database, policy: policy.policy, activationId: `supplier-activation-${suffix}` });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId: userId });
  const { purchaseId } = await seedPaidPurchase({ database, accountId, environment, atoms: 1000n });
  await fulfillPaidFixture({ database, ledger, source: 'purchased', accountId, causeId: purchaseId });
  return {
    userId,
    accountId,
    sku,
    providerId: `provider-${suffix}`,
    credentialAccount: `credential-${suffix}`,
    replica: { schemaVersion: 1, meterContractIds: policy.policy.fleet.meterContractIds },
  };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const admission = (
  fixture: Fixture,
  key: string,
  route: { readonly priced: boolean; readonly attributed: boolean },
): QualifiedAdmissionInput => ({
  environment: 'development',
  authUserId: fixture.userId,
  surface: 'chat',
  attemptKey: key,
  requestDigest: `sha256:${key}`,
  requestKeyVersion: 1,
  category: 'llm',
  modelId: 'supplier-model',
  modelDisplayName: 'Supplier Model',
  activity: 'agent',
  sku: fixture.sku,
  maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: 10n }],
  replica: fixture.replica,
  executionDeadline: new Date(Date.now() + 300_000),
  ...(route.attributed
    ? {
        providerId: fixture.providerId,
        invocation: {
          contractVersion: 'supplier-contract-v1',
          credentialAccount: fixture.credentialAccount,
          supplierRatesValidUntil: null,
          supplierRates: [{ dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
          executionTimeout: 300_000,
          ...(route.priced ? { supplierValuation: structuredClone(valuation) } : {}),
        },
      }
    : {}),
});

/** Admits, records dispatch and invocation evidence exactly as the gateway does, then terminalizes. */
const settle = async (
  fixture: Fixture,
  input: { readonly evidence: TerminalEvidence; readonly priced?: boolean; readonly attributed?: boolean },
): Promise<typeof creditOperation.$inferSelect> => {
  const key = randomUUID();
  const admitted = await ledger.admitOperation(
    admission(fixture, key, { priced: input.priced ?? true, attributed: input.attributed ?? true }),
  );
  if (admitted.status !== 'admitted') {
    throw new Error(`admission refused: ${admitted.status}`);
  }
  const claim = { operationId: admitted.operationId, accountId: fixture.accountId, requestDigest: `sha256:${key}` };
  // A settlement follows a recorded dispatch intent (the credit_operation_dispatch CHECK).
  await ledger.markDispatchIntent(admitted.operationId, admitted.generation);
  await ledger.recordInvocationEvidence({ ...claim, evidence: input.evidence });
  await ledger.terminalizeOperation({
    ...claim,
    expectedGeneration: admitted.generation,
    evidence: input.evidence,
    resolvedAt: new Date(),
  });
  return readOperation(admitted.operationId);
};

const usage = (quantity: bigint): TerminalEvidence => ({
  kind: 'final_usage',
  usageOccurredAt: new Date(),
  executionStatus: 'succeeded',
  meterItems: [{ dimension: 'uncached_input', tier: null, quantity }],
  normalizationEvidence: { version: 'test-v1', providerRequestId: `request-${randomUUID()}`, fields: {} },
});

const readOperation = async (operationId: string): Promise<typeof creditOperation.$inferSelect> => {
  const [row] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
  if (row === undefined) {
    throw new Error('operation missing');
  }
  return row;
};

/** The database clock, so the invoice period starts before this test's own dispatches and after every peer's. */
const periodFromNow = async (): Promise<{ periodStart: string; periodEnd: string }> => {
  const [now] = await client<Array<{ milliseconds: string }>>`
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text AS milliseconds`;
  const start = Number(now?.milliseconds);
  return {
    periodStart: new Date(start - 1).toISOString(),
    periodEnd: new Date(start + 3_600_000).toISOString(),
  };
};

const invoiceFor = (
  fixture: Fixture,
  invoicePeriod: { periodStart: string; periodEnd: string },
  confirmed: string,
) => ({
  version: 'operator-supplier-invoice-total-v1',
  environment: 'development',
  provider: fixture.providerId,
  credentialAccount: fixture.credentialAccount,
  ...invoicePeriod,
  currency: 'usd',
  confirmedTotalPicoUsd: confirmed,
  tolerancePicoUsd: '500',
  source: 'operator-import:console-statement',
  importedAt: new Date().toISOString(),
});

const invoiceCases = async (fixture: Fixture, invoicePeriod: { periodStart: string; periodEnd: string }) =>
  database
    .select()
    .from(billingFinancialCase)
    .where(
      and(
        eq(billingFinancialCase.environment, config.environment),
        eq(billingFinancialCase.stripeAccountId, config.stripeAccountId),
        eq(billingFinancialCase.livemode, config.livemode),
        eq(billingFinancialCase.kind, 'supplier_invoice_total_mismatch'),
        eq(
          billingFinancialCase.dedupeKey,
          `${fixture.providerId}:${fixture.credentialAccount}:${invoicePeriod.periodStart}/${invoicePeriod.periodEnd}`,
        ),
      ),
    );

const accountState = async (accountId: string) => {
  const [account] = await database
    .select({ revision: creditAccount.revision, purchased: creditAccount.purchasedAtoms })
    .from(creditAccount)
    .where(eq(creditAccount.id, accountId));
  const [journal] = await database
    .select({ rows: sql<string>`count(*)::text` })
    .from(creditTransaction)
    .where(eq(creditTransaction.accountId, accountId));
  return { account, journal };
};

describe('supplier invoice reconciliation', () => {
  it('should open no case when the invoice is within tolerance of the metered supplier cost', async () => {
    const fixture = await createFixture();
    const invoicePeriod = await periodFromNow();
    expect(await settle(fixture, { evidence: usage(3n) })).toMatchObject({ supplierCostPicoUsd: 3000n });
    expect(await settle(fixture, { evidence: usage(4n) })).toMatchObject({ supplierCostPicoUsd: 4000n });

    const result = await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '7400'));

    expect(result).toEqual({
      status: 'matched',
      localEstimatePicoUsd: '7000',
      confirmedTotalPicoUsd: '7400',
      differencePicoUsd: '400',
      operations: 2,
      unpricedOperations: 0,
      legacyOperations: 0,
      unattributedOperations: 0,
    });
    expect(await invoiceCases(fixture, invoicePeriod)).toEqual([]);
  });

  it('should open one aggregate case carrying both totals and the unpriced and unattributed counts', async () => {
    const fixture = await createFixture();
    const invoicePeriod = await periodFromNow();
    await settle(fixture, { evidence: usage(3n) });
    await settle(fixture, { evidence: usage(4n) });
    // No pinned valuation: the receipt has no supplier cost, which the meter must not count as zero silently.
    expect(await settle(fixture, { evidence: usage(5n), priced: false })).toMatchObject({
      supplierCostPicoUsd: null,
      supplierCostUnpricedReason: 'missing_rate',
    });
    // Admitted with no provider or invocation: no credential can claim its cost.
    await settle(fixture, { evidence: usage(2n), attributed: false });
    const before = await accountState(fixture.accountId);

    const result = await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '9000'));

    expect(result).toEqual({
      status: 'mismatched',
      localEstimatePicoUsd: '7000',
      confirmedTotalPicoUsd: '9000',
      differencePicoUsd: '2000',
      operations: 3,
      unpricedOperations: 1,
      legacyOperations: 0,
      unattributedOperations: 1,
    });
    const cases = await invoiceCases(fixture, invoicePeriod);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      state: 'open',
      accountId: null,
      knownAmountMinor: null,
      owner: 'billing-operations',
      nextStep: 'compare_confirmed_invoice_with_local_estimate',
      evidence: {
        version: 'supplier-invoice-reconciliation-v2',
        allocation: 'aggregate_only',
        invoiceSource: 'operator-import:console-statement',
        localEstimatePicoUsd: '7000',
        confirmedTotalPicoUsd: '9000',
        unpricedOperations: 1,
        legacyOperations: 0,
        unattributedOperations: 1,
      },
    });
    // Aggregate only: no account balance or journal row moves.
    expect(await accountState(fixture.accountId)).toEqual(before);
  });

  it('should count a receipt from before the supplier cost columns as legacy, not unpriced, and open no case', async () => {
    const fixture = await createFixture();
    const invoicePeriod = await periodFromNow();
    await settle(fixture, { evidence: usage(3n) });
    const legacy = await settle(fixture, { evidence: usage(4n) });
    // A receipt terminalized before migration 0049 carries neither column; its terminal row is otherwise immutable.
    await client.begin(async (transaction) => {
      await transaction`SET LOCAL session_replication_role = replica`;
      await transaction`UPDATE billing.credit_operation SET supplier_cost_pico_usd = NULL, supplier_cost_unpriced_reason = NULL
        WHERE id = ${legacy.id}`;
    });

    const result = await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '3000'));

    expect(result).toEqual({
      status: 'matched',
      localEstimatePicoUsd: '3000',
      confirmedTotalPicoUsd: '3000',
      differencePicoUsd: '0',
      operations: 2,
      unpricedOperations: 0,
      legacyOperations: 1,
      unattributedOperations: 0,
    });
    expect(await invoiceCases(fixture, invoicePeriod)).toEqual([]);
  });

  it('should keep one case across a repeated import and resolve it when a later import matches', async () => {
    const fixture = await createFixture();
    const invoicePeriod = await periodFromNow();
    await settle(fixture, { evidence: usage(6n) });

    await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '1'));
    await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '1'));
    const reopened = await invoiceCases(fixture, invoicePeriod);
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({ state: 'open' });

    const corrected = await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '6000'));

    expect(corrected).toMatchObject({ status: 'matched', differencePicoUsd: '0' });
    const resolved = await invoiceCases(fixture, invoicePeriod);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      state: 'resolved',
      resolutionEvidence: { disposition: 'supplier_source_qualified', localEstimatePicoUsd: '6000' },
    });
  });

  it('should refuse an invoice for another environment or an empty period', async () => {
    const fixture = await createFixture();
    const invoicePeriod = await periodFromNow();

    await expect(
      reconciliation.reconcileInvoiceTotal({ ...invoiceFor(fixture, invoicePeriod, '0'), environment: 'staging' }),
    ).rejects.toThrow('invalid_supplier_invoice');
    await expect(
      reconciliation.reconcileInvoiceTotal({
        ...invoiceFor(fixture, invoicePeriod, '0'),
        periodEnd: invoicePeriod.periodStart,
      }),
    ).rejects.toThrow('invalid_supplier_invoice');
    expect(await invoiceCases(fixture, invoicePeriod)).toEqual([]);
  });

  /* The staging pause of 2026-10-08: a refused call once became a cost-unknown liability that a
   * sweep cased a day later, pausing the route for every account. A refusal is a known zero now. */
  it('should meter a refused operation at zero, open no case for it and never revisit it', async () => {
    const fixture = await createFixture();
    const invoicePeriod = await periodFromNow();
    const refused = await settle(fixture, {
      evidence: {
        kind: 'provider_rejected',
        executionStatus: 'rejected',
        normalizationEvidence: { version: 'provider-usage-v1', terminalReason: 'provider_rejected', fields: {} },
      },
    });
    expect(refused).toMatchObject({
      customerState: 'released',
      chargedAtoms: 0n,
      supplierCostPicoUsd: 0n,
      supplierCostUnpricedReason: null,
    });

    const result = await reconciliation.reconcileInvoiceTotal(invoiceFor(fixture, invoicePeriod, '0'));

    expect(result).toMatchObject({
      status: 'matched',
      localEstimatePicoUsd: '0',
      operations: 1,
      unpricedOperations: 0,
    });
    expect(
      await database.select().from(supplierCostEvidence).where(eq(supplierCostEvidence.operationId, refused.id)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(billingFinancialCase)
        .where(or(eq(billingFinancialCase.dedupeKey, refused.id), eq(billingFinancialCase.sourceId, refused.id))),
    ).toEqual([]);
    // Nothing repairs it: the receipt is exactly as the terminalizer wrote it.
    expect(await readOperation(refused.id)).toEqual(refused);
  });
});
