import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve as resolvePath } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { eq, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { billingFinancialCase, creditAccount, creditOperation, supplierCostEvidence, user } from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import {
  CreditLedgerService,
  maximumRecoveryAttempts,
  recoveryGraceMinutes,
} from '#api/billing/credit-ledger.service.js';
import { BillingRecoveryScheduler } from '#api/billing/billing-recovery.scheduler.js';
import type { BillingRecoveryMetrics } from '#api/billing/billing-recovery.scheduler.js';
import { createOperationsGaugeSource, recordOpenCases } from '#billing-command.operations.js';
import type { OperationsGaugeMetrics } from '#billing-command.operations.js';
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
    routes: [{ routeId: `route-${suffix}`, sku, meterContractId, rateIds: [`rate-${suffix}`], enabled: true }],
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
  await seedBillingFixturePolicy({
    database,
    policy: validated.canonicalContent,
    activationId: `activation-${suffix}`,
  });
  const accountId = await ledger.ensureAccountBinding({ environment, authUserId });
  await database.update(creditAccount).set({ purchasedAtoms: 10_000n }).where(eq(creditAccount.id, accountId));
  return { authUserId, accountId, sku, meterContractId };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const admit = async (
  fixture: Fixture,
  attemptKey: string,
  options: { readonly quantity: bigint; readonly activity?: string; readonly dispatched?: boolean },
) => {
  const request: QualifiedAdmissionInput = {
    environment,
    authUserId: fixture.authUserId,
    surface: 'gateway',
    attemptKey,
    requestDigest: `sha256:${attemptKey}`,
    requestKeyVersion: 1,
    category: 'llm',
    modelId: 'test-model',
    activity: options.activity ?? 'agent',
    sku: fixture.sku,
    maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: options.quantity }],
    replica: { schemaVersion: 1, meterContractIds: [fixture.meterContractId] },
    executionDeadline: new Date(Date.now() + 300_000),
  };
  const admission = await ledger.admitOperation(request);
  if (admission.status !== 'admitted') {
    throw new Error(`Recovery fixture was not admitted: ${admission.status}`);
  }
  if (options.dispatched ?? true) {
    expect(await ledger.markDispatchIntent(admission.operationId, admission.generation)).toBe(true);
  }
  return { ...admission, requestDigest: request.requestDigest };
};

const readOperation = async (operationId: string): Promise<typeof creditOperation.$inferSelect> => {
  const [row] = await database.select().from(creditOperation).where(eq(creditOperation.id, operationId));
  if (!row) {
    throw new Error('Recovered operation disappeared');
  }
  return row;
};

/** Every case or supplier proof that names the operation; recovery writes neither. */
const supplierTraces = async (operationId: string) => ({
  cases: await database
    .select()
    .from(billingFinancialCase)
    .where(or(eq(billingFinancialCase.dedupeKey, operationId), eq(billingFinancialCase.sourceId, operationId))),
  evidence: await database.select().from(supplierCostEvidence).where(eq(supplierCostEvidence.operationId, operationId)),
});

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
  it('should absorb an operation whose retained evidence can never be priced, unpriced and without a case', async () => {
    const fixture = await createFixture();
    const admitted = await admit(fixture, `poison-${randomUUID()}`, { quantity: 100n });
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
      supplierCostPicoUsd: null,
      supplierCostUnpricedReason: 'absorbed',
      executionStatus: 'failed',
      normalizationEvidence: { terminalReason: 'recovery_unresolvable' },
    });
    // A deterministic failure is a metric and a log line, never a case that could restrict anyone.
    expect(await supplierTraces(admitted.operationId)).toEqual({ cases: [], evidence: [] });
    const [account] = await database.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(account).toMatchObject({ purchasedHeldAtoms: 0n, purchasedAtoms: 10_000n });
  });

  it('should back off a transient failure exponentially and absorb it once the attempts are spent', async () => {
    const fixture = await createFixture();
    const admitted = await admit(fixture, `transient-${randomUUID()}`, { quantity: 40n });
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
        supplierCostPicoUsd: null,
        supplierCostUnpricedReason: 'absorbed',
      });
      expect(await supplierTraces(admitted.operationId)).toEqual({ cases: [], evidence: [] });
    } finally {
      failures.mockRestore();
    }
  });

  it('should hold a dispatched operation for the grace and then absorb it unpriced', async () => {
    const fixture = await createFixture();
    const admitted = await admit(fixture, `expiry-${randomUUID()}`, { quantity: 60n });
    await makeDue(admitted.operationId);

    const deferral = await pass(fixture);

    expect(deferral).toMatchObject({ claimed: 1, resolved: 0, failedOperationIds: [] });
    const held = await readOperation(admitted.operationId);
    expect(held.customerState).toBe('pending');
    expect(Math.round(((held.leaseUntil?.getTime() ?? 0) - held.dueAt.getTime()) / 60_000)).toBe(recoveryGraceMinutes);

    await makeDue(admitted.operationId, recoveryGraceMinutes + 1);
    const expiredPass = await pass(fixture);

    expect(expiredPass).toMatchObject({ claimed: 1, resolved: 1, failedOperationIds: [] });
    expect(await readOperation(admitted.operationId)).toMatchObject({
      customerState: 'absorbed',
      chargedAtoms: 0n,
      supplierCostPicoUsd: null,
      supplierCostUnpricedReason: 'absorbed',
      normalizationEvidence: { terminalReason: 'recovery_expired' },
    });
    const [account] = await database.select().from(creditAccount).where(eq(creditAccount.id, fixture.accountId));
    expect(account).toMatchObject({ purchasedHeldAtoms: 0n, purchasedAtoms: 10_000n });
    expect(await supplierTraces(admitted.operationId)).toEqual({ cases: [], evidence: [] });
  });
});

