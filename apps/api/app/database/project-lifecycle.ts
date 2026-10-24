import { GoneException, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Database, OwnerLockTransaction } from '#database/owner-lock.js';
import { projectDeletion } from '#database/schema.js';

type LifecycleDatabase = Pick<Database, 'select'>;

export async function readProjectDeletion(
  database: LifecycleDatabase,
  projectId: string,
): Promise<typeof projectDeletion.$inferSelect | undefined> {
  const [row] = await database.select().from(projectDeletion).where(eq(projectDeletion.projectId, projectId)).limit(1);
  return row;
}

/** Intent is the database fence; never answer this check from the access cache. */
export async function assertProjectActive(
  database: LifecycleDatabase,
  projectId: string,
  userId?: string,
): Promise<void> {
  const deletion = await readProjectDeletion(database, projectId);
  if (!deletion) {
    return;
  }
  if (userId !== undefined && userId !== deletion.ownerId) {
    throw new NotFoundException('Project not found');
  }
  throw new GoneException({ code: 'PROJECT_DELETED', message: 'This project has been deleted from Tau Cloud.' });
}

/** Existing publication lock key. Acquire the owner lock first when both are needed. */
export async function lockProjectLifecycle(transaction: OwnerLockTransaction, projectId: string): Promise<void> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`);
}

export async function assertActiveProjectLocked(
  transaction: OwnerLockTransaction,
  projectId: string,
  userId?: string,
): Promise<void> {
  await lockProjectLifecycle(transaction, projectId);
  await assertProjectActive(transaction, projectId, userId);
}
