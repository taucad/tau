import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { and, eq } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { withOwnerLock } from '#database/owner-lock.js';
import { assertActiveProjectLocked, assertProjectActive } from '#database/project-lifecycle.js';
import { project, projectGitLfsObject } from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { lfsObjectLocations } from '#api/git/lfs-keys.js';

/*
 * Moved out of `lfs-keys.ts` unchanged (north star DC4): that module is on the
 * API's request path, and this one deletes the legacy key. Kept here, the
 * delete is reachable only from the maintenance image
 * (`app/storage/delete-reachability.test.ts`). It still has no subcommand
 * (go-live STO-7).
 */

const objectContentType = 'application/octet-stream';

/**
 * Moves one project's pre-D24 LFS objects under its owner's tenant prefix.
 *
 * A one-shot the go-live handbook runs per project, not a request path: reads
 * fall back to the legacy key on their own, so nothing breaks while this is
 * pending, and nothing breaks if it is interrupted — an object whose bytes are
 * already at the tenant key is finished by deleting the legacy key, and an
 * object with no legacy key is skipped.
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
  await assertProjectActive(dependencies.database, args.projectId);
  const [owner] = await dependencies.database
    .select({ storageAccountId: project.storageAccountId })
    .from(project)
    .where(and(eq(project.id, args.projectId), eq(project.ownerId, args.ownerId)))
    .limit(1);
  if (
    owner === undefined ||
    (owner.storageAccountId !== null && owner.storageAccountId !== dependencies.storage.account.id)
  ) {
    throw new Error('LFS relocation project storage account unavailable');
  }
  const rows = await dependencies.database
    .select({ oid: projectGitLfsObject.oid, size: projectGitLfsObject.sizeBytes })
    .from(projectGitLfsObject)
    .where(eq(projectGitLfsObject.projectId, args.projectId));

  const moved: string[] = [];
  /* oxlint-disable no-await-in-loop -- one object at a time bounds this job's peak memory */
  for (const row of rows) {
    await withOwnerLock(dependencies.database, args.ownerId, async (transaction) => {
      // A relocation copy/delete is a writer, even though the ordinary LFS fallback is read-only.
      await assertActiveProjectLocked(transaction, args.projectId);
      const signal = AbortSignal.timeout(5000);
      const [tenant, legacy] = lfsObjectLocations(args.ownerId, args.projectId, row.oid);
      const held = await dependencies.storage.headBlob({ ...legacy, signal });
      if (held === undefined) {
        return;
      }
      const alreadyThere = await dependencies.storage.headBlob({ ...tenant, signal });
      if (alreadyThere === undefined) {
        const blob = await dependencies.storage.getBlob({ ...legacy, signal });
        const body = Uint8Array.from(await buffer(blob.body));
        const digest = createHash('sha256').update(body).digest();
        if (digest.toString('hex') !== row.oid || body.byteLength !== row.size) {
          throw new Error(`legacy lfs object ${row.oid} of project ${args.projectId} does not match its reservation`);
        }
        await dependencies.storage.putBlob({
          ...tenant,
          signal,
          body,
          contentType: objectContentType,
          checksumSha256: digest.toString('base64'),
        });
        const written = await dependencies.storage.headBlob({ ...tenant, signal });
        if (written?.size !== row.size) {
          throw new Error(`relocated lfs object ${row.oid} of project ${args.projectId} did not store its bytes`);
        }
      } else if (alreadyThere.size !== row.size) {
        /* An interrupted earlier run: the legacy key is the only copy that is
         still known to be right, so it is kept and the operator is told. */
        throw new Error(
          `lfs object ${row.oid} of project ${args.projectId} is already at the tenant key with ${String(alreadyThere.size)} bytes, not ${String(row.size)}`,
        );
      }
      await dependencies.storage.deleteBlob({ ...legacy, signal });
      moved.push(row.oid);
    });
  }
  /* oxlint-enable no-await-in-loop -- end of the relocation loop */

  return { moved };
};
