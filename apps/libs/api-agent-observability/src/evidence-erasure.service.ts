import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TauMetrics } from '@taucad/telemetry';
import { DatabaseService } from '@taucad/api-database';
import type { Environment } from '@taucad/api-core';
import { ShutdownService } from '@taucad/api-lifecycle/shutdown';
import { MetricsService } from '@taucad/api-observability/metrics';
import type { AgentEvidenceBacklogState, AgentEvidenceErasureOutcome } from '@taucad/api-observability/metrics';
import {
  completeErasures,
  erasureDeleteAfterMilliseconds,
  leaseErasureTraces,
  settleErasureTraces,
} from '#evidence-erasure.js';
import type { LeasedErasureTrace } from '#evidence-erasure.js';
import { backlogCounts, expireBacklog } from '#evidence-delivery.js';
import { reapExpiredEvidence } from '#evidence-expiry.js';
import { LangfuseClient } from '#langfuse-client.js';

/** Lifecycle pacing. Slow and bounded: expiry and erasure are owed within a day, not seconds. */
export const erasureTiming = Object.freeze({
  intervalMilliseconds: 60_000,
  batch: 50,
  requestTimeoutMilliseconds: 10_000,
  leaseMilliseconds: 120_000,
  /** How long after admission a named trace is first deleted; see {@link erasureDeleteAfterMilliseconds}. */
  deleteAfterMilliseconds: erasureDeleteAfterMilliseconds,
  maxBackoffMilliseconds: 60 * 60_000,
  /** How long past its expiry a receipt is kept; longer than any clock skew ingress allows. */
  receiptGraceMilliseconds: 86_400_000,
  reapBatch: 1000,
});

/** Backoff for a deletion request Langfuse did not accept, by the attempts made before it. */
export const erasureRetryDelay = (attempts: number): number =>
  Math.min(erasureTiming.maxBackoffMilliseconds, 60_000 * 2 ** Math.max(0, attempts));

const backlogStates: readonly AgentEvidenceBacklogState[] =
  TauMetrics.agentEvidenceBacklogRows.attributes.shape['tau.agent_evidence.state'].options;

/**
 * Expires Tau's agent-evidence records and deletes erased subjects' traces
 * from Langfuse (blueprint T13).
 *
 * Each pass first purges backlog payloads past their retention and deletes
 * receipts a day past it, with no vendor call, so it runs whether or not
 * delivery or Langfuse is configured. It then asks Langfuse to delete a
 * batch of due journal traces. An accepted delete is the erasure (charter I6
 * as amended by ruling 9): the trace settles `accepted` with no further
 * request, and an erasure completes once every trace it named is accepted.
 * Nothing is read back; a periodic drill proves that an accepted delete
 * removes a trace and its scores. A refused delete (a 429, any other non-2xx,
 * a timeout or an unreachable host) is retried with backoff and counted as
 * `retry`, so deletes that are never accepted alert
 * (`agent-evidence-erasure-stuck`). That half runs whenever Langfuse
 * credentials are configured, whether or not delivery is enabled,
 * so pausing delivery never pauses erasure. Each pass also samples the
 * backlog for the health series (T14). Only counts and bounded codes are
 * logged or recorded.
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
    private readonly metrics: MetricsService,
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
    const retired = this.metrics.agentEvidenceLifecycleRecords;
    try {
      const purged = await expireBacklog(database, now);
      add('expired', purged);
      retired.add(purged, { action: 'purged' });
      const reaped = await reapExpiredEvidence(database, {
        before: new Date(now.getTime() - erasureTiming.receiptGraceMilliseconds),
        limit: erasureTiming.reapBatch,
      });
      add('reaped', reaped);
      retired.add(reaped, { action: 'reaped' });
      await this.recordBacklog();
      if (client !== undefined) {
        const lease = {
          owner: this.owner,
          leaseMilliseconds: erasureTiming.leaseMilliseconds,
          limit: erasureTiming.batch,
          now,
        };
        const pending = await leaseErasureTraces(database, lease);
        if (pending.length > 0) {
          add(...(await this.request(client, pending, now)));
        }
        const completed = await completeErasures(database, now);
        add('completed', completed);
        retired.add(completed, { action: 'erased' });
      }
      this.metrics.agentEvidencePasses.add(1, { 'tau.worker': 'lifecycle', outcome: 'ok' });
    } catch (error) {
      this.metrics.agentEvidencePasses.add(1, { 'tau.worker': 'lifecycle', outcome: 'error' });
      this.logger.warn({ name: error instanceof Error ? error.name : typeof error }, 'Evidence lifecycle pass failed');
    } finally {
      if (Object.values(counts).some((value) => value > 0)) {
        this.logger.log({ counts }, 'Evidence lifecycle pass');
      }
    }
    return counts;
  }

  /** Samples the shared backlog by state, every state each pass so a drained one reads zero. */
  private async recordBacklog(): Promise<void> {
    const { states, heldBytes } = await backlogCounts(this.databaseService.database);
    for (const state of backlogStates) {
      this.metrics.agentEvidenceBacklogRows.record(states[state] ?? 0, { 'tau.agent_evidence.state': state });
    }
    this.metrics.agentEvidenceBacklogHeldBytes.record(heldBytes);
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
        outcome.kind === 'accepted'
          ? { kind: 'accepted' }
          : { kind: 'retry', reason: outcome.reason, notBefore: new Date(now.getTime() + erasureRetryDelay(attempts)) },
    });
    this.countTraces(outcome.kind, held);
    this.countTraces('lease_lost', traces.length - held);
    return [outcome.kind === 'accepted' ? 'accepted' : `retry:${outcome.reason}`, held];
  }

  private countTraces(outcome: AgentEvidenceErasureOutcome, traces: number): void {
    if (traces > 0) {
      this.metrics.agentEvidenceErasureTraces.add(traces, { outcome });
    }
  }
}
