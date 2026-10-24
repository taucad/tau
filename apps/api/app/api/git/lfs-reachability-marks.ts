import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, OwnerLockTransaction } from '#database/owner-lock.js';
import { withOwnerLock } from '#database/owner-lock.js';
import { assertActiveProjectLocked } from '#database/project-lifecycle.js';
import { projectGitLfsObject } from '#database/schema.js';

/*
 * The LFS reachability marks (D6), apart from the walk that finds them: tau-api
 * applies a storage receipt's `reachableLfsOids` here and runs no git (DC1);
 * the walk is `lfs-references.ts`, on tau-storage.
 */

/**
 * Membership in the referenced set as **one** bind, not one per pointer.
 *
 * `in (…)` would bind every reachable pointer separately and PostgreSQL refuses
 * past 65 535 parameters, so a repository with that many distinct pointers
 * would fail the mark outright instead of costing more.
 */
const referencedOids = (referenced: readonly string[], side: 'in' | 'out'): SQL => {
  /* `sql.param` is what binds the whole list as ONE parameter; interpolating
     the array directly makes drizzle spell a tuple, which PostgreSQL then
     refuses to cast to `text[]`. */
  const oids = sql`${sql.param([...referenced])}::text[]`;
  return side === 'in'
    ? sql`${projectGitLfsObject.oid} = any(${oids})`
    : sql`${projectGitLfsObject.oid} <> all(${oids})`;
};

/** What the reachability pass needs: the database the marks live in. */
export type LfsReachabilityDependencies = { readonly database: Database };

/**
 * `markLfsReachability`'s two statements, given the walk's result rather
 * than a lease: how the API applies a storage receipt's `reachableLfsOids`
 * (DC1), whose walk ran on tau-storage. The set is the whole walk, never a
 * difference, so a stale receipt cannot leave a mark another one owed.
 *
 * @param dependencies - The database handle.
 * @param args - The project, its owner, every reachable LFS oid and the observation moment.
 * @returns How many rows ended reachable and how many ended unreachable.
 */
export const applyLfsReachability = async (
  dependencies: LfsReachabilityDependencies,
  args: {
    readonly projectId: string;
    readonly ownerId: string;
    readonly referenced: readonly string[];
    readonly at: Date;
  },
): Promise<{ reachable: number; unreachable: number }> =>
  withOwnerLock(dependencies.database, args.ownerId, async (transaction) => {
    await assertActiveProjectLocked(transaction, args.projectId);
    return writeLfsReachability(transaction, args);
  });

/**
 * {@link applyLfsReachability}'s two statements inside a transaction that
 * already holds the owner lock and has asserted the project active: how a
 * receipt's marks land in the same transaction as its derived generation.
 *
 * @param transaction - The owner-locked transaction.
 * @param args - The project, every reachable LFS oid and the observation moment.
 * @returns How many rows ended reachable and how many ended unreachable.
 */
export const writeLfsReachability = async (
  transaction: OwnerLockTransaction,
  args: { readonly projectId: string; readonly referenced: readonly string[]; readonly at: Date },
): Promise<{ reachable: number; unreachable: number }> => {
  const { referenced } = args;
  const reachable =
    referenced.length === 0
      ? []
      : await transaction
          .update(projectGitLfsObject)
          .set({ unreachableAt: null })
          .where(and(eq(projectGitLfsObject.projectId, args.projectId), referencedOids(referenced, 'in')))
          .returning({ oid: projectGitLfsObject.oid });

  const unreachable = await transaction
    .update(projectGitLfsObject)
    /* `postgres` binds a raw template value as a string, so the moment is
         spelled as one and given its type back. */
    .set({
      unreachableAt: sql`coalesce(${projectGitLfsObject.unreachableAt}, ${args.at.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(projectGitLfsObject.projectId, args.projectId),
        referenced.length === 0 ? undefined : referencedOids(referenced, 'out'),
      ),
    )
    .returning({ oid: projectGitLfsObject.oid });

  return { reachable: reachable.length, unreachable: unreachable.length };
};
