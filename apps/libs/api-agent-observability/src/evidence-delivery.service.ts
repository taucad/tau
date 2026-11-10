import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import type { Evidence } from '@taucad/agent-observability/contract';
import { DatabaseService } from '@taucad/api-database';
import { readProjectDeletion } from '@taucad/api-database/project-lifecycle';
import type { Environment } from '@taucad/api-core';
import { ShutdownService } from '@taucad/api-lifecycle/shutdown';
import { MetricsService } from '@taucad/api-observability/metrics';
import type { AgentEvidenceDeliveryOutcome, AgentEvidenceSupersededReason } from '@taucad/api-observability/metrics';
import { TelemetryPurposeService } from '#telemetry-purposes/telemetry-purpose.service.js';
import { openEvidence } from '#evidence-seal.js';
import { leasePending, leaseUncertain, prepareSend, settleDelivery, sweepBacklog } from '#evidence-delivery.js';
import type { DeliverySettlement, LeasedDelivery } from '#evidence-delivery.js';
import { LangfuseClient } from '#langfuse-client.js';
import { langfuseObservation, pseudonymKey, receiptSpanId } from '#langfuse-observation.js';

/** Delivery pacing. Fixed and low: vendor availability never gates the API. */
export const deliveryTiming = Object.freeze({
  intervalMilliseconds: 5000,
  batch: 16,
  concurrency: 4,
  requestTimeoutMilliseconds: 10_000,
  leaseMilliseconds: 60_000,
  /** How long an acknowledged or uncertain send may stay invisible before it is recorded as a gap. */
  gapAfterMilliseconds: 15 * 60_000,
  recheckMilliseconds: 60_000,
  maxBackoffMilliseconds: 15 * 60_000,
});

/** Backoff for a send that provably never reached ingestion. */
export const retryDelay = (attempts: number): number =>
  Math.min(deliveryTiming.maxBackoffMilliseconds, 5000 * 2 ** Math.max(0, attempts - 1));

/** The bounded health outcome of one settlement; vendor reason codes stay in the row and the log. */
const deliveryOutcome = (settlement: DeliverySettlement): AgentEvidenceDeliveryOutcome => {
  switch (settlement.kind) {
    case 'sent': {
      return settlement.reason === 'acknowledged' ? 'acknowledged' : 'uncertain';
    }
    case 'expired': {
      return settlement.reason === 'gap'
        ? 'gap'
        : settlement.reason === 'revoked' || settlement.reason === 'deleted'
          ? 'revoked'
          : 'expired';
    }
    case 'retry': {
      return settlement.reason === 'key-unavailable' ? 'key_unavailable' : 'retry';
    }
    default: {
      return settlement.kind;
    }
  }
};

const supersededReason: Readonly<Record<'object' | 'no-object', AgentEvidenceSupersededReason>> = {
  object: 'object',
  'no-object': 'no_object',
};

/** What a failure log may carry: the error's class and driver code, never its message, which can embed row values. */
const errorFacts = (error: unknown): Readonly<{ name: string; code?: string }> => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return {
    name: error instanceof Error ? error.name : typeof error,
    ...(typeof code === 'string' ? { code } : {}),
  };
};

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
 * Drains the agent-evidence backlog to Langfuse (blueprint T08).
 *
 * Each pass sweeps expired and abandoned rows, leases a bounded batch, opens
 * each payload, rechecks the plane's purpose and the project's deletion fence,
 * maps it to the one Langfuse object it writes, claims that object's id on
 * the row and sends its spans in one request, settling the row by what the
 * vendor's answer proves. A receipt for an object another receipt already
 * claimed, or for a fact that maps to no object, settles `superseded` and
 * sends nothing (LD12). Only a send that provably never reached ingestion is retried; an
 * acknowledged or uncertain one is reconciled by reading it back and, if it
 * never becomes visible, recorded as a gap. No transaction is held across a
 * vendor call, and only counts and bounded codes are logged.
 */
