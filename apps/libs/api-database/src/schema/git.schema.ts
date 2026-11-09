import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { project } from '#schema/projects.schema.js';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

/**
 * Storage accounting for one project's bare repository on the Tau Hosted
 * Remote (charter D15/D16, blueprint S25/S36). `storage_bytes` is the
 * repository directory as the API measured it after the last push;
 * `lfs_bytes` is the sum of that project's large objects in the private
 * bucket. Both are counted against the plan allowance by `pre-receive` and by
 * the LFS batch endpoint; a push over quota is refused whole (D17).
 */
export const projectGit = pgTable(
  'project_git',
  {
    projectId: text('project_id')
      .primaryKey()
      .references(() => project.id, { onDelete: 'cascade' }),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
    lfsBytes: bigint('lfs_bytes', { mode: 'number' }).notNull().default(0),
    /**
     * Bytes of packs a compaction retired that the store still keeps inside the
     * retention window (charter D18, L6-F5): real storage, never counted against
     * the plan. Written by the post-compaction sweep, which lists `packs/` anyway,
     * so it is exact after every sweep and only changes when a sweep runs.
     */
    retainedBytes: bigint('retained_bytes', { mode: 'number' }).notNull().default(0),
    /**
     * The manifest generation this row was last told about (D19). Derived state —
     * accounting, LFS marks, publications — is keyed to it, and any request that
     * sees `derived_generation` behind it re-derives. There is no reconcile job.
     */
    generation: bigint('generation', { mode: 'number' }).notNull().default(0),
    derivedGeneration: bigint('derived_generation', { mode: 'number' }).notNull().default(0),
    /**
     * The generation the B2 second copy holds (D11, W13 B4): the generation of the
     * newest snapshot `tau-mirror` wrote. Only the copier advances it, and only
     * monotonically (`greatest`), so two copiers never regress it.
     */
    copiedGeneration: bigint('copied_generation', { mode: 'number' }).notNull().default(0),
    /**
     * When the first generation the copy does not hold was recorded (W13 B4). Set
     * by the writer that advances `generation` (`coalesce`, so the oldest pending
     * time survives a burst) and cleared by the copier once it has caught up, so
     * `now() - min(copy_pending_since)` is the recovery point in force (B5).
     */
    copyPendingSince: timestamp('copy_pending_since', { withTimezone: true }),
    /**
     * The earliest Object Lock expiry among the newest snapshot and everything it
     * depends on (W13 B6). The daily retention sweep selects rows by it, so idle
     * repositories stay locked without listing B2.
     */
    copyLockedUntil: timestamp('copy_locked_until', { withTimezone: true }),
    /**
     * Hex SHA-256 of the snapshot bytes the copier wrote for `copied_generation`
     * (W13 B4, Finding 4): the restore trust root, which a B2 key cannot write.
     */
    copiedManifestSha256: text('copied_manifest_sha256'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    /* The copier's two work sets, each a partial index matching its `where` (mirror/watermark.ts). */
    index('project_git_copy_pending_idx')
      .on(table.copyPendingSince)
      .where(sql`${table.copyPendingSince} is not null`),
    index('project_git_copy_behind_idx')
      .on(table.projectId)
      .where(sql`${table.generation} > ${table.copiedGeneration}`),
    index('project_git_copy_locked_until_idx')
      .on(table.copyLockedUntil)
      .where(sql`${table.copyLockedUntil} is not null`),
  ],
);

/**
 * Which store serves one project's repository, and whether it is frozen
 * (Hosted Remote Storage DW1, W10 R1). Additive by construction: a project
 * with no row here, or a row whose columns hold their defaults, is served by
 * today's R2 store and is not frozen, so no backfill was ever needed.
 *
 * A sibling of `project_git` rather than three more columns on it: a route
 * row exists only for a repository a migration or a restore has touched, and
 * the route is read on every git request while `project_git` is rewritten on
 * every push, so the two never contend for one row.
 *
 * `frozen_until` is a lease, not a flag: a writer that dies leaves no
 * repository frozen for longer than the span it asked for (W10 step 1).
 * `migration_id` names the job that holds the freeze, so a second job cannot
 * thaw or switch a repository the first one froze.
 */
export const projectGitRoute = pgTable(
  'project_git_route',
  {
    projectId: text('project_id')
      .primaryKey()
      .references(() => project.id, { onDelete: 'cascade' }),
    store: text('store').notNull().default('r2'),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    frozenUntil: timestamp('frozen_until', { withTimezone: true }),
    migrationId: text('migration_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('project_git_route_frozen_until_idx').on(table.frozenUntil),
    check('project_git_route_store_check', sql`${table.store} IN ('r2')`),
    check(
      'project_git_route_freeze_check',
      sql`${table.frozenUntil} IS NULL OR (${table.frozenAt} IS NOT NULL AND ${table.migrationId} IS NOT NULL)`,
    ),
  ],
);

/**
 * A freeze wider than one repository (DW1): today only `global`, which the
 * restore runbook sets before a fleet restore so no client writes into a
 * store that is being rebuilt (W13 restore step 0). No row means no freeze.
 * `migration_id` carries the incident or restore id that holds it.
 */
export const gitRouteFreeze = pgTable(
  'git_route_freeze',
  {
    scope: text('scope').primaryKey(),
    frozenAt: timestamp('frozen_at', { withTimezone: true }).defaultNow().notNull(),
    frozenUntil: timestamp('frozen_until', { withTimezone: true }).notNull(),
    migrationId: text('migration_id').notNull(),
  },
  (table) => [check('git_route_freeze_scope_check', sql`${table.scope} IN ('global')`)],
);

/**
 * One quota reservation per project-scoped git-lfs object. A nullable
 * `finalized_at` means the upload URL was issued but exact bytes have not yet
 * been verified; those rows still count against quota until retention safely
 * reconciles abandoned uploads.
 */
export const projectGitLfsObject = pgTable(
  'project_git_lfs_object',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    oid: text('oid').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    /** First observation that no retained Git tree reaches this object. */
    unreachableAt: timestamp('unreachable_at', { withTimezone: true }),
    /** Latest admitted upload request; older rows fall back to their creation time. */
    lastRequestedAt: timestamp('last_requested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /** When `tau-mirror` verified this object into the B2 second copy (W13 B4); null until then. */
    copiedAt: timestamp('copied_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.oid] }),
    /* The copier's LFS backlog: finalized and not yet copied (mirror/lfs.ts). */
    index('project_git_lfs_object_copy_pending_idx')
      .on(table.projectId, table.finalizedAt)
      .where(sql`${table.copiedAt} is null and ${table.finalizedAt} is not null`),
    index('project_git_lfs_object_pending_idx').on(table.projectId, table.finalizedAt),
    /*
     * The retirement pass's two candidate sets, each as a partial index so the
     * pass reads only the rows it can act on rather than the whole table (W4b
     * review P3). Both predicates match `lfs-retirement.ts`'s own `where`
     * exactly; a mismatch would leave the index unused and the scan in place.
     */
    index('project_git_lfs_object_unreachable_idx')
      .on(table.unreachableAt)
      .where(sql`${table.unreachableAt} is not null`),
    index('project_git_lfs_object_unfinalized_idx')
      .on(sql`coalesce(${table.lastRequestedAt}, ${table.createdAt})`)
      .where(sql`${table.finalizedAt} is null`),
    check('project_git_lfs_object_size_nonnegative', sql`${table.sizeBytes} >= 0`),
  ],
);

/**
 * One weekly restore drill of the B2 second copy (W13 B10, DR2). The drill runs on
 * a one-off Machine that exits before a scrape can be relied on, so it records its
 * result here and the long-running `tau-mirror` process exports the drill metrics
 * from these rows. Written by DR2; created with DM1's migration (W13 B4).
 */
export const mirrorDrillRun = pgTable(
  'mirror_drill_run',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    environment: text('environment').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** `pass` or `fail`; null while the drill is running. */
    outcome: text('outcome'),
    /** The I2 checks that failed (`refs`, `fsck`, `lfs`, `push_log`, `generation_floor`, `refuse_erased`, `hidden_versions`). */
    failedChecks: text('failed_checks')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Restore seconds per size class (`small`, `median`, `large`). */
    durations: jsonb('durations').$type<Readonly<Record<string, number>>>().notNull().default({}),
    restoredBytes: bigint('restored_bytes', { mode: 'number' }).notNull().default(0),
  },
  (table) => [
    index('mirror_drill_run_environment_started_idx').on(table.environment, table.startedAt),
    check('mirror_drill_run_outcome_known', sql`${table.outcome} is null or ${table.outcome} in ('pass', 'fail')`),
  ],
);

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
