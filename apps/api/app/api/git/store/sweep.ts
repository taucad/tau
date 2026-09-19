import { orphanThresholdMilliseconds } from '#api/git/store/limits.js';
import { indexKeyFor } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import type { FaultInjector } from '#api/git/store/fault-points.js';

/**
 * The two deletion rules (NI4), applied by the lease holder that just
 * committed. No scheduled job enumerates repositories to find garbage: the
 * worker lists its own prefix while it is already there (NI10).
 *
 * **Never a conditional delete.** AR-A E8 showed MinIO ignoring `If-Match` on
 * DeleteObject, and W0b reproduced the same on R2, so a conditional delete is
 * not available on either backend under NI13. The fence is the manifest that
 * was just committed: every key this function deletes is a key that manifest
 * does not list, and it was durably committed before the first DELETE goes
 * out. Check-then-act against a manifest that has *not* been committed is the
 * unsafe shape E8 demonstrated.
 *
 * Unique keys (NI4) are what make that fence sufficient against a *concurrent*
 * committer. A committer names two kinds of key: ones it created in this
 * attempt, which no other worker can reproduce because of the upload nonce,
 * and ones it carried forward from the manifest it hydrated — whose survival
 * is guaranteed by the compare-and-swap, since a manifest that still lists
 * them could only be replaced by one whose writer also read them. What E8
 * killed was a sweep deleting a key a *retrying* worker had just re-created
 * under a reproducible content-addressed name; that name no longer exists.
 *
 * A pack's stored index (D33) is deleted with it and protected with it: an
 * `.idx` is not an independent object and must never be swept out from under
 * a live pack.
 */
export const sweepRepository = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  /** The manifest that was just committed. Everything it lists is protected. */
  committed: Manifest;
  /** Retired entries this commit dropped, each already past the retention window. */
  droppedRetired: readonly string[];
  at: Date;
  /** The orphan scan belongs to the compacting holder; an ordinary push skips it. */
  scanOrphans: boolean;
  faults?: FaultInjector;
}): Promise<readonly string[]> => {
  const doomed = args.droppedRetired.flatMap((key) => [key, indexKeyFor(key)]);

  if (args.scanOrphans) {
    const live = [...args.committed.packs.map((pack) => pack.key), ...args.committed.retired.map((one) => one.key)];
    const listed = new Set([...live, ...live.map((key) => indexKeyFor(key))]);
    for await (const object of args.store.listObjects(args.locator, 'packs/')) {
      if (listed.has(object.key) || object.modifiedAt === undefined) {
        continue;
      }
      if (args.at.getTime() - object.modifiedAt.getTime() > orphanThresholdMilliseconds) {
        doomed.push(object.key);
      }
    }
  }

  if (doomed.length === 0) {
    return [];
  }

  await args.faults?.('mid-sweep');
  await args.store.deleteObjects(args.locator, doomed);
  return doomed;
};
