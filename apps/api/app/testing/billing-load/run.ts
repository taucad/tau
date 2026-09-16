#!/usr/bin/env node
/**
 * B8.3 local capacity harness (T5 local half, A12 partial).
 *
 * Owns a disposable PostgreSQL 17 cluster, migrates it, installs the billing protections, seeds a
 * synthetic tariff plus N accounts funded by paid cause, then drives real ledger admission,
 * dispatch intent, durable evidence and terminalization from one or more driver child processes
 * while the built `recover-llm-worker` drains abandoned work from its own PID. Financial
 * invariants are read back from the database afterwards and written to a compact JSON report.
 *
 * Required env: none. Optional env: PATH, HOME, TMPDIR, DOCKER_HOST (tool discovery only).
 * Never reads API dotenv files, never touches the developer's database, never runs `infra:reset`,
 * never calls a provider, payment or cloud service.
 *
 * Usage:
 *   node --import @oxc-node/core/register apps/api/app/testing/billing-load/run.ts \
 *     --profile=local-smoke [--runtime=native --postgres-bin=/opt/homebrew/opt/postgresql@17/bin] \
 *     [--accounts=N --operations=N --drivers=N --concurrency=N] [--report=PATH] [--log=PATH]
 *
 * Profiles: local-smoke, local-growth, surge-64.
 * Exit codes: 0 every invariant held, 1 a failure or invariant violation.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '#database/schema.js';
import { installBillingProtections } from '#database/billing-protections.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { startOwnedCluster } from '#testing/billing-load/cluster.js';
import type { DriverConfig, DriverResult } from '#testing/billing-load/driver.js';
import {
  allowlistedChildEnvironment,
  assertInvariants,
  hardwareLabel,
  loadAdmission,
  loadEnvironment,
  loadProfiles,
  measuredSources,
  percentiles,
  registerLoadMeterContract,
  seedWorkload,
  sourceFingerprints,
} from '#testing/billing-load/harness.js';
import type { LoadProfile, WorkloadManifest } from '#testing/billing-load/harness.js';

const repositoryRoot = resolvePath(import.meta.dirname, '../../../../..');
const apiRoot = join(repositoryRoot, 'apps/api');
const laneDirectory = join(
  repositoryRoot,
  'docs/research/artifacts/tau-cloud-credit-billing-launch-charter/runs/implementation/chunks/C09/lanes/i3',
);
const rawLogDirectory = join(repositoryRoot, 'out/research/tau-cloud-credit-billing-launch-charter/C09/i3');
/** Funds every account far above the profile's worst case so denial can only mean saturation. */
const fundedAtomsPerAccount = 1_000_000n;
const budgetCapPicoUsd = 1_000_000_000_000n;
const abandonedExecutionTimeout = 2000;
const executionTimeout = 300_000;

const parseArguments = (): {
  profile: string;
  runtime: 'native' | 'compose';
  binaryDirectory?: string;
  overrides: Partial<LoadProfile>;
  reportPath: string;
  logPath: string;
} => {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/u.exec(argument);
    if (!match?.[1] || !match[2]) {
      throw new Error(`Unexpected argument ${argument}`);
    }
    values.set(match[1], match[2]);
  }
  const profile = values.get('profile') ?? 'local-smoke';
  if (profile !== 'surge-64' && !loadProfiles[profile]) {
    throw new Error(`Unknown profile ${profile}; expected surge-64 or one of ${Object.keys(loadProfiles).join(', ')}`);
  }
  const runtime = values.get('runtime') ?? 'compose';
  if (runtime !== 'native' && runtime !== 'compose') {
    throw new Error('Expected --runtime=native|compose');
  }
  const binaryDirectory = values.get('postgres-bin');
  if ((runtime === 'native') !== Boolean(binaryDirectory)) {
    throw new Error('Native mode requires --postgres-bin; compose mode does not accept it');
  }
  const numeric = (key: keyof LoadProfile): number | undefined => {
    const raw = values.get(key);
    if (raw === undefined) {
      return undefined;
    }
    if (!/^\d+(?:\.\d+)?$/u.test(raw)) {
      throw new Error(`--${key} must be a non-negative number`);
    }
    return Number(raw);
  };
  const overrides: Partial<LoadProfile> = {};
  for (const key of ['accounts', 'operations', 'drivers', 'concurrency', 'sharedAccounts', 'abandonRatio'] as const) {
    const parsed = numeric(key);
    if (parsed !== undefined) {
      overrides[key] = parsed;
    }
  }
  return {
    profile,
    runtime,
    binaryDirectory,
    overrides,
    reportPath: values.get('report') ?? join(laneDirectory, `${profile}.json`),
    logPath:
      values.get('log') ?? join(rawLogDirectory, `${profile}-${new Date().toISOString().replaceAll(':', '')}.log`),
  };
};

const freePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const bound = server.address();
      if (!bound || typeof bound === 'string') {
        server.close();
        reject(new Error('No isolated metrics port'));
        return;
      }
      server.close(() => {
        resolve(bound.port);
      });
    });
  });

/** Row values arrive untyped from `execute`; every column read here is declared `text` in SQL. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

type SpawnedProcess = { pid: number; lines: string[]; exit: Promise<number> };

const spawnChild = (options: {
  command: string;
  args: string[];
  environment: Record<string, string>;
  log: (line: string) => void;
}): SpawnedProcess & { child: ReturnType<typeof spawn> } => {
  const child = spawn(options.command, options.args, {
    cwd: repositoryRoot,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the child deliberately lacks every API-required ambient variable
    env: options.environment as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines: string[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        lines.push(line);
        options.log(line);
      }
    });
  }
  return {
    child,
    pid: child.pid ?? -1,
    lines,
    exit: new Promise<number>((resolve) => {
      child.on('close', (code) => {
        resolve(code ?? -1);
      });
    }),
  };
};

/** Exactly the recovery worker Fly runs, as its own process, with no Redis, auth or provider credential. */
const startRecoveryWorker = async (
  databaseUrl: string,
  log: (line: string) => void,
): Promise<SpawnedProcess & { child: ReturnType<typeof spawn> }> => {
  const command = join(apiRoot, 'dist/billing-command.js');
  if (!existsSync(command)) {
    throw new Error('apps/api/dist/billing-command.js is missing; run `pnpm nx run api:build:billing-command` first');
  }
  const workerVariables: Record<string, string> = {};
  workerVariables['BILLING_DATABASE_URL'] = databaseUrl;
  workerVariables['BILLING_ENVIRONMENT'] = loadEnvironment;
  workerVariables['TAU_CLOUD_ENABLED'] = 'true';
  // Prometheus exporter binds a disposable loopback port; no OTLP endpoint is set, so nothing is exported.
  workerVariables['OTEL_METRICS_PORT'] = String(await freePort());
  const workerEnvironment = allowlistedChildEnvironment(workerVariables);
  return spawnChild({
    command: process.execPath,
    args: [
      command,
      'recover-llm-worker',
      '--environment',
      loadEnvironment,
      '--limit',
      '100',
      '--poll-milliseconds',
      '250',
    ],
    environment: workerEnvironment,
    log,
  });
};

type DrainMeasurement = {
  drainedOperations: number;
  /** Wall clock from the first poll that observed due work to the poll that observed none pending. */
  drainMilliseconds: number;
  drainOperationsPerSecond: number;
  /** Peak observed age of the oldest due operation — the quantity B9's SLO alert watches. */
  maxOldestDueAgeMilliseconds: number;
  remainingPending: number;
  waitedForDeadlineMilliseconds: number;
};

/**
 * Polls until no operation is pending, so the drain rate is measured rather than assumed.
 *
 * Abandoned operations only become recoverable when their admitted deadline passes, so the wait
 * for that deadline is reported separately from the drain itself.
 */
const measureDrain = async (
  database: ReturnType<typeof drizzle>,
  expected: number,
  timeoutMilliseconds: number,
): Promise<DrainMeasurement> => {
  const started = performance.now();
  let maxOldestDueAgeMilliseconds = 0;
  let remainingPending = expected;
  let firstDueObserved: number | undefined;
  while (performance.now() - started < timeoutMilliseconds) {
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition
    const [row] = await database.execute(sql`select
      count(*) filter (where customer_state = 'pending')::int as pending,
      count(*) filter (where customer_state = 'pending' and due_at <= clock_timestamp())::int as due,
      coalesce(extract(epoch from (clock_timestamp() - min(due_at) filter (where customer_state = 'pending'
        and due_at <= clock_timestamp()))) * 1000, 0)::int as oldest
      from billing.credit_operation`);
    remainingPending = Number(row?.['pending'] ?? 0);
    maxOldestDueAgeMilliseconds = Math.max(maxOldestDueAgeMilliseconds, Number(row?.['oldest'] ?? 0));
    if (firstDueObserved === undefined && Number(row?.['due'] ?? 0) > 0) {
      firstDueObserved = performance.now();
    }
    if (remainingPending === 0) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- the poll interval is the point of the loop
    await delay(50);
  }
  const finished = performance.now();
  const waitedForDeadlineMilliseconds = Math.round((firstDueObserved ?? finished) - started);
  const drainMilliseconds = Math.round(finished - (firstDueObserved ?? started));
  const drained = expected - remainingPending;
  return {
    drainedOperations: drained,
    drainMilliseconds,
    drainOperationsPerSecond: drainMilliseconds > 0 ? Math.round((drained / drainMilliseconds) * 1000 * 100) / 100 : 0,
    maxOldestDueAgeMilliseconds,
    remainingPending,
    waitedForDeadlineMilliseconds,
  };
};

