import { setTimeout as wait } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { BillingEnvironment } from '#api/billing/credit-ledger.types.js';

/** One pass claims at most this many due operations; the ledger caps a claim at 100. */
export const recoveryPassLimit = 100;

export type BillingRecoverySchedulerConfig = {
  readonly environment: BillingEnvironment;
  /** `BILLING_RECOVERY_INTERVAL_MS`, validated and defaulted by the environment schema. */
  readonly intervalMilliseconds: number;
  readonly limit: number;
};

/**
 * Runs the ledger's own recovery claimant inside the API, in every environment.
 *
 * B9 D11 keeps one recovery path: this is the same `recoverDueLlmOperations`
 * the `recover-llm-worker` CLI drives, so the worker remains optional
 * scale-out rather than the only clock. The objection recorded at B9:397 was
 * Redis coupling and multiplied polling — neither applies: the pass imports
 * nothing but the ledger, and the durable claim lease already serialises
 * concurrent claimants across replicas and the CLI alike.
 */
// oxlint-disable-next-line new-cap -- the Nest decorator exemption lists *.service.ts, not this scheduler
@Injectable()
export class BillingRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  readonly #logger = new Logger(BillingRecoveryScheduler.name);
  readonly #shutdown = new AbortController();
  #closed: Promise<void> | undefined;

  public constructor(
    private readonly ledger: Pick<CreditLedgerService, 'recoverDueLlmOperations'>,
    private readonly config: BillingRecoverySchedulerConfig,
  ) {}

  public onModuleInit(): void {
    this.#closed = this.run();
  }

  public async onModuleDestroy(): Promise<void> {
    this.#shutdown.abort();
    await this.#closed;
  }

  /** Resolves one bounded batch of due operations and reports only when it did work. */
  public async runOnce(): Promise<void> {
    const result = await this.ledger.recoverDueLlmOperations({
      environment: this.config.environment,
      limit: this.config.limit,
    });
    if (result.claimed === 0) {
      return;
    }
    this.#logger.log(
      JSON.stringify({
        event: 'billing.llm_recovery_pass',
        environment: this.config.environment,
        claimed: result.claimed,
        resolved: result.resolved,
        failed: result.failedOperationIds.length,
        remainingDue: result.remainingDue,
        oldestDueAgeMilliseconds: result.oldestDueAgeMilliseconds,
      }),
    );
  }

  private async run(): Promise<void> {
    while (!this.#shutdown.signal.aborted) {
      try {
        // One fixed interval, no drain loop (ponytail): a backlog drains at `limit`
        // per interval, and the CLI worker is the scale-out when that is not enough.
        // oxlint-disable-next-line no-await-in-loop -- one owner drains its claims sequentially
        await this.runOnce();
      } catch (error) {
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
