import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Database } from '@taucad/api-database/owner-lock';
import { project, projectDeletion, projectGitLfsObject } from '@taucad/api-database/schema';
import type { ObjectStorageService } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';

/*
 * Go-live STO-17's existing-object inventory: before production trusts the
 * store-reported SHA-256 of a tenant-key LFS object (`git-lfs.service.ts`
 * `verify`, W12.2's server-side publication copy), every such object's stored
 * checksum is read once and compared with its `oid`. Read-only: HEADs and
 * SELECTs, no lock, no write.
 */

/** One reservation, with the owner its tenant key is under. */
export type LfsIntegrityRow = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly oid: string;
  readonly size: number;
};

/**
 * Where a reservation's bytes are and what the store says about them.
 *
 * At the tenant key, the four STO-17 outcomes: `equal` (the stored SHA-256
 * is the `oid`'s digest), `absent` (no whole-object checksum: a writer that
 * sent none), `composite` (a multipart checksum, never trusted) and
 * `different` (a stored checksum that is not the `oid`: the case the trust
 * would refuse, and the one to quarantine). Otherwise `legacy` (only the
 * pre-D24 key, STO-7's input) or `missing` (neither key).
 */
export type LfsIntegrityOutcome = 'equal' | 'absent' | 'composite' | 'different' | 'legacy' | 'missing';

/** One object whose stored checksum is not its `oid`. Ids and digests only. */
export type LfsIntegrityDifference = {
  readonly event: 'revisions_maintenance.lfs_integrity_different';
  readonly ownerId: string;
  readonly projectId: string;
  readonly oid: string;
  readonly key: string;
  readonly storedSha256: string;
  readonly size: number;
  readonly storedSize: number;
};

/** The run's last line. */
export type LfsIntegritySummary = {
  readonly event: 'revisions_maintenance.lfs_integrity';
  readonly interrupted: boolean;
  readonly objects: number;
  readonly tenant: {
    readonly equal: number;
    readonly absent: number;
    readonly composite: number;
    readonly different: number;
  };
  readonly legacy: number;
  readonly missing: number;
  /** Tenant objects whose stored length is not the reservation's, whatever their checksum. */
  readonly sizeMismatch: number;
  /** HEADs that failed; their objects are in no other count. */
  readonly errors: number;
};

/** HEADs in flight; the inventory reads no bodies. */
export const lfsIntegrityConcurrency = { default: 8, max: 32 } as const;

/**
 * The inventory's HEAD concurrency, checked against its bound.
 *
 * @param value - The operator's `--concurrency`, or `undefined` for the default.
 * @returns The number of HEADs in flight.
 * @throws RangeError - When the value is not a whole number within the bound.
 */
export const parseLfsIntegrityConcurrency = (value: string | undefined): number => {
  if (value === undefined) {
    return lfsIntegrityConcurrency.default;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > lfsIntegrityConcurrency.max) {
    throw new RangeError(`--concurrency must be a whole number from 1 to ${String(lfsIntegrityConcurrency.max)}`);
  }
  return parsed;
};

const integrityPageSize = 500;

/**
 * Every reservation of an active project in `accountId` (or Tau's default
 * account), in `(projectId, oid)` order, in keyset pages.
 *
 * @param database - The database the reservations live in.
 * @param args - The driver's storage account.
 * @yields One page of rows at a time.
 */
export async function* lfsIntegrityPages(
  database: Database,
  args: { readonly accountId: string },
): AsyncGenerator<readonly LfsIntegrityRow[]> {
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
          cursor === undefined
            ? undefined
            : or(
                gt(projectGitLfsObject.projectId, cursor.projectId),
                and(eq(projectGitLfsObject.projectId, cursor.projectId), gt(projectGitLfsObject.oid, cursor.oid)),
              ),
        ),
      )
      .orderBy(asc(projectGitLfsObject.projectId), asc(projectGitLfsObject.oid))
      .limit(integrityPageSize);
    if (page.length > 0) {
      yield page;
    }
    if (page.length < integrityPageSize) {
      return;
    }
    const last = page.at(-1)!;
    cursor = { projectId: last.projectId, oid: last.oid };
  }
}

/**
 * Classifies one reservation by its stored bytes, with HEADs only.
 *
 * @param storage - The storage driver.
 * @param row - The reservation.
 * @returns The outcome, and for `different` the line to report.
 */
