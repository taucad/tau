import { and, count, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Database } from '@taucad/api-database/owner-lock';
import { project, projectDeletion, projectGitLfsObject } from '@taucad/api-database/schema';
import type { ObjectStorageService } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';
import type { LfsReservation } from '#maintenance/lfs-reservation-scope.js';
import { parseConcurrency } from '#maintenance/lfs-reservation-scope.js';

/*
 * The existing-object inventory: before production trusts the store-reported
 * SHA-256 of a tenant-key LFS object (`git-lfs.service.ts` `verify`, the
 * server-side publication copy), every such object's stored checksum is read
 * once and compared with its `oid`. Read-only: HEADs and SELECTs, no lock, no
 * write. Its scope is the reservation rows (`project_git_lfs_object`) of active
 * projects in the driver's storage account; it lists no bucket, so bytes with
 * no row are not seen.
 */

/** One reservation, with the owner its tenant key is under. */
export type LfsIntegrityRow = LfsReservation;

/**
 * Where a reservation's bytes are and what the store says about them.
 *
 * At the tenant key, four outcomes: `equal` (the stored SHA-256 is the
 * `oid`'s digest), `absent` (no whole-object checksum: a writer that sent
 * none), `composite` (a multipart checksum, never trusted) and `different` (a
 * stored checksum that is not the `oid`: the case the trust would refuse, and
 * the one to quarantine). Otherwise `legacy` (only the pre-D24 key, the
 * relocation's input), `unfinalized` (neither key, and the upload never
 * finished: nothing was promised) or `missing` (neither key for a finalized
 * reservation: lost bytes).
 */
export type LfsIntegrityOutcome = 'equal' | 'absent' | 'composite' | 'different' | 'legacy' | 'unfinalized' | 'missing';

/** Fields every per-object line carries. Ids and digests only. */
type LfsIntegrityObjectLine = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly oid: string;
  readonly key: string;
};

/** One object whose stored checksum is not its `oid`. */
export type LfsIntegrityDifference = LfsIntegrityObjectLine & {
  readonly event: 'revisions_maintenance.lfs_integrity_different';
  readonly storedSha256: string;
  readonly size: number;
  readonly storedSize: number;
};

/** One tenant object whose stored length is not the reservation's, whatever its checksum. */
export type LfsIntegritySizeMismatch = LfsIntegrityObjectLine & {
  readonly event: 'revisions_maintenance.lfs_integrity_size_mismatch';
  readonly outcome: LfsIntegrityOutcome;
  readonly size: number;
  readonly storedSize: number;
};

/** One object whose HEAD failed; it is in no other count. */
export type LfsIntegrityError = Omit<LfsIntegrityObjectLine, 'key'> & {
  readonly event: 'revisions_maintenance.lfs_integrity_error';
  readonly error: string;
};

/** Reservations the scope leaves out, counted so the summary says what it did not read. */
export type LfsIntegrityExclusions = {
  /** Rows of active projects in another storage account. */
  readonly skippedOtherAccount: number;
  /** Rows of projects with a `project_deletion` row. */
  readonly deletedProjectRows: number;
};

