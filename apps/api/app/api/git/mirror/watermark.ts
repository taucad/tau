import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { project, projectDeletion, projectGit, projectGitLfsObject, storageTombstone } from '#database/schema.js';

/**
 * The copy's work signal and watermark in Postgres (W13 B4), behind a port so the
 * copier's rules are tested without a database and the SQL is tested against one.
 *
 * Every statement here is within the `tau_mirror` role's grants
 * (`database/service-roles.ts`): it reads `project_git`, `project_git_lfs_object`,
 * `storage_tombstone` and three `project` columns, and writes only the copy
 * columns.
 */

/**
 * The `copy_pending_since` a writer that moves `project_git.generation` to
 * `generation` must set in the same statement (W13 B4): the oldest pending time
 * survives a burst, and a generation the copy already holds starts no clock.
 *
 * @param generation - The generation the statement records.
 * @returns The SQL value for `copy_pending_since`.
 */
export const copyPendingOnAdvance = (generation: number): SQL =>
  sql`case when ${generation} > ${projectGit.copiedGeneration} then coalesce(${projectGit.copyPendingSince}, now()) else ${projectGit.copyPendingSince} end`;

/** One repository the copier may copy. */
export type CopyCandidate = {
  readonly projectId: string;
  readonly ownerId: string;
  readonly generation: number;
  readonly copiedGeneration: number;
  readonly copyPendingSince: Date | undefined;
  readonly copyLockedUntil: Date | undefined;
  readonly copiedManifestSha256: string | undefined;
  /** Rows that predate the migration have no pending time: their first copy is backfill (W13 Finding 2). */
  readonly phase: 'steady' | 'backfill';
};

/** An owner whose account was deleted, as `storage_tombstone` records it. */
export type TombstonedOwner = {
  readonly ownerId: string;
  readonly deletedAt: Date;
  readonly purgeAfter: Date;
  readonly erasure: boolean;
};

export type PendingLfsObject = {
  readonly oid: string;
  readonly sizeBytes: number;
};

/** What a completed copy round records. */
export type CopyRecord = {
  readonly generation: number;
  readonly manifestSha256: string;
  readonly lockedUntil: Date | undefined;
};

/** The lag and backlog gauges, read from Postgres in one pass (W13 Finding 2, "Lag, precisely"). */
export type BacklogReading = {
  readonly oldestPendingSince: Date | undefined;
  readonly lagGenerations: number;
  readonly steady: number;
  readonly backfill: number;
  readonly lfsBacklog: number;
  readonly earliestLockedUntil: Date | undefined;
};

export type MirrorLedger = {
  /**
   * Up to `limit` repositories behind the copy: steady rows oldest pending first,
   * then backfill rows most recently active first, at most `backfillLimit` of them.
   */
  claim(args: { limit: number; backfillLimit: number; exclude: ReadonlySet<string> }): Promise<CopyCandidate[]>;
  /** One repository's row, or `undefined` when it has none (the project was deleted). */
  candidate(projectId: string): Promise<CopyCandidate | undefined>;
  /** The owner's `storage_tombstone` row, if any: its locks are never extended again (W13 B6). */
  tombstone(ownerId: string): Promise<TombstonedOwner | undefined>;
  /**
   * Repositories the copy has caught up with that still have finalized, uncopied
   * LFS objects finalized at or before `finalizedBefore`, project order. A round
   * copies only LFS finalized by its generation's commit, so an object finalized
   * after a repository's last push is copied here or not at all (the staging
   * 100 MiB finding, 2026-10-24). Erased owners and owner-supplied accounts are
   * never returned.
   */
  lfsStragglers(args: { limit: number; finalizedBefore: Date; exclude: ReadonlySet<string> }): Promise<CopyCandidate[]>;
  /** Finalized, uncopied LFS objects of a project finalized at or before `finalizedBy`, oid order, after `after`. */
  pendingLfs(projectId: string, finalizedBy: Date, limit: number, after?: string): Promise<PendingLfsObject[]>;
  markLfsCopied(projectId: string, oids: readonly string[], at: Date): Promise<void>;
  /** Every copied LFS object of a project that still has its row: the live set retention keeps locked. */
  copiedLfs(projectId: string): Promise<ReadonlySet<string>>;
  /** Advances the watermark monotonically and clears the pending time once the row is caught up. */
  recordCopy(projectId: string, record: CopyRecord): Promise<void>;
  /** Clears a pending time the store does not justify (the store is not ahead of the copy). */
  settle(projectId: string, storeGeneration: number): Promise<void>;
  unmarkedTombstones(limit: number): Promise<TombstonedOwner[]>;
  markTombstone(ownerId: string, at: Date): Promise<void>;
  /** Live repositories whose newest snapshot's earliest lock is before `floor`, project order, after `after`. */
  sweepCandidates(floor: Date, limit: number, after?: string): Promise<CopyCandidate[]>;
  /** Moves `copy_locked_until` forward for the snapshot of `generation`, if that is still the newest. */
  advanceLock(projectId: string, generation: number, lockedUntil: Date): Promise<void>;
  /** Repositories for the reconciler: recently written (`since`) or all, project order, after `after`. */
  reconcileCandidates(since: Date | undefined, limit: number, after?: string): Promise<CopyCandidate[]>;
  /** Starts the lag clock for a repository whose store is ahead of its row (a lost receipt). */
  markStoreAhead(projectId: string, storeGeneration: number): Promise<void>;
  backlog(): Promise<BacklogReading>;
};

