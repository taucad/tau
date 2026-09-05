import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import type { DurableStreamReadOutcome } from '#api/durable-events/durable-events.types.js';
import type { DatabaseService, DatabaseType } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';

type DatabaseTransaction = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];

const emptyRead: DurableStreamReadOutcome = {
  found: true,
  snapshot: {
    streamId: 'stream-1',
    kind: 'job',
    subjectId: 'job-1',
    sequence: 0,
    data: { state: 'queued' },
  },
  events: [],
  nextSequence: 0,
};

const eventRead: DurableStreamReadOutcome = {
  found: true,
  snapshot: {
    streamId: 'stream-1',
    kind: 'job',
    subjectId: 'job-1',
    sequence: 1,
    data: { state: 'running' },
  },
  events: [
    {
      streamId: 'stream-1',
      sequence: 1,
      eventId: 'event-1',
      type: 'job-started',
      occurredAt: '2026-08-28T00:00:00.000Z',
      payload: {},
    },
  ],
  nextSequence: 1,
};

const createService = () => {
  const databaseService = mockDeep<DatabaseService>();
  const redisClient = mock<Redis>();
  const redisService = mock<RedisService>({ client: redisClient });
  return {
    databaseService,
    redisClient,
    service: new DurableEventsService(databaseService, redisService),
  };
};

