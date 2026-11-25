import { setTimeout as wait } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { CreditLedgerService } from '#credit-ledger.service.js';
import type { FundedLlmCapacityPool } from '#credit-ledger.types.js';
import type { BillingEnvironment } from '@taucad/api-database/schema/billing.types';
import type { MetricsService } from '@taucad/api-observability/metrics';

/** One pass claims at most this many due operations per pool; the ledger caps a claim at 100. */
export const recoveryPassLimit = 100;

/**
 * One pool's batch that has not settled after this long is reported as a failed batch, so a hung
 * driver or database shows as `outcome: 'failed'` passes the caller backs off from, not as silence.
 * It is under the ledger's one-minute claim lease, so the report lands before the claim can lapse.
 */
export const recoveryBatchDeadlineMilliseconds = 30_000;

const capacityPools: readonly FundedLlmCapacityPool[] = ['primary', 'helper'];

export type BillingRecoverySchedulerConfig = {
  readonly environment: BillingEnvironment;
  /** `BILLING_RECOVERY_INTERVAL_MS`, validated and defaulted by the environment schema. */
  readonly intervalMilliseconds: number;
  readonly limit: number;
  /** Defaults to {@link recoveryBatchDeadlineMilliseconds}. */
  readonly batchDeadlineMilliseconds?: number;
};

/** A pool's batch outlived its deadline; `name` is the `failureKind` its failed batch record carries. */
export class RecoveryBatchDeadlineError extends Error {
  public override readonly name = 'RecoveryBatchDeadlineError';

  public constructor(milliseconds: number) {
    super(`Recovery batch did not settle within ${milliseconds} ms`);
  }
}

/**
 * Settles with `work`, or rejects with {@link RecoveryBatchDeadlineError} once `milliseconds` pass.
 *
 * The ledger takes no cancellation signal, so an expired batch is abandoned rather than stopped: its
 * claim lease keeps other passes off the operations it holds until the lease lapses, the ledger's
 * terminal transitions stay exactly-once, and its late outcome is dropped here instead of becoming
 * an unhandled rejection.
 *
 * @param work - The batch in flight.
 * @param milliseconds - Its deadline.
 * @returns The batch's result.
 */
const withinDeadline = async <T>(work: Promise<T>, milliseconds: number): Promise<T> => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- nothing awaits an abandoned batch, so its rejection is observed here
  work.catch(() => undefined);
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RecoveryBatchDeadlineError(milliseconds));
    }, milliseconds);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
};

export type BillingRecoveryMetrics = Pick<
  MetricsService,
  | 'billingFundedOperationRecoveries'
  | 'billingFundedOperationCurrent'
  | 'billingFundedOperationOldestDueAge'
  | 'billingFundedOperationRecoveryProviderExecutions'
  | 'billingFundedOperationRecoveryBatchDuration'
  | 'billingWorkerPasses'
>;

/** What one pass over both pools did; the CLI worker uses it to drain a full batch or back off. */
export type BillingRecoveryPassResult = {
  /** Operations that failed recovery, plus one per pool whose batch threw. */
  readonly failed: number;
  /** A pool claimed its whole limit, so more due work is likely waiting. */
  readonly fullBatch: boolean;
  /** One `billing.llm_recovery_batch` log record per pool, in the shape the CLI prints and the load harness parses. */
  readonly batches: readonly BillingRecoveryBatch[];
};

export type BillingRecoveryBatch = Readonly<Record<string, unknown>> & {
  readonly event: 'billing.llm_recovery_batch';
  readonly outcome?: 'failed';
  readonly claimed?: number;
  readonly failed?: number;
};

/**
 * Runs the ledger's own recovery claimant inside the API, in every environment.
 *
 * B9 D11 keeps one recovery path: this is the same `recoverDueLlmOperations`
 * the `recover-llm-worker` CLI drives (the CLI calls `runOnce` below), so the
 * worker is optional scale-out rather than the only clock. Since the
 * `billing-recovery` Fly process group was retired this scheduler is the only
 * deployed clock, so it also owns the recovery metrics the alerts read:
 * `tau_billing_worker_passes_total{tau_worker="recovery"}` and the funded-operation
 * gauges. Every API replica emits them; the alerts aggregate by app, not process.
 * The objection recorded at B9:397 was Redis coupling and multiplied polling —
 * neither applies: the pass imports nothing but the ledger, and the durable claim
 * lease already serialises concurrent claimants across replicas and the CLI alike.
 */
