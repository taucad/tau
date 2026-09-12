/**
 * Shared vocabulary for the B8.3 local capacity harness: profiles, the pre-import environment
 * allowlist, the synthetic funded workload, invariant queries and measurement helpers.
 *
 * Non-production by construction. No Nest application, no HTTP server, no Redis, no provider,
 * payment or cloud credential; the ledger profile drives `CreditLedgerService` directly on a
 * disposable cluster, exactly as `development-billing-account.ts` does for a single account.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { sql } from 'drizzle-orm';
import { billingBudget, billingBudgetFunding, user } from '#database/schema.js';
import type { DatabaseType } from '#database/database.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { QualifiedAdmissionInput } from '#api/billing/credit-ledger.types.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import { fulfillPaidFixture, seedPaidPurchase } from '#testing/billing-payment.fixture.js';

export const loadEnvironment = 'development';
/** One dimension, retail 1 credit atom per unit, so authorized and charged atoms are readable by hand. */
export const loadDimension = 'uncached_input';
/** Every admission authorizes this many units; the stub returns a fraction of it as final usage. */
export const authorizedUnits = 10n;

export type LoadProfile = {
  /** Funded accounts seeded by paid cause before any driver starts. */
  accounts: number;
  /** Total admitted operations across every driver process. */
  operations: number;
  /** Independent driver child processes. */
  drivers: number;
  /** In-flight operations per driver; each holds one pooled connection. */
  concurrency: number;
  /** Accounts every driver shares, producing same-account row contention across processes. */
  sharedAccounts: number;
  /** Fraction of operations admitted with a short deadline and abandoned for the worker to drain. */
  abandonRatio: number;
};

/**
 * B8 `tau-credit-billing-infrastructure-and-capacity-blueprint.md:121-122`.
 *
 * The deferred launch-qualification, steady-load and burst profiles are a parameter change only:
 * `--accounts`, `--operations`, `--drivers` and `--concurrency` override any field here. They are
 * not listed as named profiles because nothing has run them yet and a named profile that has never
 * executed is a claim, not evidence.
 */
export const loadProfiles: Record<string, LoadProfile> = {
  'local-smoke': {
    accounts: 100,
    operations: 10_000,
    drivers: 1,
    concurrency: 8,
    sharedAccounts: 0,
    abandonRatio: 0.02,
  },
  'local-growth': {
    accounts: 1000,
    operations: 20_000,
    drivers: 2,
    concurrency: 8,
    sharedAccounts: 10,
    abandonRatio: 0.02,
  },
};

/**
 * Child environment built from an explicit allowlist **before** any module import, per B8 R4.
 * Nothing inherits: no API dotenv file, no `STRIPE_*`, no supplier key, no cloud or telemetry
 * endpoint. `OTEL_EXPORTER_OTLP_ENDPOINT` stays unset so the recovery worker exports nowhere.
 */
export const allowlistedChildEnvironment = (extra: Record<string, string>): Record<string, string> => {
  const allowed: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR'] as const) {
    const value = process.env[key];
    if (value !== undefined) {
      allowed[key] = value;
    }
  }
  allowed['NODE_ENV'] = 'test';
  return { ...allowed, ...extra };
};

export const registerLoadMeterContract = (meterContractId: string): void => {
  qualifiedMeterContracts.set(meterContractId, new Set([`${loadDimension}:`]));
};

export type WorkloadManifest = {
  environment: typeof loadEnvironment;
  sku: string;
  meterContractId: string;
  activationId: string;
  spendBudgetId: string;
  riskBudgetId: string;
  /** Admission authenticates the auth user; terminalization addresses the financial account. */
  accounts: Array<{ authUserId: string; accountId: string }>;
};

/**
 * Seeds one synthetic tariff, one shared spend/risk budget pair and `accounts` funded accounts.
 *
 * Funding is by **paid cause** through the shared fixtures (`seedPaidPurchase` then
 * `fulfillPaidFixture`), never `issueCurrentPromotion`: D1 holds and launch promotions stay off.
 * Because every atom arrives through a journalled grant, `assertInvariants` can assert exact
 * journal/counter conservation afterwards.
 */
