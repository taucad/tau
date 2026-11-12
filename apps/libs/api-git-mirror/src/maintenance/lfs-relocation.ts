import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@taucad/api-database/owner-lock';
import { withOwnerLock } from '@taucad/api-database/owner-lock';
import { assertActiveProjectLocked, assertProjectActive } from '@taucad/api-database/project-lifecycle';
import { project, projectGitLfsObject } from '@taucad/api-database/schema';
import type { HeadBlobResult, ObjectStorageService } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';

/*
 * Moved out of `lfs-keys.ts` (north star DC4): that module is on the API's
 * request path, and this one deletes the legacy key. Kept here, the delete is
 * reachable only from the maintenance image (`app/delete-reachability.test.ts`).
 * The `relocate-lfs` subcommand of `maintenance-command.ts` runs it through
 * `lfs-relocation-run.ts`.
 */

const objectContentType = 'application/octet-stream';

const mebibyte = 1024 * 1024;

/** The locked step's budget: a HEAD and a DELETE, well inside the 15 s idle-in-transaction limit. */
const lockedStepMilliseconds = 5000;

/**
 * How long one object's unlocked copy (or tenant re-hash) may take: a floor
 * for the round trips plus two seconds per MiB, so a 100 MiB object gets
 * about three and a half minutes.
 *
 * @param size - The object's reserved size in bytes.
 * @returns The budget in milliseconds.
 */
export const lfsRelocationCopyBudgetMilliseconds = (size: number): number => 10_000 + Math.ceil(size / mebibyte) * 2000;

/** The base64 SHA-256 and length of a streamed body, without holding it. */
const digestOf = async (body: Readable): Promise<{ sha256: string; size: number }> => {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array<ArrayBuffer>>) {
    hash.update(chunk);
    size += chunk.byteLength;
  }
  return { sha256: hash.digest('base64'), size };
};

/** Whether a tenant HEAD (asked with `checksum`) is not this reservation's bytes, when the HEAD alone can tell. */
const headContradicts = (head: HeadBlobResult, row: { readonly size: number }, expected: string): boolean =>
  head.size !== row.size || (head.checksumSha256 !== undefined && head.checksumSha256 !== expected);

/**
 * Moves one project's pre-D24 LFS objects under its owner's tenant prefix.
 *
 * A one-shot the go-live handbook runs per project, not a request path: reads
 * fall back to the legacy key on their own, so nothing breaks while this is
 * pending, and nothing breaks if it is interrupted — an object whose bytes are
 * already at the tenant key is finished by deleting the legacy key, and an
 * object with no legacy key is skipped.
 *
 * Each object goes in two steps. The copy (GET, hash, PUT with the checksum,
 * HEAD) runs outside any transaction under a size-proportional deadline, since
 * a large object would outlast the database's idle-in-transaction limit. Only
 * the short verify-and-delete runs under the owner lock: there the project must
 * still be active and the reservation still held, the tenant copy is HEADed
 * again, and only then is the legacy key deleted. A copy this call wrote for a
 * project deleted, or a reservation retired, while it was unlocked is removed
 * again under the lock, so a race leaves no orphan and never loses the legacy
 * bytes. A tenant copy an earlier run left is trusted only when its stored
 * SHA-256 is the `oid` or, with no stored checksum, its bytes hash to it.
 *
 * ponytail: one object at a time, whole object in memory, no multipart. The
 * inventory is small and the job runs once; if a tenant ever holds enough LFS
 * bytes for that to bind, the upgrade is a server-side copy in the driver
 * (`copyBlob` cannot cross a namespace today).
 *
 * @param dependencies - The database the reservations live in and the storage driver.
 * @param args - The owner and project to relocate.
 * @returns The `oid` of every object whose bytes this call moved.
 */