export const candidateColumns = {
  projectId: projectGit.projectId,
  ownerId: project.ownerId,
  generation: projectGit.generation,
  copiedGeneration: projectGit.copiedGeneration,
  copyPendingSince: projectGit.copyPendingSince,
  copyLockedUntil: projectGit.copyLockedUntil,
  copiedManifestSha256: projectGit.copiedManifestSha256,
};

export type CandidateRow = {
  projectId: string;
  ownerId: string;
  generation: number;
  copiedGeneration: number;
  // oxlint-disable-next-line typescript/no-restricted-types -- Drizzle returns SQL null for an absent column
  copyPendingSince: Date | null;
  // oxlint-disable-next-line typescript/no-restricted-types -- same
  copyLockedUntil: Date | null;
  // oxlint-disable-next-line typescript/no-restricted-types -- same
  copiedManifestSha256: string | null;
};

export const toCandidate = (row: CandidateRow): CopyCandidate => ({
  projectId: row.projectId,
  ownerId: row.ownerId,
  generation: row.generation,
  copiedGeneration: row.copiedGeneration,
  copyPendingSince: row.copyPendingSince ?? undefined,
  copyLockedUntil: row.copyLockedUntil ?? undefined,
  copiedManifestSha256: row.copiedManifestSha256 ?? undefined,
  phase: row.copyPendingSince === null ? 'backfill' : 'steady',
});

/** Only the Tau default account is copied; an owner-supplied bucket is the owner's (D26). */
export const defaultAccount = isNull(project.storageAccountId);

export const notTombstoned = sql`not exists (select 1 from ${storageTombstone} where ${storageTombstone.ownerId} = ${project.ownerId})`;

/** `tau_mirror`'s Postgres, through Drizzle. */
export class PostgresMirrorLedger implements MirrorLedger {
  public constructor(private readonly database: Database) {}

  public async claim(args: {
    limit: number;
    backfillLimit: number;
    exclude: ReadonlySet<string>;
  }): Promise<CopyCandidate[]> {
    /*
     * No row lock is held across a round: a round streams objects for longer than
     * the role's idle-in-transaction timeout. Two copiers are safe anyway, because
     * `recordCopy` only ever moves the watermark forward (`greatest`) and writes the
     * trust root only for the newest generation; at worst both copy the same keys.
     */
    const excluded = [...args.exclude];
    const notExcluded = excluded.length === 0 ? undefined : notInArray(projectGit.projectId, excluded);
    const steady = await this.database
      .select(candidateColumns)
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(and(isNotNull(projectGit.copyPendingSince), defaultAccount, notExcluded))
      .orderBy(asc(projectGit.copyPendingSince))
      .limit(args.limit);
    const room = Math.min(args.backfillLimit, args.limit - steady.length);
    const backfill =
      room <= 0
        ? []
        : await this.database
            .select(candidateColumns)
            .from(projectGit)
            .innerJoin(project, eq(project.id, projectGit.projectId))
            .where(
              and(
                isNull(projectGit.copyPendingSince),
                gt(projectGit.generation, projectGit.copiedGeneration),
                defaultAccount,
                notExcluded,
              ),
            )
            .orderBy(desc(projectGit.updatedAt))
            .limit(room);
    return [...steady, ...backfill].map((row) => toCandidate(row));
  }

  public async candidate(projectId: string): Promise<CopyCandidate | undefined> {
    const [row] = await this.database
      .select(candidateColumns)
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(and(eq(projectGit.projectId, projectId), defaultAccount))
      .limit(1);
    return row === undefined ? undefined : toCandidate(row);
  }