export async function seedWorkload(input: {
  database: DatabaseType;
  ledger: CreditLedgerService;
  accounts: number;
  suffix: string;
  fundedAtoms: bigint;
  budgetCapPicoUsd: bigint;
  concurrency: number;
}): Promise<WorkloadManifest> {
  const { suffix } = input;
  const sku = `load-sku-${suffix}`;
  const meterContractId = `load-meter-${suffix}`;
  const activationId = `load-activation-${suffix}`;
  const spendBudgetId = `load-spend-${suffix}`;
  const riskBudgetId = `load-risk-${suffix}`;
  registerLoadMeterContract(meterContractId);
  const validated = validateCommercialPolicy({
    schemaVersion: 1,
    environment: loadEnvironment,
    policyVersion: suffix,
    markupBps: 0,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
    rates: [
      {
        rateId: `load-rate-${suffix}`,
        meterContractId,
        dimension: loadDimension,
        tier: null,
        unit: 'token',
        referenceNumeratorPicoUsd: '1',
        denominatorUnits: '1',
        retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
      },
    ],
    routes: [
      {
        routeId: `load-route-${suffix}`,
        sku,
        meterContractId,
        rateIds: [`load-rate-${suffix}`],
        enabled: true,
        spendBudgetId,
        riskBudgetId,
      },
    ],
    offers: [
      {
        offerId: `load-pro-${suffix}`,
        kind: 'pro_monthly',
        currency: 'usd',
        principalMinor: '1',
        grantCreditAtoms: '1',
        ceilingCreditAtoms: '1',
      },
      {
        offerId: `load-top-${suffix}`,
        kind: 'top_up',
        currency: 'usd',
        minimumPrincipalMinor: '1',
        maximumPrincipalMinor: '1',
        creditAtomsPerPrincipalMinor: '1',
      },
    ],
    /* D1: launch promotions stay off; every atom in this harness arrives by paid cause. */
    promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
  });
  await input.database.insert(billingBudgetFunding).values([
    {
      id: `${spendBudgetId}-funding`,
      environment: loadEnvironment,
      kind: 'spend',
      scope: suffix,
      fundedLifetime: input.budgetCapPicoUsd,
    },
    {
      id: `${riskBudgetId}-funding`,
      environment: loadEnvironment,
      kind: 'risk',
      scope: suffix,
      fundedLifetime: input.budgetCapPicoUsd,
    },
  ]);
  await input.database.insert(billingBudget).values([
    {
      id: spendBudgetId,
      environment: loadEnvironment,
      fundingId: `${spendBudgetId}-funding`,
      kind: 'spend',
      scope: suffix,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: input.budgetCapPicoUsd,
    },
    {
      id: riskBudgetId,
      environment: loadEnvironment,
      fundingId: `${riskBudgetId}-funding`,
      kind: 'risk',
      scope: suffix,
      periodStart: new Date('2020-01-01Z'),
      periodEnd: new Date('2030-01-01Z'),
      quantum: 'pico_usd',
      approvedCap: input.budgetCapPicoUsd,
    },
  ]);
  await seedBillingFixturePolicy({ database: input.database, policy: validated.canonicalContent, activationId });
  const accounts: WorkloadManifest['accounts'] = [];
  const pending = Array.from({ length: input.accounts }, (_, index) => `load-user-${suffix}-${index}`);
  await input.database
    .insert(user)
    .values(pending.map((id) => ({ id, name: 'Billing load', email: `${id}@test.invalid`, emailVerified: true })));
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: input.concurrency }, async () => {
      for (let authUserId = queue.pop(); authUserId !== undefined; authUserId = queue.pop()) {
        // oxlint-disable-next-line no-await-in-loop -- each worker seeds its own accounts sequentially to bound connections
        const accountId = await input.ledger.ensureAccountBinding({ environment: loadEnvironment, authUserId });
        // oxlint-disable-next-line no-await-in-loop -- the purchase must exist before its cash disposition
        const { purchaseId } = await seedPaidPurchase({
          database: input.database,
          accountId,
          environment: loadEnvironment,
          atoms: input.fundedAtoms,
        });
        // oxlint-disable-next-line no-await-in-loop -- fulfilment depends on the purchase created immediately above
        await fulfillPaidFixture({
          database: input.database,
          ledger: input.ledger,
          accountId,
          causeId: purchaseId,
          source: 'purchased',
        });
        accounts.push({ authUserId, accountId });
      }
    }),
  );
  return { environment: loadEnvironment, sku, meterContractId, activationId, spendBudgetId, riskBudgetId, accounts };
}

