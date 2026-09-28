import { createHash } from 'node:crypto';
import path from 'node:path';
import { orphanThresholdMilliseconds, retentionWindowMilliseconds } from '#api/git/store/limits.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import type { FaultInjector } from '#api/git/store/fault-points.js';

/**
 * `retired/<retiredAt epoch ms>-<pack file name>`: the record that a pack left
 * the live set at that instant (NI4, W13b). An empty object rather than a
 * manifest entry, so the manifest every request reads does not grow with the
 * number of compactions inside the retention window.
 *
 * The time is in the key, not the object's modification time, so it is the
 * committer's clock like every other timestamp the store keeps, and one pack
 * can carry several markers: a writer that marked it and then lost its race
 * leaves an older one, and the compaction that really retires it writes a
 * newer one. The newest marker is the one that counts, so a stale marker can
 * only ever lengthen a retention, never shorten it.
 *
 * @param packKey - The retired pack's key.
 * @param at - When it was retired.
 * @returns The marker's key.
 */
export const retirementMarkerKey = (packKey: string, at: Date): string =>
  `retired/${String(at.getTime())}-${path.posix.basename(packKey)}`;

const markerPattern = /^retired\/(\d+)-(pack-[\w.-]+\.pack)$/u;

/** Writes the markers for `packKeys`. Every one must land before the manifest that drops them is committed. */
export const markRetired = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  packKeys: readonly string[];
  at: Date;
}): Promise<void> => {
  const empty = new Uint8Array(new ArrayBuffer(0));
  const sha256 = createHash('sha256').update(empty).digest('base64');
  await Promise.all(
    args.packKeys.map(async (key) =>
      args.store.putObject(args.locator, retirementMarkerKey(key, args.at), empty, { contentLength: 0, sha256 }),
    ),
  );
};

/** Newest retirement time per pack key, and every marker key, from one listing of `retired/`. */
const readMarkers = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
): Promise<{ newest: Map<string, number>; markers: Array<{ key: string; pack: string; at: number }> }> => {
  const newest = new Map<string, number>();
  const markers: Array<{ key: string; pack: string; at: number }> = [];
  for await (const object of store.listObjects(locator, 'retired/')) {
    const match = markerPattern.exec(object.key);
    if (match?.[1] === undefined || match[2] === undefined) {
      continue;
    }
    const pack = `packs/${match[2]}`;
    const at = Number(match[1]);
    markers.push({ key: object.key, pack, at });
    newest.set(pack, Math.max(newest.get(pack) ?? 0, at));
  }
  return { newest, markers };
};

/**
 * The two deletion rules (NI4), applied by the lease holder that just
 * compacted. No scheduled job enumerates repositories to find garbage: the
 * worker lists its own prefix while it is already there (NI10).
 *
 * - A pack the committed manifest does not list, with a retirement marker,
 *   is deleted once its **newest** marker is older than the retention window.
 * - A pack the committed manifest does not list, with no marker, is an orphan
 *   (a committer that died after its upload), deleted once the object is
 *   older than the orphan threshold.
 *
 * **Never a conditional delete.** AR-A E8 showed MinIO ignoring `If-Match` on
 * DeleteObject, and W0b reproduced the same on R2, so a conditional delete is
 * not available on either backend under NI13. The fence is the manifest that
 * was just committed: every pack this function deletes is one that manifest
 * does not list, and it was durably committed before the first DELETE goes
 * out. A key no committed manifest lists can never become live again — only
 * the manifest a lease hydrated can carry a pack forward, and that lease loses
 * its compare-and-swap — so every marker that will ever exist for it was
 * written before that commit, and this listing sees them all.
 *
 * A pack's stored index (D33) is deleted with it and protected with it. An
 * expired marker is deleted too; the markers are keyed by time, so deleting an
 * old one can never remove a newer one a concurrent compaction just wrote.
 */
export const sweepRepository = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  /** The manifest that was just committed. Everything it lists is protected. */
  committed: Manifest;
  at: Date;
  faults?: FaultInjector;
}): Promise<SweepOutcome> => {
  const { store, locator } = args;
  const now = args.at.getTime();
  const live = new Set(args.committed.packs.map((pack) => pack.key));
  const { newest, markers } = await readMarkers(store, locator);
  const expired = (pack: string): boolean => now - (newest.get(pack) ?? now) > retentionWindowMilliseconds;

  const doomed: string[] = [];
  let retainedBytes = 0;
  for await (const object of store.listObjects(locator, 'packs/')) {
    const pack = object.key.endsWith('.idx') ? `${object.key.slice(0, -'.idx'.length)}.pack` : object.key;
    if (live.has(pack)) {
      continue;
    }
    const due = newest.has(pack)
      ? expired(pack)
      : object.modifiedAt !== undefined && now - object.modifiedAt.getTime() > orphanThresholdMilliseconds;
    if (due) {
      doomed.push(object.key);
    } else {
      retainedBytes += object.bytes;
    }
  }
  doomed.push(...markers.filter((marker) => now - marker.at > retentionWindowMilliseconds).map((marker) => marker.key));

  if (doomed.length > 0) {
    await args.faults?.('mid-sweep');
    await store.deleteObjects(locator, doomed);
  }
  return { deleted: doomed, retainedBytes };
};

/**
 * What one sweep did: the keys it deleted, and the bytes of packs (and their
 * indexes) the committed manifest no longer lists that it kept (D18, L6-F5) —
 * retired packs inside the retention window, and uploads too young to call
 * orphans. Real storage the plan does not charge.
 */
export type SweepOutcome = { readonly deleted: readonly string[]; readonly retainedBytes: number };
