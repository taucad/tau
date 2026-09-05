import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type {
  JobArtifactManifest,
  JobCapabilityValue,
  JobDefinition,
  JobProgress,
  JobProviderExecutionOutcome,
} from '@taucad/jobs';
import { digestJobDefinition, matchJobCapabilities } from '@taucad/jobs';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { DatabaseType } from '#database/database.service.js';
import { DatabaseService } from '#database/database.service.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import {
  durableStream,
  durableStreamEvent,
  jobArtifact,
  jobAttempt,
  jobDispatchOutbox,
  jobRunner,
  jobRun,
} from '#database/schema.js';
import type { DurableStreamEvent } from '#api/durable-events/durable-events.types.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import { jobArtifactStorageKey, verifyJobArtifactStream } from '#api/jobs/job-artifacts.js';

type DatabaseTransaction = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];
type JobRow = typeof jobRun.$inferSelect;
type StreamRow = typeof durableStream.$inferSelect;
type AdmissionTransactionOutcome =
  | { readonly conflict: true }
  | { readonly conflict: false; readonly deduplicated: boolean; readonly snapshot: Record<string, unknown> };
type CancellationTransactionOutcome =
  | { readonly outcome: 'not-found' | 'terminal' }
  | { readonly outcome: 'accepted'; readonly event: DurableStreamEvent };
type AttemptTransactionOutcome = {
  readonly outcome: JobAttemptMutationOutcome;
  readonly event?: DurableStreamEvent;
};

export type JobDispatchClaim = {
  readonly dispatchAttempt: number;
  readonly ownerId: string;
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly definitionDigest: `sha256:${string}`;
  readonly definition: JobDefinition;
};

export type JobAttemptMutationOutcome =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: string };

type AttemptIdentity = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly attempt: number;
  readonly runnerId: string;
};

const terminalJobStates = new Set(['completed', 'failed', 'cancelled']);
const attemptLeaseDuration = 15_000;
const runnerHeartbeatLifetime = 15_000;
const dispatchClaimDuration = 30_000;

const isTerminal = (state: string): boolean => terminalJobStates.has(state);

const jobSnapshot = (row: JobRow, current: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...current,
  jobId: row.id,
  projectId: row.projectId,
  streamId: row.streamId,
  idempotencyKey: row.idempotencyKey,
  definitionDigest: row.definitionHash,
  definition: row.definition,
  state: row.state,
  currentAttempt: row.currentAttempt,
  orchestratorRunId: row.orchestratorRunId,
  runnerId: row.runnerId,
  leaseUntil: row.leaseUntil?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
});

