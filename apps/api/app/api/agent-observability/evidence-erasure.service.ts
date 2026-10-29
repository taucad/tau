import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '#database/database.service.js';
import type { Environment } from '#config/environment.config.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import {
  completeErasures,
  leaseErasureTraces,
  recheckErasureTrace,
  settleErasureTraces,
} from '#api/agent-observability/evidence-erasure.js';
import type { LeasedErasureTrace } from '#api/agent-observability/evidence-erasure.js';
import { expireBacklog } from '#api/agent-observability/evidence-delivery.js';
import { reapExpiredEvidence } from '#api/agent-observability/evidence-expiry.js';
import { LangfuseClient } from '#api/agent-observability/langfuse-client.js';

/** Lifecycle pacing. Slow and bounded: expiry and erasure are owed within a day, not seconds. */
export const erasureTiming = Object.freeze({
  intervalMilliseconds: 60_000,
  batch: 50,
  concurrency: 4,
  requestTimeoutMilliseconds: 10_000,
  leaseMilliseconds: 120_000,
  /**
   * How long after a deletion request the trace is read back. At least the
   * delivery gap window, so a span that was accepted before the fence but
   * not yet ingested lands before the read and is deleted again.
   */
  recheckAfterMilliseconds: 15 * 60_000,
  unavailableRecheckMilliseconds: 5 * 60_000,
  maxBackoffMilliseconds: 60 * 60_000,
  /** How long past its expiry a receipt is kept; longer than any clock skew ingress allows. */
  receiptGraceMilliseconds: 86_400_000,
  reapBatch: 1000,
});

/** Backoff for a deletion request that did not reach Langfuse, or a trace still present after one. */
export const erasureRetryDelay = (attempts: number): number =>
  Math.min(erasureTiming.maxBackoffMilliseconds, 60_000 * 2 ** Math.max(0, attempts));

const runInPool = async <T>(items: readonly T[], width: number, task: (item: T) => Promise<void>): Promise<void> => {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++]!;
      // oxlint-disable-next-line no-await-in-loop -- the pool bounds concurrency to `width`
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
};

/**
 * Expires Tau's agent-evidence records and deletes erased subjects' traces
 * from Langfuse (blueprint T13).
 *
 * Each pass first purges backlog payloads past their retention and deletes
 * receipts a day past it, with no vendor call, so it runs whether or not
 * delivery or Langfuse is configured. It then asks Langfuse to delete a batch of journal traces, then, once the
 * recheck window has passed, reads each one back: only a 404 settles it. A
 * trace still present is requested again with backoff, and an unanswered
 * read is retried without counting as absence. That half runs whenever
 * Langfuse credentials are configured, whether or not delivery is enabled,
 * so pausing delivery never pauses erasure. Only counts and bounded codes
 * are logged.
 */
@Injectable()
export class EvidenceErasureService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvidenceErasureService.name);
  private readonly owner = `eer_${randomUUID()}`;
  private readonly client: LangfuseClient | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<unknown> | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    configService: ConfigService<Environment, true>,
    private readonly shutdown: ShutdownService,
  ) {
    const baseUrl = configService.get('LANGFUSE_BASE_URL', { infer: true });
    const publicKey = configService.get('LANGFUSE_PUBLIC_KEY', { infer: true });
    const secretKey = configService.get('LANGFUSE_SECRET_KEY', { infer: true });
    if (baseUrl !== undefined && publicKey !== undefined && secretKey !== undefined) {
      this.client = new LangfuseClient({ baseUrl, publicKey, secretKey }, erasureTiming.requestTimeoutMilliseconds);
    }
  }

  public onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tick();
    }, erasureTiming.intervalMilliseconds);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * One lifecycle pass. Public for tests and the maintenance command.
   *
   * @param now - The clock.
   * @returns Counts of what the pass did.
   */
  public async drain(now = new Date()): Promise<Readonly<Record<string, number>>> {
    const { client } = this;
    const counts: Record<string, number> = {};
    const add = (key: string, value: number): void => {
      counts[key] = (counts[key] ?? 0) + value;
    };
    const { database } = this.databaseService;
    try {
      add('expired', await expireBacklog(database, now));
      add(
        'reaped',
        await reapExpiredEvidence(database, {
          before: new Date(now.getTime() - erasureTiming.receiptGraceMilliseconds),
          limit: erasureTiming.reapBatch,
        }),
      );
      if (client === undefined) {
        return counts;
      }
      const lease = {
        owner: this.owner,
        leaseMilliseconds: erasureTiming.leaseMilliseconds,
        limit: erasureTiming.batch,
        now,
      };
      const pending = await leaseErasureTraces(database, { ...lease, state: 'pending' });
      if (pending.length > 0) {
        add(...(await this.request(client, pending, now)));
      }
      const requested = await leaseErasureTraces(database, { ...lease, state: 'requested' });
      await runInPool(requested, erasureTiming.concurrency, async (trace) => {
        add(await this.confirm(client, trace, now), 1);
      });
      add('completed', await completeErasures(database, now));
    } catch (error) {
      this.logger.warn({ name: error instanceof Error ? error.name : typeof error }, 'Evidence lifecycle pass failed');
    } finally {
      if (Object.values(counts).some((value) => value > 0)) {
        this.logger.log({ counts }, 'Evidence lifecycle pass');
      }
    }
    return counts;
  }

  /** Starts a pass unless one is running or the process is stopping. */
  private tick(): void {
    if (this.running !== undefined || this.shutdown.signal.aborted) {
      return;
    }
    const pass = (async (): Promise<void> => {
      try {
        await this.drain();
      } finally {
        this.running = undefined;
      }
    })();
    this.running = pass;
    this.shutdown.track(pass);
  }

  private async request(
    client: LangfuseClient,
    traces: readonly LeasedErasureTrace[],
    now: Date,
  ): Promise<[string, number]> {
    const outcome = await client.deleteTraces(
      traces.map((trace) => trace.traceId),
      this.shutdown.signal,
    );
    const attempts = Math.max(...traces.map((trace) => trace.attempts));
    const held = await settleErasureTraces(this.databaseService.database, {
      traces,
      owner: this.owner,
      now,
      settlement:
        outcome.kind === 'requested'
          ? { kind: 'requested', recheckAt: new Date(now.getTime() + erasureTiming.recheckAfterMilliseconds) }
          : { kind: 'retry', reason: outcome.reason, notBefore: new Date(now.getTime() + erasureRetryDelay(attempts)) },
    });
    return [outcome.kind === 'requested' ? 'requested' : `retry:${outcome.reason}`, held];
  }

  private async confirm(client: LangfuseClient, trace: LeasedErasureTrace, now: Date): Promise<string> {
    const found = await client.traceExists(trace.traceId, this.shutdown.signal);
    const { database } = this.databaseService;
    if (found === 'unavailable') {
      const held = await recheckErasureTrace(database, {
        trace,
        owner: this.owner,
        notBefore: new Date(now.getTime() + erasureTiming.unavailableRecheckMilliseconds),
      });
      return held ? 'recheck' : 'lease-lost';
    }
    const held = await settleErasureTraces(database, {
      traces: [trace],
      owner: this.owner,
      now,
      settlement:
        found === 'absent'
          ? { kind: 'absent' }
          : {
              kind: 'retry',
              reason: 'present',
              notBefore: new Date(now.getTime() + erasureRetryDelay(trace.attempts)),
            },
    });
    return held === 0 ? 'lease-lost' : found;
  }
}