// oxlint-disable-next-line new-cap -- the Nest decorator exemption lists *.service.ts, not this scheduler
@Injectable()
export class BillingRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  readonly #logger = new Logger(BillingRecoveryScheduler.name);
  readonly #shutdown = new AbortController();
  #closed: Promise<void> | undefined;

  public constructor(
    private readonly ledger: Pick<CreditLedgerService, 'recoverDueLlmOperations'>,
    private readonly metrics: BillingRecoveryMetrics,
    private readonly config: BillingRecoverySchedulerConfig,
  ) {}

  public onModuleInit(): void {
    this.#closed = this.run();
  }

  public async onModuleDestroy(): Promise<void> {
    this.#shutdown.abort();
    await this.#closed;
  }

  /**
   * Resolves one bounded batch of due operations per capacity pool and records the
   * recovery metrics. The caller decides which batch records to log. Each batch has a
   * deadline, so a pass always settles: a batch that throws or outlives it is a failed batch.
   */
  public async runOnce(): Promise<BillingRecoveryPassResult> {
    let failed = 0;
    let batchThrew = false;
    let fullBatch = false;
    const batches: BillingRecoveryBatch[] = [];
    for (const pool of capacityPools) {
      const startedAt = Date.now();
      const attributes = {
        'deployment.environment': this.config.environment,
        'tau.billing.capacity_pool': pool,
      } as const;
      this.metrics.billingFundedOperationRecoveries.add(1, {
        ...attributes,
        'tau.billing.recovery.outcome': 'attempted',
      });
      try {
        // oxlint-disable-next-line no-await-in-loop -- the two disjoint capacity pools are drained in turn
        const result = await withinDeadline(
          this.ledger.recoverDueLlmOperations({
            environment: this.config.environment,
            limit: this.config.limit,
            pool,
          }),
          this.config.batchDeadlineMilliseconds ?? recoveryBatchDeadlineMilliseconds,
        );
        const failures = result.failedOperationIds.length;
        failed += failures;
        fullBatch ||= result.claimed === this.config.limit;
        for (const [outcome, count] of [
          ['claimed', result.claimed],
          ['resolved', result.resolved],
          ['failed', failures],
        ] as const) {
          if (count > 0) {
            this.metrics.billingFundedOperationRecoveries.add(count, {
              ...attributes,
              'tau.billing.recovery.outcome': outcome,
            });
          }
        }
        this.metrics.billingFundedOperationCurrent.record(result.pending, {
          ...attributes,
          'tau.billing.pending.state': 'pending',
        });
        this.metrics.billingFundedOperationCurrent.record(result.remainingDue, {
          ...attributes,
          'tau.billing.pending.state': 'due',
        });
        this.metrics.billingFundedOperationOldestDueAge.record(result.oldestDueAgeMilliseconds ?? 0, attributes);
        this.metrics.billingFundedOperationRecoveryProviderExecutions.record(0, attributes);
        this.metrics.billingFundedOperationRecoveryBatchDuration.record((Date.now() - startedAt) / 1000, {
          ...attributes,
          'tau.billing.recovery.batch.outcome': failures === 0 ? 'succeeded' : 'failed',
        });
        batches.push({
          event: 'billing.llm_recovery_batch',
          environment: this.config.environment,
          pool,
          claimed: result.claimed,
          resolved: result.resolved,
          pending: result.pending,
          remainingDue: result.remainingDue,
          leasedDue: result.leasedDue,
          oldestDueAgeMilliseconds: result.oldestDueAgeMilliseconds,
          failed: failures,
          providerExecutions: 0,
          durationMilliseconds: Date.now() - startedAt,
        });
      } catch (error) {
        failed += 1;
        batchThrew = true;
        this.metrics.billingFundedOperationRecoveries.add(1, {
          ...attributes,
          'tau.billing.recovery.outcome': 'failed',
        });
        this.metrics.billingFundedOperationRecoveryBatchDuration.record((Date.now() - startedAt) / 1000, {
          ...attributes,
          'tau.billing.recovery.batch.outcome': 'failed',
        });
        batches.push({
          event: 'billing.llm_recovery_batch',
          environment: this.config.environment,
          pool,
          outcome: 'failed',
          failureKind: error instanceof Error ? error.name : 'UnknownError',
          // Ledger and driver messages name the invariant or constraint, not customer content; without it a
          // P1 Recovery Failed alert has nothing to diagnose from.
          failureMessage: error instanceof Error ? error.message : String(error),
          durationMilliseconds: Date.now() - startedAt,
        });
      }
    }
    /* F-10: the per-pass gauges keep exporting their last value, so a stalled clock is only visible here.
       A pass is `error` only when a batch threw: one operation that keeps failing recovery is counted
       by `recoveries{failed}`, and must not make a live clock read as stalled. */
    this.metrics.billingWorkerPasses.add(1, { 'tau.worker': 'recovery', outcome: batchThrew ? 'error' : 'ok' });
    return { failed, fullBatch, batches };
  }

  private async run(): Promise<void> {
    while (!this.#shutdown.signal.aborted) {
      // One fixed interval, no drain loop (ponytail): a backlog drains at `limit` per pool
      // per replica per interval, and the CLI worker is the scale-out when that is not enough.
      try {
        // oxlint-disable-next-line no-await-in-loop -- one owner drains its claims sequentially
        const { batches } = await this.runOnce();
        // Every replica polls every few seconds, so an idle batch is not worth a log line.
        for (const batch of batches) {
          if (batch.outcome === 'failed') {
            this.#logger.error(JSON.stringify(batch));
          } else if ((batch.claimed ?? 0) > 0 || (batch.failed ?? 0) > 0) {
            this.#logger.log(JSON.stringify(batch));
          }
        }
      } catch (error) {
        // `runOnce` catches each pool's failure; this guards the clock itself against anything else.
        this.#logger.error({ err: error }, 'Billing recovery pass failed');
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- the poll deliberately sleeps between passes
        await wait(this.config.intervalMilliseconds, undefined, { signal: this.#shutdown.signal });
      } catch {
        return;
      }
    }
  }
}
