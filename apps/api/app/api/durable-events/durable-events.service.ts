import { setTimeout } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gt, lte, ne } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Topic } from '@taucad/events';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { DatabaseType } from '#database/database.service.js';
import { DatabaseService } from '#database/database.service.js';
import { durableStream, durableStreamEvent } from '#database/schema.js';
import { RedisService } from '#redis/redis.service.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type {
  DurableAppendOutcome,
  DurableStreamEvent,
  DurableStreamKind,
  DurableStreamReadOutcome,
  DurableStreamSnapshot,
  RevisionCommittedPayload,
} from '#api/durable-events/durable-events.types.js';
import {
  durableStreamEventSchema,
  revisionCommittedEventType,
  revisionStreamId,
  revisionStreamProjectId,
} from '#api/durable-events/durable-events.types.js';

const durableEventChannel = 'tau:durable-events:v1';
/** Snapshot-complete streams retain this many replayable events after compaction. */
const retainedTailEventLimit = 1000;
type DatabaseTransaction = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];

type CreateStreamInput = {
  readonly streamId: string;
  readonly ownerId: string;
  readonly kind: DurableStreamKind;
  readonly subjectId: string;
  readonly snapshot: Record<string, unknown>;
};

type AppendEventInput = {
  readonly streamId: string;
  readonly ownerId: string;
  readonly expectedSequence?: number;
  readonly attempt?: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly snapshot: Record<string, unknown>;
};

type ReadEventsInput = {
  readonly streamId: string;
  readonly ownerId: string;
  readonly afterSequence: number;
  readonly limit?: number;
  /** `forward` preserves every delta; `tail` reconstructs from the latest snapshot with bounded activity. */
  readonly delivery?: 'forward' | 'tail';
  /** The kind the stored stream must be, so an id never reads a stream of another kind. */
  readonly kind?: DurableStreamKind;
};

type WaitForEventsInput = ReadEventsInput & {
  /** Milliseconds. */
  readonly longPollDuration: number;
};

type WaitForCallerEventsInput = Omit<WaitForEventsInput, 'ownerId'> & {
  /** The authenticated caller, never the stream's owner. */
  readonly userId: string;
};

