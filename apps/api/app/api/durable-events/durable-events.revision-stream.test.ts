import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { project, projectCollaborator, user } from '#database/schema.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import { databaseReachable } from '#testing/database-reachable.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { DurableEventsController } from '#api/durable-events/durable-events.controller.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import { revisionStreamId } from '#api/durable-events/durable-events.types.js';

/**
 * Charter D13 against a real PostgreSQL: a project's `revision` stream is read
 * through project `read` access, every other stream keeps owner equality.
 *
 * Redis is the one fake. Its publish hands the message straight to the
 * subscriber the service opened, which is the cross-worker wake-up collapsed
 * into one process, so a long poll still wakes on the append rather than on its
 * timeout.
 *
 * Needs `pnpm infra:up` and a migrated database:
 * `DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/tau_dev`.
 */
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('revision streams (D13)', () => {
  const suffix = randomBytes(5).toString('hex');
  const ownerId = `user-w5-owner-${suffix}`;
  const readerId = `user-w5-reader-${suffix}`;
  const strangerId = `user-w5-stranger-${suffix}`;
  const heirId = `user-w5-heir-${suffix}`;
  const projectId = `proj-w5-${suffix}`;
  let client: ReturnType<typeof postgres>;
  let service: DurableEventsService;
  /** The route handler, so a refusal is asserted as the status a client sees. */
  let controller: DurableEventsController;

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 2, prepare: false });
    const database = drizzle(client, { schema });
    await database
      .insert(user)
      .values(
        [ownerId, readerId, strangerId, heirId].map((id) => ({
          id,
          name: id,
          email: `${id}@tau.test`,
          emailVerified: false,
        })),
      );
    await database.insert(project).values({ id: projectId, ownerId, name: 'w5' });
    await database
      .insert(projectCollaborator)
      .values({ projectId, userId: readerId, role: 'read', invitedBy: ownerId });

    let deliver: ((channel: string, message: string) => void) | undefined;
    const subscriber = mock<Redis>({ status: 'ready' });
    subscriber.on.mockImplementation((event: string | symbol, listener: (...args: never[]) => void) => {
      if (event === 'message') {
        deliver = listener as (channel: string, message: string) => void;
      }
      return subscriber;
    });
    const publisher = mock<Redis>();
    /* The service publishes JSON strings, so the two arguments are read as text. */
    publisher.publish.mockImplementation(async (...args: readonly unknown[]) => {
      deliver?.(String(args[0]), String(args[1]));
      return 1;
    });
    /* A plain holder, as the F4 suite does: a mock proxy around a live Drizzle client never settled here. */
    const databaseService = { database } as unknown as DatabaseService;
    service = new DurableEventsService(
      databaseService,
      mock<RedisService>({ client: publisher, createDuplicateClient: () => subscriber }),
      new ProjectAccessService(databaseService),
    );
    await service.onModuleInit();
    controller = new DurableEventsController(service);
  }, 60_000);

  afterAll(async () => {
    await service.onModuleDestroy();
    /* Cascades to the project, the collaborator row and every stream they own. */
    await drizzle(client, { schema })
      .delete(user)
      .where(inArray(user.id, [ownerId, readerId, strangerId, heirId]));
    await client.end();
  }, 60_000);

  const poll = { afterSequence: 0, limit: 10, longPollDuration: 0 };
  const read = async (streamId: string, userId: string, query: Partial<typeof poll> = {}) =>
    controller.readEvents(streamId, { ...poll, ...query }, userId);

  it('should wake a read collaborator’s long poll with one entry per committed manifest', async () => {
    const waiting = read(revisionStreamId(projectId), readerId, { longPollDuration: 20_000 });
    /* Let the poll find no stream, create it and start waiting. */
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    const started = Date.now();
    await service.appendRevision({ projectId, ownerId, generation: 1, refs: ['refs/heads/main'] });

    const outcome = await waiting;

    expect(Date.now() - started).toBeLessThan(5000);
    expect(outcome).toMatchObject({
      found: true,
      snapshot: { kind: 'revision', subjectId: projectId, data: { generation: 1 } },
      events: [{ sequence: 1, type: 'revision.committed', payload: { generation: 1, refs: ['refs/heads/main'] } }],
      nextSequence: 1,
    });

    await service.appendRevision({ projectId, ownerId, generation: 2, refs: ['refs/tau/chats/chat_w5'] });
    const next = await read(revisionStreamId(projectId), readerId, { afterSequence: 1 });
    expect(next).toMatchObject({
      found: true,
      events: [{ sequence: 2, payload: { generation: 2, refs: ['refs/tau/chats/chat_w5'] } }],
    });
  }, 30_000);

  it('should tell a non-member the project does not exist', async () => {
    await expect(read(revisionStreamId(projectId), strangerId)).rejects.toMatchObject({ status: 404 });
  });

  it('should keep a project read collaborator out of the owner’s job stream', async () => {
    const jobStreamId = `str_w5job${suffix}`;
    await service.createStream({
      streamId: jobStreamId,
      ownerId,
      kind: 'job',
      subjectId: `job_w5${suffix}`,
      snapshot: { projectId, state: 'queued' },
    });
    await service.append({
      streamId: jobStreamId,
      ownerId,
      type: 'job.queued',
      payload: { projectId },
      snapshot: { projectId, state: 'queued' },
    });

    await expect(read(jobStreamId, readerId)).rejects.toMatchObject({ status: 404 });
    await expect(read(jobStreamId, ownerId)).resolves.toMatchObject({ found: true, events: [{ type: 'job.queued' }] });
  });

  it('should not create a revision stream for a caller who may not read the project', async () => {
    const otherProjectId = `proj-w5-other-${suffix}`;
    await drizzle(client, { schema }).insert(project).values({ id: otherProjectId, ownerId, name: 'w5 other' });

    await expect(read(revisionStreamId(otherProjectId), strangerId)).rejects.toMatchObject({ status: 404 });
    const streams = await drizzle(client, { schema })
      .select()
      .from(schema.durableStream)
      .where(eq(schema.durableStream.subjectId, otherProjectId));
    expect(streams).toEqual([]);
  });

  it('should hand the stream to a project’s new owner instead of failing', async () => {
    const movedProjectId = `proj-w5-moved-${suffix}`;
    const database = drizzle(client, { schema });
    await database.insert(project).values({ id: movedProjectId, ownerId, name: 'w5 moved' });
    await service.appendRevision({ projectId: movedProjectId, ownerId, generation: 1, refs: ['refs/heads/main'] });

    await database.update(project).set({ ownerId: heirId }).where(eq(project.id, movedProjectId));

    await expect(read(revisionStreamId(movedProjectId), heirId)).resolves.toMatchObject({
      found: true,
      events: [{ sequence: 1, payload: { generation: 1 } }],
    });
    await service.appendRevision({
      projectId: movedProjectId,
      ownerId: heirId,
      generation: 2,
      refs: ['refs/heads/main'],
    });
    await expect(read(revisionStreamId(movedProjectId), heirId, { afterSequence: 1 })).resolves.toMatchObject({
      events: [{ sequence: 2, payload: { generation: 2 } }],
    });
    await expect(read(revisionStreamId(movedProjectId), ownerId)).rejects.toMatchObject({ status: 404 });
  });

  it('should answer 404 for a revision id whose stored stream is of another kind', async () => {
    const squattedProjectId = `proj-w5-squat-${suffix}`;
    await drizzle(client, { schema }).insert(project).values({ id: squattedProjectId, ownerId, name: 'w5 squat' });
    await service.createStream({
      streamId: revisionStreamId(squattedProjectId),
      ownerId,
      kind: 'job',
      subjectId: `job_w5squat${suffix}`,
      snapshot: { secret: true },
    });

    await expect(read(revisionStreamId(squattedProjectId), ownerId)).rejects.toMatchObject({ status: 404 });
  });
});
