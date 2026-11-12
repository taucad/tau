import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { project, projectDeletion, projectGitLfsObject, user } from '@taucad/api-database/schema';
import * as schema from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { lfsIntegrityPages } from '#maintenance/lfs-integrity.js';

/**
 * Which reservations `lfs-integrity` reads, against a migrated PostgreSQL:
 * every row of an active project in the driver's account, with its owner, in
 * `(projectId, oid)` order. Needs `pnpm infra:up` and a migrated database; no
 * object store.
 */

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('lfs-integrity reservation selection', () => {
  const run = randomBytes(6).toString('hex');
  const ownerId = `user-sto17-${run}`;
  const ids = { first: `sto17-${run}-a`, second: `sto17-${run}-b`, deleted: `sto17-${run}-c` };
  const mine = new Set(Object.values(ids));
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
    await database.insert(user).values({ id: ownerId, name: 'STO-17 owner', email: `${ownerId}@example.invalid` });
    await database.insert(project).values(Object.values(ids).map((id) => ({ id, ownerId, name: id })));
    await database.insert(projectGitLfsObject).values([
      { projectId: ids.second, oid: 'c'.repeat(64), sizeBytes: 5 },
      { projectId: ids.first, oid: 'b'.repeat(64), sizeBytes: 4 },
      { projectId: ids.first, oid: 'a'.repeat(64), sizeBytes: 3 },
      { projectId: ids.deleted, oid: 'd'.repeat(64), sizeBytes: 6 },
    ]);
    await database.insert(projectDeletion).values({ projectId: ids.deleted, ownerId, requestedBy: ownerId });
  }, 60_000);

  afterAll(async () => {
    await database.delete(projectDeletion).where(inArray(projectDeletion.projectId, [...mine]));
    await database.delete(user).where(inArray(user.id, [ownerId]));
    await client.end();
  });

  it('should read every reservation of an active project once, in order, with its owner', async () => {
    const pages = await Array.fromAsync(lfsIntegrityPages(database, { accountId: 'tau-default' }));
    const rows = pages.flat().filter((candidate) => mine.has(candidate.projectId));

    expect(rows).toEqual([
      { ownerId, projectId: ids.first, oid: 'a'.repeat(64), size: 3 },
      { ownerId, projectId: ids.first, oid: 'b'.repeat(64), size: 4 },
      { ownerId, projectId: ids.second, oid: 'c'.repeat(64), size: 5 },
    ]);
  });
});
