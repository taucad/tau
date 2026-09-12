import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingBudget,
  billingBudgetFunding,
  billingBudgetHold,
  billingFinancialCase,
  creditAccount,
  creditOperation,
  user,
} from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import {
  CreditLedgerService,
  maximumRecoveryAttempts,
  recoveryFinancialCaseKind,
  recoveryGraceMinutes,
} from '#api/billing/credit-ledger.service.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import type { QualifiedAdmissionInput, TerminalEvidence } from '#api/billing/credit-ledger.types.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client, { schema });
const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
const environment = 'development';

afterAll(async () => client.end());

const createFixture = async () => {
  const suffix = randomUUID();
  const authUserId = `recovery-${suffix}`;
  const sku = `sku-${suffix}`;
  const meterContractId = `meter-${suffix}`;
  const spendBudgetId = `recovery-spend-${suffix}`;
  const riskBudgetId = `recovery-risk-${suffix}`;
  qualifiedMeterContracts.set(meterContractId, new Set(['uncached_input:']));
  const validated = validateCommercialPolicy({
    schemaVersion: 1,
    environment,
    policyVersion: suffix,
    markupBps: 0,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
    rates: [
      {
        rateId: `rate-${suffix}`,
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
        routeId: `route-${suffix}`,
        sku,
        meterContractId,
        rateIds: [`rate-${suffix}`],
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
    promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
  });
  await database
    .insert(user)
    .values({ id: authUserId, name: 'Recovery fixture', email: `${suffix}@test.invalid`, emailVerified: true });
  await database.insert(billingBudgetFunding).values([
    { id: `${spendBudgetId}-funding`, environment, kind: 'spend', scope: suffix, fundedLifetime: 1_000_000n },
    { id: `${riskBudgetId}-funding`, environment, kind: 'risk', scope: suffix, fundedLifetime: 1_000_000n },
  ]);
  await database.insert(billingBudget).values([
    {
      id: spendBudgetId,
      environment,
      fundingId: `${spendBudgetId}-funding`,
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
      fundingId: `${riskBudgetId}-funding`,
      kind: 'risk',
      scope: suffix,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: 1_000_000n,
    },
  ]);
  await seedBillingFixturePolicy({
    database,
    policy: validated.canonicalContent,
    activationId: `activation-${suffix}`,
  });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId });
  await database.update(creditAccount).set({ purchasedAtoms: 10_000n }).where(eq(creditAccount.id, accountId));
  return { authUserId, accountId, sku, meterContractId, spendBudgetId, riskBudgetId };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const admit = async (fixture: Fixture, attemptKey: string, quantity: bigint) => {
  const request: QualifiedAdmissionInput = {
    environment,
    authUserId: fixture.authUserId,
    surface: 'gateway',
    attemptKey,
    requestDigest: `sha256:${attemptKey}`,
    requestKeyVersion: 1,
    category: 'llm',
    modelId: 'test-model',
    activity: 'agent',
    sku: fixture.sku,
    maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity }],
    supplierMaximumPicoUsd: quantity,
    replica: { schemaVersion: 1, meterContractIds: [fixture.meterContractId] },
    executionDeadline: new Date(Date.now() + 300_000),
  };
  const admission = await ledger.admitOperation(request);
  if (admission.status !== 'admitted') {
    throw new Error(`Recovery fixture was not admitted: ${admission.status}`);
  }
  expect(await ledger.markDispatchIntent(admission.operationId, admission.generation)).toBe(true);
  return { ...admission, requestDigest: request.requestDigest };
};

const readOperation = async (operationId: string): Promise<typeof creditOperation.$inferSelect> => {
  const [row] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
  if (!row) {
    throw new Error('Recovered operation disappeared');
  }
  return row;
};

const readHolds = async (operationId: string): Promise<Array<typeof billingBudgetHold.$inferSelect>> =>
  database.select().from(billingBudgetHold).where(eq(billingBudgetHold.operationId, operationId));

const readCase = async (operationId: string) => {
  const [row] = await database
    .select()
    .from(billingFinancialCase)
    .where(eq(billingFinancialCase.dedupeKey, operationId));
  return row;
};

/** Makes a pending operation due now, and claimable again after a backoff lease. */
const makeDue = async (operationId: string, dueMinutesAgo = 0): Promise<void> => {
  await database
    .update(creditOperation)
    .set({
      dueAt: sql`clock_timestamp() - make_interval(secs => ${dueMinutesAgo * 60 + 1})`,
      leaseUntil: sql`clock_timestamp() - interval '1 second'`,
    })
    .where(eq(creditOperation.id, operationId));
};

/** Scoped to the fixture's own account so a peer suite's pending work cannot join the batch. */
const pass = async (fixture: Fixture) =>
  ledger.recoverDueLlmOperations({ environment, limit: 100, accountId: fixture.accountId });