const recoveryBatches = (lines: readonly string[]): Array<Record<string, unknown>> =>
  lines.flatMap((line) => {
    if (!line.startsWith('{')) {
      return [];
    }
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the worker's own structured log line
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return parsed['event'] === 'billing.llm_recovery_batch' ? [parsed] : [];
    } catch {
      return [];
    }
  });

/**
 * A12: 64 concurrent primary admissions on ONE funded account across two independent ledger
 * replicas, a 65th refused, the helper pool unaffected, and admission latency percentiles.
 */
const runSurge = async (databaseUrl: string, manifest: WorkloadManifest): Promise<Record<string, unknown>> => {
  const clients = [
    postgres(databaseUrl, { max: 34, prepare: false }),
    postgres(databaseUrl, { max: 34, prepare: false }),
  ];
  const databases = clients.map((client) => drizzle(client, { schema }));
  const ledgers = databases.map(
    (database) => new CreditLedgerService({ database }, new BillingPolicyService({ database })),
  );
  const account = manifest.accounts[0];
  const [firstLedger, secondLedger] = ledgers;
  const [firstDatabase] = databases;
  if (!account || !firstLedger || !secondLedger || !firstDatabase) {
    throw new Error('Surge requires one seeded account and two ledger replicas');
  }
  try {
    const latencies: number[] = [];
    const results = await Promise.all(
      Array.from({ length: 64 }, async (_, index) => {
        const request = loadAdmission({
          manifest,
          authUserId: account.authUserId,
          attemptKey: `surge-${index}`,
          executionTimeout: abandonedExecutionTimeout,
        });
        const startedAt = performance.now();
        const admission = await (index % 2 === 0 ? firstLedger : secondLedger).admitOperation(request);
        latencies.push(performance.now() - startedAt);
        return admission;
      }),
    );
    const admitted = results.filter((result) => result.status === 'admitted');
    const extra = await firstLedger.admitOperation(
      loadAdmission({
        manifest,
        authUserId: account.authUserId,
        attemptKey: 'surge-65',
        executionTimeout: abandonedExecutionTimeout,
      }),
    );
    const [headroom] = await firstDatabase.execute(sql`select
      (a.purchased_atoms - a.purchased_held_atoms)::text as spendable_atoms,
      (b.approved_cap - b.consumed - b.held)::text as spend_budget_remaining_pico_usd
      from billing.credit_account a, billing.billing_budget b
      where a.id = ${account.accountId} and b.id = ${manifest.spendBudgetId}`);
    const helper = await secondLedger.admitOperation({
      ...loadAdmission({
        manifest,
        authUserId: account.authUserId,
        attemptKey: 'surge-helper',
        executionTimeout: abandonedExecutionTimeout,
      }),
      activity: 'title',
    });
    return {
      requestedPrimary: 64,
      admittedPrimary: admitted.length,
      deniedPrimary: results.length - admitted.length,
      sixtyFifth: extra.status === 'denied' ? { status: extra.status, reason: extra.reason } : { status: extra.status },
      /* Saturation is genuine only if money and budget were still available at the refusal. */
      headroomAtRefusal: {
        spendableAtoms: text(headroom?.['spendable_atoms']),
        spendBudgetRemainingPicoUsd: text(headroom?.['spend_budget_remaining_pico_usd']),
      },
      helperPoolAdmitted: helper.status === 'admitted',
      admissionLatencyMilliseconds: percentiles(latencies),
      passed:
        admitted.length === 64 &&
        extra.status === 'denied' &&
        extra.reason === 'concurrency_unavailable' &&
        helper.status === 'admitted' &&
        BigInt(text(headroom?.['spendable_atoms']) || '0') > 0n,
    };
  } finally {
    await Promise.all(clients.map(async (client) => client.end()));
  }
};

type SpawnedDriver = { resultPath: string; process: SpawnedProcess & { child: ReturnType<typeof spawn> } };

