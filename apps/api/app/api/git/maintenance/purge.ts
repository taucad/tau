import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { storageTombstone, user } from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { isProjectRepositoryId } from '#api/git/git.constants.js';
import { commitTombstone } from '#api/git/store/commit.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

/**
 * The purge job: the **only** caller of prefix deletion in this codebase
 * (charter D31, S5, S10).
 *
 * Everything about its shape is that containment. With no bucket versioning,
 * no object lock and no independent copy until DG1, an unbounded prefix delete
 * is the one irrecoverable action Tau can take, so it gets the narrowest path
 * the design can give it:
 *
 * - it runs only in the singleton `revisions-maintenance` group, asserted here
 *   and not only in the command (D21);
 * - it acts only on an owner with a `storage_tombstone` row whose window has
 *   passed — no request path, no project id, no argument reaches the delete;
 * - it skips any owner whose `user` row still exists, because a tombstone is
 *   written before the account cascade and nothing in the codebase removes a
 *   stale one: a live owner with a due tombstone is a defect to report, never
 *   a tenant to delete;
 * - it refuses an owner id `isProjectRepositoryId` would not accept, the same
 *   guard every other store call passes through (NI15);
 * - it lists and prints a plan before it removes anything;
 * - above a bounded object count it refuses without `--confirm <ownerId>`;
 * - it writes the manifest tombstone first, so any lease still in flight is
 *   fenced before its bytes go (NI12);
 * - it records what it removed on the tombstone row.
 *
 * It never reads a project row: the tombstone deliberately outlives the
 * cascade that removed them, so the repositories an owner had are discovered
 * from the storage prefix itself, which is also the only place bytes can hide.
 */

/**
 * Above this many objects an owner is not purged without being named on the
 * command line. It is a human check on an irreversible action, not a capacity
 * limit: a repository at the 1 GiB ceiling holds a handful of packs, so five
 * figures of objects under one owner means either a very large tenant or a
 * wrong owner id, and both deserve a person looking at the plan first.
 */
export const maxPurgeObjectsWithoutConfirmation = 10_000;

/** The two authoritative prefixes an owner has (D24). Nothing else is tenant-scoped. */
const tenantPrefixes = (ownerId: string): readonly string[] => [`${ownerId}/repos/`, `${ownerId}/lfs/`];

export type TenantPurgePlan = {
  ownerId: string;
  prefixes: readonly string[];
  objects: number;
  bytes: number;
  /** Discovered from the `repos/` prefix, because the project rows are already gone. */
  projectIds: readonly string[];
};

export type TenantPurgeOutcome = {
  ownerId: string;
  status: 'purged' | 'planned' | 'refused' | 'live-owner';
  /** Objects the store no longer holds, measured after the delete. */
  deleted: number;
  /** Absent when the owner was skipped before anything was listed. */
  plan?: TenantPurgePlan;
};

export type PurgeArguments = {
  database: DatabaseType;
  driver: ObjectStorageService;
  /** Writes the manifest tombstone. Defaults to the S3 adapter over `driver`. */
  store?: RepositoryStore;
  /** Restricts the pass to these owners (`purge --owner <id>`). Absent means every due tombstone. */
  ownerIds?: readonly string[];
  now?: () => Date;
  /** The owner the operator typed after `--confirm`, allowing a plan above the bound. */
  confirmOwnerId?: string;
  dryRun?: boolean;
  /** Overrides {@link maxPurgeObjectsWithoutConfirmation}; the suite lowers it. */
  objectBound?: number;
  report?: (line: string) => void;
};

/**
 * Which of `ownerIds` still have a `user` row.
 *
 * `storage_tombstone.owner_id` and `user.id` are the same id space
 * (`project.owner_id` references `user.id`), and the tombstone is written in
 * `deleteUser.beforeDelete` — *before* the delete it precedes, which can still
 * fail. So a due tombstone does not by itself prove the account is gone, and
 * this is the independent check that it is. Shared with `mark-erasure`, which
 * must refuse for the same reason.
 */
export const liveOwnerIds = async (database: DatabaseType, ownerIds: readonly string[]): Promise<Set<string>> => {
  if (ownerIds.length === 0) {
    return new Set();
  }

  const rows = await database.query.user.findMany({
    columns: { id: true },
    where: inArray(user.id, [...ownerIds]),
  });
  return new Set(rows.map((row) => row.id));
};

/**
 * Lists what a purge would remove. One listing per prefix, and the same
 * listing yields the project ids, so planning costs what the delete would have
 * cost to enumerate anyway.
 */
export const planTenantPurge = async (driver: ObjectStorageService, ownerId: string): Promise<TenantPurgePlan> => {
  const prefixes = tenantPrefixes(ownerId);
  const projectIds = new Set<string>();
  let objects = 0;
  let bytes = 0;

  for (const prefix of prefixes) {
    // oxlint-disable-next-line no-await-in-loop -- two prefixes, and a listing is paginated anyway
    for await (const object of driver.listObjects({ namespace: 'tenants', keyPrefix: prefix, tier: 'private' })) {
      objects += 1;
      bytes += object.bytes;
      // `<ownerId>/repos/<projectId>/…`; anything shallower is not a repository.
      const projectId = object.key.split('/')[2];
      if (prefix.endsWith('/repos/') && projectId !== undefined && projectId !== '') {
        projectIds.add(projectId);
      }
    }
  }

  return { ownerId, prefixes, objects, bytes, projectIds: [...projectIds].sort() };
};