@Injectable()
export class JobsService {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly durableEvents: DurableEventsService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  public async submit(input: {
    readonly ownerId: string;
    readonly projectId: string;
    readonly idempotencyKey: string;
    readonly definitionDigest: `sha256:${string}`;
    readonly definition: JobDefinition;
  }): Promise<{ readonly deduplicated: boolean; readonly job: Record<string, unknown> }> {
    const actualDigest = await digestJobDefinition(input.definition);
    if (actualDigest !== input.definitionDigest) {
      throw new BadRequestException({ code: 'JOB_DEFINITION_DIGEST_MISMATCH', expectedDigest: actualDigest });
    }

    const jobId = generatePrefixedId(idPrefix.job);
    const streamId = generatePrefixedId(idPrefix.stream);
    const eventId = generatePrefixedId(idPrefix.event);
    const occurredAt = new Date();
    const transactionOutcome: AdmissionTransactionOutcome = await this.databaseService.database.transaction(
      async (transaction) => {
        const admissionLockKey = JSON.stringify([input.ownerId, input.projectId, input.idempotencyKey]);
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${admissionLockKey}, 0))`);
        const existingRows = await transaction
          .select()
          .from(jobRun)
          .where(
            and(
              eq(jobRun.ownerId, input.ownerId),
              eq(jobRun.projectId, input.projectId),
              eq(jobRun.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        const existing = existingRows[0];
        if (existing) {
          if (existing.definitionHash !== actualDigest) {
            return { conflict: true };
          }
          const stream = await this.loadStream(transaction, existing.streamId);
          return { conflict: false, deduplicated: true, snapshot: stream.snapshot };
        }

        const row: JobRow = {
          id: jobId,
          ownerId: input.ownerId,
          projectId: input.projectId,
          streamId,
          idempotencyKey: input.idempotencyKey,
          definitionHash: actualDigest,
          definition: structuredClone(input.definition),
          state: 'queued',
          orchestratorRunId: null,
          currentAttempt: 0,
          runnerId: null,
          leaseUntil: null,
          createdAt: occurredAt,
          updatedAt: occurredAt,
          cancelRequestedAt: null,
          cancellationDispatchedAt: null,
          finishedAt: null,
        };
        const snapshot = { ...jobSnapshot(row), artifacts: [] };
        await transaction.insert(durableStream).values({
          id: streamId,
          ownerId: input.ownerId,
          kind: 'job',
          subjectId: jobId,
          nextSequence: 1,
          snapshotSequence: 1,
          snapshot,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
        await transaction.insert(jobRun).values(row);
        await transaction.insert(jobDispatchOutbox).values({ jobId, availableAt: occurredAt });
        await transaction.insert(durableStreamEvent).values({
          streamId,
          sequence: 1,
          eventId,
          type: 'job.submitted',
          occurredAt,
          payload: {
            jobId,
            projectId: input.projectId,
            idempotencyKey: input.idempotencyKey,
            definitionDigest: actualDigest,
          },
        });
        return { conflict: false, deduplicated: false, snapshot };
      },
    );

    if (transactionOutcome.conflict) {
      throw new ConflictException({ code: 'JOB_IDEMPOTENCY_CONFLICT' });
    }
    if (!transactionOutcome.deduplicated) {
      await this.durableEvents.notifyCommittedEvent({
        streamId,
        sequence: 1,
        eventId,
        type: 'job.submitted',
        occurredAt: occurredAt.toISOString(),
        payload: {
          jobId,
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey,
          definitionDigest: actualDigest,
        },
      });
    }
    return { deduplicated: transactionOutcome.deduplicated, job: transactionOutcome.snapshot };
  }

  public async list(input: {
    readonly ownerId: string;
    readonly projectId?: string;
  }): Promise<ReadonlyArray<Record<string, unknown>>> {
    const predicate = input.projectId
      ? and(eq(jobRun.ownerId, input.ownerId), eq(jobRun.projectId, input.projectId))
      : eq(jobRun.ownerId, input.ownerId);
    const rows = await this.databaseService.database
      .select({ snapshot: durableStream.snapshot })
      .from(jobRun)
      .innerJoin(durableStream, eq(jobRun.streamId, durableStream.id))
      .where(predicate)
      .orderBy(desc(jobRun.createdAt))
      .limit(200);
    return rows.map(({ snapshot }) => snapshot);
  }

  public async get(input: {
    readonly ownerId: string;
    readonly jobId: string;
  }): Promise<Record<string, unknown> | undefined> {
    const rows = await this.databaseService.database
      .select({ snapshot: durableStream.snapshot })
      .from(jobRun)
      .innerJoin(durableStream, eq(jobRun.streamId, durableStream.id))
      .where(and(eq(jobRun.id, input.jobId), eq(jobRun.ownerId, input.ownerId)))
      .limit(1);
    const row = rows[0];
    return row?.snapshot;
  }

  public async getArtifact(input: {
    readonly ownerId: string;
    readonly jobId: string;
    readonly artifactId: string;
  }): Promise<
    | {
        readonly digest: string;
        readonly mediaType: string;
        readonly size: number;
        readonly storageKey: string;
      }
    | undefined
  > {
    const rows = await this.databaseService.database
      .select({
        digest: jobArtifact.sha256,
        mediaType: jobArtifact.mediaType,
        size: jobArtifact.sizeBytes,
        storageKey: jobArtifact.storageRef,
      })
      .from(jobArtifact)
      .innerJoin(jobRun, eq(jobArtifact.jobId, jobRun.id))
      .where(
        and(
          eq(jobArtifact.id, input.artifactId),
          eq(jobArtifact.jobId, input.jobId),
          eq(jobRun.ownerId, input.ownerId),
        ),
      )
      .limit(1);
    const artifact = rows[0];
    return artifact ? { ...artifact, size: Number(artifact.size) } : undefined;
  }

  public async registerRunner(input: {
    readonly ownerId: string;
    readonly runnerId: string;
    readonly capabilities: Readonly<Record<string, JobCapabilityValue>>;
    readonly slots: number;
  }): Promise<{ readonly accepted: true } | { readonly accepted: false; readonly reason: string }> {
    return this.databaseService.database.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(jobRunner)
        .where(eq(jobRunner.id, input.runnerId))
        .for('update')
        .limit(1);
      const existing = rows[0];
      if (existing && existing.ownerId !== input.ownerId) {
        return { accepted: false, reason: 'runner-owner-mismatch' };
      }
      if (existing?.revokedAt) {
        return { accepted: false, reason: 'runner-revoked' };
      }
      if (existing && existing.usedSlots > input.slots) {
        return { accepted: false, reason: 'runner-slots-below-active-usage' };
      }
      const now = new Date();
      await transaction
        .insert(jobRunner)
        .values({
          id: input.runnerId,
          ownerId: input.ownerId,
          capabilities: structuredClone(input.capabilities),
          totalSlots: input.slots,
          usedSlots: 0,
          lastHeartbeatAt: now,
        })
        .onConflictDoUpdate({
          target: jobRunner.id,
          set: {
            ownerId: input.ownerId,
            capabilities: structuredClone(input.capabilities),
            totalSlots: input.slots,
            lastHeartbeatAt: now,
            drainingAt: null,
            revokedAt: null,
          },
        });
      return { accepted: true };
    });
  }

  public async heartbeatRunner(input: {
    readonly ownerId: string;
    readonly runnerId: string;
  }): Promise<{ readonly accepted: true } | { readonly accepted: false; readonly reason: string }> {
    const rows = await this.databaseService.database
      .update(jobRunner)
      .set({ lastHeartbeatAt: new Date() })
      .where(
        and(
          eq(jobRunner.id, input.runnerId),
          eq(jobRunner.ownerId, input.ownerId),
          isNull(jobRunner.drainingAt),
          isNull(jobRunner.revokedAt),
        ),
      )
      .returning({ id: jobRunner.id });
    return rows.length === 1 ? { accepted: true } : { accepted: false, reason: 'runner-not-active' };
  }

  public async drainRunner(input: { readonly ownerId: string; readonly runnerId: string }): Promise<void> {
    await this.databaseService.database
      .update(jobRunner)
      .set({ drainingAt: new Date() })
      .where(and(eq(jobRunner.id, input.runnerId), eq(jobRunner.ownerId, input.ownerId)));
  }

  public async isRunnerAuthorized(input: { readonly ownerId: string; readonly runnerId: string }): Promise<boolean> {
    const heartbeatAfter = new Date(Date.now() - runnerHeartbeatLifetime);
    const rows = await this.databaseService.database
      .select({ id: jobRunner.id })
      .from(jobRunner)
      .where(
        and(
          eq(jobRunner.id, input.runnerId),
          eq(jobRunner.ownerId, input.ownerId),
          isNull(jobRunner.drainingAt),
          isNull(jobRunner.revokedAt),
          sql`${jobRunner.lastHeartbeatAt} > ${heartbeatAfter}`,
        ),
      )
      .limit(1);
    return rows.length === 1;
  }

  public async isArtifactAttemptAuthorized(input: AttemptIdentity & { readonly ownerId: string }): Promise<boolean> {
    return this.databaseService.database.transaction(async (transaction) => {
      const locked = await this.loadLockedJob(transaction, input.jobId, input.ownerId);
      return Boolean(locked && (await this.isActiveAttempt(transaction, locked.job, input)));
    });
  }

  public async requestCancellation(input: {
    readonly ownerId: string;
    readonly jobId: string;
    readonly reason: string;
  }): Promise<'accepted' | 'not-found' | 'terminal'> {
    const result: CancellationTransactionOutcome = await this.databaseService.database.transaction(
      async (transaction) => {
        const locked = await this.loadLockedJob(transaction, input.jobId, input.ownerId);
        if (!locked) {
          return { outcome: 'not-found' };
        }
        if (isTerminal(locked.job.state)) {
          return { outcome: 'terminal' };
        }
        const now = new Date();
        const queued = locked.job.state === 'queued' && !locked.job.orchestratorRunId;
        const state = queued ? 'cancelled' : 'cancel_requested';
        const updated = {
          ...locked.job,
          state,
          cancelRequestedAt: now,
          updatedAt: now,
          ...(queued ? { finishedAt: now } : {}),
        };
        await transaction
          .update(jobRun)
          .set({ state, cancelRequestedAt: now, updatedAt: now, ...(queued ? { finishedAt: now } : {}) })
          .where(eq(jobRun.id, input.jobId));
        const event = await this.appendLocked(transaction, {
          job: updated,
          stream: locked.stream,
          type: queued ? 'job.cancelled' : 'job.cancellation-requested',
          payload: { reason: input.reason },
          snapshot: { ...jobSnapshot(updated, locked.stream.snapshot), cancellationReason: input.reason },
        });
        return { outcome: 'accepted', event };
      },
    );
    if ('event' in result) {
      await this.durableEvents.notifyCommittedEvent(result.event);
    }
    if (result.outcome === 'accepted') {
      await this.databaseService.database.delete(jobDispatchOutbox).where(eq(jobDispatchOutbox.jobId, input.jobId));
    }
    return result.outcome;
  }

  public async claimDispatch(): Promise<JobDispatchClaim | undefined> {
    const now = new Date();
    const claimedUntil = new Date(now.getTime() + dispatchClaimDuration);
    return this.databaseService.database.transaction(async (transaction) => {
      const rows = await transaction
        .select({ outbox: jobDispatchOutbox, job: jobRun })
        .from(jobDispatchOutbox)
        .innerJoin(jobRun, eq(jobDispatchOutbox.jobId, jobRun.id))
        .where(
          and(
            lte(jobDispatchOutbox.availableAt, now),
            or(isNull(jobDispatchOutbox.claimedUntil), lte(jobDispatchOutbox.claimedUntil, now)),
            eq(jobRun.state, 'queued'),
          ),
        )
        .orderBy(asc(jobDispatchOutbox.createdAt))
        .for('update', { skipLocked: true })
        .limit(1);
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      const dispatchAttempt = row.outbox.attempts + 1;
      await transaction
        .update(jobDispatchOutbox)
        .set({ attempts: dispatchAttempt, claimedUntil })
        .where(eq(jobDispatchOutbox.jobId, row.job.id));
      return {
        dispatchAttempt,
        ownerId: row.job.ownerId,
        jobId: row.job.id,
        idempotencyKey: row.job.idempotencyKey,
        definitionDigest: row.job.definitionHash as `sha256:${string}`,
        definition: row.job.definition as JobDefinition,
      };
    });
  }

  public async reportDispatch(input: {
    readonly claim: JobDispatchClaim;
    readonly outcome:
      | { readonly dispatched: true; readonly orchestratorRunId: string; readonly deduplicated: boolean }
      | { readonly dispatched: false; readonly retryable: boolean; readonly message: string };
  }): Promise<void> {
    const event = await this.databaseService.database.transaction(async (transaction) => {
      const outboxRows = await transaction
        .select()
        .from(jobDispatchOutbox)
        .where(eq(jobDispatchOutbox.jobId, input.claim.jobId))
        .for('update')
        .limit(1);
      const outbox = outboxRows[0];
      if (!outbox || outbox.attempts !== input.claim.dispatchAttempt) {
        return undefined;
      }
      if (!input.outcome.dispatched && input.outcome.retryable) {
        const backoff = Math.min(60_000, 1000 * 2 ** Math.min(outbox.attempts - 1, 6));
        await transaction
          .update(jobDispatchOutbox)
          .set({
            claimedUntil: null,
            availableAt: new Date(Date.now() + backoff),
            lastError: input.outcome.message.slice(0, 4000),
          })
          .where(eq(jobDispatchOutbox.jobId, input.claim.jobId));
        return undefined;
      }

      const locked = await this.loadLockedJob(transaction, input.claim.jobId);
      if (locked?.job.state !== 'queued') {
        await transaction.delete(jobDispatchOutbox).where(eq(jobDispatchOutbox.jobId, input.claim.jobId));
        return undefined;
      }
      const now = new Date();
      const state = input.outcome.dispatched ? 'assigned' : 'failed';
      const updated = {
        ...locked.job,
        state,
        updatedAt: now,
        orchestratorRunId: input.outcome.dispatched ? input.outcome.orchestratorRunId : null,
        ...(input.outcome.dispatched ? {} : { finishedAt: now }),
      };
      await transaction
        .update(jobRun)
        .set({
          state,
          updatedAt: now,
          orchestratorRunId: updated.orchestratorRunId,
          ...(input.outcome.dispatched ? {} : { finishedAt: now }),
        })
        .where(eq(jobRun.id, input.claim.jobId));
      await transaction.delete(jobDispatchOutbox).where(eq(jobDispatchOutbox.jobId, input.claim.jobId));
      return this.appendLocked(transaction, {
        job: updated,
        stream: locked.stream,
        type: input.outcome.dispatched ? 'job.dispatched' : 'job.failed',
        payload: input.outcome.dispatched
          ? { orchestratorRunId: input.outcome.orchestratorRunId, deduplicated: input.outcome.deduplicated }
          : { failure: { code: 'DISPATCH_REJECTED', message: input.outcome.message, retryable: false } },
        snapshot: {
          ...jobSnapshot(updated, locked.stream.snapshot),
          ...(input.outcome.dispatched
            ? {}
            : { failure: { code: 'DISPATCH_REJECTED', message: input.outcome.message, retryable: false } }),
        },
      });
    });
    if (event) {
      await this.durableEvents.notifyCommittedEvent(event);
    }
  }

  public async claimCancellation(): Promise<
    { readonly jobId: string; readonly orchestratorRunId: string } | undefined
  > {
    const retryBefore = new Date(Date.now() - 30_000);
    return this.databaseService.database.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(jobRun)
        .where(
          and(
            eq(jobRun.state, 'cancel_requested'),
            or(isNull(jobRun.cancellationDispatchedAt), lte(jobRun.cancellationDispatchedAt, retryBefore)),
          ),
        )
        .orderBy(asc(jobRun.cancelRequestedAt))
        .for('update', { skipLocked: true })
        .limit(1);
      const row = rows[0];
      if (!row?.orchestratorRunId) {
        return undefined;
      }
      await transaction.update(jobRun).set({ cancellationDispatchedAt: new Date() }).where(eq(jobRun.id, row.id));
      return { jobId: row.id, orchestratorRunId: row.orchestratorRunId };
    });
  }

  public async releaseCancellation(jobId: string): Promise<void> {
    await this.databaseService.database
      .update(jobRun)
      .set({ cancellationDispatchedAt: null })
      .where(and(eq(jobRun.id, jobId), eq(jobRun.state, 'cancel_requested')));
  }

  public async reapExpiredAttempt(): Promise<boolean> {
    const result = await this.databaseService.database.transaction(async (transaction) => {
      const now = new Date();
      const rows = await transaction
        .select({ attempt: jobAttempt, job: jobRun })
        .from(jobAttempt)
        .innerJoin(jobRun, eq(jobAttempt.jobId, jobRun.id))
        .where(
          and(
            eq(jobAttempt.state, 'running'),
            lte(jobAttempt.leaseUntil, now),
            or(eq(jobRun.state, 'running'), eq(jobRun.state, 'cancel_requested')),
          ),
        )
        .orderBy(asc(jobAttempt.leaseUntil))
        .for('update', { skipLocked: true })
        .limit(1);
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      const stream = await this.loadStream(transaction, row.job.streamId);
      const definition = row.job.definition as JobDefinition;
      const cancellationWon = row.job.state === 'cancel_requested';
      const exhausted = row.attempt.attempt >= definition.maxAttempts;
      const state = cancellationWon ? 'cancelled' : exhausted ? 'failed' : 'waiting';
      const failure = {
        code: 'ATTEMPT_LEASE_EXPIRED',
        message: `Attempt ${row.attempt.id} stopped renewing its lease.`,
        retryable: !exhausted,
      };
      await transaction
        .update(jobAttempt)
        .set({ state: 'lost', finishedAt: now, terminalReason: failure.message })
        .where(and(eq(jobAttempt.id, row.attempt.id), eq(jobAttempt.state, 'running')));
      await transaction
        .update(jobRunner)
        .set({ usedSlots: sql`greatest(${jobRunner.usedSlots} - ${definition.slotCost}, 0)` })
        .where(eq(jobRunner.id, row.attempt.runnerId));
      const updated = {
        ...row.job,
        state,
        runnerId: null,
        leaseUntil: null,
        updatedAt: now,
        ...(state === 'waiting' ? {} : { finishedAt: now }),
      };
      await transaction
        .update(jobRun)
        .set({
          state,
          runnerId: null,
          leaseUntil: null,
          updatedAt: now,
          ...(state === 'waiting' ? {} : { finishedAt: now }),
        })
        .where(eq(jobRun.id, row.job.id));
      const event = await this.appendLocked(transaction, {
        job: updated,
        stream,
        type: cancellationWon ? 'job.cancelled' : exhausted ? 'job.failed' : 'job.attempt-lost',
        attempt: row.attempt.attempt,
        payload: cancellationWon ? { reason: 'attempt lease expired after cancellation' } : { failure },
        snapshot: {
          ...jobSnapshot(updated, stream.snapshot),
          progress: null,
          ...(cancellationWon ? { cancellationReason: 'attempt lease expired after cancellation' } : { failure }),
        },
      });
      return event;
    });
    if (!result) {
      return false;
    }
    await this.durableEvents.notifyCommittedEvent(result);
    return true;
  }

  public async startAttempt(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly workflowRunId: string;
      readonly definitionDigest: `sha256:${string}`;
    },
  ): Promise<JobAttemptMutationOutcome> {
    return this.mutateStartedAttempt(input);
  }

  public async heartbeatAttempt(
    input: AttemptIdentity & { readonly ownerId: string },
  ): Promise<JobAttemptMutationOutcome> {
    return this.databaseService.database.transaction(async (transaction) => {
      const locked = await this.loadLockedJob(transaction, input.jobId, input.ownerId);
      if (!locked || !(await this.isActiveAttempt(transaction, locked.job, input))) {
        return { accepted: false, reason: 'attempt-not-active' };
      }
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + attemptLeaseDuration);
      await transaction
        .update(jobAttempt)
        .set({ heartbeatAt: now, leaseUntil })
        .where(eq(jobAttempt.id, input.attemptId));
      await transaction.update(jobRun).set({ leaseUntil, updatedAt: now }).where(eq(jobRun.id, input.jobId));
      return { accepted: true };
    });
  }

  public async reportProgress(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly progress: JobProgress;
    },
  ): Promise<JobAttemptMutationOutcome> {
    return this.mutateActiveAttempt({
      ...input,
      type: 'job.progress',
      payload: { progress: input.progress },
      snapshotPatch: { progress: input.progress },
    });
  }

  public async retryAttempt(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly outcome: Extract<JobProviderExecutionOutcome, { readonly status: 'failed' }>;
    },
  ): Promise<JobAttemptMutationOutcome> {
    return this.finishActiveAttempt({ ...input, outcome: input.outcome, retrying: true });
  }

  public async finishAttempt(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly outcome: JobProviderExecutionOutcome;
    },
  ): Promise<JobAttemptMutationOutcome> {
    return this.finishActiveAttempt({ ...input, outcome: input.outcome, retrying: false });
  }

  private async mutateStartedAttempt(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly workflowRunId: string;
      readonly definitionDigest: `sha256:${string}`;
    },
  ): Promise<JobAttemptMutationOutcome> {
    const result: AttemptTransactionOutcome = await this.databaseService.database.transaction(async (transaction) => {
      const locked = await this.loadLockedJob(transaction, input.jobId, input.ownerId);
      if (!locked) {
        return { outcome: { accepted: false, reason: 'job-not-found' } };
      }
      if (
        locked.job.orchestratorRunId !== input.workflowRunId ||
        locked.job.definitionHash !== input.definitionDigest ||
        isTerminal(locked.job.state) ||
        locked.job.state === 'cancel_requested'
      ) {
        return { outcome: { accepted: false, reason: 'stale-attempt' } };
      }
      const now = new Date();
      const existingRows = await transaction
        .select()
        .from(jobAttempt)
        .where(eq(jobAttempt.id, input.attemptId))
        .limit(1);
      const existing = existingRows[0];
      if (existing) {
        const accepted =
          existing.jobId === input.jobId &&
          existing.attempt === input.attempt &&
          existing.runnerId === input.runnerId &&
          locked.job.currentAttempt === input.attempt &&
          existing.state === 'running' &&
          existing.leaseUntil.getTime() > now.getTime() &&
          locked.job.leaseUntil !== null &&
          locked.job.leaseUntil.getTime() > now.getTime();
        return { outcome: accepted ? { accepted: true } : { accepted: false, reason: 'attempt-conflict' } };
      }
      if (locked.job.state === 'running') {
        return { outcome: { accepted: false, reason: 'attempt-already-running' } };
      }
      if (input.attempt !== locked.job.currentAttempt + 1) {
        return { outcome: { accepted: false, reason: 'attempt-out-of-order' } };
      }
      const runnerRows = await transaction
        .select()
        .from(jobRunner)
        .where(eq(jobRunner.id, input.runnerId))
        .for('update')
        .limit(1);
      const runner = runnerRows[0];
      if (
        !runner ||
        runner.ownerId !== input.ownerId ||
        runner.drainingAt !== null ||
        runner.revokedAt !== null ||
        runner.lastHeartbeatAt.getTime() <= now.getTime() - runnerHeartbeatLifetime
      ) {
        return { outcome: { accepted: false, reason: 'runner-not-active' } };
      }
      const definition = locked.job.definition as JobDefinition;
      const match = matchJobCapabilities({
        requirements: definition.requirements,
        slotCost: definition.slotCost,
        occupiedSlots: runner.usedSlots,
        runner: {
          runnerId: runner.id,
          capabilities: runner.capabilities as Readonly<Record<string, JobCapabilityValue>>,
          slots: runner.totalSlots,
        },
      });
      if (!match.matched) {
        return { outcome: { accepted: false, reason: `runner-capability-rejected:${match.reason}` } };
      }
      const leaseUntil = new Date(now.getTime() + attemptLeaseDuration);
      await transaction.insert(jobAttempt).values({
        id: input.attemptId,
        jobId: input.jobId,
        attempt: input.attempt,
        runnerId: input.runnerId,
        workspaceId: input.attemptId,
        state: 'running',
        leaseUntil,
        heartbeatAt: now,
        startedAt: now,
      });
      const updated = {
        ...locked.job,
        state: 'running',
        currentAttempt: input.attempt,
        runnerId: input.runnerId,
        leaseUntil,
        updatedAt: now,
      };
      await transaction
        .update(jobRun)
        .set({ state: 'running', currentAttempt: input.attempt, runnerId: input.runnerId, leaseUntil, updatedAt: now })
        .where(eq(jobRun.id, input.jobId));
      await transaction
        .update(jobRunner)
        .set({ usedSlots: runner.usedSlots + definition.slotCost })
        .where(eq(jobRunner.id, runner.id));
      const event = await this.appendLocked(transaction, {
        job: updated,
        stream: locked.stream,
        type: 'job.attempt-started',
        attempt: input.attempt,
        payload: { attemptId: input.attemptId, runnerId: input.runnerId, workflowRunId: input.workflowRunId },
        snapshot: { ...jobSnapshot(updated, locked.stream.snapshot), progress: null },
      });
      return { outcome: { accepted: true }, event };
    });
    if ('event' in result && result.event) {
      await this.durableEvents.notifyCommittedEvent(result.event);
    }
    return result.outcome;
  }

  private async mutateActiveAttempt(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly type: string;
      readonly payload: Record<string, unknown>;
      readonly snapshotPatch: Record<string, unknown>;
    },
  ): Promise<JobAttemptMutationOutcome> {
    const result: AttemptTransactionOutcome = await this.databaseService.database.transaction(async (transaction) => {
      const locked = await this.loadLockedJob(transaction, input.jobId, input.ownerId);
      if (!locked || !(await this.isActiveAttempt(transaction, locked.job, input))) {
        return { outcome: { accepted: false, reason: 'attempt-not-active' } };
      }
      if (locked.job.state === 'cancel_requested') {
        return { outcome: { accepted: false, reason: 'cancellation-requested' } };
      }
      const event = await this.appendLocked(transaction, {
        job: locked.job,
        stream: locked.stream,
        type: input.type,
        attempt: input.attempt,
        payload: input.payload,
        snapshot: { ...jobSnapshot(locked.job, locked.stream.snapshot), ...input.snapshotPatch },
      });
      return { outcome: { accepted: true }, event };
    });
    if ('event' in result && result.event) {
      await this.durableEvents.notifyCommittedEvent(result.event);
    }
    return result.outcome;
  }

  private async finishActiveAttempt(
    input: AttemptIdentity & {
      readonly ownerId: string;
      readonly outcome: JobProviderExecutionOutcome;
      readonly retrying: boolean;
    },
  ): Promise<JobAttemptMutationOutcome> {
    if (input.outcome.status === 'completed') {
      await this.validateArtifacts(input.ownerId, input.outcome.artifacts);
    }
    const result: AttemptTransactionOutcome = await this.databaseService.database.transaction(async (transaction) => {
      const locked = await this.loadLockedJob(transaction, input.jobId, input.ownerId);
      if (!locked || !(await this.isActiveAttempt(transaction, locked.job, input))) {
        return { outcome: { accepted: false, reason: 'attempt-not-active' } };
      }
      if (locked.job.state === 'cancel_requested' && input.outcome.status !== 'cancelled') {
        return { outcome: { accepted: false, reason: 'cancellation-requested' } };
      }
      if (input.outcome.status === 'completed') {
        const invalidArtifact = input.outcome.artifacts.find(
          (artifact) =>
            artifact.provenance.jobId !== input.jobId ||
            artifact.provenance.attemptId !== input.attemptId ||
            artifact.provenance.attempt !== input.attempt ||
            artifact.provenance.runnerId !== input.runnerId ||
            artifact.provenance.inputDigest !== (locked.job.definition as JobDefinition).input.digest,
        );
        if (invalidArtifact) {
          return { outcome: { accepted: false, reason: `artifact-provenance-mismatch:${invalidArtifact.artifactId}` } };
        }
      }

      const now = new Date();
      const state = input.retrying
        ? 'waiting'
        : input.outcome.status === 'completed'
          ? 'completed'
          : input.outcome.status === 'cancelled'
            ? 'cancelled'
            : 'failed';
      await transaction
        .update(jobAttempt)
        .set({
          state: input.retrying ? 'failed' : state,
          finishedAt: now,
          terminalReason:
            input.outcome.status === 'failed'
              ? input.outcome.failure.message
              : input.outcome.status === 'cancelled'
                ? input.outcome.reason
                : null,
        })
        .where(eq(jobAttempt.id, input.attemptId));
      if (input.outcome.status === 'completed') {
        await this.insertArtifacts(transaction, input.outcome.artifacts);
      }
      const updated = {
        ...locked.job,
        state,
        runnerId: null,
        leaseUntil: null,
        updatedAt: now,
        ...(input.retrying ? {} : { finishedAt: now }),
      };
      await transaction
        .update(jobRun)
        .set({
          state,
          runnerId: null,
          leaseUntil: null,
          updatedAt: now,
          ...(input.retrying ? {} : { finishedAt: now }),
        })
        .where(eq(jobRun.id, input.jobId));
      const definition = locked.job.definition as JobDefinition;
      await transaction
        .update(jobRunner)
        .set({ usedSlots: sql`greatest(${jobRunner.usedSlots} - ${definition.slotCost}, 0)` })
        .where(eq(jobRunner.id, input.runnerId));
      const snapshotPatch =
        input.outcome.status === 'completed'
          ? { artifacts: input.outcome.artifacts, result: input.outcome.result, progress: null }
          : input.outcome.status === 'failed'
            ? { failure: input.outcome.failure, progress: null }
            : { cancellationReason: input.outcome.reason, progress: null };
      const event = await this.appendLocked(transaction, {
        job: updated,
        stream: locked.stream,
        type: input.retrying ? 'job.retrying' : `job.${input.outcome.status}`,
        attempt: input.attempt,
        payload: { outcome: input.outcome },
        snapshot: { ...jobSnapshot(updated, locked.stream.snapshot), ...snapshotPatch },
      });
      return { outcome: { accepted: true }, event };
    });
    if ('event' in result && result.event) {
      await this.durableEvents.notifyCommittedEvent(result.event);
    }
    return result.outcome;
  }

  private async validateArtifacts(ownerId: string, artifacts: readonly JobArtifactManifest[]): Promise<void> {
    await Promise.all(
      artifacts.map(async (artifact) => {
        const storageKey = jobArtifactStorageKey(ownerId, artifact.digest);
        if (artifact.storageKey !== storageKey) {
          throw new BadRequestException({ code: 'JOB_ARTIFACT_STORAGE_KEY_MISMATCH', artifactId: artifact.artifactId });
        }
        const metadata = await this.objectStorage.headBlob({ namespace: 'blobs', key: storageKey, tier: 'private' });
        if (!metadata || metadata.size !== artifact.size || metadata.contentType !== artifact.mediaType) {
          throw new BadRequestException({ code: 'JOB_ARTIFACT_NOT_COMMITTED', artifactId: artifact.artifactId });
        }
        const stored = await this.objectStorage.getBlob({ namespace: 'blobs', key: storageKey, tier: 'private' });
        if (stored.contentType !== artifact.mediaType) {
          throw new BadRequestException({ code: 'JOB_ARTIFACT_NOT_COMMITTED', artifactId: artifact.artifactId });
        }
        const verification = await verifyJobArtifactStream({
          body: stored.body,
          expectedDigest: artifact.digest,
          expectedSize: artifact.size,
        });
        if (!verification.verified) {
          throw new BadRequestException({
            code: verification.reason === 'size' ? 'JOB_ARTIFACT_SIZE_MISMATCH' : 'JOB_ARTIFACT_DIGEST_MISMATCH',
            artifactId: artifact.artifactId,
          });
        }
      }),
    );
  }

  private async insertArtifacts(
    transaction: DatabaseTransaction,
    artifacts: readonly JobArtifactManifest[],
  ): Promise<void> {
    if (artifacts.length === 0) {
      return;
    }
    await transaction.insert(jobArtifact).values(
      artifacts.map((artifact) => ({
        id: artifact.artifactId,
        attemptId: artifact.provenance.attemptId,
        jobId: artifact.provenance.jobId,
        attempt: artifact.provenance.attempt,
        role: artifact.role,
        logicalPath: artifact.logicalPath,
        mediaType: artifact.mediaType,
        sizeBytes: BigInt(artifact.size),
        sha256: artifact.digest,
        storageRef: artifact.storageKey,
        provenance: artifact.provenance,
      })),
    );
  }

  private async isActiveAttempt(
    transaction: DatabaseTransaction,
    row: JobRow,
    input: AttemptIdentity,
  ): Promise<boolean> {
    const now = Date.now();
    if (
      row.currentAttempt !== input.attempt ||
      row.runnerId !== input.runnerId ||
      isTerminal(row.state) ||
      !row.leaseUntil ||
      row.leaseUntil.getTime() <= now
    ) {
      return false;
    }
    const attempts = await transaction
      .select()
      .from(jobAttempt)
      .where(
        and(eq(jobAttempt.id, input.attemptId), eq(jobAttempt.jobId, input.jobId), eq(jobAttempt.state, 'running')),
      )
      .limit(1);
    const attempt = attempts[0];
    return (
      attempt?.attempt === input.attempt && attempt.runnerId === input.runnerId && attempt.leaseUntil.getTime() > now
    );
  }

  private async loadLockedJob(
    transaction: DatabaseTransaction,
    jobId: string,
    ownerId?: string,
  ): Promise<{ readonly job: JobRow; readonly stream: StreamRow } | undefined> {
    const predicate = ownerId ? and(eq(jobRun.id, jobId), eq(jobRun.ownerId, ownerId)) : eq(jobRun.id, jobId);
    const jobs = await transaction.select().from(jobRun).where(predicate).for('update').limit(1);
    const job = jobs[0];
    if (!job) {
      return undefined;
    }
    return { job, stream: await this.loadStream(transaction, job.streamId) };
  }

  private async loadStream(transaction: DatabaseTransaction, streamId: string): Promise<StreamRow> {
    const streams = await transaction
      .select()
      .from(durableStream)
      .where(eq(durableStream.id, streamId))
      .for('update')
      .limit(1);
    const stream = streams[0];
    if (!stream) {
      throw new Error(`Durable stream ${streamId} is missing.`);
    }
    return stream;
  }

  private async appendLocked(
    transaction: DatabaseTransaction,
    input: {
      readonly job: JobRow;
      readonly stream: StreamRow;
      readonly type: string;
      readonly attempt?: number;
      readonly payload: Record<string, unknown>;
      readonly snapshot: Record<string, unknown>;
    },
  ): Promise<DurableStreamEvent> {
    const sequence = input.stream.nextSequence + 1;
    const eventId = generatePrefixedId(idPrefix.event);
    const occurredAt = new Date();
    await transaction.insert(durableStreamEvent).values({
      streamId: input.stream.id,
      sequence,
      eventId,
      attempt: input.attempt,
      type: input.type,
      occurredAt,
      payload: input.payload,
    });
    await transaction
      .update(durableStream)
      .set({ nextSequence: sequence, snapshotSequence: sequence, snapshot: input.snapshot, updatedAt: occurredAt })
      .where(eq(durableStream.id, input.stream.id));
    return {
      streamId: input.stream.id,
      sequence,
      eventId,
      ...(input.attempt === undefined ? {} : { attempt: input.attempt }),
      type: input.type,
      occurredAt: occurredAt.toISOString(),
      payload: input.payload,
    };
  }
}