  public async lfsStragglers(args: {
    limit: number;
    finalizedBefore: Date;
    exclude: ReadonlySet<string>;
  }): Promise<CopyCandidate[]> {
    const excluded = [...args.exclude];
    // The partial index `project_git_lfs_object_copy_pending_idx` serves the `exists`.
    const pendingLfs = sql`exists (select 1 from ${projectGitLfsObject} where ${projectGitLfsObject.projectId} = ${projectGit.projectId} and ${projectGitLfsObject.copiedAt} is null and ${projectGitLfsObject.finalizedAt} is not null and ${projectGitLfsObject.finalizedAt} <= ${args.finalizedBefore.toISOString()}::timestamptz)`;
    // A project being deleted is never claimed: its purge removes the LFS rows, and
    // re-claiming it every poll until then would only copy what is about to go.
    const notDeleting = sql`not exists (select 1 from ${projectDeletion} where ${projectDeletion.projectId} = ${projectGit.projectId})`;
    const rows = await this.database
      .select(candidateColumns)
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(
        and(
          gt(projectGit.copiedGeneration, 0),
          lte(projectGit.generation, projectGit.copiedGeneration),
          notDeleting,
          isNull(projectGit.copyPendingSince),
          defaultAccount,
          notTombstoned,
          pendingLfs,
          excluded.length === 0 ? undefined : notInArray(projectGit.projectId, excluded),
        ),
      )
      .orderBy(asc(projectGit.projectId))
      .limit(args.limit);
    return rows.map((row) => toCandidate(row));
  }

  public async tombstone(ownerId: string): Promise<TombstonedOwner | undefined> {
    const [row] = await this.database
      .select({
        ownerId: storageTombstone.ownerId,
        deletedAt: storageTombstone.createdAt,
        purgeAfter: storageTombstone.purgeAfter,
        erasure: storageTombstone.erasure,
      })
      .from(storageTombstone)
      .where(eq(storageTombstone.ownerId, ownerId))
      .limit(1);
    return row;
  }

  // oxlint-disable-next-line max-params -- keyset paging beside the project and the commit time
  public async pendingLfs(
    projectId: string,
    finalizedBy: Date,
    limit: number,
    after?: string,
  ): Promise<PendingLfsObject[]> {
    return this.database
      .select({
        oid: projectGitLfsObject.oid,
        sizeBytes: projectGitLfsObject.sizeBytes,
      })
      .from(projectGitLfsObject)
      .where(
        and(
          eq(projectGitLfsObject.projectId, projectId),
          isNull(projectGitLfsObject.copiedAt),
          isNotNull(projectGitLfsObject.finalizedAt),
          lte(projectGitLfsObject.finalizedAt, finalizedBy),
          after === undefined ? undefined : gt(projectGitLfsObject.oid, after),
        ),
      )
      .orderBy(asc(projectGitLfsObject.oid))
      .limit(limit);
  }

  public async markLfsCopied(projectId: string, oids: readonly string[], at: Date): Promise<void> {
    if (oids.length === 0) {
      return;
    }
    await this.database
      .update(projectGitLfsObject)
      .set({ copiedAt: at })
      .where(and(eq(projectGitLfsObject.projectId, projectId), inArray(projectGitLfsObject.oid, [...oids])));
  }

  public async copiedLfs(projectId: string): Promise<ReadonlySet<string>> {
    const rows = await this.database
      .select({ oid: projectGitLfsObject.oid })
      .from(projectGitLfsObject)
      .where(and(eq(projectGitLfsObject.projectId, projectId), isNotNull(projectGitLfsObject.copiedAt)));
    return new Set(rows.map((row) => row.oid));
  }

  public async recordCopy(projectId: string, record: CopyRecord): Promise<void> {
    const newest = sql`${record.generation} >= ${projectGit.copiedGeneration}`;
    await this.database
      .update(projectGit)
      .set({
        copiedGeneration: sql`greatest(${projectGit.copiedGeneration}, ${record.generation})`,
        copiedManifestSha256: sql`case when ${newest} then ${record.manifestSha256} else ${projectGit.copiedManifestSha256} end`,
        copyLockedUntil:
          record.lockedUntil === undefined
            ? sql`case when ${newest} then null else ${projectGit.copyLockedUntil} end`
            : sql`case when ${newest} then ${record.lockedUntil.toISOString()}::timestamptz else ${projectGit.copyLockedUntil} end`,
        copyPendingSince: sql`case when ${projectGit.generation} <= ${record.generation} then null else ${projectGit.copyPendingSince} end`,
      })
      .where(eq(projectGit.projectId, projectId));
  }