describe('the in-API recovery scheduler', () => {
  /** A due absorbed, a due refused and a due undispatched operation in one capacity pool. */
  const duePool = async (fixture: Fixture, activity: string) => {
    const absorbed = await admit(fixture, `absorbed-${randomUUID()}`, { quantity: 30n, activity });
    await makeDue(absorbed.operationId, recoveryGraceMinutes + 1);
    const rejected = await admit(fixture, `rejected-${randomUUID()}`, { quantity: 30n, activity });
    await ledger.recordInvocationEvidence({
      operationId: rejected.operationId,
      accountId: fixture.accountId,
      requestDigest: rejected.requestDigest,
      evidence: {
        kind: 'provider_rejected',
        executionStatus: 'rejected',
        normalizationEvidence: { version: 'provider-usage-v1', terminalReason: 'provider_rejected', fields: {} },
      },
    });
    await makeDue(rejected.operationId);
    const undispatched = await admit(fixture, `undispatched-${randomUUID()}`, {
      quantity: 30n,
      activity,
      dispatched: false,
    });
    await makeDue(undispatched.operationId);
    return { absorbed: absorbed.operationId, rejected: rejected.operationId, undispatched: undispatched.operationId };
  };

  it('should resolve every due kind in both pools on one pass and record each series once per pool', async () => {
    const fixture = await createFixture();
    const primary = await duePool(fixture, 'agent');
    const helper = await duePool(fixture, 'title');
    const metrics = mockDeep<BillingRecoveryMetrics>();
    const scheduler = new BillingRecoveryScheduler(
      {
        recoverDueLlmOperations: async (input) =>
          ledger.recoverDueLlmOperations({ ...input, accountId: fixture.accountId }),
      },
      metrics,
      { environment, intervalMilliseconds: 1000, limit: 100 },
    );

    const result = await scheduler.runOnce();

    expect(result).toMatchObject({ failed: 0, fullBatch: false });
    expect(result.batches.map(({ pool, claimed, resolved, failed }) => ({ pool, claimed, resolved, failed }))).toEqual([
      { pool: 'primary', claimed: 3, resolved: 3, failed: 0 },
      { pool: 'helper', claimed: 3, resolved: 3, failed: 0 },
    ]);
    for (const pool of ['primary', 'helper']) {
      const attributes = { 'deployment.environment': environment, 'tau.billing.capacity_pool': pool };
      const recoveries = metrics.billingFundedOperationRecoveries.add.mock.calls.filter(
        ([, recorded]) => recorded?.['tau.billing.capacity_pool'] === pool,
      );
      expect(recoveries).toEqual([
        [1, { ...attributes, 'tau.billing.recovery.outcome': 'attempted' }],
        [3, { ...attributes, 'tau.billing.recovery.outcome': 'claimed' }],
        [3, { ...attributes, 'tau.billing.recovery.outcome': 'resolved' }],
      ]);
      expect(metrics.billingFundedOperationCurrent.record).toHaveBeenCalledWith(0, {
        ...attributes,
        'tau.billing.pending.state': 'pending',
      });
      expect(metrics.billingFundedOperationCurrent.record).toHaveBeenCalledWith(0, {
        ...attributes,
        'tau.billing.pending.state': 'due',
      });
      expect(metrics.billingFundedOperationOldestDueAge.record).toHaveBeenCalledWith(0, attributes);
      expect(metrics.billingFundedOperationRecoveryProviderExecutions.record).toHaveBeenCalledWith(0, attributes);
      expect(metrics.billingFundedOperationRecoveryBatchDuration.record).toHaveBeenCalledWith(expect.any(Number), {
        ...attributes,
        'tau.billing.recovery.batch.outcome': 'succeeded',
      });
    }
    expect(metrics.billingWorkerPasses.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.worker': 'recovery',
      outcome: 'ok',
    });

    for (const operations of [primary, helper]) {
      // oxlint-disable-next-line no-await-in-loop -- reads the rows the pass wrote
      expect(await readOperation(operations.absorbed)).toMatchObject({
        customerState: 'absorbed',
        chargedAtoms: 0n,
        supplierCostPicoUsd: null,
        supplierCostUnpricedReason: 'absorbed',
      });
      for (const released of [operations.rejected, operations.undispatched]) {
        // A refusal and a call that never left Tau cost the supplier nothing, and nothing revisits them.
        // oxlint-disable-next-line no-await-in-loop -- reads the rows the pass wrote
        expect(await readOperation(released)).toMatchObject({
          customerState: 'released',
          chargedAtoms: 0n,
          supplierCostPicoUsd: 0n,
          supplierCostUnpricedReason: null,
        });
        // oxlint-disable-next-line no-await-in-loop -- reads the rows the pass wrote
        expect(await supplierTraces(released)).toEqual({ cases: [], evidence: [] });
      }
    }
  });

  it('should report the absorbed operations in the hourly unpriced-operations gauge and not the released ones', async () => {
    const fixture = await createFixture();
    await duePool(fixture, 'agent');
    await duePool(fixture, 'title');
    await new BillingRecoveryScheduler(
      {
        recoverDueLlmOperations: async (input) =>
          ledger.recoverDueLlmOperations({ ...input, accountId: fixture.accountId }),
      },
      mockDeep<BillingRecoveryMetrics>(),
      { environment, intervalMilliseconds: 1000, limit: 100 },
    ).runOnce();
    const source = createOperationsGaugeSource(client, environment);

    const unpriced = await source.unpricedOperations();

    expect(unpriced.filter(({ sku }) => sku === fixture.sku)).toEqual([
      { provider: null, sku: fixture.sku, reason: 'absorbed', operations: 2 },
    ]);
    const metrics = mockDeep<OperationsGaugeMetrics>();
    await recordOpenCases({ source, metrics, environment });
    expect(metrics.billingSupplierUnpricedOperations.record).toHaveBeenCalledWith(2, {
      'deployment.environment': environment,
      'gen_ai.provider.name': 'unattributed',
      'tau.billing.sku': fixture.sku,
      'tau.billing.unpriced.reason': 'absorbed',
    });
  });

  it('should print one recovery batch line per pool per pass from the optional CLI worker', async () => {
    const childEnvironment: Record<string, string | undefined> = {};
    childEnvironment['PATH'] = process.env['PATH'];
    childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
    childEnvironment['BILLING_ENVIRONMENT'] = 'prod-eu';
    childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
    childEnvironment['OTEL_METRICS_PORT'] = '0';
    const child = spawn(
      process.execPath,
      [
        resolvePath(import.meta.dirname, '../../../dist/billing-command.js'),
        'recover-llm-worker',
        '--environment',
        'prod-eu',
        '--limit',
        '100',
        '--poll-milliseconds',
        '10',
      ],
      { env: childEnvironment as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    try {
      // Two passes' worth of lines: a loaded host may deliver several lines in one chunk.
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
          if (stdout.split('\n').length > 4) {
            resolve();
          }
        });
        child.once('exit', () => {
          reject(new Error(`recover-llm-worker exited early: ${stderr}`));
        });
      });
      child.kill('SIGTERM');
      await once(child, 'close');
      // Only complete lines: the worker may have been stopped part-way through writing the last one.
      const lines = stdout
        .split('\n')
        .slice(0, -1)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        lines.slice(0, 4).map(({ event, environment: batchEnvironment, pool, failed }) => ({
          event,
          batchEnvironment,
          pool,
          failed,
        })),
      ).toEqual(
        ['primary', 'helper', 'primary', 'helper'].map((pool) => ({
          event: 'billing.llm_recovery_batch',
          batchEnvironment: 'prod-eu',
          pool,
          failed: 0,
        })),
      );
      expect(lines.every(({ event }) => event === 'billing.llm_recovery_batch')).toBe(true);
      expect(stderr).toBe('');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});
