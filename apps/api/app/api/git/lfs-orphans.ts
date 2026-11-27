import { and, asc, eq, gt, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '@taucad/api-database/owner-lock';
import { withOwnerLock } from '@taucad/api-database/owner-lock';
import { assertActiveProjectLocked } from '@taucad/api-database/project-lifecycle';
import { project, projectDeletion, projectGit, projectGitLfsObject } from '@taucad/api-database/schema';

/**
 * How long an uploaded object of a project with no committed push waits before it is marked unreachable (cloud
 * backup admission, WP12, Finding 7). A first backup uploads its large objects before the push that would reach
 * them; when that push is refused and never commits, no derivation ever runs, so nothing marks them and the
 * retirement window never starts. A day covers a first backup that is still being retried: every batch request
 * renews `last_requested_at`, which restarts this clock.
 */
export const orphanedLfsGraceMilliseconds = 24 * 60 * 60 * 1000;

/**
 * Finalized, unmarked objects that no committed push could have reached and that nobody has asked about for the
 * grace period.
 *
 * @param now - The pass's clock.
 * @returns The predicate, for a `where` on `project_git_lfs_object`.
 */
const orphanCondition = (now: Date): SQL | undefined =>
  and(
    isNotNull(projectGitLfsObject.finalizedAt),
    isNull(projectGitLfsObject.unreachableAt),
    lte(
      sql`coalesce(${projectGitLfsObject.lastRequestedAt}, ${projectGitLfsObject.createdAt})`,
      new Date(now.getTime() - orphanedLfsGraceMilliseconds).toISOString(),
    ),
    notExists(
      sql`(select 1 from ${projectGit} where ${projectGit.projectId} = ${projectGitLfsObject.projectId} and ${projectGit.generation} > 0)`,
    ),
  );

export type OrphanedLfsOutcome = {
  readonly projectId: string;
  /** How many objects this pass marked unreachable. */
  readonly marked: number;
  /** Why this project was skipped, when it was. */
  readonly error?: string;
};

/**
 * Marks the large objects of projects whose push never committed unreachable, so the retirement pass's 30-day window
 * starts for them (WP12 orphan sweep). No credit is given for them (operator ruling A5).
 *
 * The mark never authorizes a delete by itself: `retireLfsObjects` still walks the repository before removing
 * anything (D18), and a push that commits later clears the marks of whatever it reaches, as does a batch answer of
 * "present". Each project's marks are written under its owner lock, the lock a reachability pass and a retirement
 * take, and only while the project is active and still has no committed generation.
 *
 * @param dependencies - The database handle.
 * @param args - The pass's clock.
 * @param args.now - The moment the marks carry.
 * @yields One outcome per project that held an orphan.
 */
export const markOrphanedLfsObjects = async function* (
  dependencies: { readonly database: Database },
  args: { readonly now: Date },
): AsyncGenerator<OrphanedLfsOutcome> {
  let cursor: string | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- bounded keyset pages of projects
    const projects = await dependencies.database
      .selectDistinct({ projectId: projectGitLfsObject.projectId, ownerId: project.ownerId })
      .from(projectGitLfsObject)
      .innerJoin(project, eq(project.id, projectGitLfsObject.projectId))
      .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
      .where(
        and(
          orphanCondition(args.now),
          isNull(projectDeletion.projectId),
          cursor === undefined ? undefined : gt(projectGitLfsObject.projectId, cursor),
        ),
      )
      .orderBy(asc(projectGitLfsObject.projectId))
      .limit(500);
    if (projects.length === 0) {
      return;
    }
    cursor = projects.at(-1)!.projectId;
    for (const row of projects) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one owner lock at a time
        const marked = await withOwnerLock(dependencies.database, row.ownerId, async (transaction) => {
          await assertActiveProjectLocked(transaction, row.projectId);
          const updated = await transaction
            .update(projectGitLfsObject)
            .set({ unreachableAt: args.now })
            .where(and(eq(projectGitLfsObject.projectId, row.projectId), orphanCondition(args.now)))
            .returning({ oid: projectGitLfsObject.oid });
          return updated.length;
        });
        yield { projectId: row.projectId, marked };
      } catch (error) {
        yield { projectId: row.projectId, marked: 0, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
};
