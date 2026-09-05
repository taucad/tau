import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { zooCloseCodes } from '#api/billing/billing.constants.js';

/** Milliseconds between engine-minute ticks. */
const minuteTickInterval = 60_000;

/** Milliseconds (Q35): client inactivity window before the session closes. */
const zooIdleTimeout = 5 * 60_000;

export type ZooSessionMeterDeps = {
  creditLedgerService: Pick<CreditLedgerService, 'debit'>;
  metricsService: Pick<MetricsService, 'billingCreditCommitted' | 'billingCommitFailures'>;
  userId: string;
  /** User-charged µ$ per started engine minute (Q35 list × 1.3). 0 disables metering. */
  ratePerMinuteMicro: bigint;
  /** Closes the CLIENT socket; upstream teardown cascades via the proxy's close handlers. */
  close: (code: number, reason: string) => void;
};

/**
 * Per-connection Zoo engine-minute meter (B8/T2b/Q35/AD14): starts at the
 * upstream `modeling_session_data` auth marker, charges each STARTED minute
 * reservation-less (`debit` may go negative — the tick that exhausts the
 * balance settles, then the session closes with a typed code), and closes
 * idle sessions after five minutes without client frames.
 */
export class ZooSessionMeter {
  private readonly logger = new Logger(ZooSessionMeter.name);
  private readonly sessionId = randomUUID();
  private tickTimer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;
  private startedAt: number | undefined;
  private stopped = false;

  /** Started minutes settled so far (S53 duration accounting). */
  public chargedMinutes = 0;

  public constructor(private readonly deps: ZooSessionMeterDeps) {}

  /** Engine time begins at the upstream auth marker, not the socket open. */
  public onAuthenticated(): void {
    if (this.stopped || this.startedAt !== undefined) {
      return;
    }
    this.startedAt = Date.now();
    this.resetIdleTimer();
    if (this.deps.ratePerMinuteMicro <= 0n) {
      return;
    }
    // Minute 1 starts now; every tick afterwards starts the next minute.
    void this.chargeStartedMinute();
    this.tickTimer = setInterval(() => {
      void this.chargeStartedMinute();
    }, minuteTickInterval);
  }

  /** Client frames prove liveness — reset the Q35 idle window. */
  public onClientActivity(): void {
    if (this.stopped || this.startedAt === undefined) {
      return;
    }
    this.resetIdleTimer();
  }

  /** Idempotent teardown; safe from every close/error path. */
  public stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (this.startedAt !== undefined) {
      const durationSeconds = Math.round((Date.now() - this.startedAt) / 1000);
      this.logger.debug(
        `Zoo session ${this.sessionId} ended after ${durationSeconds}s — ${this.chargedMinutes} engine minute(s) settled`,
      );
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.logger.debug(`Zoo session ${this.sessionId} idle for ${zooIdleTimeout}ms — closing (Q35)`);
      this.deps.close(zooCloseCodes.idleTimeout, 'IDLE_TIMEOUT');
      this.stop();
    }, zooIdleTimeout);
    this.idleTimer.unref();
  }

  private async chargeStartedMinute(): Promise<void> {
    if (this.stopped) {
      return;
    }
    try {
      const outcome = await this.deps.creditLedgerService.debit({
        userId: this.deps.userId,
        amountMicro: this.deps.ratePerMinuteMicro,
        category: 'zoo_engine',
        modelId: 'zoo-engine',
        note: `zoo-session:${this.sessionId}`,
      });
      this.chargedMinutes += 1;
      this.deps.metricsService.billingCreditCommitted.add(Number(this.deps.ratePerMinuteMicro), {
        'tau.billing.category': 'zoo_engine',
      });
      if (outcome.balanceMicro <= 0n) {
        // The exhausting minute is settled (S51), then the session ends.
        this.deps.close(zooCloseCodes.insufficientCredits, 'INSUFFICIENT_CREDITS');
        this.stop();
      }
    } catch (error) {
      // Fail open for this tick — the drift audit surfaces sustained failures;
      // killing a live modeling session over a transient Redis blip is worse.
      this.deps.metricsService.billingCommitFailures.add(1, { 'tau.billing.category': 'zoo_engine' });
      this.logger.error(`Zoo engine-minute debit failed for ${this.deps.userId}: ${String(error)}`);
    }
  }
}
