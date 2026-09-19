/**
 * One driver process of the B8.3 local capacity harness.
 *
 * Runs a slice of funded operations through the real `CreditLedgerService` — admission, dispatch
 * intent, durable invocation evidence, terminalization — against the launcher's disposable
 * PostgreSQL. The supplier is a pure local stub: `globalThis.fetch` is replaced with a thrower so
 * a provider call fails loudly instead of leaving the run merely "probably" offline.
 *
 * Not invoked directly: `run.ts` spawns it with an allowlisted environment and one config path.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { TerminalEvidence } from '#api/billing/credit-ledger.types.js';
import {
  authorizedUnits,
  loadAdmission,
  loadDimension,
  registerLoadMeterContract,
} from '#testing/billing-load/harness.js';
import type { WorkloadManifest } from '#testing/billing-load/harness.js';

export type DriverConfig = {
  databaseUrl: string;
  manifest: WorkloadManifest;
  resultPath: string;
  label: string;
  operations: number;
  concurrency: number;
  /** Accounts only this driver uses, plus the shared accounts every driver contends on. */
  privateAccountIndexes: number[];
  sharedAccountIndexes: number[];
  /** One in `abandonEvery` operations is admitted with a short deadline and never terminalized. */
  abandonEvery: number;
  /** Milliseconds allowed before an operation becomes recoverable work. */
  executionTimeout: number;
  abandonedExecutionTimeout: number;
};

export type DriverResult = {
  label: string;
  pid: number;
  startedAt: string;
  finishedAt: string;
  durationMilliseconds: number;
  admitted: number;
  settled: number;
  released: number;
  abandoned: number;
  denials: Record<string, number>;
  replays: number;
  providerExecutions: number;
  failures: string[];
  admitMilliseconds: number[];
  terminalizeMilliseconds: number[];
  operationMilliseconds: number[];
};

/** Deterministic synthetic supplier outcome; no network, no provider SDK, no credential. */
const stubbedSupplierOutcome = (
  index: number,
): { kind: 'usage'; units: bigint } | { kind: 'rejected' } | { kind: 'zero' } => {
  if (index % 10 === 0) {
    return { kind: 'rejected' };
  }
  if (index % 7 === 0) {
    return { kind: 'zero' };
  }
  return { kind: 'usage', units: BigInt((index % Number(authorizedUnits - 1n)) + 1) };
};

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error('Usage: driver.ts CONFIG_JSON (spawned by run.ts)');
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the launcher writes this file immediately before spawning
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as DriverConfig;
  let providerExecutions = 0;
  globalThis.fetch = (): never => {
    providerExecutions += 1;
    throw new Error('The billing load harness performs zero provider calls');
  };
  registerLoadMeterContract(config.manifest.meterContractId);
  const client = postgres(config.databaseUrl, { max: config.concurrency, prepare: false });
  const database = drizzle(client, { schema });
  const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
  const result: DriverResult = {
    label: config.label,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    durationMilliseconds: 0,
    admitted: 0,
    settled: 0,
    released: 0,
    abandoned: 0,
    denials: {},
    replays: 0,
    providerExecutions: 0,
    failures: [],
    admitMilliseconds: [],
    terminalizeMilliseconds: [],
    operationMilliseconds: [],
  };
  const started = performance.now();
  let next = 0;
  const runOne = async (index: number): Promise<void> => {
    const abandoned = index % config.abandonEvery === 0;
    const chosen =
      config.sharedAccountIndexes.length > 0 && index % 5 === 0
        ? config.sharedAccountIndexes[index % config.sharedAccountIndexes.length]
        : config.privateAccountIndexes[index % config.privateAccountIndexes.length];
    const account = config.manifest.accounts[chosen ?? 0];
    if (!account) {
      throw new Error('Driver slice addresses an unseeded account');
    }
    const attemptKey = `${config.label}-${index}`;
    const request = loadAdmission({
      manifest: config.manifest,
      authUserId: account.authUserId,
      attemptKey,
      executionTimeout: abandoned ? config.abandonedExecutionTimeout : config.executionTimeout,
    });
    const operationStarted = performance.now();
    const admissionStarted = performance.now();
    const admission = await ledger.admitOperation(request);
    result.admitMilliseconds.push(performance.now() - admissionStarted);
    if (admission.status === 'denied') {
      result.denials[admission.reason] = (result.denials[admission.reason] ?? 0) + 1;
      return;
    }
    if (admission.status === 'replay') {
      result.replays += 1;
      return;
    }
    result.admitted += 1;
    const identity = {
      operationId: admission.operationId,
      accountId: account.accountId,
      requestDigest: request.requestDigest,
    };
    if (!(await ledger.markDispatchIntent(admission.operationId, admission.generation))) {
      result.failures.push(`dispatch-intent-refused:${admission.operationId}`);
      return;
    }
    if (abandoned) {
      // Left for the recovery worker: the deadline passes while nothing resolves it.
      result.abandoned += 1;
      return;
    }
    const outcome = stubbedSupplierOutcome(index);
    const evidence: TerminalEvidence =
      outcome.kind === 'rejected'
        ? { kind: 'provider_rejected', executionStatus: 'rejected' }
        : {
            kind: 'final_usage',
            usageOccurredAt: new Date(),
            executionStatus: 'succeeded',
            meterItems: [
              { dimension: loadDimension, tier: null, quantity: outcome.kind === 'zero' ? 0n : outcome.units },
            ],
          };
    await ledger.recordInvocationEvidence({ ...identity, evidence });
    const terminalizeStarted = performance.now();
    const receipt = await ledger.terminalizeOperation({
      ...identity,
      expectedGeneration: admission.generation,
      evidence,
      resolvedAt: new Date(),
    });
    result.terminalizeMilliseconds.push(performance.now() - terminalizeStarted);
    if (receipt.customerState === 'settled') {
      result.settled += 1;
    } else {
      result.released += 1;
    }
    result.operationMilliseconds.push(performance.now() - operationStarted);
  };
  await Promise.all(
    Array.from({ length: config.concurrency }, async () => {
      for (let index = next++; index < config.operations; index = next++) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- a worker is one sequential in-flight operation by design
          await runOne(index);
        } catch (error) {
          result.failures.push(`${index}:${error instanceof Error ? error.message : 'unknown'}`);
        }
      }
    }),
  );
  result.durationMilliseconds = Math.round(performance.now() - started);
  result.finishedAt = new Date().toISOString();
  result.providerExecutions = providerExecutions;
  await client.end();
  writeFileSync(config.resultPath, JSON.stringify(result));
  console.log(
    JSON.stringify({
      event: 'billing.load_driver',
      label: result.label,
      pid: result.pid,
      admitted: result.admitted,
      settled: result.settled,
      released: result.released,
      abandoned: result.abandoned,
      denials: result.denials,
      failures: result.failures.length,
      providerExecutions: result.providerExecutions,
      durationMilliseconds: result.durationMilliseconds,
    }),
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
