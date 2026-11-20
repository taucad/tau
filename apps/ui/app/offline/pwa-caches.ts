/**
 * Which Cache Storage caches belong to the web app's service worker, and the page's cleanup of those no registration
 * owns (progressive loading PL7; FP3 of Brain `research/pl7-service-worker-staging-defects-blueprint.md`). Shared by the
 * worker, its kill switch (`service-worker-retire.ts`) and the page (`pwa-registration.ts`, `use-pwa.ts`): a module of
 * its own, importing only the cache names, named without "worker" because the server output check takes a chunk named
 * after a worker for a worker bundle (`check-server-output.mts`).
 */
import { assetCacheName, cachePrefix, preFixAssetCacheName, retiredCachePrefix } from '#offline/pwa-messages.js';

/**
 * Whether a Cache Storage cache is the retired `/usage` worker's (`tau-offline-shell-<version>`), which the web app's
 * worker deletes when it activates.
 *
 * @param name - The cache name.
 * @returns `true` for one of the retired worker's caches.
 */
export const isRetiredWorkerCache = (name: string): boolean => name.startsWith(retiredCachePrefix);

/**
 * Whether a Cache Storage cache belongs to the web app's worker or the retired `/usage` worker, and so goes with the
 * kill switch: Workbox's precache and runtime caches under the worker's prefix (`tau-precache-…`, `tau-runtime-…`), its
 * asset cache, and the retired worker's caches. Nothing else on the origin.
 *
 * @param name - The cache name.
 * @returns `true` for a cache the kill switch deletes.
 */
export const isWorkerCache = (name: string): boolean =>
  name.startsWith(`${cachePrefix}-precache-`) ||
  name.startsWith(`${cachePrefix}-runtime-`) ||
  name === assetCacheName ||
  name === preFixAssetCacheName ||
  isRetiredWorkerCache(name);

/**
 * Whether a Cache Storage cache is a pre-fix worker's (PL7 before FP3: Workbox's default `tau-precache-v2-<scope>`,
 * `tau-runtime-<scope>` and the unversioned `tau-assets`). A fixed worker that finds one replaces a pre-fix worker, so
 * it activates at once, and deletes them when it does.
 *
 * @param name - The cache name.
 * @returns `true` for a pre-fix worker's cache.
 */
export const isPreFixWorkerCache = (name: string): boolean =>
  name.startsWith(`${cachePrefix}-precache-v2-`) ||
  name.startsWith(`${cachePrefix}-runtime-`) ||
  name === preFixAssetCacheName;

/** Cache Storage as {@link deleteOrphanWorkerCaches} uses it. */
export type OrphanCacheStorage = Pick<CacheStorage, 'keys' | 'delete'>;

/**
 * Delete every worker cache when no worker is registered to own them: what a failed install, a retired worker's
 * in-flight fetch finishing after its retirement, or a cleared registration leaves behind (D11, FP3). The page calls it
 * only after it has found no registration.
 *
 * @param storage - The page's Cache Storage.
 * @returns The cache names deleted.
 */
export const deleteOrphanWorkerCaches = async (storage: OrphanCacheStorage): Promise<readonly string[]> => {
  const allNames = await storage.keys();
  const names = allNames.filter((name) => isWorkerCache(name));
  await Promise.all(names.map(async (name) => storage.delete(name)));
  return names;
};
