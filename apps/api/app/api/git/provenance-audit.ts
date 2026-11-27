import { and, asc, eq, gt, isNotNull, isNull, notExists, sql } from 'drizzle-orm';
import type { Database } from '@taucad/api-database/owner-lock';
import { project, projectDeletion, projectGit, projectGitLfsObject } from '@taucad/api-database/schema';
import { auditHistory } from '@taucad/api-git-core/store/history-audit';
import type { HistoryAudit } from '@taucad/api-git-core/store/history-audit';
import { pushRecordsAfter } from '@taucad/api-git-core/store/manifest';
import type { Manifest, PushRecord } from '@taucad/api-git-core/store/manifest';

/**
 * WP11, the read-only audit an operator runs before WP3's attestation backfill (cloud backup admission blueprint,
 * Migration): per hosted repository, history by record shape and the commits the backfill can reach only by inference
 * ({@link auditHistory}), and its large objects; then the orphaned large objects of projects with no committed push.
 *
 * Nothing is written: each repository is read through a read-only lease and Postgres through `select`s alone. Output
 * carries project ids and counts only — no name, address, message or owner.
 */

/** The project a lease is for, with its storage account as Postgres holds it (none: the default account). */
export type AuditTarget = Readonly<
  Pick<typeof project.$inferSelect, 'ownerId' | 'storageAccountId'> & { projectId: string }
>;

/** One hydrated, read-only view of a repository. */
export type AuditLease = Readonly<{ directory: string; manifest: Manifest | undefined; release: () => Promise<void> }>;

/** What the audit needs beyond Postgres: a read-only lease and a push-log segment read, both per repository. */
export type ProvenanceAuditDependencies = Readonly<{
  database: Database;
  /** Hydrates a read-only lease of the project's repository. */
  hydrate: (target: AuditTarget) => Promise<AuditLease>;
  /** Reads one spilled push-log segment of that repository. */
  readSegment: (target: AuditTarget, key: string) => Promise<Uint8Array<ArrayBuffer>>;
}>;

/** One repository's line. */
export type RepositoryAuditLine = Readonly<
  { kind: 'repository'; projectId: string; generation: number } & (
    | (HistoryAudit & { lfs: Readonly<{ live: number; marked: number }> })
    | { error: string }
  )
>;

/** The closing line: totals, and the orphans of projects whose push never committed. */
export type AuditSummaryLine = Readonly<{
  kind: 'summary';
  repositories: number;
  failed: number;
  commits: number;
  shapes: Readonly<Record<'git' | 'tau/2' | 'tau/other', number>>;
  unlisted: number;
  repositoriesWithUnlisted: number;
  recordsWithOmitted: number;
  missingTips: number;
  orphans: Readonly<{ projects: number; unmarked: number; marked: number; unmarkedBytes: number }>;
}>;

