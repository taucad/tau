import { and, eq, gt, isNull, lte, min, or, sql, count } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { gitRouteFreeze, projectGitRoute } from '#database/schema.js';
import { defaultRepositoryStore, defaultRoute } from '#api/git/routing/route.js';
import type { RepositoryRoute, RepositoryStoreName } from '#api/git/routing/route.js';

/**
 * The route rows in Postgres (DW1, W10 R1). Plain functions over a Drizzle
 * database, so the API's guard, the maintenance command's global freeze and
 * DM2's migrator all read and write the same rows the same way.
 *
 * Every function treats an absent row as today's R2 store, unfrozen, which is
 * the whole of the "no backfill" rule: nothing has to be written before a
 * repository is served, only before it is moved.
 */

/** The one wider-than-a-repository freeze scope there is today. */
const globalScope = 'global';

/** W10 step 6: a switch needs this much of the freeze left, so no request admitted before it outlives it. */
const switchMarginMilliseconds = 2000;

type FreezeRow = Pick<typeof projectGitRoute.$inferSelect, 'frozenAt' | 'frozenUntil' | 'migrationId'>;

/** A freeze row whose lease has not lapsed at `now`, in the route's shape. */
const liveFreeze = (row: FreezeRow | undefined, now: Date): Omit<RepositoryRoute, 'store'> | undefined =>
  row?.frozenUntil === null || row?.frozenUntil === undefined || row.frozenUntil <= now
    ? undefined
    : {
        frozenUntil: row.frozenUntil,
        ...(row.frozenAt === null ? {} : { frozenAt: row.frozenAt }),
        ...(row.migrationId === null ? {} : { migrationId: row.migrationId }),
      };

/**
 * One repository's route: its own row, merged with the global freeze. Of two
 * live freezes the one that ends later is reported, because that is the one a
 * held request waits on.
 *
 * @param database - The Drizzle database.
 * @param projectId - The repository's project.
 * @param now - The clock the freeze leases are judged against.
 * @returns The route; {@link defaultRoute} when no row and no global freeze exist.
 */
export const readRoute = async (
  database: DatabaseType,
  projectId: string,
  now: Date = new Date(),
): Promise<RepositoryRoute> => {
  const [own, global] = await Promise.all([
    database
      .select({
        store: projectGitRoute.store,
        frozenAt: projectGitRoute.frozenAt,
        frozenUntil: projectGitRoute.frozenUntil,
        migrationId: projectGitRoute.migrationId,
      })
      .from(projectGitRoute)
      .where(eq(projectGitRoute.projectId, projectId))
      .limit(1),
    database
      .select({
        frozenAt: gitRouteFreeze.frozenAt,
        frozenUntil: gitRouteFreeze.frozenUntil,
        migrationId: gitRouteFreeze.migrationId,
      })
      .from(gitRouteFreeze)
      .where(eq(gitRouteFreeze.scope, globalScope))
      .limit(1),
  ]);
  const row = own[0];
  const store = row?.store ?? defaultRepositoryStore;
  const repositoryFreeze = liveFreeze(row, now);
  const globalFreeze = liveFreeze(global[0], now);
  const holding =
    globalFreeze !== undefined &&
    (repositoryFreeze === undefined || globalFreeze.frozenUntil! > repositoryFreeze.frozenUntil!)
      ? { ...globalFreeze, global: true }
      : repositoryFreeze;
  if (holding === undefined && store === defaultRepositoryStore) {
    return defaultRoute;
  }
  return { store, ...holding };
};

/**
 * Freezes one repository for `forMilliseconds` on behalf of `migrationId`
 * (W10 step 1). The freeze is a lease: a migrator that dies leaves it to lapse.
 * The holder may extend its own freeze, which keeps the original `frozen_at`
 * so the oldest-freeze gauge sees a migrator that keeps re-freezing.
 *
 * @param database - The Drizzle database.
 * @param args - The repository, the migration that freezes it, the lease length and the clock.
 * @returns `frozen` with the lease, or the migration that holds a live freeze already.
 */
export const freezeRoute = async (
  database: DatabaseType,
  args: {
    projectId: string;
    migrationId: string;
    forMilliseconds: number;
    now?: Date;
  },
): Promise<{ frozen: true; frozenAt: Date; frozenUntil: Date } | { frozen: false; heldBy: string }> => {
  const now = args.now ?? new Date();
  const frozenUntil = new Date(now.getTime() + args.forMilliseconds);
  /* A raw fragment binds a string, not a Date. */
  const stamp = sql`${now.toISOString()}::timestamptz`;
  const [row] = await database
    .insert(projectGitRoute)
    .values({
      projectId: args.projectId,
      frozenAt: now,
      frozenUntil,
      migrationId: args.migrationId,
    })
    .onConflictDoUpdate({
      target: projectGitRoute.projectId,
      set: {
        /* The holder extending its own live freeze keeps when it began. */
        frozenAt: sql`CASE WHEN ${projectGitRoute.migrationId} = ${args.migrationId} AND ${projectGitRoute.frozenUntil} > ${stamp} THEN ${projectGitRoute.frozenAt} ELSE ${stamp} END`,
        frozenUntil,
        migrationId: args.migrationId,
      },
      setWhere: or(
        isNull(projectGitRoute.frozenUntil),
        lte(projectGitRoute.frozenUntil, now),
        eq(projectGitRoute.migrationId, args.migrationId),
      ),
    })
    .returning({
      frozenAt: projectGitRoute.frozenAt,
      frozenUntil: projectGitRoute.frozenUntil,
    });
  if (row?.frozenAt && row.frozenUntil) {
    return {
      frozen: true,
      frozenAt: row.frozenAt,
      frozenUntil: row.frozenUntil,
    };
  }
  const [held] = await database
    .select({ migrationId: projectGitRoute.migrationId })
    .from(projectGitRoute)
    .where(eq(projectGitRoute.projectId, args.projectId))
    .limit(1);
  return { frozen: false, heldBy: held?.migrationId ?? 'unknown' };
};

