import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import type { Evidence } from '@taucad/agent-observability/contract';
import { DatabaseService } from '#database/database.service.js';
import { readProjectDeletion } from '#database/project-lifecycle.js';
import type { Environment } from '#config/environment.config.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import { openEvidence } from '#api/agent-observability/evidence-seal.js';
import {
  leasePending,
  leaseUncertain,
  prepareSend,
  settleDelivery,
  sweepBacklog,
} from '#api/agent-observability/evidence-delivery.js';
import type { DeliverySettlement, LeasedDelivery } from '#api/agent-observability/evidence-delivery.js';
import { LangfuseClient } from '#api/agent-observability/langfuse-client.js';
import { langfuseObservation, observationSpanId, pseudonymKey } from '#api/agent-observability/langfuse-observation.js';

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
 * sends one span per request and settles the row by what the vendor's answer
 * proves. Only a send that provably never reached ingestion is retried; an
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
      const lease = {
        owner: this.owner,
        leaseMilliseconds: deliveryTiming.leaseMilliseconds,
        limit: deliveryTiming.batch,
        now,
      };
      const pending = await leasePending(database, lease);
      await runInPool(pending, deliveryTiming.concurrency, async (row) => {
        count(await this.deliver({ client, pseudonym }, row, now));
      });
      const uncertain = await leaseUncertain(database, lease);
      await runInPool(uncertain, deliveryTiming.concurrency, async (row) => {
        count(await this.reconcile(client, row, now));
      });
    } catch (error) {
      this.logger.warn({ name: error instanceof Error ? error.name : typeof error }, 'Evidence delivery pass failed');
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

  private async settle(row: LeasedDelivery, settlement: DeliverySettlement): Promise<string> {
    const held = await settleDelivery(
      this.databaseService.database,
      { receiptId: row.receiptId, owner: this.owner },
      settlement,
    );
    if (!held) {
      return 'lease-lost';
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
    { client, pseudonym }: Readonly<{ client: LangfuseClient; pseudonym: Uint8Array<ArrayBuffer> }>,
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
    const { span } = langfuseObservation(
      evidence,
      { environment: this.environment, receipt: row.receiptId, protection: row.protection },
      pseudonym,
    );
    const observedAt = new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n));
    if (
      !(await prepareSend(
        this.databaseService.database,
        { receiptId: row.receiptId, owner: this.owner },
        {
          traceId: span.traceId,
          observedAt,
        },
      ))
    ) {
      return 'lease-lost';
    }
    const outcome = await client.send(span, this.shutdown.signal);
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
    const found = await client.lookup(
      { traceId: row.traceId, spanId: observationSpanId(this.environment, row.receiptId) },
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
