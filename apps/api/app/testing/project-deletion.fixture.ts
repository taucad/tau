import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Database } from '#database/owner-lock.js';
import * as schema from '#database/schema.js';
import { createScratchDatabase } from '#testing/scratch-database.js';

/** Refuse the shared developer database even when the integration config loads it. */
export const assertDeletionDatabase = (connection: string | undefined): string => {
  const marker: unknown = Reflect.get(process.env, 'CPD_ACCEPTANCE_POSTGRES_CONTAINER');
  if (!connection || typeof marker !== 'string' || !/^cpd07-acceptance-postgres-[a-f\d]+$/u.test(marker)) {
    throw new Error('Project deletion acceptance requires its owned PostgreSQL container marker.');
  }
  const url = new URL(connection);
  if (
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.port === '5432' ||
    url.username !== 'cpd_acceptance' ||
    !/^\/(?:cpd_acceptance|cpd_full_api_[a-f\d]+|tau_scratch_project_deletion_[a-f\d]+_\d+)$/u.test(url.pathname)
  ) {
    throw new Error('Project deletion acceptance requires its isolated loopback PostgreSQL database.');
  }
  return connection;
};

/** Create a migrated database; retain all fixture rows for the acceptance owner. */
export const createDeletionDatabase = async (): Promise<{ client: postgres.Sql; database: Database; url: string }> => {
  assertDeletionDatabase(process.env.DATABASE_URL);
  const scratch = await createScratchDatabase(`project_deletion_${randomBytes(6).toString('hex')}`);
  const client = postgres(scratch.url, { max: 8, prepare: false });
  return { client, database: drizzle(client, { schema }), url: scratch.url };
};

/** Independent owners and projects make every test inspectable without clearing shared tables. */
export const seedDeletionProject = async (
  database: Database,
): Promise<{
  ownerId: string;
  readerId: string;
  writerId: string;
  strangerId: string;
  projectId: string;
  neighborId: string;
}> => {
  const suffix = randomUUID();
  const ownerId = `owner_${suffix}`;
  const readerId = `reader_${suffix}`;
  const writerId = `writer_${suffix}`;
  const strangerId = `stranger_${suffix}`;
  const projectId = `legacy_${suffix}`;
  const neighborId = `${projectId}-neighbor`;
  await database.insert(schema.user).values(
    [ownerId, readerId, writerId, strangerId].map((id) => ({
      id,
      name: 'Deletion acceptance',
      email: `${id}@example.invalid`,
    })),
  );
  await database.insert(schema.project).values([
    { id: projectId, ownerId, name: 'Delete this fixture' },
    { id: neighborId, ownerId, name: 'Keep this fixture' },
  ]);
  await database.insert(schema.projectCollaborator).values([
    { projectId, userId: readerId, role: 'read' },
    { projectId, userId: writerId, role: 'write' },
    { projectId: neighborId, userId: readerId, role: 'read' },
  ]);
  await database.insert(schema.projectGit).values([
    { projectId, storageBytes: 1000, lfsBytes: 300, retainedBytes: 70 },
    { projectId: neighborId, storageBytes: 400, lfsBytes: 50 },
  ]);
  return { ownerId, readerId, writerId, strangerId, projectId, neighborId };
};