/** The exact admission a funded gateway invocation makes, with the supplier stubbed out. */
export const loadAdmission = (input: {
  manifest: WorkloadManifest;
  authUserId: string;
  attemptKey: string;
  executionTimeout: number;
}): QualifiedAdmissionInput => ({
  environment: input.manifest.environment,
  authUserId: input.authUserId,
  surface: 'gateway',
  attemptKey: input.attemptKey,
  requestDigest: `sha256:${input.attemptKey}`,
  requestKeyVersion: 1,
  category: 'llm',
  modelId: 'billing-load-stub',
  activity: 'agent',
  sku: input.manifest.sku,
  maximumQuantities: [{ dimension: loadDimension, tier: null, quantity: authorizedUnits }],
  supplierMaximumPicoUsd: authorizedUnits,
  replica: { schemaVersion: 1, meterContractIds: [input.manifest.meterContractId] },
  executionDeadline: new Date(Date.now() + input.executionTimeout),
  invocation: {
    contractVersion: 'billing-load-v1',
    credentialAccount: 'billing-load-stub',
    supplierRatesValidUntil: null,
    executionTimeout: input.executionTimeout,
    supplierRates: [{ dimension: loadDimension, tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
    supplierValuation: {
      version: 'supplier-valuation-v1',
      sourceRevision: 'billing-load-v1',
      longContextMinimumInputTokens: null,
      baseRates: [{ dimension: loadDimension, tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' }],
      longContextRates: null,
    },
  },
});

export type InvariantReport = {
  /** Per-account sum of journalled deltas must equal the account counters exactly. */
  conservationViolations: number;
  negativeOrOverHeldAccounts: number;
  /** Account hold counters must equal the sum of the holds of its still-pending operations. */
  heldReconciliationViolations: number;
  resolvedWithoutExactlyOneJournal: number;
  pendingWithJournal: number;
  /** Budget holds are released on supplier finality, not on customer terminalization. */
  residualHoldsOnSupplierFinal: number;
  operationsByCustomerState: Record<string, number>;
  operationsByDispatchState: Record<string, number>;
  operationsBySupplierState: Record<string, number>;
  transactionsByKind: Record<string, number>;
  passed: boolean;
};

const countRows = (rows: Array<Record<string, unknown>>, key: string): Record<string, number> =>
  Object.fromEntries(rows.map((row) => [String(row[key]), Number(row['total'])]));

/** Reads the financial invariants back out of the database after a profile finishes. */
export async function assertInvariants(database: DatabaseType): Promise<InvariantReport> {
  const [conservation] = await database.execute(sql`
    select count(*)::text as total from billing.credit_account a
    join lateral (select coalesce(sum(t.promo_delta_atoms), 0) as promo, coalesce(sum(t.plan_delta_atoms), 0) as plan,
      coalesce(sum(t.purchased_delta_atoms), 0) as purchased, coalesce(sum(t.debt_delta_atoms), 0) as debt
      from billing.credit_transaction t where t.account_id = a.id) j on true
    where a.promo_atoms <> j.promo or a.plan_atoms <> j.plan
      or a.purchased_atoms <> j.purchased or a.debt_atoms <> j.debt`);
  const [negative] = await database.execute(sql`
    select count(*)::text as total from billing.credit_account a
    where a.promo_atoms < 0 or a.plan_atoms < 0 or a.purchased_atoms < 0 or a.debt_atoms < 0
      or a.promo_held_atoms < 0 or a.plan_held_atoms < 0 or a.purchased_held_atoms < 0
      or a.promo_held_atoms > a.promo_atoms or a.plan_held_atoms > a.plan_atoms
      or a.purchased_held_atoms > a.purchased_atoms`);
  const [resolution] = await database.execute(sql`
    select
      count(*) filter (where o.customer_state <> 'pending' and j.total <> 1)::text as resolved,
      count(*) filter (where o.customer_state = 'pending' and j.total <> 0)::text as pending
    from billing.credit_operation o
    cross join lateral (select count(*) as total from billing.credit_transaction t
      where t.operation_id = o.id and t.kind = 'operation_resolution') j`);
  const [residual] = await database.execute(sql`
    select count(*)::text as total from billing.billing_budget_hold h
    join billing.credit_operation o on o.id = h.operation_id
    where o.supplier_state in ('final', 'funded_exception') and h.remaining_held <> 0`);
  const [held] = await database.execute(sql`
    select count(*)::text as total from billing.credit_account a
    join lateral (select coalesce(sum(o.promo_held_atoms), 0) as promo, coalesce(sum(o.plan_held_atoms), 0) as plan,
      coalesce(sum(o.purchased_held_atoms), 0) as purchased from billing.credit_operation o
      where o.account_id = a.id and o.customer_state = 'pending') h on true
    where a.promo_held_atoms <> h.promo or a.plan_held_atoms <> h.plan or a.purchased_held_atoms <> h.purchased`);
  const customerStates = await database.execute(
    sql`select customer_state, count(*)::text as total from billing.credit_operation group by 1 order by 1`,
  );
  const dispatchStates = await database.execute(
    sql`select dispatch_state, count(*)::text as total from billing.credit_operation group by 1 order by 1`,
  );
  const supplierStates = await database.execute(
    sql`select supplier_state, count(*)::text as total from billing.credit_operation group by 1 order by 1`,
  );
  const kinds = await database.execute(
    sql`select kind, count(*)::text as total from billing.credit_transaction group by 1 order by 1`,
  );
  const report: InvariantReport = {
    conservationViolations: Number(conservation?.['total'] ?? -1),
    negativeOrOverHeldAccounts: Number(negative?.['total'] ?? -1),
    heldReconciliationViolations: Number(held?.['total'] ?? -1),
    resolvedWithoutExactlyOneJournal: Number(resolution?.['resolved'] ?? -1),
    pendingWithJournal: Number(resolution?.['pending'] ?? -1),
    residualHoldsOnSupplierFinal: Number(residual?.['total'] ?? -1),
    operationsByCustomerState: countRows([...customerStates], 'customer_state'),
    operationsByDispatchState: countRows([...dispatchStates], 'dispatch_state'),
    operationsBySupplierState: countRows([...supplierStates], 'supplier_state'),
    transactionsByKind: countRows([...kinds], 'kind'),
    passed: false,
  };
  report.passed =
    report.conservationViolations === 0 &&
    report.negativeOrOverHeldAccounts === 0 &&
    report.heldReconciliationViolations === 0 &&
    report.resolvedWithoutExactlyOneJournal === 0 &&
    report.pendingWithJournal === 0 &&
    report.residualHoldsOnSupplierFinal === 0;
  return report;
}

export type Percentiles = {
  count: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
};

/** Nearest-rank percentiles; the sample is milliseconds of wall clock, not a modelled distribution. */
export const percentiles = (samples: readonly number[]): Percentiles => {
  if (samples.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((first, second) => first - second);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))] ?? 0;
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    count: sorted.length,
    min: round(sorted[0] ?? 0),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted.at(-1) ?? 0),
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
  };
};