  public async settle(projectId: string, storeGeneration: number): Promise<void> {
    await this.database
      .update(projectGit)
      .set({ copyPendingSince: null })
      .where(
        and(
          eq(projectGit.projectId, projectId),
          lte(projectGit.generation, projectGit.copiedGeneration),
          lte(sql`${storeGeneration}`, projectGit.copiedGeneration),
        ),
      );
  }

  public async unmarkedTombstones(limit: number): Promise<TombstonedOwner[]> {
    const rows = await this.database
      .select({
        ownerId: storageTombstone.ownerId,
        deletedAt: storageTombstone.createdAt,
        purgeAfter: storageTombstone.purgeAfter,
        erasure: storageTombstone.erasure,
      })
      .from(storageTombstone)
      .where(isNull(storageTombstone.copyMarkedAt))
      .orderBy(asc(storageTombstone.createdAt))
      .limit(limit);
    return rows;
  }

  public async markTombstone(ownerId: string, at: Date): Promise<void> {
    await this.database
      .update(storageTombstone)
      .set({ copyMarkedAt: at })
      .where(and(eq(storageTombstone.ownerId, ownerId), isNull(storageTombstone.copyMarkedAt)));
  }

  public async sweepCandidates(floor: Date, limit: number, after?: string): Promise<CopyCandidate[]> {
    const rows = await this.database
      .select(candidateColumns)
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(
        and(
          gt(projectGit.copiedGeneration, 0),
          isNotNull(projectGit.copiedManifestSha256),
          or(isNull(projectGit.copyLockedUntil), lt(projectGit.copyLockedUntil, floor)),
          defaultAccount,
          notTombstoned,
          after === undefined ? undefined : gt(projectGit.projectId, after),
        ),
      )
      .orderBy(asc(projectGit.projectId))
      .limit(limit);
    return rows.map((row) => toCandidate(row));
  }

  public async advanceLock(projectId: string, generation: number, lockedUntil: Date): Promise<void> {
    await this.database
      .update(projectGit)
      .set({ copyLockedUntil: lockedUntil })
      .where(and(eq(projectGit.projectId, projectId), eq(projectGit.copiedGeneration, generation)));
  }

  public async reconcileCandidates(since: Date | undefined, limit: number, after?: string): Promise<CopyCandidate[]> {
    const rows = await this.database
      .select(candidateColumns)
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(
        and(
          defaultAccount,
          since === undefined ? undefined : gt(projectGit.updatedAt, since),
          after === undefined ? undefined : gt(projectGit.projectId, after),
        ),
      )
      .orderBy(asc(projectGit.projectId))
      .limit(limit);
    return rows.map((row) => toCandidate(row));
  }

  public async markStoreAhead(projectId: string, storeGeneration: number): Promise<void> {
    await this.database
      .update(projectGit)
      .set({
        copyPendingSince: sql`coalesce(${projectGit.copyPendingSince}, now())`,
      })
      .where(and(eq(projectGit.projectId, projectId), lt(projectGit.copiedGeneration, storeGeneration)));
  }

  public async backlog(): Promise<BacklogReading> {
    const [row] = await this.database
      .select({
        oldestPendingSince: sql<string | undefined>`min(${projectGit.copyPendingSince})`,
        lagGenerations: sql<string>`coalesce(max(greatest(${projectGit.generation} - ${projectGit.copiedGeneration}, 0)), 0)`,
        steady: sql<string>`count(*) filter (where ${projectGit.copyPendingSince} is not null)`,
        backfill: sql<string>`count(*) filter (where ${projectGit.copyPendingSince} is null and ${projectGit.generation} > ${projectGit.copiedGeneration})`,
        earliestLockedUntil: sql<
          string | undefined
        >`min(${projectGit.copyLockedUntil}) filter (where ${projectGit.copiedGeneration} > 0 and ${notTombstoned})`,
      })
      .from(projectGit)
      .innerJoin(project, eq(project.id, projectGit.projectId))
      .where(defaultAccount);
    const [lfs] = await this.database
      .select({ count: sql<string>`count(*)` })
      .from(projectGitLfsObject)
      .where(and(isNull(projectGitLfsObject.copiedAt), isNotNull(projectGitLfsObject.finalizedAt)));
    return {
      oldestPendingSince: row?.oldestPendingSince ? new Date(row.oldestPendingSince) : undefined,
      lagGenerations: Number(row?.lagGenerations ?? 0),
      steady: Number(row?.steady ?? 0),
      backfill: Number(row?.backfill ?? 0),
      lfsBacklog: Number(lfs?.count ?? 0),
      earliestLockedUntil: row?.earliestLockedUntil ? new Date(row.earliestLockedUntil) : undefined,
    };
  }
}
