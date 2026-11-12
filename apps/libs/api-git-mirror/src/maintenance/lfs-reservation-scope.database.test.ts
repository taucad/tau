import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { project, projectDeletion, projectGitLfsObject, user } from '@taucad/api-database/schema';
import * as schema from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { lfsRelocationProjects, lfsRelocationRows } from '#maintenance/lfs-relocation-run.js';

/**
 * Which projects `relocate-lfs` visits, against a migrated PostgreSQL: active
 * projects in the driver's account that hold an LFS reservation, in
 * `projectId` order, after the resume cursor. Needs `pnpm infra:up` and a
 * migrated database; no object store.
 */

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('relocate-lfs project selection', () => {
  const run = randomBytes(6).toString('hex');
  const ownerId = `user-sto7-${run}`;
  const ids = {
    first: `sto7-${run}-a`,
    second: `sto7-${run}-b`,
    withoutLfs: `sto7-${run}-c`,
    deleted: `sto7-${run}-d`,
  };
  const mine = new Set(Object.values(ids));
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  const visited = async (args: { after?: string; projectId?: string } = {}) => {
    const projects = await Array.fromAsync(lfsRelocationProjects(database, { accountId: 'tau-default', ...args }));
    return projects.filter((candidate) => mine.has(candidate.projectId));
  };

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
    await database.insert(user).values({ id: ownerId, name: 'STO-7 owner', email: `${ownerId}@example.invalid` });
    await database.insert(project).values(Object.values(ids).map((id) => ({ id, ownerId, name: id })));
    const reservation = (projectId: string, digit: string) => ({
      projectId,
      oid: digit.repeat(64),
      sizeBytes: 3,
    });
    await database
      .insert(projectGitLfsObject)
      .values([
        reservation(ids.first, 'b'),
        reservation(ids.first, 'a'),
        reservation(ids.second, 'c'),
        reservation(ids.deleted, 'd'),
      ]);
    await database.insert(projectDeletion).values({ projectId: ids.deleted, ownerId, requestedBy: ownerId });
  }, 60_000);

  afterAll(async () => {
    await database.delete(projectDeletion).where(inArray(projectDeletion.projectId, [...mine]));
    await database.delete(user).where(inArray(user.id, [ownerId]));
    await client.end();
  });

  it('should visit each active project with a reservation once, in order', async () => {
    expect(await visited()).toEqual([
      { ownerId, projectId: ids.first },
      { ownerId, projectId: ids.second },
    ]);
  });

  it('should resume after the cursor and narrow to one project', async () => {
    expect(await visited({ after: ids.first })).toEqual([{ ownerId, projectId: ids.second }]);
    expect(await visited({ projectId: ids.first })).toEqual([{ ownerId, projectId: ids.first }]);
    expect(await visited({ projectId: ids.deleted })).toEqual([]);
  });

  it('should read one project reservations in oid order', async () => {
    expect(await lfsRelocationRows(database, ids.first)).toEqual([
      { oid: 'a'.repeat(64), size: 3 },
      { oid: 'b'.repeat(64), size: 3 },
    ]);
  });
});
