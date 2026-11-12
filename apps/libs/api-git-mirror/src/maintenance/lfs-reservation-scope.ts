import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Database } from '@taucad/api-database/owner-lock';
import { project, projectDeletion, projectGitLfsObject } from '@taucad/api-database/schema';

/*
 * What the LFS maintenance commands (`relocate-lfs`, `lfs-integrity`) visit:
 * every LFS reservation of an active project in the driver's storage account,
 * read in keyset pages, and their shared worker-count parser.
 */

/** One reservation, with the owner its tenant key is under. */
export type LfsReservation = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly oid: string;
  readonly size: number;
};

/** A worker bound: the default and the largest accepted value. */
export type ConcurrencyBound = { readonly default: number; readonly max: number };

/**
 * A command's `--concurrency`, checked against its bound.
 *
 * @param value - The operator's `--concurrency`, or `undefined` for the default.
 * @param bound - The default and the largest accepted value.
 * @param qualifier - Appended to the error, such as `' with --confirm'`.
 * @returns The worker count.
 * @throws RangeError - When the value is not a whole number within the bound.
 */
export const parseConcurrency = (value: string | undefined, bound: ConcurrencyBound, qualifier = ''): number => {
  if (value === undefined) {
    return bound.default;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > bound.max) {
    throw new RangeError(`--concurrency must be a whole number from 1 to ${String(bound.max)}${qualifier}`);
  }
  return parsed;
};

const reservationPageSize = 500;

/**
 * Every reservation of an active project in `accountId` (a project with no
 * storage account is in Tau's default one), in `(projectId, oid)` order, in
 * keyset pages. Reservations of deleted projects and of projects in another
 * account are left out.
 *
 * @param database - The database the reservations live in.
 * @param args - The driver's storage account, a project to resume after, and one project to limit it to.
 * @yields One non-empty page of rows at a time.
 */
export async function* activeLfsReservationPages(
  database: Database,
  args: { readonly accountId: string; readonly afterProjectId?: string; readonly projectId?: string },
): AsyncGenerator<readonly LfsReservation[]> {
  let cursor: { projectId: string; oid: string } | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- keyset pages are sequential by cursor
    const page = await database
      .select({
        ownerId: project.ownerId,
        projectId: projectGitLfsObject.projectId,
        oid: projectGitLfsObject.oid,
        size: projectGitLfsObject.sizeBytes,
      })
      .from(projectGitLfsObject)
      .innerJoin(project, eq(project.id, projectGitLfsObject.projectId))
      .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
      .where(
        and(
          isNull(projectDeletion.projectId),
          or(isNull(project.storageAccountId), eq(project.storageAccountId, args.accountId)),
          args.projectId === undefined ? undefined : eq(projectGitLfsObject.projectId, args.projectId),
          args.afterProjectId === undefined ? undefined : gt(projectGitLfsObject.projectId, args.afterProjectId),
          cursor === undefined
            ? undefined
            : or(
                gt(projectGitLfsObject.projectId, cursor.projectId),
                and(eq(projectGitLfsObject.projectId, cursor.projectId), gt(projectGitLfsObject.oid, cursor.oid)),
              ),
        ),
      )
      .orderBy(asc(projectGitLfsObject.projectId), asc(projectGitLfsObject.oid))
      .limit(reservationPageSize);
    if (page.length > 0) {
      yield page;
    }
    if (page.length < reservationPageSize) {
      return;
    }
    const last = page.at(-1)!;
    cursor = { projectId: last.projectId, oid: last.oid };
  }
}