export const inspectLfsObject = async (
  storage: Pick<ObjectStorageService, 'headBlob'>,
  row: LfsIntegrityRow,
): Promise<{ outcome: LfsIntegrityOutcome; sizeMismatch: boolean; difference?: LfsIntegrityDifference }> => {
  const [tenant, legacy] = lfsObjectLocations(row.ownerId, row.projectId, row.oid);
  const stored = await storage.headBlob({ ...tenant, checksum: true, signal: AbortSignal.timeout(5000) });
  if (stored === undefined) {
    const held = await storage.headBlob({ ...legacy, signal: AbortSignal.timeout(5000) });
    return { outcome: held === undefined ? 'missing' : 'legacy', sizeMismatch: false };
  }
  const sizeMismatch = stored.size !== row.size;
  if (stored.checksumComposite === true) {
    return { outcome: 'composite', sizeMismatch };
  }
  if (stored.checksumSha256 === undefined) {
    return { outcome: 'absent', sizeMismatch };
  }
  if (stored.checksumSha256 === Buffer.from(row.oid, 'hex').toString('base64')) {
    return { outcome: 'equal', sizeMismatch };
  }
  return {
    outcome: 'different',
    sizeMismatch,
    difference: {
      event: 'revisions_maintenance.lfs_integrity_different',
      ownerId: row.ownerId,
      projectId: row.projectId,
      oid: row.oid,
      key: `${tenant.namespace}/${tenant.key}`,
      storedSha256: Buffer.from(stored.checksumSha256, 'base64').toString('hex'),
      size: row.size,
      storedSize: stored.size,
    },
  };
};

/**
 * The `lfs-integrity` run: classify every reservation, `concurrency` HEADs at
 * a time, report each `different` object as its own line and end with the
 * counts. A failed HEAD is counted under `errors` and the run goes on; a
 * stop signal ends it after the page in flight.
 *
 * @param dependencies - The reservation pages and the storage driver.
 * @param options - The HEAD concurrency, the line sink and a stop signal.
 * @returns The run's summary, which is also reported as the last line.
 */
export const inventoryLfsIntegrity = async (
  dependencies: {
    readonly pages: AsyncIterable<readonly LfsIntegrityRow[]>;
    readonly storage: Pick<ObjectStorageService, 'headBlob'>;
  },
  options: {
    readonly concurrency: number;
    readonly report: (line: string) => Promise<void>;
    readonly signal?: AbortSignal;
    /** Reports a progress line after this many objects. */
    readonly progressEvery?: number;
  },
): Promise<LfsIntegritySummary> => {
  const counts: Record<LfsIntegrityOutcome, number> = {
    equal: 0,
    absent: 0,
    composite: 0,
    different: 0,
    legacy: 0,
    missing: 0,
  };
  let objects = 0;
  let sizeMismatch = 0;
  let errors = 0;
  const progressEvery = options.progressEvery ?? 5000;

  const totals = () => ({
    objects,
    tenant: { equal: counts.equal, absent: counts.absent, composite: counts.composite, different: counts.different },
    legacy: counts.legacy,
    missing: counts.missing,
    sizeMismatch,
    errors,
  });

  const inspect = async (row: LfsIntegrityRow): Promise<void> => {
    try {
      const inspected = await inspectLfsObject(dependencies.storage, row);
      counts[inspected.outcome] += 1;
      sizeMismatch += inspected.sizeMismatch ? 1 : 0;
      if (inspected.difference !== undefined) {
        await options.report(JSON.stringify(inspected.difference));
      }
    } catch {
      errors += 1;
    }
    objects += 1;
    if (objects % progressEvery === 0) {
      await options.report(JSON.stringify({ event: 'revisions_maintenance.lfs_integrity_progress', ...totals() }));
    }
  };

  /** `concurrency` workers draining one page. */
  const inspectPage = async (page: readonly LfsIntegrityRow[]): Promise<void> => {
    const queue = [...page];
    const worker = async (): Promise<void> => {
      for (let row = queue.shift(); row !== undefined; row = queue.shift()) {
        // oxlint-disable-next-line no-await-in-loop -- each worker inspects its next row when it is free
        await inspect(row);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency, page.length) }, worker));
  };

  /* oxlint-disable no-await-in-loop -- one page at a time bounds memory; HEADs within it run in parallel */
  for await (const page of dependencies.pages) {
    if (options.signal?.aborted === true) {
      break;
    }
    await inspectPage(page);
  }
  /* oxlint-enable no-await-in-loop -- end of the page loop */

  const summary: LfsIntegritySummary = {
    event: 'revisions_maintenance.lfs_integrity',
    interrupted: options.signal?.aborted === true,
    ...totals(),
  };
  await options.report(JSON.stringify(summary));
  return summary;
};