export const relocateLegacyLfsObjects = async (
  dependencies: { readonly database: Database; readonly storage: ObjectStorageService },
  args: { readonly ownerId: string; readonly projectId: string },
): Promise<{ moved: readonly string[] }> => {
  const { database, storage } = dependencies;
  await assertProjectActive(database, args.projectId);
  const [owner] = await database
    .select({ storageAccountId: project.storageAccountId })
    .from(project)
    .where(and(eq(project.id, args.projectId), eq(project.ownerId, args.ownerId)))
    .limit(1);
  if (owner === undefined || (owner.storageAccountId !== null && owner.storageAccountId !== storage.account.id)) {
    throw new Error('LFS relocation project storage account unavailable');
  }
  const rows = await database
    .select({ oid: projectGitLfsObject.oid, size: projectGitLfsObject.sizeBytes })
    .from(projectGitLfsObject)
    .where(eq(projectGitLfsObject.projectId, args.projectId));

  const moved: string[] = [];
  /* oxlint-disable no-await-in-loop -- one object at a time bounds this job's peak memory */
  for (const row of rows) {
    const [tenant, legacy] = lfsObjectLocations(args.ownerId, args.projectId, row.oid);
    const expected = Buffer.from(row.oid, 'hex').toString('base64');
    const held = await storage.headBlob({ ...legacy, signal: AbortSignal.timeout(lockedStepMilliseconds) });
    if (held === undefined) {
      continue;
    }

    // Unlocked: copy, or prove an earlier run's copy, under a deadline sized to the object.
    const copySignal = AbortSignal.timeout(lfsRelocationCopyBudgetMilliseconds(row.size));
    const alreadyThere = await storage.headBlob({ ...tenant, checksum: true, signal: copySignal });
    let wrote = false;
    if (alreadyThere === undefined) {
      const blob = await storage.getBlob({ ...legacy, signal: copySignal });
      // `buffer` concatenates into a fresh `ArrayBuffer`-backed Buffer; a cast, not a second copy of the object.
      const body = (await buffer(blob.body)) as Uint8Array<ArrayBuffer>;
      const digest = createHash('sha256').update(body).digest();
      if (digest.toString('hex') !== row.oid || body.byteLength !== row.size) {
        throw new Error(`legacy lfs object ${row.oid} of project ${args.projectId} does not match its reservation`);
      }
      await storage.putBlob({
        ...tenant,
        signal: copySignal,
        body,
        contentType: objectContentType,
        checksumSha256: expected,
      });
      wrote = true;
      const written = await storage.headBlob({ ...tenant, checksum: true, signal: copySignal });
      if (written === undefined || headContradicts(written, row, expected)) {
        throw new Error(`relocated lfs object ${row.oid} of project ${args.projectId} did not store its bytes`);
      }
    } else if (alreadyThere.size !== row.size) {
      /* An interrupted earlier run: the legacy key is the only copy that is
         still known to be right, so it is kept and the operator is told. */
      throw new Error(
        `lfs object ${row.oid} of project ${args.projectId} is already at the tenant key with ${String(alreadyThere.size)} bytes, not ${String(row.size)}`,
      );
    } else if (alreadyThere.checksumSha256 === undefined) {
      // No whole-object checksum (a writer that sent none, or a multipart composite): hash the bytes.
      const copied = await storage.getBlob({ ...tenant, signal: copySignal });
      const stored = await digestOf(copied.body);
      if (stored.sha256 !== expected || stored.size !== row.size) {
        throw new Error(
          `lfs object ${row.oid} of project ${args.projectId} is already at the tenant key with other bytes`,
        );
      }
    } else if (alreadyThere.checksumSha256 !== expected) {
      throw new Error(
        `lfs object ${row.oid} of project ${args.projectId} is already at the tenant key with another stored SHA-256`,
      );
    }

    // Locked: still active, still reserved, the copy still there; only then the legacy delete.
    const deleted = await withOwnerLock(database, args.ownerId, async (transaction) => {
      const signal = AbortSignal.timeout(lockedStepMilliseconds);
      try {
        // A relocation copy/delete is a writer, even though the ordinary LFS fallback is read-only.
        await assertActiveProjectLocked(transaction, args.projectId);
      } catch (error) {
        if (wrote) {
          await storage.deleteBlob({ ...tenant, signal });
        }
        throw error;
      }
      const [reserved] = await transaction
        .select({ oid: projectGitLfsObject.oid })
        .from(projectGitLfsObject)
        .where(and(eq(projectGitLfsObject.projectId, args.projectId), eq(projectGitLfsObject.oid, row.oid)))
        .limit(1);
      if (reserved === undefined) {
        // Retired while unlocked: retirement owns both keys now; take back only the copy this call made.
        if (wrote) {
          await storage.deleteBlob({ ...tenant, signal });
        }
        return false;
      }
      const copy = await storage.headBlob({ ...tenant, checksum: true, signal });
      if (copy === undefined || headContradicts(copy, row, expected)) {
        throw new Error(
          `relocated lfs object ${row.oid} of project ${args.projectId} changed before its legacy delete`,
        );
      }
      await storage.deleteBlob({ ...legacy, signal });
      return true;
    });
    if (deleted) {
      moved.push(row.oid);
    }
  }
  /* oxlint-enable no-await-in-loop -- end of the relocation loop */

  return { moved };
};