@Injectable()
export class EvidenceDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvidenceDeliveryService.name);
  private readonly owner = `evd_${randomUUID()}`;
  private readonly client: LangfuseClient | undefined;
  private readonly keys: ReadonlyMap<number, Uint8Array<ArrayBuffer>>;
  private readonly pseudonym: Uint8Array<ArrayBuffer> | undefined;
  private readonly environment: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<unknown> | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    configService: ConfigService<Environment, true>,
    private readonly telemetryPurposes: TelemetryPurposeService,
    private readonly shutdown: ShutdownService,
    private readonly metrics: MetricsService,
  ) {
    const encodedKey = configService.get('TAU_OBSERVABILITY_PAYLOAD_KEY', { infer: true });
    const key = encodedKey === undefined ? undefined : Uint8Array.from(Buffer.from(encodedKey, 'base64url'));
    this.keys =
      key === undefined
        ? new Map()
        : new Map([[configService.get('TAU_OBSERVABILITY_PAYLOAD_KEY_VERSION', { infer: true }), key]]);
    this.pseudonym = key === undefined ? undefined : pseudonymKey(key);
    const baseUrl = configService.get('LANGFUSE_BASE_URL', { infer: true });
    const publicKey = configService.get('LANGFUSE_PUBLIC_KEY', { infer: true });
    const secretKey = configService.get('LANGFUSE_SECRET_KEY', { infer: true });
    if (
      configService.get('TAU_OBSERVABILITY_DELIVERY_ENABLED', { infer: true }) &&
      baseUrl !== undefined &&
      publicKey !== undefined &&
      secretKey !== undefined
    ) {
      this.client = new LangfuseClient({ baseUrl, publicKey, secretKey }, deliveryTiming.requestTimeoutMilliseconds);
    }
    /* The same deployment name the payload was sealed under at admission. */
    const deployment: unknown = configService.get('BILLING_ENVIRONMENT', { infer: true });
    this.environment = typeof deployment === 'string' ? deployment : configService.get('NODE_ENV', { infer: true });
  }

  public onModuleInit(): void {
    if (this.client === undefined || this.pseudonym === undefined) {
      return;
    }
    this.timer = setInterval(() => {
      this.tick();
    }, deliveryTiming.intervalMilliseconds);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * One delivery pass. Public for tests and the maintenance command.
   *
   * @param now - The clock.
   * @returns Counts of what the pass did.
   */
  public async drain(now = new Date()): Promise<Readonly<Record<string, number>>> {
    const { client, pseudonym } = this;
    if (client === undefined || pseudonym === undefined) {
      return {};
    }
    const counts: Record<string, number> = {};
    const count = (key: string): void => {
      counts[key] = (counts[key] ?? 0) + 1;
    };
    const { database } = this.databaseService;
    try {
      const swept = await sweepBacklog(database, now);
      counts['expired'] = swept.expired;
      counts['abandoned'] = swept.abandoned;
      this.metrics.agentEvidenceLifecycleRecords.add(swept.expired, { action: 'purged' });
      this.metrics.agentEvidenceDeliveries.add(swept.abandoned, { outcome: 'abandoned' });
      const lease = {
        owner: this.owner,
        leaseMilliseconds: deliveryTiming.leaseMilliseconds,
        limit: deliveryTiming.batch,
        now,
      };
      const pending = await leasePending(database, lease);
      await runInPool(pending, deliveryTiming.concurrency, async (row) => {
        const progress = { identified: false };
        count(
          await this.isolate(row, {
            stage: 'deliver',
            progress,
            now,
            attempt: async () => this.deliver({ client, pseudonym, progress }, row, now),
          }),
        );
      });
      const uncertain = await leaseUncertain(database, lease);
      await runInPool(uncertain, deliveryTiming.concurrency, async (row) => {
        count(
          await this.isolate(row, {
            stage: 'reconcile',
            progress: { identified: true },
            now,
            attempt: async () => this.reconcile(client, row, now),
          }),
        );
      });
      this.metrics.agentEvidencePasses.add(1, { 'tau.worker': 'delivery', outcome: 'ok' });
    } catch (error) {
      this.metrics.agentEvidencePasses.add(1, { 'tau.worker': 'delivery', outcome: 'error' });
      this.logger.warn(errorFacts(error), 'Evidence delivery pass failed');
    }
    if (Object.values(counts).some((value) => value > 0)) {
      this.logger.log({ counts }, 'Evidence delivery pass');
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

  /**
   * Run one row's attempt so that its failure settles that row alone. Without
   * this, one row's error rejected the pass and stranded every row it had
   * leased in `sending` until the lease lapsed, when the sweep counted them as
   * abandoned although no worker had died.
   *
   * A row whose send identity is not yet recorded provably never reached
   * ingestion, so it backs off and is sent again; one whose identity is
   * recorded may have been applied, so it is only ever reconciled.
   */
  private async isolate(
    row: LeasedDelivery,
    {
      stage,
      progress,
      now,
      attempt,
    }: Readonly<{
      stage: 'deliver' | 'reconcile';
      progress: Readonly<{ identified: boolean }>;
      now: Date;
      attempt: () => Promise<string>;
    }>,
  ): Promise<string> {
    try {
      return await attempt();
    } catch (error) {
      this.logger.warn({ stage, ...errorFacts(error) }, 'Evidence delivery attempt failed');
      try {
        if (stage === 'reconcile') {
          return await this.settle(row, {
            kind: 'recheck',
            notBefore: new Date(now.getTime() + deliveryTiming.recheckMilliseconds),
          });
        }
        return progress.identified
          ? await this.settle(row, { kind: 'sent', reason: 'error' })
          : await this.settle(row, {
              kind: 'retry',
              reason: 'error',
              notBefore: new Date(now.getTime() + retryDelay(row.attempts)),
            });
      } catch {
        /* The database itself failed; the lease lapses and the sweep recovers the row. */
        return 'error';
      }
    }
  }

  private async settle(row: LeasedDelivery, settlement: DeliverySettlement): Promise<string> {
    const held = await settleDelivery(
      this.databaseService.database,
      { receiptId: row.receiptId, owner: this.owner },
      settlement,
    );
    this.metrics.agentEvidenceDeliveries.add(1, { outcome: held ? deliveryOutcome(settlement) : 'lease_lost' });
    if (!held) {
      return 'lease-lost';
    }
    if (settlement.kind === 'superseded') {
      this.metrics.agentEvidenceSuperseded.add(1, { reason: supersededReason[settlement.reason] });
    }
    return 'reason' in settlement ? `${settlement.kind}:${settlement.reason}` : settlement.kind;
  }

  private open(row: LeasedDelivery): Evidence | 'unsealable' | 'invalid' | 'key-unavailable' {
    const version = Number(row.payload?.split('.', 1)[0]);
    if (!this.keys.has(version)) {
      return 'key-unavailable';
    }
    const bytes =
      row.payload === null
        ? undefined
        : openEvidence(
            row.payload,
            {
              environment: this.environment,
              principal: row.principalId,
              project: row.projectId,
              receipt: row.receiptId,
              plane: row.plane,
            },
            this.keys,
          );
    if (bytes === undefined) {
      return 'unsealable';
    }
    try {
      const parsed = evidenceSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      return parsed.success ? parsed.data : 'invalid';
    } catch {
      return 'invalid';
    }
  }

  /** Whether the plane's purpose still allows delivery and the project is not deletion-fenced. */
  private async revocation(row: LeasedDelivery): Promise<'revoked' | 'deleted' | undefined> {
    const { database } = this.databaseService;
    if ((await readProjectDeletion(database, row.projectId)) !== undefined) {
      return 'deleted';
    }
    const authority = await this.telemetryPurposes.getAdmissionAuthority(row.principalId, row.projectId);
    const state = authority.effective.purposes.find((purpose) => purpose.purpose === row.plane);
    return state?.allowed === true ? undefined : 'revoked';
  }

  private async deliver(
    {
      client,
      pseudonym,
      progress,
    }: Readonly<{ client: LangfuseClient; pseudonym: Uint8Array<ArrayBuffer>; progress: { identified: boolean } }>,
    row: LeasedDelivery,
    now: Date,
  ): Promise<string> {
    const evidence = this.open(row);
    if (evidence === 'key-unavailable') {
      /* A rotated-out key may be restored; hold the bytes until retention ends. */
      return this.settle(row, {
        kind: 'retry',
        reason: evidence,
        notBefore: new Date(now.getTime() + deliveryTiming.maxBackoffMilliseconds),
      });
    }
    if (typeof evidence === 'string') {
      return this.settle(row, { kind: 'rejected', reason: evidence });
    }
    const revoked = await this.revocation(row);
    if (revoked !== undefined) {
      return this.settle(row, { kind: 'expired', reason: revoked });
    }
    const observation = langfuseObservation(
      evidence,
      { environment: this.environment, protection: row.protection },
      pseudonym,
    );
    if (observation === undefined) {
      return this.settle(row, { kind: 'superseded', reason: 'no-object' });
    }
    const [object] = observation.spans;
    const claim = await prepareSend(
      this.databaseService.database,
      { receiptId: row.receiptId, owner: this.owner },
      {
        traceId: observation.identity.traceId,
        objectId: observation.identity.spanId,
        observedAt: new Date(Number(BigInt(object!.startTimeUnixNano) / 1_000_000n)),
      },
    );
    if (claim === 'taken') {
      return this.settle(row, { kind: 'superseded', reason: 'object' });
    }
    if (claim === 'lost') {
      this.metrics.agentEvidenceDeliveries.add(1, { outcome: 'lease_lost' });
      return 'lease-lost';
    }
    progress.identified = true;
    const outcome = await client.send(observation.spans, this.shutdown.signal);
    switch (outcome.kind) {
      case 'accepted': {
        return this.settle(row, { kind: 'sent', reason: 'acknowledged' });
      }
      case 'uncertain': {
        return this.settle(row, { kind: 'sent', reason: outcome.reason });
      }
      case 'not-sent': {
        return this.settle(row, {
          kind: 'retry',
          reason: outcome.reason,
          notBefore: new Date(now.getTime() + retryDelay(row.attempts)),
        });
      }
      case 'rejected': {
        return this.settle(row, { kind: 'rejected', reason: outcome.reason });
      }
    }
  }

  private async reconcile(client: LangfuseClient, row: LeasedDelivery, now: Date): Promise<string> {
    if (row.traceId === null || row.observedAt === null) {
      return this.settle(row, { kind: 'expired', reason: 'unidentified' });
    }
    /* A send made before v5 stored no object id; its span id was its receipt's digest. */
    const found = await client.lookup(
      { traceId: row.traceId, spanId: row.objectId ?? receiptSpanId(this.environment, row.receiptId) },
      new Date(row.observedAt.getTime() - 60_000),
      this.shutdown.signal,
    );
    if (found === 'present') {
      return this.settle(row, { kind: 'confirmed' });
    }
    const sentAt = row.sentAt?.getTime() ?? 0;
    if (found === 'absent' && now.getTime() - sentAt >= deliveryTiming.gapAfterMilliseconds) {
      /* Never resent: a late write would duplicate it. The gap is recorded instead. */
      return this.settle(row, { kind: 'expired', reason: 'gap' });
    }
    return this.settle(row, {
      kind: 'recheck',
      notBefore: new Date(now.getTime() + deliveryTiming.recheckMilliseconds),
    });
  }
}
