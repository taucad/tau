import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import type { Evidence } from '@taucad/agent-observability/contract';
import type { PersonalIdentity } from '@taucad/agent-observability/content-redaction';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '@taucad/api-database';
import { user } from '@taucad/api-database/schema';
import { readProjectDeletion } from '@taucad/api-database/project-lifecycle';
import type { Environment } from '@taucad/api-core';
import { ShutdownService } from '@taucad/api-lifecycle/shutdown';
import { MetricsService } from '@taucad/api-observability/metrics';
import type {
  AgentEvidenceDeliveryOutcome,
  AgentEvidenceScoreOutcome,
  AgentEvidenceSupersededReason,
} from '@taucad/api-observability/metrics';
import { TelemetryPurposeService } from '#telemetry-purposes/telemetry-purpose.service.js';
import { openEvidence } from '#evidence-seal.js';
import { leasePending, leaseUncertain, prepareSend, settleDelivery, sweepBacklog } from '#evidence-delivery.js';
import type { DeliverySettlement, LeasedDelivery } from '#evidence-delivery.js';
import { LangfuseClient } from '#langfuse-client.js';
import type { ScoreOutcome } from '#langfuse-client.js';
import {
  exportableEvidence,
  langfuseObservation,
  langfuseScores,
  pseudonymKey,
  receiptSpanId,
} from '#langfuse-observation.js';
import type { LangfuseScore, OtlpSpan } from '#langfuse-observation.js';

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
      if (settlement.reason === 'score-uncertain') {
        return 'uncertain';
      }
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

const scoreOutcome: Readonly<Record<ScoreOutcome['kind'], AgentEvidenceScoreOutcome>> = {
  accepted: 'accepted',
  rejected: 'rejected',
  uncertain: 'uncertain',
  'not-sent': 'not_sent',
};

/** The reason of a receipt's first score write that ended `kind`, if one did. */
const reasonOf = (outcomes: readonly ScoreOutcome[], kind: 'not-sent' | 'rejected'): string | undefined => {
  for (const outcome of outcomes) {
    if (outcome.kind === kind && 'reason' in outcome) {
      return outcome.reason;
    }
  }
  return undefined;
};

/**
 * The Langfuse units one accepted request wrote (LW24): an observation for each span, and a trace as well for each span
 * with no parent, a run's root or a helper or direct call.
 */
