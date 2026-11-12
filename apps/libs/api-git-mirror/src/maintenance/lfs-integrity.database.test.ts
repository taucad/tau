import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { project, projectDeletion, projectGitLfsObject, storageAccount, user } from '@taucad/api-database/schema';
import * as schema from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { lfsIntegrityExclusions } from '#maintenance/lfs-integrity.js';
import { activeLfsReservationPages } from '#maintenance/lfs-reservation-scope.js';

/**
 * Which reservations `lfs-integrity` reads, and which it counts as left out,
 * against a migrated PostgreSQL: every row of an active project in the
 * driver's account, with its owner and whether it was finalized, in
 * `(projectId, oid)` order. Needs `pnpm infra:up` and a migrated database; no
 * object store.
 */

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('lfs-integrity reservation selection', () => {
  const run = randomBytes(6).toString('hex');
  const ownerId = `user-lfs-integrity-${run}`;
  const otherAccountId = `account-lfs-integrity-${run}`;
  const ids = {
    first: `lfs-integrity-${run}-a`,
    second: `lfs-integrity-${run}-b`,
    deleted: `lfs-integrity-${run}-c`,
    otherAccount: `lfs-integrity-${run}-d`,
  };
  const mine = new Set(Object.values(ids));
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
    await database
      .insert(user)
      .values({ id: ownerId, name: 'LFS integrity owner', email: `${ownerId}@example.invalid` });
    await database.insert(storageAccount).values({
      id: otherAccountId,
      ownerId,
      provider: 's3',
      endpoint: 'https://storage.example.invalid',
      bucket: 'lfs-integrity',
    });
    await database.insert(project).values(
      Object.values(ids).map((id) => ({
        id,
        ownerId,
        name: id,
        ...(id === ids.otherAccount ? { storageAccountId: otherAccountId } : {}),
      })),
    );
    await database.insert(projectGitLfsObject).values([
      { projectId: ids.second, oid: 'c'.repeat(64), sizeBytes: 5, finalizedAt: new Date() },
      { projectId: ids.first, oid: 'b'.repeat(64), sizeBytes: 4 },
      { projectId: ids.first, oid: 'a'.repeat(64), sizeBytes: 3, finalizedAt: new Date() },
      { projectId: ids.deleted, oid: 'd'.repeat(64), sizeBytes: 6 },
      { projectId: ids.otherAccount, oid: 'e'.repeat(64), sizeBytes: 7 },
      { projectId: ids.otherAccount, oid: 'f'.repeat(64), sizeBytes: 8 },
    ]);
    await database.insert(projectDeletion).values({ projectId: ids.deleted, ownerId, requestedBy: ownerId });
  }, 60_000);

  afterAll(async () => {
    await database.delete(projectDeletion).where(inArray(projectDeletion.projectId, [...mine]));
    await database.delete(project).where(inArray(project.id, [...mine]));
    await database.delete(user).where(inArray(user.id, [ownerId]));
    await client.end();
  });

  it('should read every reservation of an active project in this account once, in order, with its owner', async () => {
    const pages = await Array.fromAsync(activeLfsReservationPages(database, { accountId: 'tau-default' }));
    const rows = pages.flat().filter((candidate) => mine.has(candidate.projectId));

    expect(rows).toEqual([
      { ownerId, projectId: ids.first, oid: 'a'.repeat(64), size: 3, finalized: true },
      { ownerId, projectId: ids.first, oid: 'b'.repeat(64), size: 4, finalized: false },
      { ownerId, projectId: ids.second, oid: 'c'.repeat(64), size: 5, finalized: true },
    ]);
  });

  it('should count the rows of deleted projects and of another storage account as left out', async () => {
    // Other runs share the database, so the counts include at least this suite's rows.
    const exclusions = await lfsIntegrityExclusions(database, { accountId: 'tau-default' });
    expect(exclusions.skippedOtherAccount).toBeGreaterThanOrEqual(2);
    expect(exclusions.deletedProjectRows).toBeGreaterThanOrEqual(1);
    // Run as that account, its rows are read rather than left out.
    const pages = await Array.fromAsync(activeLfsReservationPages(database, { accountId: otherAccountId }));
    expect(pages.flat().filter((candidate) => candidate.projectId === ids.otherAccount)).toHaveLength(2);
  });
});
