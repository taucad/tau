import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { withOwnerLock } from '#database/owner-lock.js';
import { project, projectGit, projectGitLfsObject } from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { lfsObjectLocations } from '#api/git/lfs-keys.js';
import { referencedLfsOids } from '#api/git/lfs-reachability.js';

/**
 * How long an object stays after the last tree that reached it (charter D16,
 * revisions Rule 15). A client that still holds the object restarts this clock
 * through its batch answer, so the window is measured from the last evidence
 * of the object anywhere, not from the last push.
 */
export const lfsRetirementWindowMilliseconds = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a reservation whose bytes never arrived keeps holding quota. It is
 * shorter than the retirement window because nothing was ever stored under it:
 * the upload URL expired long before, and the row is the only cost.
 */
export const abandonedReservationWindowMilliseconds = 24 * 60 * 60 * 1000;

export type LfsRetirementDependencies = {
  readonly database: Database;
  /** The repository store the lease is hydrated from. */
  readonly store: RepositoryStore;
  readonly storage: ObjectStorageService;
  /** Where leases are built; defaults to the OS temp directory. */
  readonly leaseParentDirectory?: string;
};

type Candidate = { readonly oid: string; readonly size: number };

/**
 * Rows whose window has passed, in the one shape every selector uses: both
 * entry points here and `revisions-maintenance retire-lfs --dry-run`, so the
 * rule that authorizes a delete is spelled once.
 *
 * @param now - The pass's clock.
 * @param window - How long an unreachable object is kept.
 * @returns The predicate, for a `where` on `project_git_lfs_object`. Drizzle's
 *   `or` types the result as optional; both operands here are always present.
 */
export const dueCondition = (now: Date, window: number): SQL | undefined =>
  or(
    lte(projectGitLfsObject.unreachableAt, new Date(now.getTime() - window)),
    and(
      isNull(projectGitLfsObject.finalizedAt),
      lte(projectGitLfsObject.createdAt, new Date(now.getTime() - abandonedReservationWindowMilliseconds)),
    ),
  );

/**
 * Retires one project's due LFS objects, rechecking the repository first (D18).
 *
 * The mark alone never authorizes a delete: the candidates are selected from
 * the marks, a **read-only lease** is hydrated and walked, and only the objects
 * that walk still misses are removed. An object the repository reached again
 * has its stale mark cleared instead, which is the same answer a "present"
 * batch gives.
 *
 * The owner lock is taken for the deletes alone and never across the hydrate,
 * so a push waiting on the same owner is never behind a store round trip. The
 * bytes go before the row: a worker killed between them leaves a row whose
 * object is gone, which the next pass finishes, while the opposite order would
 * leave bytes nothing remembers.
 *
 * @param dependencies - The database, the store, the storage driver and the lease root.
 * @param args - The owner, the project, the clock and the retention window.
 * @returns The `oid` of every object this call removed.
 */
