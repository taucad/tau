import { TauMetrics } from '@taucad/telemetry';
import { count, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { project, projectDeletion, projectGit } from '#database/schema.js';
import { repositoryByteCeiling } from '#api/git/store/limits.js';
import type { AccountingFigures, AccountingObservation } from '#api/storage-accounting/accounting-figures.js';

/**
 * Usage by plan, the fleet's repository sizes and quota bands (W14 OB3, catalogue N43–N47), from Tau's
 * own accounting: R2 reports per bucket only, and every owner shares one prefix tree (Finding 6).
 *
 * Two aggregate reads an hour: one row per owner that stores anything, and one row of filtered counts
 * over live repositories. Owner ids stay inside this module; the figures carry only enums.
 */

type StoragePlan = AccountingObservation<'storageUsageRepositories'>['attributes']['tau.plan'];
type QuotaBand = AccountingObservation<'storageQuotaOwners'>['attributes']['band'];
type SizeBound = AccountingObservation<'gitRepositorySizeDistribution'>['attributes']['tau.size_le'];
type CeilingThreshold = AccountingObservation<'gitRepositoryCeilingProximity'>['attributes']['threshold'];

const plans = TauMetrics.storageUsageRepositories.attributes.shape['tau.plan'].options as readonly StoragePlan[];
const bands = TauMetrics.storageQuotaOwners.attributes.shape.band.options as readonly QuotaBand[];
const sizeBounds = TauMetrics.gitRepositorySizeDistribution.attributes.shape['tau.size_le']
  .options as readonly SizeBound[];
const ceilingThresholds = TauMetrics.gitRepositoryCeilingProximity.attributes.shape.threshold
  .options as readonly CeilingThreshold[];

/** The classes Tau's accounting holds; `compute` (OB7) and `mirror` (the copier, OB6) report elsewhere. */
const accountedClasses = ['repository', 'lfs', 'retained'] as const;

/** One owner's account-wide storage and the plan it counts under. */
export type OwnerUsage = {
  readonly ownerId: string;
  readonly plan: StoragePlan;
  /** The plan allowance in bytes, as `GitRepositoryService.authorize` enforces it (D16). */
  readonly limitBytes: number;
  /** Pack bytes of live projects (`project_git.storage_bytes`). */
  readonly repositoryBytes: number;
  readonly lfsBytes: number;
  /** Retired packs still in retention, and a deleted project's bytes until purge (D18); never charged. */
  readonly retainedBytes: number;
  /** Hosted repositories of live projects. */
  readonly repositories: number;
};

/** Live repositories at or below each size bound, and at or above each fraction of the 1 GiB ceiling. */
export type RepositorySizeCounts = {
  /** One count per bound of `tau.size_le`, in the registry's order. */
  readonly atOrBelow: readonly number[];
  /** One count per `threshold`, in the registry's order. */
  readonly atOrAboveCeilingFraction: readonly number[];
};

/**
 * Which band of its allowance an owner's charged bytes fall in. At the allowance a push is already
 * refused (`remainingBytes` is 0), so that counts as `over`; bytes held under no allowance (a lapsed
 * plan) are `over` too.
 *
 * @param usedBytes - Repository plus LFS bytes; retained bytes are never charged.
 * @param limitBytes - The plan allowance.
 * @returns The band.
 */
export const quotaBandOf = (usedBytes: number, limitBytes: number): QuotaBand => {
  if (limitBytes <= 0) {
    return usedBytes > 0 ? 'over' : 'lt50';
  }
  const share = usedBytes / limitBytes;
  return share >= 1 ? 'over' : share >= 0.95 ? '95_100' : share >= 0.8 ? '80_95' : share >= 0.5 ? '50_80' : 'lt50';
};

/**
 * Folds per-owner usage and the size counts into the usage gauges. Every plan, class and band is
 * present, zero when empty, so a panel shows a flat line rather than a gap.
 *
 * @param owners - Every owner that stores anything.
 * @param sizes - The fleet's repository size counts.
 * @returns The five usage gauges' figures.
 */
export const usageFigures = (owners: readonly OwnerUsage[], sizes: RepositorySizeCounts): AccountingFigures => {
  const bytes = new Map<string, number>();
  const repositories = new Map<StoragePlan, number>();
  const quota = new Map<string, number>();
  for (const owner of owners) {
    for (const [storageClass, value] of [
      ['repository', owner.repositoryBytes],
      ['lfs', owner.lfsBytes],
      ['retained', owner.retainedBytes],
    ] as const) {
      const key = `${storageClass}/${owner.plan}`;
      bytes.set(key, (bytes.get(key) ?? 0) + value);
    }
    repositories.set(owner.plan, (repositories.get(owner.plan) ?? 0) + owner.repositories);
    const key = `${owner.plan}/${quotaBandOf(owner.repositoryBytes + owner.lfsBytes, owner.limitBytes)}`;
    quota.set(key, (quota.get(key) ?? 0) + 1);
  }
  return {
    storageUsageBytes: accountedClasses.flatMap((storageClass) =>
      plans.map((plan) => ({
        value: bytes.get(`${storageClass}/${plan}`) ?? 0,
        attributes: { 'tau.storage.class': storageClass, 'tau.plan': plan },
      })),
    ),
    storageUsageRepositories: plans.map((plan) => ({
      value: repositories.get(plan) ?? 0,
      attributes: { 'tau.plan': plan },
    })),
    storageQuotaOwners: plans.flatMap((plan) =>
      bands.map((band) => ({
        value: quota.get(`${plan}/${band}`) ?? 0,
        attributes: { 'tau.plan': plan, band },
      })),
    ),
    gitRepositorySizeDistribution: sizeBounds.map((bound, index) => ({
      value: sizes.atOrBelow[index] ?? 0,
      attributes: { 'tau.size_le': bound },
    })),
    gitRepositoryCeilingProximity: ceilingThresholds.map((threshold, index) => ({
      value: sizes.atOrAboveCeilingFraction[index] ?? 0,
      attributes: { threshold },
    })),
  };
};

/** An owner's plan and allowance, from the commercial entitlements `authorize` reads. */
export type ResolvePlan = (ownerId: string) => Promise<{ readonly plan: StoragePlan; readonly limitBytes: number }>;

/** Owners whose plans resolve at once; the entitlements read is a few indexed queries each. */
const planConcurrency = 4;

/**
 * Reads the usage figures: account-wide totals per owner, counted exactly as `readOwnerUsage` counts them
 * (a deleted project's bytes are retained until its purge), and the size counts over live repositories.
 *
 * @param database - The Drizzle database.
 * @param resolvePlan - Each owner's plan and allowance.
 * @returns The five usage gauges' figures.
 */
export const readUsage = async (database: DatabaseType, resolvePlan: ResolvePlan): Promise<AccountingFigures> => {
  const live = isNull(projectDeletion.deletedAt);
  const [ownerRows, [sizeRow]] = await Promise.all([
    database
      .select({
        ownerId: project.ownerId,
        repositoryBytes: sql<string>`coalesce(sum(${projectGit.storageBytes}) filter (where ${live}), 0)`,
        lfsBytes: sql<string>`coalesce(sum(${projectGit.lfsBytes}) filter (where ${live}), 0)`,
        retainedBytes: sql<string>`coalesce(sum(case when ${live} then ${projectGit.retainedBytes} else ${projectDeletion.retainedBytes} end), 0)`,
        repositories: sql<number>`(count(${projectGit.projectId}) filter (where ${live}))::int`,
      })
      .from(project)
      .leftJoin(projectGit, eq(projectGit.projectId, project.id))
      .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
      .groupBy(project.ownerId)
      .having(sql`count(${projectGit.projectId}) > 0 or coalesce(sum(${projectDeletion.retainedBytes}), 0) > 0`),
    database
      .select({
        atOrBelow: sql<number[]>`array[${sql.join(
          sizeBounds.map((bound): SQL => {
            const filter = bound === '+Inf' ? sql`true` : sql`${projectGit.storageBytes} <= ${Number(bound)}`;
            return sql`(${count()} filter (where ${filter}))::int`;
          }),
          sql`, `,
        )}]`,
        atOrAboveCeilingFraction: sql<number[]>`array[${sql.join(
          ceilingThresholds.map(
            (threshold): SQL =>
              sql`(${count()} filter (where ${projectGit.storageBytes} >= ${Math.ceil(Number(threshold) * repositoryByteCeiling)}))::int`,
          ),
          sql`, `,
        )}]`,
      })
      .from(projectGit)
      .leftJoin(projectDeletion, eq(projectDeletion.projectId, projectGit.projectId))
      .where(live),
  ]);

  const owners: OwnerUsage[] = [];
  for (let start = 0; start < ownerRows.length; start += planConcurrency) {
    // oxlint-disable-next-line no-await-in-loop -- a few owners at a time keeps the entitlements reads light
    const batch = await Promise.all(
      ownerRows.slice(start, start + planConcurrency).map(async (row) => ({
        ownerId: row.ownerId,
        ...(await resolvePlan(row.ownerId)),
        repositoryBytes: Number(row.repositoryBytes),
        lfsBytes: Number(row.lfsBytes),
        retainedBytes: Number(row.retainedBytes),
        repositories: Number(row.repositories),
      })),
    );
    owners.push(...batch);
  }
  return usageFigures(owners, {
    atOrBelow: (sizeRow?.atOrBelow ?? []).map(Number),
    atOrAboveCeilingFraction: (sizeRow?.atOrAboveCeilingFraction ?? []).map(Number),
  });
};
