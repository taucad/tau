/**
 * The service worker kill switch (progressive loading PL7): what a retiring worker does, kept apart from the worker
 * global so it is unit-tested without one. `service-worker-kill-switch.ts` binds it to the worker's lifecycle.
 *
 * A build with `TAU_SERVICE_WORKER_KILL_SWITCH=true` (`apps/ui/build-environment.ts`) ships this worker at
 * `/service-worker.js` instead of the web app's worker (`service-worker.ts`). A browser that has the web app's worker
 * fetches the new script on its next update check (every navigation, since `/service-worker.js` is never stored by the
 * browser or the CDN: `netlify.toml`, `server.ts`) and installs it. It skips waiting ({@link activateRetirement} runs
 * on `install`), so the browser activates it as soon as the worker it replaces has no event in flight, without waiting
 * for that worker's pages to close; a project page keeps one in flight, so there it activates when that page unloads
 * (Chrome, `service-worker-deploy.test.ts`). On `activate` it ({@link retireServiceWorker}) takes control of every open
 * page, so none is left on the worker it replaces, deletes every cache and the expiration database the web app's worker
 * owns, and unregisters. It has no `fetch` handler, so from the moment it activates every request reaches the network:
 * at the latest the second page load after the deploy is the live deploy's with no worker at all. One deploy of a
 * build without the switch restores the web app's worker.
 */
import { cachePrefix } from '#offline/pwa-messages.js';

/** The IndexedDB database Workbox's expiration plugin keeps its timestamps in (`workbox-expiration`'s `CacheTimestampsModel`). */
export const workboxExpirationDatabase = 'workbox-expiration';

/** The worker global, as far as the retirement uses it. */
export type RetiringWorkerScope = {
  readonly caches: Pick<CacheStorage, 'keys' | 'delete'>;
  readonly clients: { claim(): Promise<void> };
  readonly registration: { unregister(): Promise<boolean> };
  readonly indexedDB?: Pick<IDBFactory, 'deleteDatabase'>;
  skipWaiting(): Promise<void>;
};

/**
 * Whether a Cache Storage cache belongs to the web app's worker: its precache, runtime and asset caches and the retired
 * `/usage` worker's all start with the worker's prefix.
 *
 * @param name - The cache name.
 * @returns `true` for a cache the kill switch deletes.
 */
export const isWorkerCache = (name: string): boolean => name.startsWith(`${cachePrefix}-`);

/**
 * On `install`: skip waiting, so activation never waits for the pages of the worker being replaced to close.
 *
 * @param scope - The worker global.
 */
export const activateRetirement = async (scope: RetiringWorkerScope): Promise<void> => {
  await scope.skipWaiting();
};

/**
 * Delete an IndexedDB database, settling whether it was deleted, blocked or failed: a leftover timestamp table holds
 * no responses, so it never fails the retirement.
 */
const deleteDatabase = async (factory: Pick<IDBFactory, 'deleteDatabase'>, name: string): Promise<void> =>
  new Promise<void>((resolve) => {
    try {
      const request = factory.deleteDatabase(name);
      request.addEventListener('success', () => {
        resolve();
      });
      request.addEventListener('error', () => {
        resolve();
      });
      request.addEventListener('blocked', () => {
        resolve();
      });
    } catch {
      resolve();
    }
  });

/**
 * On `activate`: take every open page, delete the web app's worker's caches and its expiration database, then
 * unregister.
 *
 * @param scope - The worker global.
 * @returns The cache names deleted.
 */
export const retireServiceWorker = async (scope: RetiringWorkerScope): Promise<readonly string[]> => {
  await scope.clients.claim();
  const allNames = await scope.caches.keys();
  const names = allNames.filter((name) => isWorkerCache(name));
  await Promise.all(names.map(async (name) => scope.caches.delete(name)));
  if (scope.indexedDB !== undefined) {
    await deleteDatabase(scope.indexedDB, workboxExpirationDatabase);
  }
  await scope.registration.unregister();
  return names;
};
