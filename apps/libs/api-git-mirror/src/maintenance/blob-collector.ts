import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseType } from '@taucad/api-database';
import { blobRef } from '@taucad/api-database/schema';
import type { ObjectStorageService } from '@taucad/api-object-storage';
import { blobKeyFromSha256Hex } from '@taucad/api-object-storage/sha256';
import { assertSingletonProcessGroup } from '#maintenance/singleton.js';

/**
 * The zero-count blob collector (charter D10, north star "Publications and LFS
 * on the Same Discipline"): publications decrement `blob_ref.refcount` when
 * they are replaced or unpublished, and until now nothing removed the bytes.
 *
 * It touches the global content-addressed `blobs/` namespace only. Tenant
 * prefixes belong to the purge job and are unreachable from here.
 *
 * The `blob_ref` row is the fence, and the conditional `refcount = 0` delete
 * is what makes that fence hold: a publisher references a blob — upserting its
 * row inside the publication transaction, which holds the row lock — before it
 * relies on the bytes being there, so a row still at `refcount = 0` has no
 * in-flight publisher behind it, and a publisher that starts mid-pass blocks
 * this `DELETE` on its own row lock and then fails its `refcount = 0`
 * predicate. Only the blobs the delete returned are removed.
 *
 * **The transaction spans the byte deletion**, which is the other half of that
 * sentence (W4c review F1). With the delete committing on its own, a publisher
 * arriving between the row delete and the byte delete found no row to block on,
 * inserted a fresh one, saw the bytes still present and skipped its upload —
 * and then this pass removed them, leaving a committed publication pointing at
 * an object that is gone and a `refcount = 1` row nothing will ever revisit.
 * Holding the transaction open until the bytes are gone makes that publisher
 * wait on the deleted-but-uncommitted row, so it inserts afterwards, misses on
 * `headBlob`, and puts the bytes back.
 *
 * ponytail: no grace window and no `zeroed_at` column, because the ordering of
 * the two writers is the invariant rather than the timing.
 */

/** Blobs removed in one pass. Bounded so an operator run has a knowable cost. */
export const zeroCountBlobBatch = 500;

/**
 * Above this many unreferenced blobs a pass deletes nothing unless the operator
 * confirms it (`collect-blobs --confirm`). It is a human check on an
 * irreversible delete across both tiers, not a capacity limit, and it mirrors
 * the purge's object bound: the collector trusts `blob_ref` alone, so a bug or
 * a manual change that zeroes reference counts would otherwise turn the daily
 * pass into a quiet deleter of a batch of user content a day (R11). Steady
 * state unpublishes far fewer blobs than this between two daily passes.
 */
export const maxCollectedBlobsWithoutConfirmation = 500;

export type BlobCollectionResult = {
  /** Zero-count blobs this pass considered. */
  planned: readonly string[];
  /** Blobs whose row and bytes were removed. */
  collected: readonly string[];
  bytes: number;
  /** The backlog was above {@link maxCollectedBlobsWithoutConfirmation} and the run was not confirmed. */
  refused: boolean;
};

export type BlobCollectionArguments = {
  database: DatabaseType;
  driver: ObjectStorageService;
  batchSize?: number;
  /** The operator passed `--confirm`, allowing a pass above the bound. */
  confirm?: boolean;
  /** Overrides {@link maxCollectedBlobsWithoutConfirmation}; the suite lowers it. */
  blobBound?: number;
  dryRun?: boolean;
  report?: (line: string) => void;
};

export const collectZeroCountBlobs = async (args: BlobCollectionArguments): Promise<BlobCollectionResult> => {
  assertSingletonProcessGroup();

  const report = args.report ?? ((): void => undefined);
  const batch = args.batchSize ?? zeroCountBlobBatch;
  const bound =
    args.confirm === true ? Number.POSITIVE_INFINITY : (args.blobBound ?? maxCollectedBlobsWithoutConfirmation);
  // One row past the bound is enough to know the backlog is above it.
  const rows = await args.database.query.blobRef.findMany({
    where: eq(blobRef.refcount, 0),
    limit: Number.isFinite(bound) ? Math.max(batch, bound + 1) : batch,
  });
  const candidates = rows.slice(0, batch);

  const planned = candidates.map((candidate) => candidate.sha256);
  const plannedBytes = candidates.reduce((total, candidate) => total + Number(candidate.sizeBytes), 0);
  report(
    `blob collection plan: ${String(planned.length)}${rows.length > batch ? '+' : ''} unreferenced blobs, ${String(plannedBytes)} bytes`,
  );

  if (args.dryRun === true || planned.length === 0) {
    return { planned, collected: [], bytes: 0, refused: false };
  }

  if (rows.length > bound) {
    report(
      `refusing blob collection: more than ${String(bound)} unreferenced blobs is above the bound; check blob_ref, then re-run collect-blobs --confirm`,
    );
    return { planned, collected: [], bytes: 0, refused: true };
  }

  const removed = await args.database.transaction(async (transaction) => {
    const rows = await transaction
      .delete(blobRef)
      .where(and(inArray(blobRef.sha256, planned), eq(blobRef.refcount, 0)))
      .returning({ sha256: blobRef.sha256, sizeBytes: blobRef.sizeBytes });

    const deletable = rows.map((row) => blobKeyFromSha256Hex(row.sha256));
    if (deletable.length > 0) {
      // A blob's tier follows its publication's visibility, and a delete of a key
      // that is not there is not an error, so both tiers are swept. Inside the
      // transaction, so no publisher can observe "row gone, bytes present".
      await args.driver.deleteBlobs({ namespace: 'blobs', keys: deletable, tier: 'private' });
      await args.driver.deleteBlobs({ namespace: 'blobs', keys: deletable, tier: 'public' });
    }
    return rows;
  });

  const collected = removed.map((row) => row.sha256);

  const bytes = removed.reduce((total, row) => total + Number(row.sizeBytes), 0);
  report(`collected ${String(collected.length)} blobs, ${String(bytes)} bytes`);
  return { planned, collected, bytes, refused: false };
};