/**
 * Purges every tenant whose tombstone is due.
 *
 * The window is read twice on purpose: SQL narrows to the rows the index can
 * find, and the same rule is applied again against the injected clock, so the
 * one condition that authorizes deletion is visible in the code that deletes
 * rather than only in a query.
 */
// oxlint-disable-next-line max-lines-per-function -- one guarded sequence per tenant; splitting it hides the order that makes it safe
export const purgeTombstonedTenants = async (args: PurgeArguments): Promise<readonly TenantPurgeOutcome[]> => {
  assertSingletonProcessGroup();

  const at = (args.now ?? (() => new Date()))();
  const bound = args.objectBound ?? maxPurgeObjectsWithoutConfirmation;
  const store = args.store ?? new S3RepositoryStore(args.driver);
  const report = args.report ?? ((): void => undefined);

  const due = await args.database.query.storageTombstone.findMany({
    where: and(
      isNull(storageTombstone.purgedAt),
      or(eq(storageTombstone.erasure, true), lte(storageTombstone.purgeAfter, at)),
      ...(args.ownerIds === undefined ? [] : [inArray(storageTombstone.ownerId, [...args.ownerIds])]),
    ),
  });

  const live = await liveOwnerIds(
    args.database,
    due.map((tombstone) => tombstone.ownerId),
  );

  const outcomes: TenantPurgeOutcome[] = [];
  for (const tombstone of due) {
    const { ownerId } = tombstone;
    if (!tombstone.erasure && tombstone.purgeAfter > at) {
      continue;
    }

    if (live.has(ownerId)) {
      report(`skipping ${ownerId}: the tombstone is due but the account still exists; investigate before purging`);
      outcomes.push({ ownerId, status: 'live-owner', deleted: 0 });
      continue;
    }

    if (!isProjectRepositoryId(ownerId)) {
      report(`refusing '${ownerId}': not a storable identifier, so it cannot name a tenant prefix`);
      outcomes.push({ ownerId, status: 'refused', deleted: 0 });
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- one tenant at a time; a failure stops the pass
    const plan = await planTenantPurge(args.driver, ownerId);
    report(
      `purge plan ${ownerId}: ${String(plan.objects)} objects, ${String(plan.bytes)} bytes, ${String(plan.projectIds.length)} repositories under ${plan.prefixes.join(' and ')}`,
    );

    if (args.dryRun === true) {
      outcomes.push({ ownerId, status: 'planned', deleted: 0, plan });
      continue;
    }

    if (plan.objects > bound && args.confirmOwnerId !== ownerId) {
      report(
        `refusing ${ownerId}: ${String(plan.objects)} objects is above the ${String(bound)}-object bound; re-run with --confirm ${ownerId}`,
      );
      outcomes.push({ ownerId, status: 'refused', deleted: 0, plan });
      continue;
    }

    for (const projectId of plan.projectIds) {
      // oxlint-disable-next-line no-await-in-loop -- the fence is written per repository, before any delete
      await commitTombstone({
        store,
        locator: repositoryLocator({ ownerId, projectId }),
        committedBy: `purge:${ownerId}`,
        erasureVerified: tombstone.erasure,
        at,
      });
    }

    for (const prefix of plan.prefixes) {
      // oxlint-disable-next-line no-await-in-loop -- sequential so a failure stops at a prefix boundary
      await args.driver.deleteEntirePrefixForPurgeJob({
        namespace: 'tenants',
        keyPrefix: prefix,
        tier: 'private',
      });
    }

    /*
     * What the store no longer holds, not what was listed or submitted: D31
     * asks the job to record what it removed, and the only honest source for
     * that is a second listing. It is one request against a prefix that should
     * now be empty, and a non-zero remainder is visible in the report line.
     */
    // oxlint-disable-next-line no-await-in-loop -- the measurement belongs to this tenant's delete
    const remaining = await planTenantPurge(args.driver, ownerId);
    const deleted = plan.objects - remaining.objects;
    const bytes = plan.bytes - remaining.bytes;

    // oxlint-disable-next-line no-await-in-loop -- the record follows its own tenant's delete
    await args.database
      .update(storageTombstone)
      .set({ purgedAt: at, purgedObjects: deleted, purgedBytes: bytes })
      .where(eq(storageTombstone.ownerId, ownerId));

    report(
      `purged ${ownerId}: ${String(deleted)} objects, ${String(bytes)} bytes${remaining.objects === 0 ? '' : `, ${String(remaining.objects)} objects still present`}`,
    );
    outcomes.push({ ownerId, status: 'purged', deleted, plan });
  }

  return outcomes;
};