describe('DurableEventsService', () => {
  it('reads a jobs snapshot and its events from one repeatable database snapshot during a concurrent append', async () => {
    const { databaseService, service } = createService();
    let committedNextSequence = 1;
    let transactionConfig: unknown;
    const streamFor = vi.fn(() => ({
      limit: vi.fn(async () => [
        {
          id: 'stream-1',
          ownerId: 'owner-1',
          kind: 'job',
          subjectId: 'job-1',
          nextSequence: 1,
          snapshotSequence: 1,
          snapshot: { state: 'running' },
          createdAt: new Date('2026-08-28T00:00:00.000Z'),
          updatedAt: new Date('2026-08-28T00:00:00.000Z'),
        },
      ]),
    }));
    const eventLimit = vi.fn(async () => {
      // Model an append committing after the stream row was read. A query on
      // the ambient connection would now see sequence 2; this transaction's
      // repeatable snapshot must still return the matching sequence-1 event.
      committedNextSequence = 2;
      return [
        {
          streamId: 'stream-1',
          sequence: 1,
          eventId: 'event-1',
          attempt: 1,
          type: 'job.started',
          occurredAt: new Date('2026-08-28T00:00:00.000Z'),
          payload: {},
        },
      ];
    });
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: () => ({ for: streamFor }) }) })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ orderBy: () => ({ limit: eventLimit }) }) }),
        }),
      delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    };
    databaseService.database.transaction.mockImplementation(async (operation, config) => {
      transactionConfig = config;
      return operation(transaction as unknown as DatabaseTransaction);
    });

    const outcome = await service.read({ streamId: 'stream-1', ownerId: 'owner-1', afterSequence: 0 });

    expect(committedNextSequence).toBe(2);
    expect(transactionConfig).toEqual({ isolationLevel: 'repeatable read', accessMode: 'read write' });
    expect(streamFor).toHaveBeenCalledWith('update');
    expect(outcome).toMatchObject({
      found: true,
      snapshot: { sequence: 1, data: { state: 'running' } },
      events: [{ sequence: 1, type: 'job.started' }],
      nextSequence: 1,
    });
  });

  it('does not request a PostgreSQL row lock from a forward read-only transaction', async () => {
    const { databaseService, service } = createService();
    let transactionConfig: unknown;
    const streamFor = vi.fn();
    const streamLimit = vi.fn(async () => [
      {
        id: 'stream-1',
        ownerId: 'owner-1',
        kind: 'job',
        subjectId: 'run-1',
        nextSequence: 0,
        snapshotSequence: 0,
        snapshot: { state: 'running' },
        createdAt: new Date('2026-08-28T00:00:00.000Z'),
        updatedAt: new Date('2026-08-28T00:00:00.000Z'),
      },
    ]);
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ for: streamFor, limit: streamLimit }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
        }),
    };
    databaseService.database.transaction.mockImplementation(async (operation, config) => {
      transactionConfig = config;
      return operation(transaction as unknown as DatabaseTransaction);
    });

    await expect(
      service.read({
        streamId: 'stream-1',
        ownerId: 'owner-1',
        afterSequence: 0,
        delivery: 'forward',
      }),
    ).resolves.toMatchObject({ found: true, events: [] });
    expect(transactionConfig).toEqual({ isolationLevel: 'repeatable read', accessMode: 'read only' });
    expect(streamFor).not.toHaveBeenCalled();
  });

  it('compacts snapshot-complete history to a bounded tail with an exact replay floor', async () => {
    const { databaseService, service } = createService();
    const deleteWhere = vi.fn(async () => undefined);
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: async () => [
                  {
                    id: 'stream-1',
                    ownerId: 'owner-1',
                    kind: 'job',
                    subjectId: 'job-1',
                    nextSequence: 1205,
                    snapshotSequence: 1205,
                    snapshot: { state: 'running' },
                    createdAt: new Date('2026-08-28T00:00:00.000Z'),
                    updatedAt: new Date('2026-08-28T00:00:00.000Z'),
                  },
                ],
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [
                  {
                    streamId: 'stream-1',
                    sequence: 1205,
                    eventId: 'event-1205',
                    attempt: 1,
                    type: 'job.progress',
                    occurredAt: new Date('2026-08-28T00:00:00.000Z'),
                    payload: {},
                  },
                ],
              }),
            }),
          }),
        }),
      delete: vi.fn(() => ({ where: deleteWhere })),
    };
    databaseService.database.transaction.mockImplementation(async (operation) =>
      operation(transaction as unknown as DatabaseTransaction),
    );

    const outcome = await service.read({
      streamId: 'stream-1',
      ownerId: 'owner-1',
      afterSequence: 0,
      limit: 1,
    });

    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({
      found: true,
      snapshot: { sequence: 1205 },
      events: [{ sequence: 1205 }],
      truncatedBeforeSequence: 1204,
      nextSequence: 1205,
    });
  });

  it('closes the subscribe race with a second durable read', async () => {
    const { service } = createService();
    const read = vi.spyOn(service, 'read').mockResolvedValueOnce(emptyRead).mockResolvedValueOnce(eventRead);

    await expect(
      service.waitForEvents({
        streamId: 'stream-1',
        ownerId: 'owner-1',
        afterSequence: 0,
        longPollDuration: 25_000,
      }),
    ).resolves.toEqual(eventRead);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('returns a fresh durable snapshot after a quiet long poll', async () => {
    vi.useFakeTimers();
    try {
      const { service } = createService();
      const read = vi
        .spyOn(service, 'read')
        .mockResolvedValueOnce(emptyRead)
        .mockResolvedValueOnce(emptyRead)
        .mockResolvedValueOnce(eventRead);

      const outcome = service.waitForEvents({
        streamId: 'stream-1',
        ownerId: 'owner-1',
        afterSequence: 0,
        longPollDuration: 25,
      });
      await vi.advanceTimersByTimeAsync(25);

      await expect(outcome).resolves.toEqual(eventRead);
      expect(read).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds 100 simultaneous reconnect watchers independently', async () => {
    vi.useFakeTimers();
    try {
      const { service } = createService();
      const reads = new Map<string, number>();
      vi.spyOn(service, 'read').mockImplementation(async (input) => {
        const count = (reads.get(input.streamId) ?? 0) + 1;
        reads.set(input.streamId, count);
        if (count < 3) {
          return {
            ...emptyRead,
            snapshot: { ...emptyRead.snapshot, streamId: input.streamId, subjectId: input.streamId },
          };
        }
        return {
          ...eventRead,
          snapshot: { ...eventRead.snapshot, streamId: input.streamId, subjectId: input.streamId },
          events: eventRead.events.map((event) => ({ ...event, streamId: input.streamId })),
        };
      });

      const watchers = Promise.all(
        Array.from({ length: 100 }, async (_, index) =>
          service.waitForEvents({
            streamId: `stream-${String(index)}`,
            ownerId: 'owner-1',
            afterSequence: 0,
            longPollDuration: 25,
          }),
        ),
      );
      await vi.advanceTimersByTimeAsync(25);

      const outcomes = await watchers;
      expect(outcomes).toHaveLength(100);
      expect(outcomes.every((outcome) => outcome.found && outcome.events.length === 1)).toBe(true);
      expect([...reads.values()].every((count) => count === 3)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