describe('LLM recovery that cannot deadlock', () => {
  it('should absorb an operation whose retained evidence can never be priced, with an operator case', async () => {
    const fixture = await createFixture();
    const admitted = await admit(fixture, `poison-${randomUUID()}`, 100n);
    // Retained evidence is immutable and names a dimension the tariff does not pin.
    const evidence: TerminalEvidence = {
      kind: 'final_usage',
      usageOccurredAt: new Date(),
      meterItems: [{ dimension: 'output', tier: null, quantity: 7n }],
    };
    await ledger.recordInvocationEvidence({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: admitted.requestDigest,
      evidence,
    });
    await makeDue(admitted.operationId);

    const result = await pass(fixture);

    expect(result.failedOperationIds).toEqual([admitted.operationId]);
    expect(await readOperation(admitted.operationId)).toMatchObject({
      customerState: 'absorbed',
      chargedAtoms: 0n,
      supplierState: 'unresolved',
      executionStatus: 'failed',
      normalizationEvidence: { terminalReason: 'recovery_unresolvable' },
    });
    const opened = await readCase(admitted.operationId);
    expect(opened).toMatchObject({
      kind: recoveryFinancialCaseKind,
      state: 'open',
      sourceType: 'credit_operation',
      accountId: fixture.accountId,
      evidence: { reason: 'unresolvable_failure' },
    });
    expect(String(opened?.evidence['detail'])).toContain('Terminal meter dimension is not pinned');
    const [account] = await database.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(account).toMatchObject({ purchasedHeldAtoms: 0n, purchasedAtoms: 10_000n });
  });

  it('should back off a transient failure exponentially and absorb it once the attempts are spent', async () => {
    const fixture = await createFixture();
    const admitted = await admit(fixture, `transient-${randomUUID()}`, 40n);
    await ledger.recordInvocationEvidence({
      operationId: admitted.operationId,
      accountId: fixture.accountId,
      requestDigest: admitted.requestDigest,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 5n }],
      },
    });
    const terminalize = ledger.terminalizeOperation.bind(ledger);
    const failures = vi
      .spyOn(ledger, 'terminalizeOperation')
      .mockImplementation(async (input) =>
        failures.mock.calls.length > maximumRecoveryAttempts
          ? terminalize(input)
          : Promise.reject(new Error('Controlled unavailable storage')),
      );
    try {
      const leases: number[] = [];
      for (let attempt = 1; attempt <= maximumRecoveryAttempts; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by construction
        await makeDue(admitted.operationId);
        // oxlint-disable-next-line no-await-in-loop -- one claimant at a time
        const attemptResult = await pass(fixture);
        expect(attemptResult.failedOperationIds).toEqual([admitted.operationId]);
        // oxlint-disable-next-line no-await-in-loop -- reads the row the pass just wrote
        const row = await readOperation(admitted.operationId);
        if (row.customerState === 'pending') {
          leases.push(Math.round(((row.leaseUntil?.getTime() ?? 0) - Date.now()) / 60_000));
        }
      }

      expect(leases).toEqual([1, 2, 4, 8]);
      expect(await readOperation(admitted.operationId)).toMatchObject({
        customerState: 'absorbed',
        chargedAtoms: 0n,
        generation: BigInt(maximumRecoveryAttempts + 1),
      });
      expect(await readCase(admitted.operationId)).toMatchObject({
        kind: recoveryFinancialCaseKind,
        evidence: { reason: 'retries_exhausted' },
      });
    } finally {
      failures.mockRestore();
    }
  });

  it('should hold a dispatched operation for the grace and then release both holds', async () => {
    const fixture = await createFixture();
    const admitted = await admit(fixture, `expiry-${randomUUID()}`, 60n);
    await makeDue(admitted.operationId);

    const deferral = await pass(fixture);

    expect(deferral).toMatchObject({ claimed: 1, resolved: 0, failedOperationIds: [] });
    const held = await readOperation(admitted.operationId);
    expect(held.customerState).toBe('pending');
    expect(Math.round(((held.leaseUntil?.getTime() ?? 0) - held.dueAt.getTime()) / 60_000)).toBe(recoveryGraceMinutes);
    const reserved = await readHolds(admitted.operationId);
    expect(reserved.every((hold) => hold.remainingHeld === 60n)).toBe(true);

    await makeDue(admitted.operationId, recoveryGraceMinutes + 1);
    const expiredPass = await pass(fixture);

    expect(expiredPass).toMatchObject({ claimed: 1, resolved: 1, failedOperationIds: [] });
    expect(await readOperation(admitted.operationId)).toMatchObject({
      customerState: 'absorbed',
      chargedAtoms: 0n,
      supplierState: 'unresolved',
      normalizationEvidence: { terminalReason: 'recovery_expired' },
    });
    const holds = await readHolds(admitted.operationId);
    expect(holds.map((hold) => hold.finalityState).sort()).toEqual(['absorbed', 'unresolved']);
    expect(holds.every((hold) => hold.remainingHeld === 0n && hold.consumed === 60n)).toBe(true);
    const [spend] = await database.select().from(billingBudget).where(eq(billingBudget.id, fixture.spendBudgetId));
    expect(spend).toMatchObject({ held: 0n, consumed: 60n });
    const [account] = await database.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(account).toMatchObject({ purchasedHeldAtoms: 0n, purchasedAtoms: 10_000n });
    expect(await readCase(admitted.operationId)).toMatchObject({ evidence: { reason: 'time_to_live' } });
  });
});