/** Gives each driver its own account slice plus the shared accounts every driver contends on. */
const spawnDrivers = (input: {
  cluster: { url: string; directory: string };
  manifest: WorkloadManifest;
  profile: LoadProfile;
  log: (line: string) => void;
}): SpawnedDriver[] => {
  const { profile } = input;
  const perDriver = Math.ceil(profile.operations / profile.drivers);
  const sharedAccountIndexes = Array.from({ length: profile.sharedAccounts }, (_, index) => index);
  return Array.from({ length: profile.drivers }, (_, driverIndex) => {
    const privateAccountIndexes = input.manifest.accounts
      .map((_, index) => index)
      .filter((index) => index >= profile.sharedAccounts && index % profile.drivers === driverIndex);
    const configPath = join(input.cluster.directory, `driver-${driverIndex}.json`);
    const resultPath = join(input.cluster.directory, `driver-${driverIndex}-result.json`);
    const config: DriverConfig = {
      databaseUrl: input.cluster.url,
      manifest: input.manifest,
      resultPath,
      label: `driver-${driverIndex}`,
      operations: perDriver,
      concurrency: profile.concurrency,
      privateAccountIndexes: privateAccountIndexes.length > 0 ? privateAccountIndexes : [0],
      sharedAccountIndexes,
      abandonEvery: Math.max(1, Math.round(1 / profile.abandonRatio)),
      executionTimeout,
      abandonedExecutionTimeout,
    };
    writeFileSync(configPath, JSON.stringify(config));
    return {
      resultPath,
      process: spawnChild({
        command: process.execPath,
        args: ['--import', '@oxc-node/core/register', join(apiRoot, 'app/testing/billing-load/driver.ts'), configPath],
        environment: allowlistedChildEnvironment({}),
        log: input.log,
      }),
    };
  });
};

const collectDrivers = async (spawned: readonly SpawnedDriver[]): Promise<DriverResult[]> => {
  const codes = await Promise.all(spawned.map(async ({ process: child }) => child.exit));
  if (codes.some((code) => code !== 0)) {
    throw new Error(`A driver process exited non-zero: ${codes.join(', ')}`);
  }
  return spawned.map(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each driver writes its own result file before exiting
    ({ resultPath }) => JSON.parse(readFileSync(resultPath, 'utf8')) as DriverResult,
  );
};