/**
 * Lifts `migrationId`'s freeze on one repository without changing its store:
 * a failed gate, or an aborted cut-over (W10 step 5).
 *
 * @param database - The Drizzle database.
 * @param args - The repository and the migration that froze it.
 * @returns Whether that migration held the freeze and it is now lifted.
 */
export const unfreezeRoute = async (
  database: DatabaseType,
  args: { projectId: string; migrationId: string },
): Promise<boolean> => {
  const lifted = await database
    .update(projectGitRoute)
    .set({ frozenAt: null, frozenUntil: null, migrationId: null })
    .where(and(eq(projectGitRoute.projectId, args.projectId), eq(projectGitRoute.migrationId, args.migrationId)))
    .returning({ projectId: projectGitRoute.projectId });
  return lifted.length > 0;
};

/**
 * Points one repository at `store` and thaws it in the same write (W10 step
 * 6), only while `migrationId` still holds a freeze with at least 2 s left.
 *
 * @param database - The Drizzle database.
 * @param args - The repository, the migration, the store it now lives in and the clock.
 * @returns Whether the switch was written; false means unfreeze and retry later.
 */
export const switchRoute = async (
  database: DatabaseType,
  args: {
    projectId: string;
    migrationId: string;
    store: RepositoryStoreName;
    now?: Date;
  },
): Promise<boolean> => {
  const now = args.now ?? new Date();
  const switched = await database
    .update(projectGitRoute)
    .set({
      store: args.store,
      frozenAt: null,
      frozenUntil: null,
      migrationId: null,
    })
    .where(
      and(
        eq(projectGitRoute.projectId, args.projectId),
        eq(projectGitRoute.migrationId, args.migrationId),
        gt(projectGitRoute.frozenUntil, new Date(now.getTime() + switchMarginMilliseconds)),
      ),
    )
    .returning({ projectId: projectGitRoute.projectId });
  return switched.length > 0;
};

/**
 * Freezes every repository (the restore runbook's step 0, W13): pushes and
 * fetches to any repository are held, then answered 429 with `Retry-After`.
 * A second call replaces the first one's lease and reason.
 *
 * @param database - The Drizzle database.
 * @param args - The incident or restore id that holds it, the lease length and the clock.
 * @returns The lease written.
 */
export const freezeAll = async (
  database: DatabaseType,
  args: { migrationId: string; forMilliseconds: number; now?: Date },
): Promise<{ frozenAt: Date; frozenUntil: Date }> => {
  const now = args.now ?? new Date();
  const frozenUntil = new Date(now.getTime() + args.forMilliseconds);
  await database
    .insert(gitRouteFreeze)
    .values({
      scope: globalScope,
      frozenAt: now,
      frozenUntil,
      migrationId: args.migrationId,
    })
    .onConflictDoUpdate({
      target: gitRouteFreeze.scope,
      set: { frozenAt: now, frozenUntil, migrationId: args.migrationId },
    });
  return { frozenAt: now, frozenUntil };
};

/**
 * Lifts the global freeze.
 *
 * @param database - The Drizzle database.
 * @returns Whether there was one.
 */
export const unfreezeAll = async (database: DatabaseType): Promise<boolean> => {
  const lifted = await database
    .delete(gitRouteFreeze)
    .where(eq(gitRouteFreeze.scope, globalScope))
    .returning({ scope: gitRouteFreeze.scope });
  return lifted.length > 0;
};

/** Live freezes in one scope: how many, and how long the oldest has held. */
export type FrozenScopeSummary = {
  readonly frozen: number;
  readonly oldestSeconds: number;
};

/**
 * What the OB5 gauges `tau.git.route.frozen` and `tau.git.route.frozen.oldest`
 * report, by scope. Repository ids never leave this function.
 *
 * @param database - The Drizzle database.
 * @param now - The clock the leases are judged against.
 * @returns Per-repository and global freezes that hold at `now`.
 */
export const readFrozenSummary = async (
  database: DatabaseType,
  now: Date = new Date(),
): Promise<{ repository: FrozenScopeSummary; global: FrozenScopeSummary }> => {
  const [[repositories], [global]] = await Promise.all([
    database
      .select({ frozen: count(), oldest: min(projectGitRoute.frozenAt) })
      .from(projectGitRoute)
      .where(gt(projectGitRoute.frozenUntil, now)),
    database
      .select({ frozen: count(), oldest: min(gitRouteFreeze.frozenAt) })
      .from(gitRouteFreeze)
      .where(gt(gitRouteFreeze.frozenUntil, now)),
  ]);
  const summarize = (row: typeof repositories | undefined): FrozenScopeSummary => ({
    frozen: row?.frozen ?? 0,
    oldestSeconds: row?.oldest ? Math.max(0, (now.getTime() - new Date(row.oldest).getTime()) / 1000) : 0,
  });
  return { repository: summarize(repositories), global: summarize(global) };
};