const allPushes = async (
  manifest: Manifest | undefined,
  readSegment: (key: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<readonly PushRecord[]> => {
  if (manifest === undefined) {
    return [];
  }
  const out: PushRecord[] = [];
  let after = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- pages of one log, each continuing the last
    const page = await pushRecordsAfter({ manifest, readSegment, after, limit: 1000 });
    out.push(...page.records);
    if (page.next === undefined) {
      return out;
    }
    after = page.next;
  }
};

/* The projects whose push never committed: no row, or generation 0. */
const noCommittedPush = notExists(
  sql`(select 1 from ${projectGit} where ${projectGit.projectId} = ${projectGitLfsObject.projectId} and ${projectGit.generation} > 0)`,
);

const orphanSummary = async (database: Database): Promise<AuditSummaryLine['orphans']> => {
  const [row] = await database
    .select({
      projects: sql<number>`count(distinct ${projectGitLfsObject.projectId})::int`,
      unmarked: sql<number>`count(*) filter (where ${projectGitLfsObject.unreachableAt} is null)::int`,
      marked: sql<number>`count(*) filter (where ${projectGitLfsObject.unreachableAt} is not null)::int`,
      unmarkedBytes: sql<number>`coalesce(sum(${projectGitLfsObject.sizeBytes}) filter (where ${projectGitLfsObject.unreachableAt} is null), 0)::bigint`,
    })
    .from(projectGitLfsObject)
    .innerJoin(project, eq(project.id, projectGitLfsObject.projectId))
    .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
    .where(and(isNotNull(projectGitLfsObject.finalizedAt), isNull(projectDeletion.projectId), noCommittedPush));
  return {
    projects: Number(row?.projects ?? 0),
    unmarked: Number(row?.unmarked ?? 0),
    marked: Number(row?.marked ?? 0),
    unmarkedBytes: Number(row?.unmarkedBytes ?? 0),
  };
};

const lfsCounts = async (database: Database, projectId: string): Promise<{ live: number; marked: number }> => {
  const [row] = await database
    .select({
      live: sql<number>`count(*) filter (where ${projectGitLfsObject.unreachableAt} is null)::int`,
      marked: sql<number>`count(*) filter (where ${projectGitLfsObject.unreachableAt} is not null)::int`,
    })
    .from(projectGitLfsObject)
    .where(and(eq(projectGitLfsObject.projectId, projectId), isNotNull(projectGitLfsObject.finalizedAt)));
  return { live: Number(row?.live ?? 0), marked: Number(row?.marked ?? 0) };
};

/**
 * Audit every active project with a committed push, or only `projectId`, then summarize. Read-only.
 *
 * @param dependencies - Postgres, the lease and the segment read.
 * @param options - An optional single project.
 * @param options.projectId - Audit only this project.
 * @yields One line per repository, then the summary.
 */
export const auditProvenance = async function* (
  dependencies: ProvenanceAuditDependencies,
  options: Readonly<{ projectId?: string }> = {},
): AsyncGenerator<RepositoryAuditLine | AuditSummaryLine> {
  const totals = {
    repositories: 0,
    failed: 0,
    commits: 0,
    shapes: { git: 0, 'tau/2': 0, 'tau/other': 0 },
    unlisted: 0,
    repositoriesWithUnlisted: 0,
    recordsWithOmitted: 0,
    missingTips: 0,
  };
  let cursor: string | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- bounded keyset pages of projects
    const page = await dependencies.database
      .select({
        projectId: project.id,
        ownerId: project.ownerId,
        storageAccountId: project.storageAccountId,
        generation: projectGit.generation,
      })
      .from(project)
      .innerJoin(projectGit, eq(projectGit.projectId, project.id))
      .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
      .where(
        and(
          gt(projectGit.generation, 0),
          isNull(projectDeletion.projectId),
          options.projectId === undefined ? undefined : eq(project.id, options.projectId),
          cursor === undefined ? undefined : gt(project.id, cursor),
        ),
      )
      .orderBy(asc(project.id))
      .limit(100);
    if (page.length === 0) {
      break;
    }
    cursor = page.at(-1)!.projectId;
    for (const target of page) {
      totals.repositories += 1;
      let line: RepositoryAuditLine;
      try {
        // oxlint-disable-next-line no-await-in-loop -- one lease on disk at a time
        const lease = await dependencies.hydrate(target);
        try {
          // oxlint-disable-next-line no-await-in-loop -- as above
          const pushes = await allPushes(lease.manifest, async (key) => dependencies.readSegment(target, key));
          // oxlint-disable-next-line no-await-in-loop -- as above
          const history = await auditHistory(lease.directory, pushes);
          // oxlint-disable-next-line no-await-in-loop -- as above
          const lfs = await lfsCounts(dependencies.database, target.projectId);
          line = { kind: 'repository', projectId: target.projectId, generation: target.generation, ...history, lfs };
        } finally {
          // oxlint-disable-next-line no-await-in-loop -- release before the next lease
          await lease.release();
        }
        totals.commits += line.commits;
        for (const shape of ['git', 'tau/2', 'tau/other'] as const) {
          totals.shapes[shape] += line.shapes[shape];
        }
        totals.unlisted += line.unlisted;
        totals.repositoriesWithUnlisted += line.unlisted > 0 ? 1 : 0;
        totals.recordsWithOmitted += line.recordsWithOmitted;
        totals.missingTips += line.missingTips;
      } catch (error) {
        totals.failed += 1;
        line = {
          kind: 'repository',
          projectId: target.projectId,
          generation: target.generation,
          error: error instanceof Error ? error.name : 'Error',
        };
      }
      yield line;
    }
  }
  yield { kind: 'summary', ...totals, orphans: await orphanSummary(dependencies.database) };
};