export type HardwareLabel = {
  disclaimer: string;
  cpu: string;
  cores: number;
  memoryGigabytes: number;
  platform: string;
  release: string;
  node: string;
};

/** Every timing in this harness is labelled with the machine that produced it; none is a production figure. */
export const hardwareLabel = (): HardwareLabel => {
  let cpu = 'unknown';
  try {
    cpu = execFileSync('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).trim();
  } catch {
    cpu = cpus()[0]?.model ?? 'unknown';
  }
  return {
    disclaimer:
      'NON-PRODUCTION: single developer machine, disposable local PostgreSQL with fsync off, no Redis, no HTTP, no provider. Not a hosted capacity result (B8 T6).',
    cpu,
    cores: cpus().length,
    memoryGigabytes: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    platform: process.platform,
    release: release(),
    node: process.version,
  };
};

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');

/** Sha256 of the files whose behaviour the measurement depends on, so a result can be re-tied to source. */
export const sourceFingerprints = (relativePaths: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    relativePaths.map((relativePath) => [
      relativePath,
      createHash('sha256')
        .update(readFileSync(resolve(repositoryRoot, relativePath)))
        .digest('hex'),
    ]),
  );

export const measuredSources = [
  'apps/api/app/api/billing/credit-ledger.service.ts',
  'apps/api/app/billing-command.ts',
  'apps/api/dist/billing-command.js',
  'apps/api/app/testing/billing-load/cluster.ts',
  'apps/api/app/testing/billing-load/harness.ts',
  'apps/api/app/testing/billing-load/driver.ts',
  'apps/api/app/testing/billing-load/run.ts',
] as const;