const spanUnits = (spans: readonly OtlpSpan[]): Readonly<{ observations: number; traces: number }> => ({
  observations: spans.length,
  traces: spans.filter((span) => span.parentSpanId === undefined).length,
});

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
      this.client = new LangfuseClient(
        {
          baseUrl,
          publicKey,
          secretKey,
          scoreConfigs: configService.get('TAU_OBSERVABILITY_SCORE_CONFIG_IDS', { infer: true }),
        },
        deliveryTiming.requestTimeoutMilliseconds,
      );
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

  /** Add the units Langfuse is known to hold, once per object, to `tau.agent_evidence.langfuse_units`. */
  private countUnits({ observations, traces }: Readonly<{ observations: number; traces: number }>): void {
    this.metrics.agentEvidenceLangfuseUnits.add(observations, { kind: 'observation' });
    if (traces > 0) {
      this.metrics.agentEvidenceLangfuseUnits.add(traces, { kind: 'trace' });
    }
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

  /**
   * What the receipt may be sent as now: nothing for a deletion-fenced project or a purpose no longer effective, and
   * for content its fact alone while only `summary` is effective (rule 5). Content carries the account's registered
   * email and name for the export redaction pass.
   */
  private async exportable(
    row: LeasedDelivery,
    evidence: Evidence,
  ): Promise<Readonly<{ evidence: Evidence; identity?: PersonalIdentity }> | 'revoked' | 'deleted'> {
    const { database } = this.databaseService;
    if ((await readProjectDeletion(database, row.projectId)) !== undefined) {
      return 'deleted';
    }
    const authority = await this.telemetryPurposes.getAdmissionAuthority(row.principalId, row.projectId);
    const allowed = (purpose: string): boolean =>
      authority.effective.purposes.find((state) => state.purpose === purpose)?.allowed === true;
    if (!allowed(row.plane) && row.plane !== 'content') {
      return 'revoked';
    }
    const exported = exportableEvidence(evidence, { summary: allowed('summary'), content: allowed('content') });
    if (exported === undefined) {
      return 'revoked';
    }
    if (exported.payload.plane !== 'content') {
      return { evidence: exported };
    }
    const account = await database.query.user.findFirst({
      where: eq(user.id, row.principalId),
      columns: { email: true, name: true },
    });
    return { evidence: exported, identity: { email: account?.email, name: account?.name } };
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
    const exportable = await this.exportable(row, evidence);
    if (typeof exportable === 'string') {
      return this.settle(row, { kind: 'expired', reason: exportable });
    }
    const observation = langfuseObservation(
      exportable.evidence,
      { environment: this.environment, protection: row.protection, identity: exportable.identity },
      pseudonym,
    );
    const scores = langfuseScores(exportable.evidence, { environment: this.environment });
    if (observation === undefined) {
      return scores.length === 0
        ? this.settle(row, { kind: 'superseded', reason: 'no-object' })
        : this.settleScores(row, await this.writeScores(client, scores), now);
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
      /* A later outcome of a run whose root is written still writes its own scores (rule 5). */
      await this.writeScores(client, scores);
      return this.settle(row, { kind: 'superseded', reason: 'object' });
    }
    if (claim === 'lost') {
      this.metrics.agentEvidenceDeliveries.add(1, { outcome: 'lease_lost' });
      return 'lease-lost';
    }
    progress.identified = true;
    const outcome = await client.send(observation.spans, this.shutdown.signal);
    /*
     * The scores follow the observation once it will never be sent again, so a retried send cannot write them twice.
     * The payload goes with the settlement, so a score whose write failed here is not tried again.
     */
    if (outcome.kind !== 'not-sent') {
      await this.writeScores(client, scores);
    }
    switch (outcome.kind) {
      case 'accepted': {
        const settled = await this.settle(row, { kind: 'sent', reason: 'acknowledged' });
        /* A worker that lost its lease leaves the row abandoned, and reconciliation counts it once it is found. */
        if (settled !== 'lease-lost') {
          this.countUnits(spanUnits(observation.spans));
        }
        return settled;
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

  /**
   * Write a receipt's scores one at a time, each settled by its answer (nothing reads a score back), and count each
   * outcome once. A write that never reached Langfuse stops the rest, so a receipt that only writes scores can be retried
   * whole; any other answer is final.
   */
  private async writeScores(
    client: LangfuseClient,
    scores: readonly LangfuseScore[],
  ): Promise<readonly ScoreOutcome[]> {
    const outcomes: ScoreOutcome[] = [];
    for (const score of scores) {
      // oxlint-disable-next-line no-await-in-loop -- one score per request, in order, stopping at the first unsent
      const outcome = await client.score(score, this.shutdown.signal);
      this.countScore(score, outcome, client.scoreConfigured(score.name));
      outcomes.push(outcome);
      if (outcome.kind === 'not-sent') {
        break;
      }
    }
    return outcomes;
  }

  /**
   * Count one score write by its outcome, and whether it named a score config. An `accepted` score is the one Langfuse
   * holds, counted here once per write that is never repeated, which is where the `score` kind of a units counter
   * belongs (LW24).
   */
  private countScore(score: LangfuseScore, outcome: ScoreOutcome, configured: boolean): void {
    this.metrics.agentEvidenceScores.add(1, {
      'tau.agent_evidence.score': score.name,
      'tau.agent_evidence.score_configured': configured ? 'true' : 'false',
      outcome: scoreOutcome[outcome.kind],
    });
    if (outcome.kind === 'accepted') {
      this.metrics.agentEvidenceLangfuseUnits.add(1, { kind: 'score' });
    }
  }

  /**
   * Settle a receipt that writes scores and no observation (a rating): confirmed by an accepted answer, rejected by a
   * refusal, retried when a write never reached Langfuse, since a repeat replaces itself (LD5), and expired when it
   * stayed uncertain after its bounded repeats, as nothing can read it back.
   */
  private async settleScores(row: LeasedDelivery, outcomes: readonly ScoreOutcome[], now: Date): Promise<string> {
    const unsent = reasonOf(outcomes, 'not-sent');
    if (unsent !== undefined) {
      return this.settle(row, {
        kind: 'retry',
        reason: unsent,
        notBefore: new Date(now.getTime() + retryDelay(row.attempts)),
      });
    }
    const refused = reasonOf(outcomes, 'rejected');
    if (refused !== undefined) {
      return this.settle(row, { kind: 'rejected', reason: refused });
    }
    return outcomes.some((outcome) => outcome.kind === 'uncertain')
      ? this.settle(row, { kind: 'expired', reason: 'score-uncertain' })
      : this.settle(row, { kind: 'confirmed' });
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
      const settled = await this.settle(row, { kind: 'confirmed' });
      /*
       * An acknowledged send was counted at its answer; one whose answer was uncertain is counted once it is found.
       * Its payload is gone by then, so only the object read back is counted.
       */
      if (settled !== 'lease-lost' && row.reason !== 'acknowledged') {
        this.countUnits({ observations: 1, traces: 0 });
      }
      return settled;
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
