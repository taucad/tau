import { sql, eq } from 'drizzle-orm';
import type { DatabaseService } from '#database/database.service.js';
import { project, projectGit } from '#database/schema.js';

/** The Drizzle handle every caller holds. */
export type Database = DatabaseService['database'];

/** The handle inside a transaction, which is what a locked body is given. */
export type OwnerLockTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Runs `body` holding the owner-keyed PostgreSQL advisory lock (D18).
 *
 * Two pieces of state live outside the repository manifest and need their own
 * serialization: an LFS object's reachability mark, and the owner's quota. Both
 * take this one lock, keyed on the owner rather than the project, because one
 * plan allowance is shared by every project the owner has.
 *
 * `pg_advisory_xact_lock` is released when the transaction ends, so the lock can
 * never outlive its body — which is the rule that matters here, since it must
 * never be held across a push. The key is `hashtextextended(ownerId, 0)`, the
 * same expression `git.service.ts` already locks on, so the two never overlap.
 *
 * **A transaction takes at most one advisory lock in this key space.** The only
 * other one is the project key `publication-materializer.ts` takes to serialize
 * a repair, and a body that took it while holding this one would let two callers
 * acquire the pair in opposite orders and deadlock. If some future caller
 * genuinely needs both, the owner key is taken first, everywhere.
 *
 * @param database - The Drizzle handle to open the transaction on.
 * @param ownerId - The account whose storage state is being serialized.
 * @param body - What to run while the lock is held; it receives the transaction.
 * @returns Whatever `body` returned, once the transaction has committed.
 */
export async function withOwnerLock<T>(
  database: Database,
  ownerId: string,
  body: (transaction: OwnerLockTransaction) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
    return body(transaction);
  });
}

/**
 * The owner's stored bytes, read inside a lock so a recheck sees a settled total.
 *
 * Usage is account-wide: one plan allowance is shared by all of an owner's
 * projects, including the ones they own but somebody else pushes to (D27).
 *
 * @param transaction - A transaction, normally one `withOwnerLock` opened.
 * @param ownerId - The account to total.
 * @returns Non-LFS and LFS bytes across every project the account owns.
 */
export async function readOwnerUsage(
  transaction: OwnerLockTransaction,
  ownerId: string,
): Promise<{ storageBytes: number; lfsBytes: number }> {
  const rows = await transaction
    .select({
      storageBytes: sql<number>`coalesce(sum(${projectGit.storageBytes}), 0)`,
      lfsBytes: sql<number>`coalesce(sum(${projectGit.lfsBytes}), 0)`,
    })
    .from(project)
    .leftJoin(projectGit, eq(projectGit.projectId, project.id))
    .where(eq(project.ownerId, ownerId));
  const [row] = rows;
  return { storageBytes: Number(row?.storageBytes ?? 0), lfsBytes: Number(row?.lfsBytes ?? 0) };
}
