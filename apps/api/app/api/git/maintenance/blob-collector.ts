import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseType } from '#database/database.service.js';
import { blobRef } from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex } from '#storage/sha256.utils.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

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
 * ponytail: no grace window and no `zeroed_at` column, because the ordering in
 * `publications.service` is the invariant rather than the timing.
 */

/** Blobs removed in one pass. Bounded so an operator run has a knowable cost. */
export const zeroCountBlobBatch = 500;

export type BlobCollectionResult = {
  /** Zero-count blobs this pass considered. */
  planned: readonly string[];
  /** Blobs whose row and bytes were removed. */
  collected: readonly string[];
  bytes: number;
};

export type BlobCollectionArguments = {
  database: DatabaseType;
  driver: ObjectStorageService;
  batchSize?: number;
  dryRun?: boolean;
  report?: (line: string) => void;
};

export const collectZeroCountBlobs = async (args: BlobCollectionArguments): Promise<BlobCollectionResult> => {
  assertSingletonProcessGroup();

  const report = args.report ?? ((): void => undefined);
  const candidates = await args.database.query.blobRef.findMany({
    where: eq(blobRef.refcount, 0),
    limit: args.batchSize ?? zeroCountBlobBatch,
  });

  const planned = candidates.map((candidate) => candidate.sha256);
  const plannedBytes = candidates.reduce((total, candidate) => total + Number(candidate.sizeBytes), 0);
  report(`blob collection plan: ${String(planned.length)} unreferenced blobs, ${String(plannedBytes)} bytes`);

  if (args.dryRun === true || planned.length === 0) {
    return { planned, collected: [], bytes: 0 };
  }

  const removed = await args.database
    .delete(blobRef)
    .where(and(inArray(blobRef.sha256, planned), eq(blobRef.refcount, 0)))
    .returning({ sha256: blobRef.sha256, sizeBytes: blobRef.sizeBytes });

  const collected = removed.map((row) => row.sha256);
  const keys = collected.map((sha256) => blobKeyFromSha256Hex(sha256));
  if (keys.length > 0) {
    // A blob's tier follows its publication's visibility, and a delete of a key
    // that is not there is not an error, so both tiers are swept.
    await args.driver.deleteBlobs({ namespace: 'blobs', keys, tier: 'private' });
    await args.driver.deleteBlobs({ namespace: 'blobs', keys, tier: 'public' });
  }

  const bytes = removed.reduce((total, row) => total + Number(row.sizeBytes), 0);
  report(`collected ${String(collected.length)} blobs, ${String(bytes)} bytes`);
  return { planned, collected, bytes };
};