@Injectable()
export class DurableEventsService implements OnModuleInit, OnModuleDestroy {
  readonly #logger = new Logger(DurableEventsService.name);
  readonly #topics = new Map<string, Topic<DurableStreamEvent>>();
  #subscriber: Redis | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const subscriber = this.redisService.createDuplicateClient();
    subscriber.on('message', (_channel, message) => {
      const parsed = durableStreamEventSchema.safeParse(this.parseMessage(message));
      if (!parsed.success) {
        this.#logger.warn({ issues: parsed.error.issues }, 'Discarded malformed durable-event notification');
        return;
      }
      this.#topics.get(parsed.data.streamId)?.emit(parsed.data);
    });
    subscriber.on('error', (error: Error) => {
      this.#logger.warn({ err: error }, 'Durable-event notification subscriber failed');
    });
    if (subscriber.status === 'wait') {
      await subscriber.connect();
    }
    await subscriber.subscribe(durableEventChannel);
    this.#subscriber = subscriber;
  }

  public async onModuleDestroy(): Promise<void> {
    for (const topic of this.#topics.values()) {
      topic.dispose();
    }
    this.#topics.clear();
    if (!this.#subscriber) {
      return;
    }
    if (this.#subscriber.status === 'ready') {
      await this.#subscriber.unsubscribe(durableEventChannel);
      await this.#subscriber.quit();
    } else {
      // The offline queue is disabled, so `quit()` would throw on a dead socket.
      this.#subscriber.disconnect();
    }
    this.#subscriber = undefined;
  }

  public async createStream(input: CreateStreamInput): Promise<DurableStreamSnapshot> {
    const rows = await this.databaseService.database
      .insert(durableStream)
      .values({
        id: input.streamId,
        ownerId: input.ownerId,
        kind: input.kind,
        subjectId: input.subjectId,
        snapshot: input.snapshot,
      })
      .onConflictDoNothing({ target: [durableStream.kind, durableStream.subjectId] })
      .returning();

    const inserted = rows[0];
    if (inserted) {
      return this.toSnapshot(inserted);
    }
    const existingRows = await this.databaseService.database
      .select()
      .from(durableStream)
      .where(and(eq(durableStream.kind, input.kind), eq(durableStream.subjectId, input.subjectId)))
      .limit(1);
    const row = existingRows[0];

    if (!row || row.ownerId !== input.ownerId) {
      throw new Error(`Durable stream subject "${input.subjectId}" is already owned by another account.`);
    }

    return this.toSnapshot(row);
  }

  public async append(input: AppendEventInput): Promise<DurableAppendOutcome> {
    const occurredAt = new Date();
    const eventId = generatePrefixedId(idPrefix.event);
    const outcome = await this.databaseService.database.transaction(async (transaction) => {
      const lockedRows = await transaction
        .select()
        .from(durableStream)
        .where(and(eq(durableStream.id, input.streamId), eq(durableStream.ownerId, input.ownerId)))
        .for('update')
        .limit(1);
      const row = lockedRows[0];
      if (!row) {
        return { appended: false, reason: 'not-found' } as const;
      }
      if (input.expectedSequence !== undefined && input.expectedSequence !== row.nextSequence) {
        return {
          appended: false,
          reason: 'sequence-conflict',
          actualSequence: row.nextSequence,
        } as const;
      }

      const sequence = row.nextSequence + 1;
      await transaction.insert(durableStreamEvent).values({
        streamId: input.streamId,
        sequence,
        eventId,
        attempt: input.attempt,
        type: input.type,
        occurredAt,
        payload: input.payload,
      });
      await transaction
        .update(durableStream)
        .set({
          nextSequence: sequence,
          snapshotSequence: sequence,
          snapshot: input.snapshot,
          updatedAt: occurredAt,
        })
        .where(eq(durableStream.id, input.streamId));

      return {
        appended: true,
        event: {
          streamId: input.streamId,
          sequence,
          eventId,
          ...(input.attempt === undefined ? {} : { attempt: input.attempt }),
          type: input.type,
          occurredAt: occurredAt.toISOString(),
          payload: input.payload,
        },
      } as const;
    });

    if (outcome.appended) {
      await this.notifyCommittedEvent(outcome.event);
    }
    return outcome;
  }

  /** Publish a best-effort wake-up for an event already committed by another transactional authority. */
  public async notifyCommittedEvent(event: DurableStreamEvent): Promise<void> {
    // Chat snapshots contain coordinator state, not a transcript checkpoint, so
    // their deltas remain lossless. Snapshot-complete domains compact eagerly;
    // tail reads also compact as crash-after-commit recovery.
    if (!event.type.startsWith('chat.')) {
      try {
        await this.compactSnapshotCompleteStream(event.streamId);
      } catch (error) {
        this.#logger.warn({ err: error, streamId: event.streamId }, 'Durable event history compaction failed');
      }
    }
    try {
      await this.redisService.client.publish(durableEventChannel, JSON.stringify(event));
    } catch (error) {
      this.#logger.warn({ err: error, streamId: event.streamId }, 'Durable event committed without live notification');
    }
  }

  public async read(input: ReadEventsInput): Promise<DurableStreamReadOutcome> {
    const forward = input.delivery === 'forward';
    return this.databaseService.database.transaction(
      async (transaction): Promise<DurableStreamReadOutcome> => {
        const streamQuery = transaction
          .select()
          .from(durableStream)
          .where(
            and(
              eq(durableStream.id, input.streamId),
              eq(durableStream.ownerId, input.ownerId),
              input.kind === undefined ? undefined : eq(durableStream.kind, input.kind),
            ),
          );
        const streamRows = forward ? await streamQuery.limit(1) : await streamQuery.for('update').limit(1);
        const row = streamRows[0];
        if (!row) {
          return { found: false };
        }

        if (!forward) {
          await this.compactLocked(transaction, row.id, row.nextSequence);
        }

        const limit = Math.max(1, Math.min(1000, input.limit ?? 500));
        const predicate = and(
          eq(durableStreamEvent.streamId, input.streamId),
          gt(durableStreamEvent.sequence, input.afterSequence),
          lte(durableStreamEvent.sequence, row.nextSequence),
        );
        const queriedRows = forward
          ? await transaction
              .select()
              .from(durableStreamEvent)
              .where(predicate)
              .orderBy(asc(durableStreamEvent.sequence))
              .limit(limit)
          : await transaction
              .select()
              .from(durableStreamEvent)
              .where(predicate)
              .orderBy(desc(durableStreamEvent.sequence))
              .limit(limit);
        const rows = forward ? queriedRows : queriedRows.toReversed();
        const firstSequence = rows[0]?.sequence;
        const truncatedBeforeSequence =
          firstSequence !== undefined && firstSequence > input.afterSequence + 1 ? firstSequence - 1 : undefined;

        return {
          found: true,
          snapshot: this.toSnapshot(row),
          events: rows.map((event) => ({
            streamId: event.streamId,
            sequence: event.sequence,
            eventId: event.eventId,
            ...(event.attempt === null ? {} : { attempt: event.attempt }),
            type: event.type,
            occurredAt: event.occurredAt.toISOString(),
            payload: event.payload,
          })),
          ...(truncatedBeforeSequence === undefined ? {} : { truncatedBeforeSequence }),
          nextSequence: row.nextSequence,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: forward ? 'read only' : 'read write' },
    );
  }

  /**
   * Appends one committed manifest to its project's `revision` stream (D13).
   *
   * The stream is created on the project's first commit and owned by the
   * project's owner, whose collaborators read it through `read` access.
   *
   * @param input - The project, its owner and what the commit moved.
   * @returns The appended event.
   */
  public async appendRevision(
    input: RevisionCommittedPayload & { readonly projectId: string; readonly ownerId: string },
  ): Promise<DurableAppendOutcome> {
    const payload: RevisionCommittedPayload = { generation: input.generation, refs: input.refs, heads: input.heads };
    const entry = {
      streamId: revisionStreamId(input.projectId),
      ownerId: input.ownerId,
      type: revisionCommittedEventType,
      payload,
      snapshot: { generation: input.generation },
    };
    const outcome = await this.append(entry);
    if (outcome.appended || outcome.reason !== 'not-found') {
      return outcome;
    }
    await this.ensureRevisionStream(input.projectId, input.ownerId);
    return this.append(entry);
  }

  /**
   * The long poll behind `GET /v1/streams/:streamId/events`, authorized per kind.
   *
   * A `revision` stream is readable by anybody with `read` access to its
   * project (D13), so a non-member is told the project does not exist. Every
   * other stream keeps owner equality: a project collaborator never reads the
   * owner's job streams.
   *
   * @param input - The stream, the caller and the long-poll bounds.
   * @returns What `waitForEvents` returned for the stream's owner.
   * @throws NotFoundException When the caller may not read a `revision` stream's project.
   */
  public async waitForCallerEvents(input: WaitForCallerEventsInput): Promise<DurableStreamReadOutcome> {
    const { userId, ...read } = input;
    const projectId = revisionStreamProjectId(read.streamId);
    if (projectId === undefined) {
      return this.waitForEvents({ ...read, ownerId: userId, kind: 'job' });
    }
    const { ownerId } = await this.projectAccess.authorize(projectId, userId, 'read');
    const outcome = await this.waitForEvents({ ...read, ownerId, kind: 'revision' });
    if (outcome.found) {
      return outcome;
    }
    /* Nobody has pushed yet, or the project changed hands since the stream was
       made. A reader subscribes before the first commit, so the stream is
       created (or handed to the current owner) rather than answered 404. */
    await this.ensureRevisionStream(projectId, ownerId);
    return this.waitForEvents({ ...read, ownerId, kind: 'revision' });
  }

  public async waitForEvents(input: WaitForEventsInput): Promise<DurableStreamReadOutcome> {
    const initial = await this.read(input);
    if (!initial.found || initial.events.length > 0 || input.longPollDuration === 0) {
      return initial;
    }

    const wake = Promise.withResolvers<void>();
    const unsubscribe = this.subscribe(input.streamId, () => {
      wake.resolve();
    });
    try {
      const afterSubscribe = await this.read(input);
      if (!afterSubscribe.found || afterSubscribe.events.length > 0) {
        return afterSubscribe;
      }
      await Promise.race([wake.promise, setTimeout(input.longPollDuration)]);
      return await this.read(input);
    } finally {
      unsubscribe();
    }
  }

  /**
   * The project's `revision` stream, owned by the project's current owner.
   *
   * It follows an ownership change rather than refusing it: who may read it is
   * decided by project access, never by the stream's owner column, so moving
   * the column is safe and keeps an open project live across a transfer. A row
   * under this id of any other kind is left alone, and the kind-filtered read
   * then answers 404.
   *
   * @param projectId - The project.
   * @param ownerId - Its current owner, from `ProjectAccessService`.
   */
  private async ensureRevisionStream(projectId: string, ownerId: string): Promise<void> {
    await this.databaseService.database
      .insert(durableStream)
      .values({
        id: revisionStreamId(projectId),
        ownerId,
        kind: 'revision',
        subjectId: projectId,
        snapshot: { generation: 0 },
      })
      .onConflictDoUpdate({
        target: durableStream.id,
        set: { ownerId },
        setWhere: and(eq(durableStream.kind, 'revision'), ne(durableStream.ownerId, ownerId)),
      });
  }

  private subscribe(streamId: string, onEvent: (event: DurableStreamEvent) => void): () => void {
    let topic = this.#topics.get(streamId);
    if (!topic) {
      topic = new Topic<DurableStreamEvent>({ name: `durable-events[${streamId}]` });
      this.#topics.set(streamId, topic);
    }
    const unsubscribe = topic.subscribe(onEvent);
    return () => {
      unsubscribe();
      if (topic.size === 0) {
        topic.dispose();
        this.#topics.delete(streamId);
      }
    };
  }

  private async compactSnapshotCompleteStream(streamId: string): Promise<void> {
    await this.databaseService.database.transaction(async (transaction) => {
      const rows = await transaction
        .select({ id: durableStream.id, nextSequence: durableStream.nextSequence })
        .from(durableStream)
        .where(eq(durableStream.id, streamId))
        .for('update')
        .limit(1);
      const row = rows[0];
      if (!row) {
        return;
      }
      await this.compactLocked(transaction, row.id, row.nextSequence);
    });
  }

  private async compactLocked(transaction: DatabaseTransaction, streamId: string, nextSequence: number): Promise<void> {
    const compactThrough = nextSequence - retainedTailEventLimit;
    if (compactThrough < 1) {
      return;
    }
    await transaction
      .delete(durableStreamEvent)
      .where(and(eq(durableStreamEvent.streamId, streamId), lte(durableStreamEvent.sequence, compactThrough)));
  }

  private toSnapshot(row: typeof durableStream.$inferSelect): DurableStreamSnapshot {
    return {
      streamId: row.id,
      kind: row.kind as DurableStreamKind,
      subjectId: row.subjectId,
      sequence: row.snapshotSequence,
      data: row.snapshot,
    };
  }

  private parseMessage(message: string): unknown {
    try {
      return JSON.parse(message) as unknown;
    } catch {
      return undefined;
    }
  }
}
