import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { project, projectDeletion, projectGit, projectGitLfsObject, user } from '@taucad/api-database/schema';
import * as schema from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { markOrphanedLfsObjects, orphanedLfsGraceMilliseconds } from '#api/git/lfs-orphans.js';

/**
 * WP12 orphan sweep (cloud backup admission, Finding 7, ruling A5): the large objects of a project whose push never
 * committed are marked unreachable once nobody has asked about them for a day, which starts the retirement window.
 * Objects of a project with a committed push, objects still being asked about, unfinalized reservations and deleted
 * projects are left alone; an existing mark keeps its first moment.
 *
 * A real PostgreSQL; needs a migrated database (`pnpm infra:up`, `pnpm db:migrate`).
 */
const databaseUrl = process.env.DATABASE_URL;
const day = 24 * 60 * 60 * 1000;

describe.skipIf(!(await databaseReachable(databaseUrl)))('LFS orphan sweep', () => {
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const owners: string[] = [];
  const now = new Date();
  const longAgo = new Date(now.getTime() - 3 * day);

  const newProject = async (generation: number | undefined): Promise<{ ownerId: string; projectId: string }> => {
    const ownerId = `user-wp12-${randomBytes(6).toString('hex')}`;
    const projectId = `proj-${randomBytes(6).toString('hex')}`;
    owners.push(ownerId);
    await database.insert(user).values({ id: ownerId, name: 'WP12', email: `${ownerId}@tau.test` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'orphans' });
    if (generation !== undefined) {
      await database.insert(projectGit).values({ projectId, generation });
    }
    return { ownerId, projectId };
  };

  const seed = async (
    projectId: string,
    row: Readonly<{ finalized?: boolean; createdAt?: Date; lastRequestedAt?: Date; unreachableAt?: Date }>,
  ): Promise<string> => {
    const oid = randomBytes(32).toString('hex');
    await database.insert(projectGitLfsObject).values({
      projectId,
      oid,
      sizeBytes: 10,
      finalizedAt: row.finalized === false ? null : longAgo,
      createdAt: row.createdAt ?? longAgo,
      lastRequestedAt: row.lastRequestedAt ?? null,
      unreachableAt: row.unreachableAt ?? null,
    });
    return oid;
  };

  /** The object's mark in milliseconds, `undefined` when it has none. */
  const markOf = async (projectId: string, oid: string): Promise<number | undefined> => {
    const row = await database.query.projectGitLfsObject.findFirst({
      where: and(eq(projectGitLfsObject.projectId, projectId), eq(projectGitLfsObject.oid, oid)),
    });
    return row?.unreachableAt?.getTime();
  };

  const sweep = async (): Promise<ReadonlyMap<string, number>> => {
    const outcomes = await Array.fromAsync(markOrphanedLfsObjects({ database }, { now }));
    for (const outcome of outcomes) {
      expect(outcome.error, outcome.projectId).toBeUndefined();
    }
    return new Map(outcomes.map((outcome) => [outcome.projectId, outcome.marked]));
  };

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
  });

  afterAll(async () => {
    if (owners.length > 0) {
      await database.delete(projectDeletion).where(inArray(projectDeletion.ownerId, owners));
      await database.delete(user).where(inArray(user.id, owners));
    }
    await client.end();
  });

  it('should mark the stale objects of a project with no committed push, with and without its accounting row', async () => {
    const neverCommitted = await newProject(0);
    const noRow = await newProject(undefined);
    const orphan = await seed(neverCommitted.projectId, {});
    const another = await seed(noRow.projectId, {});

    const marked = await sweep();

    expect(marked.get(neverCommitted.projectId)).toBe(1);
    expect(marked.get(noRow.projectId)).toBe(1);
    expect(await markOf(neverCommitted.projectId, orphan)).toBe(now.getTime());
    expect(await markOf(noRow.projectId, another)).toBe(now.getTime());
  });

  it('should leave a committed project, a recent request, an unfinalized reservation and a deleted project alone', async () => {
    const committed = await newProject(3);
    const committedObject = await seed(committed.projectId, {});
    const retrying = await newProject(0);
    const recent = await seed(retrying.projectId, {
      lastRequestedAt: new Date(now.getTime() - orphanedLfsGraceMilliseconds + 60_000),
    });
    const fresh = await seed(retrying.projectId, { createdAt: new Date(now.getTime() - 60_000) });
    const pending = await seed(retrying.projectId, { finalized: false });
    const deleted = await newProject(0);
    const deletedObject = await seed(deleted.projectId, {});
    await database
      .insert(projectDeletion)
      .values({ projectId: deleted.projectId, ownerId: deleted.ownerId, requestedBy: deleted.ownerId });

    const marked = await sweep();

    expect(marked.has(committed.projectId)).toBe(false);
    expect(marked.has(retrying.projectId)).toBe(false);
    expect(marked.has(deleted.projectId)).toBe(false);
    expect(await markOf(committed.projectId, committedObject)).toBeUndefined();
    expect(await markOf(retrying.projectId, recent)).toBeUndefined();
    expect(await markOf(retrying.projectId, fresh)).toBeUndefined();
    expect(await markOf(retrying.projectId, pending)).toBeUndefined();
    expect(await markOf(deleted.projectId, deletedObject)).toBeUndefined();
  });

  it('should keep the first moment of an existing mark and mark nothing twice', async () => {
    const neverCommitted = await newProject(0);
    const earlier = new Date(now.getTime() - 10 * day);
    const marked = await seed(neverCommitted.projectId, { unreachableAt: earlier });

    const first = await sweep();
    expect(first.has(neverCommitted.projectId)).toBe(false);
    expect(await markOf(neverCommitted.projectId, marked)).toBe(earlier.getTime());

    const orphan = await seed(neverCommitted.projectId, {});
    const second = await sweep();
    const third = await sweep();
    expect(second.get(neverCommitted.projectId)).toBe(1);
    expect(third.has(neverCommitted.projectId)).toBe(false);
    expect(await markOf(neverCommitted.projectId, orphan)).toBe(now.getTime());
  });
});
