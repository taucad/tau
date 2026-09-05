import { setTimeout } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Topic } from '@taucad/events';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { DatabaseType } from '#database/database.service.js';
import { DatabaseService } from '#database/database.service.js';
import { durableStream, durableStreamEvent } from '#database/schema.js';
import { RedisService } from '#redis/redis.service.js';
import type {
  DurableAppendOutcome,
  DurableStreamEvent,
  DurableStreamKind,
  DurableStreamReadOutcome,
  DurableStreamSnapshot,
} from '#api/durable-events/durable-events.types.js';
import { durableStreamEventSchema } from '#api/durable-events/durable-events.types.js';

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
};

type WaitForEventsInput = ReadEventsInput & {
  /** Milliseconds. */
  readonly longPollDuration: number;
};

@Injectable()
export class DurableEventsService implements OnModuleInit, OnModuleDestroy {
  readonly #logger = new Logger(DurableEventsService.name);
  readonly #topics = new Map<string, Topic<DurableStreamEvent>>();
  #subscriber: Redis | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
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
    await this.#subscriber.unsubscribe(durableEventChannel);
    await this.#subscriber.quit();
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
          .where(and(eq(durableStream.id, input.streamId), eq(durableStream.ownerId, input.ownerId)));
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