export const retireLfsObjects = async (
  dependencies: LfsRetirementDependencies,
  args: {
    readonly ownerId: string;
    readonly projectId: string;
    readonly now: Date;
    readonly window?: number;
  },
): Promise<{ retired: readonly string[] }> => {
  const window = args.window ?? lfsRetirementWindowMilliseconds;
  const candidates: readonly Candidate[] = await dependencies.database
    .select({ oid: projectGitLfsObject.oid, size: projectGitLfsObject.sizeBytes })
    .from(projectGitLfsObject)
    .where(and(eq(projectGitLfsObject.projectId, args.projectId), dueCondition(args.now, window)));
  if (candidates.length === 0) {
    return { retired: [] };
  }

  const lease = await hydrateLease({
    store: dependencies.store,
    locator: repositoryLocator({ ownerId: args.ownerId, projectId: args.projectId }),
    ...(dependencies.leaseParentDirectory === undefined ? {} : { parentDirectory: dependencies.leaseParentDirectory }),
  });
  let referenced: ReadonlySet<string>;
  try {
    referenced = await referencedLfsOids(lease.directory);
  } finally {
    await lease.dispose();
  }

  const unreferenced = candidates.filter((candidate) => !referenced.has(candidate.oid));
  const returned = candidates.filter((candidate) => referenced.has(candidate.oid)).map((candidate) => candidate.oid);

  return withOwnerLock(dependencies.database, args.ownerId, async (transaction) => {
    if (returned.length > 0) {
      await transaction
        .update(projectGitLfsObject)
        .set({ unreachableAt: null })
        .where(and(eq(projectGitLfsObject.projectId, args.projectId), inArray(projectGitLfsObject.oid, returned)));
    }
    if (unreferenced.length === 0) {
      return { retired: [] };
    }

    // Re-read under the lock: a batch answer of "present" between the select
    // and here cleared the mark, and that object is no longer due.
    const held = await transaction
      .select({
        oid: projectGitLfsObject.oid,
        size: projectGitLfsObject.sizeBytes,
        unreachableAt: projectGitLfsObject.unreachableAt,
        finalizedAt: projectGitLfsObject.finalizedAt,
        createdAt: projectGitLfsObject.createdAt,
      })
      .from(projectGitLfsObject)
      .where(
        and(
          eq(projectGitLfsObject.projectId, args.projectId),
          inArray(
            projectGitLfsObject.oid,
            unreferenced.map((candidate) => candidate.oid),
          ),
        ),
      )
      .for('update');
    /* The same rule `dueCondition` spells in SQL, re-applied to what the lock
       is actually holding, so the condition that authorizes a delete is visible
       in the code that deletes. */
    const due = held.filter(
      (row) =>
        (row.unreachableAt !== null && row.unreachableAt.getTime() <= args.now.getTime() - window) ||
        (row.finalizedAt === null &&
          row.createdAt.getTime() <= args.now.getTime() - abandonedReservationWindowMilliseconds),
    );
    if (due.length === 0) {
      return { retired: [] };
    }

    for (const row of due) {
      // Both keys: a project whose objects predate D24 still has its bytes at
      // the legacy key, and deleting a key that was never written is not an
      // error on either store.
      for (const location of lfsObjectLocations(args.ownerId, args.projectId, row.oid)) {
        // oxlint-disable-next-line no-await-in-loop -- the lock is held; these run in order, briefly
        await dependencies.storage.deleteBlob(location);
      }
    }

    const retired = due.map((row) => row.oid);
    await transaction
      .delete(projectGitLfsObject)
      .where(and(eq(projectGitLfsObject.projectId, args.projectId), inArray(projectGitLfsObject.oid, retired)));
    const released = due.reduce((total, row) => total + row.size, 0);
    await transaction
      .update(projectGit)
      .set({ lfsBytes: sql`greatest(0, ${projectGit.lfsBytes} - ${released})`, updatedAt: args.now })
      .where(eq(projectGit.projectId, args.projectId));

    return { retired };
  });
};

export type LfsRetirementOutcome = {
  readonly projectId: string;
  readonly retired: readonly string[];
  /** Why this project was skipped, when it was. */
  readonly error?: string;
};

/**
 * The runnable pass: every project holding a due candidate, retired in turn.
 *
 * The projects come from one query over the marks, so the pass costs a lease
 * per project that has something to retire and nothing at all for the rest —
 * no job enumerates every repository. One project's failure (a tombstoned
 * tenant mid-purge, a store outage) is recorded and the pass continues; the
 * marks it left behind make the next run pick it up again.
 *
 * @param dependencies - The database, the store, the storage driver and the lease root.
 * @param args - The clock and the retention window.
 * @returns One outcome per project the pass considered.
 */
export const retireDueLfsObjects = async (
  dependencies: LfsRetirementDependencies,
  args: { readonly now: Date; readonly window?: number },
): Promise<readonly LfsRetirementOutcome[]> => {
  const window = args.window ?? lfsRetirementWindowMilliseconds;
  const projects = await dependencies.database
    .selectDistinct({ projectId: projectGitLfsObject.projectId, ownerId: project.ownerId })
    .from(projectGitLfsObject)
    .innerJoin(project, eq(project.id, projectGitLfsObject.projectId))
    .where(dueCondition(args.now, window));

  const outcomes: LfsRetirementOutcome[] = [];
  for (const row of projects) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one lease at a time bounds the pass's disk
      const { retired } = await retireLfsObjects(dependencies, {
        ownerId: row.ownerId,
        projectId: row.projectId,
        now: args.now,
        window,
      });
      outcomes.push({ projectId: row.projectId, retired });
    } catch (error) {
      outcomes.push({
        projectId: row.projectId,
        retired: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
};