/** The run's last line. */
export type LfsIntegritySummary = LfsIntegrityExclusions & {
  readonly event: 'revisions_maintenance.lfs_integrity';
  readonly scope: 'reservation rows of active projects in this storage account; no bucket listing';
  readonly interrupted: boolean;
  readonly objects: number;
  readonly tenant: {
    readonly equal: number;
    readonly absent: number;
    readonly composite: number;
    readonly different: number;
  };
  readonly legacy: number;
  /** Reservations with bytes at neither key whose upload never finished. */
  readonly unfinalized: number;
  /** Finalized reservations with bytes at neither key. */
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
export const parseLfsIntegrityConcurrency = (value: string | undefined): number =>
  parseConcurrency(value, lfsIntegrityConcurrency);

/**
 * How many reservations the inventory's scope leaves out, by reason.
 *
 * @param database - The database the reservations live in.
 * @param args - The driver's storage account.
 * @returns The rows of deleted projects, and of active projects in another account.
 */
export const lfsIntegrityExclusions = async (
  database: Database,
  args: { readonly accountId: string },
): Promise<LfsIntegrityExclusions> => {
  const [deleted] = await database
    .select({ rows: count() })
    .from(projectGitLfsObject)
    .innerJoin(projectDeletion, eq(projectDeletion.projectId, projectGitLfsObject.projectId));
  const [elsewhere] = await database
    .select({ rows: count() })
    .from(projectGitLfsObject)
    .innerJoin(project, eq(project.id, projectGitLfsObject.projectId))
    .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
    .where(
      and(
        isNull(projectDeletion.projectId),
        isNotNull(project.storageAccountId),
        ne(project.storageAccountId, args.accountId),
      ),
    );
  return { skippedOtherAccount: Number(elsewhere?.rows ?? 0), deletedProjectRows: Number(deleted?.rows ?? 0) };
};

/**
 * Classifies one reservation by its stored bytes, with HEADs only.
 *
 * @param storage - The storage driver.
 * @param row - The reservation.
 * @returns The outcome, and the lines to report for a `different` checksum or a size mismatch.
 */
export const inspectLfsObject = async (
  storage: Pick<ObjectStorageService, 'headBlob'>,
  row: LfsIntegrityRow,
): Promise<{
  outcome: LfsIntegrityOutcome;
  sizeMismatch?: LfsIntegritySizeMismatch;
  difference?: LfsIntegrityDifference;
}> => {
  const [tenant, legacy] = lfsObjectLocations(row.ownerId, row.projectId, row.oid);
  const stored = await storage.headBlob({ ...tenant, checksum: true, signal: AbortSignal.timeout(5000) });
  if (stored === undefined) {
    const held = await storage.headBlob({ ...legacy, signal: AbortSignal.timeout(5000) });
    if (held !== undefined) {
      return { outcome: 'legacy' };
    }
    return { outcome: row.finalized ? 'missing' : 'unfinalized' };
  }
  const line = {
    ownerId: row.ownerId,
    projectId: row.projectId,
    oid: row.oid,
    key: `${tenant.namespace}/${tenant.key}`,
  };
  let outcome: LfsIntegrityOutcome;
  if (stored.checksumComposite === true) {
    outcome = 'composite';
  } else if (stored.checksumSha256 === undefined) {
    outcome = 'absent';
  } else if (stored.checksumSha256 === Buffer.from(row.oid, 'hex').toString('base64')) {
    outcome = 'equal';
  } else {
    outcome = 'different';
  }
  return {
    outcome,
    ...(stored.size === row.size
      ? {}
      : {
          sizeMismatch: {
            event: 'revisions_maintenance.lfs_integrity_size_mismatch',
            ...line,
            outcome,
            size: row.size,
            storedSize: stored.size,
          },
        }),
    ...(outcome === 'different' && stored.checksumSha256 !== undefined
      ? {
          difference: {
            event: 'revisions_maintenance.lfs_integrity_different',
            ...line,
            storedSha256: Buffer.from(stored.checksumSha256, 'base64').toString('hex'),
            size: row.size,
            storedSize: stored.size,
          },
        }
      : {}),
  };
};

/**
 * The `lfs-integrity` run: classify every reservation, `concurrency` HEADs at
 * a time, report each `different`, size-mismatched or failed object as its own
 * line and end with the counts. A failed HEAD is counted under `errors` and the
 * run goes on. A stop signal is checked before each row: in-flight HEADs
 * finish and no row starts after it. If reporting a line throws, every worker
 * stops, the ones in flight settle, and the error is rethrown without a
 * summary; an object is counted once, whether or not its line was written.
 *
 * @param dependencies - The reservation pages, the storage driver and the scope's exclusions.
 * @param options - The HEAD concurrency, the line sink and a stop signal.
 * @returns The run's summary, which is also reported as the last line.
 */
export const inventoryLfsIntegrity = async (
  dependencies: {
    readonly pages: AsyncIterable<readonly LfsIntegrityRow[]>;
    readonly storage: Pick<ObjectStorageService, 'headBlob'>;
    readonly exclusions: () => Promise<LfsIntegrityExclusions>;
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
    unfinalized: 0,
    missing: 0,
  };
  let objects = 0;
  let sizeMismatch = 0;
  let errors = 0;
  const progressEvery = options.progressEvery ?? 5000;
  /** The first line that could not be written; it stops every worker. */
  let fault: { readonly error: unknown } | undefined;
  const stopped = (): boolean => fault !== undefined || options.signal?.aborted === true;

  const totals = () => ({
    objects,
    tenant: { equal: counts.equal, absent: counts.absent, composite: counts.composite, different: counts.different },
    legacy: counts.legacy,
    unfinalized: counts.unfinalized,
    missing: counts.missing,
    sizeMismatch,
    errors,
  });

  const inspect = async (row: LfsIntegrityRow): Promise<void> => {
    // Count first, report after: a line that fails to write never re-counts its object.
    const lines: string[] = [];
    try {
      const inspected = await inspectLfsObject(dependencies.storage, row);
      counts[inspected.outcome] += 1;
      if (inspected.difference !== undefined) {
        lines.push(JSON.stringify(inspected.difference));
      }
      if (inspected.sizeMismatch !== undefined) {
        sizeMismatch += 1;
        lines.push(JSON.stringify(inspected.sizeMismatch));
      }
    } catch (error) {
      errors += 1;
      const line: LfsIntegrityError = {
        event: 'revisions_maintenance.lfs_integrity_error',
        ownerId: row.ownerId,
        projectId: row.projectId,
        oid: row.oid,
        error: error instanceof Error ? error.message : String(error),
      };
      lines.push(JSON.stringify(line));
    }
    objects += 1;
    if (objects % progressEvery === 0) {
      lines.push(JSON.stringify({ event: 'revisions_maintenance.lfs_integrity_progress', ...totals() }));
    }
    for (const line of lines) {
      // oxlint-disable-next-line no-await-in-loop -- one object's lines in order
      await options.report(line);
    }
  };

  /** `concurrency` workers draining one page, each checking the stop before its next row. */
  const inspectPage = async (page: readonly LfsIntegrityRow[]): Promise<void> => {
    const queue = [...page];
    const worker = async (): Promise<void> => {
      try {
        for (let row = queue.shift(); row !== undefined && !stopped(); row = queue.shift()) {
          // oxlint-disable-next-line no-await-in-loop -- each worker inspects its next row when it is free
          await inspect(row);
        }
      } catch (error) {
        fault ??= { error };
      }
    };
    // Workers never reject, so every in-flight HEAD settles before the page ends.
    await Promise.all(Array.from({ length: Math.min(options.concurrency, page.length) }, worker));
  };

  /* oxlint-disable no-await-in-loop -- one page at a time bounds memory; HEADs within it run in parallel */
  for await (const page of dependencies.pages) {
    if (stopped()) {
      break;
    }
    await inspectPage(page);
  }
  /* oxlint-enable no-await-in-loop -- end of the page loop */
  if (fault !== undefined) {
    throw fault.error;
  }

  const summary: LfsIntegritySummary = {
    event: 'revisions_maintenance.lfs_integrity',
    scope: 'reservation rows of active projects in this storage account; no bucket listing',
    interrupted: options.signal?.aborted === true,
    ...totals(),
    ...(await dependencies.exclusions()),
  };
  await options.report(JSON.stringify(summary));
  return summary;
};