async function main(): Promise<void> {
  const options = parseArguments();
  mkdirSync(dirname(options.reportPath), { recursive: true });
  mkdirSync(dirname(options.logPath), { recursive: true });
  const logLines: string[] = [];
  const log = (line: string): void => {
    logLines.push(line);
    console.log(line);
  };
  const startedAt = new Date();
  const profile: LoadProfile = {
    ...(loadProfiles[options.profile] ?? {
      accounts: 1,
      operations: 0,
      drivers: 0,
      concurrency: 1,
      sharedAccounts: 0,
      abandonRatio: 1,
    }),
    ...options.overrides,
  };
  const cluster = await startOwnedCluster({ runtime: options.runtime, binaryDirectory: options.binaryDirectory });
  log(`Owned cluster ${cluster.project} at ${cluster.address} (${cluster.runtime})`);
  const client = postgres(cluster.url, { max: 4, prepare: false, onnotice: () => undefined });
  const database = drizzle(client, { schema });
  let report: Record<string, unknown> = {};
  let failed = false;
  try {
    await migrate(database, { migrationsFolder: join(apiRoot, 'app/database/migrations') });
    await installBillingProtections(client);
    const suffix = randomUUID();
    const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
    const seedStarted = performance.now();
    const manifest = await seedWorkload({
      database,
      ledger,
      accounts: profile.accounts,
      suffix,
      fundedAtoms: fundedAtomsPerAccount,
      budgetCapPicoUsd,
      concurrency: 8,
    });
    registerLoadMeterContract(manifest.meterContractId);
    log(`Seeded ${manifest.accounts.length} funded accounts in ${Math.round(performance.now() - seedStarted)} ms`);
    const processes: Array<Record<string, unknown>> = [{ role: 'launcher', pid: process.pid }];
    let surge: Record<string, unknown> | undefined;
    let drivers: DriverResult[] = [];
    let drain: DrainMeasurement | undefined;
    let worker: (SpawnedProcess & { child: ReturnType<typeof spawn> }) | undefined;
    const runStarted = performance.now();
    if (options.profile === 'surge-64') {
      surge = await runSurge(cluster.url, manifest);
      worker = await startRecoveryWorker(cluster.url, log);
      processes.push({ role: 'recovery-worker', pid: worker.pid });
      drain = await measureDrain(database, 65, 120_000);
    } else {
      worker = await startRecoveryWorker(cluster.url, log);
      processes.push({ role: 'recovery-worker', pid: worker.pid });
      const spawned = spawnDrivers({ cluster, manifest, profile, log });
      for (const { process: child } of spawned) {
        processes.push({ role: 'driver', pid: child.pid });
      }
      drivers = await collectDrivers(spawned);
      const expectedAbandoned = drivers.reduce((total, driver) => total + driver.abandoned, 0);
      drain = await measureDrain(database, expectedAbandoned, 180_000);
    }
    const runMilliseconds = Math.round(performance.now() - runStarted);
    worker.child.kill('SIGTERM');
    await worker.exit;
    const batches = recoveryBatches(worker.lines);
    const invariants = await assertInvariants(database);
    const admissionSamples = drivers.flatMap((driver) => driver.admitMilliseconds);
    const settled = drivers.reduce((total, driver) => total + driver.settled, 0);
    const released = drivers.reduce((total, driver) => total + driver.released, 0);
    const admitted = drivers.reduce((total, driver) => total + driver.admitted, 0);
    const denials: Record<string, number> = {};
    for (const driver of drivers) {
      for (const [reason, count] of Object.entries(driver.denials)) {
        denials[reason] = (denials[reason] ?? 0) + count;
      }
    }
    const driverWallMilliseconds = Math.max(0, ...drivers.map((driver) => driver.durationMilliseconds));
    const [version] = await database.execute(sql`select current_setting('server_version')::text as version`);
    report = {
      profile: options.profile,
      nonProduction: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      runMilliseconds,
      hardware: hardwareLabel(),
      cluster: {
        runtime: cluster.runtime,
        project: cluster.project,
        address: cluster.address,
        postgresVersion: text(version?.['version']) || 'unknown',
        durability: 'fsync=off, synchronous_commit=off — disposable fixture, not a durability measurement',
      },
      workload: {
        ...profile,
        fundedAtomsPerAccount: fundedAtomsPerAccount.toString(),
        budgetCapPicoUsd: budgetCapPicoUsd.toString(),
        fundingCause: 'paid purchase via seedPaidPurchase + fulfillPaidFixture (never issueCurrentPromotion)',
        sku: manifest.sku,
        meterContractId: manifest.meterContractId,
        activationId: manifest.activationId,
        sharedSpendBudgetId: manifest.spendBudgetId,
      },
      processes,
      distinctPids: new Set(processes.map((entry) => entry['pid'])).size === processes.length,
      counts: {
        admitted,
        settled,
        released,
        abandoned: drivers.reduce((total, driver) => total + driver.abandoned, 0),
        replays: drivers.reduce((total, driver) => total + driver.replays, 0),
        denials,
        failures: drivers.flatMap((driver) => driver.failures),
        providerExecutions: drivers.reduce((total, driver) => total + driver.providerExecutions, 0),
      },
      latencyMilliseconds: {
        admission: percentiles(admissionSamples),
        terminalization: percentiles(drivers.flatMap((driver) => driver.terminalizeMilliseconds)),
        operation: percentiles(drivers.flatMap((driver) => driver.operationMilliseconds)),
      },
      throughput: {
        driverWallMilliseconds,
        /* Admitted operations per second across every driver, excluding seeding and the drain wait. */
        operationsPerSecond:
          driverWallMilliseconds > 0 ? Math.round((admitted / driverWallMilliseconds) * 1000 * 100) / 100 : 0,
      },
      recovery: {
        workerPid: processes.find((entry) => entry['role'] === 'recovery-worker')?.['pid'],
        batches: batches.length,
        claimed: batches.reduce((total, batch) => total + Number(batch['claimed'] ?? 0), 0),
        resolved: batches.reduce((total, batch) => total + Number(batch['resolved'] ?? 0), 0),
        workerReportedProviderExecutions: batches.reduce(
          (total, batch) => total + Number(batch['providerExecutions'] ?? 0),
          0,
        ),
        ...drain,
      },
      ...(surge ? { surge } : {}),
      invariants,
      sources: sourceFingerprints(measuredSources),
    };
    failed =
      !invariants.passed ||
      (surge !== undefined && surge['passed'] !== true) ||
      drain.remainingPending > 0 ||
      drivers.some((driver) => driver.providerExecutions > 0 || driver.failures.length > 0);
  } finally {
    await client.end();
    cluster.stop();
    writeFileSync(options.logPath, `${logLines.join('\n')}\n`);
    if (Object.keys(report).length > 0) {
      writeFileSync(options.reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
      console.log(`Report ${options.reportPath}`);
    }
    console.log(`Raw log ${options.logPath}`);
  }
  if (failed) {
    throw new Error('Billing load profile reported a failure or an invariant violation');
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
