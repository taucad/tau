import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { project, projectDeletion, projectGitLfsObject, storageAccount, user } from '@taucad/api-database/schema';
import * as schema from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { lfsRelocationProjects } from '#maintenance/lfs-relocation-run.js';
import { activeLfsReservationPages } from '#maintenance/lfs-reservation-scope.js';

/**
 * Which reservations the LFS maintenance commands visit, against a migrated
 * PostgreSQL: those of active projects in the driver's account, in
 * `(projectId, oid)` order, after the resume cursor. Needs `pnpm infra:up` and
 * a migrated database; no object store.
 */

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('LFS reservation scope', () => {
  const run = randomBytes(6).toString('hex');
  const ownerId = `user-lfs-scope-${run}`;
  const otherAccountId = `account-lfs-scope-${run}`;
  const ids = {
    first: `lfs-scope-${run}-a`,
    second: `lfs-scope-${run}-b`,
    withoutLfs: `lfs-scope-${run}-c`,
    deleted: `lfs-scope-${run}-d`,
    otherAccount: `lfs-scope-${run}-e`,
  };
  const mine = new Set(Object.values(ids));
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  const visited = async (args: { accountId?: string; afterProjectId?: string; projectId?: string } = {}) => {
    const projects = await Array.fromAsync(
      lfsRelocationProjects(activeLfsReservationPages(database, { accountId: 'tau-default', ...args })),
    );
    return projects.filter((candidate) => mine.has(candidate.projectId));
  };

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
    await database.insert(user).values({ id: ownerId, name: 'LFS scope owner', email: `${ownerId}@example.invalid` });
    await database.insert(storageAccount).values({
      id: otherAccountId,
      ownerId,
      provider: 's3',
      endpoint: 'https://storage.example.invalid',
      bucket: 'lfs-scope',
    });
    await database.insert(project).values(
      Object.values(ids).map((id) => ({
        id,
        ownerId,
        name: id,
        ...(id === ids.otherAccount ? { storageAccountId: otherAccountId } : {}),
      })),
    );
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
        reservation(ids.otherAccount, 'e'),
      ]);
    await database.insert(projectDeletion).values({ projectId: ids.deleted, ownerId, requestedBy: ownerId });
  }, 60_000);

  afterAll(async () => {
    await database.delete(projectDeletion).where(inArray(projectDeletion.projectId, [...mine]));
    await database.delete(project).where(inArray(project.id, [...mine]));
    await database.delete(user).where(inArray(user.id, [ownerId]));
    await client.end();
  });

  it('should visit each active project in this account once, in order, with its rows in oid order', async () => {
    expect(await visited()).toEqual([
      {
        ownerId,
        projectId: ids.first,
        rows: [
          { oid: 'a'.repeat(64), size: 3 },
          { oid: 'b'.repeat(64), size: 3 },
        ],
      },
      { ownerId, projectId: ids.second, rows: [{ oid: 'c'.repeat(64), size: 3 }] },
    ]);
  });

  it('should leave out a project in another storage account unless the driver is that account', async () => {
    const defaultAccount = await visited();
    expect(defaultAccount.map((each) => each.projectId)).not.toContain(ids.otherAccount);
    expect(await visited({ accountId: otherAccountId })).toEqual([
      expect.objectContaining({ projectId: ids.first }),
      expect.objectContaining({ projectId: ids.second }),
      { ownerId, projectId: ids.otherAccount, rows: [{ oid: 'e'.repeat(64), size: 3 }] },
    ]);
  });

  it('should resume after the cursor and narrow to one project', async () => {
    const resumed = await visited({ afterProjectId: ids.first });
    expect(resumed.map((each) => each.projectId)).toEqual([ids.second]);
    const narrowed = await visited({ projectId: ids.first });
    expect(narrowed.map((each) => each.projectId)).toEqual([ids.first]);
    expect(await visited({ projectId: ids.deleted })).toEqual([]);
    expect(await visited({ projectId: ids.otherAccount })).toEqual([]);
  });
});
