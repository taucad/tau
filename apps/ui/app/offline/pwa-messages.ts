/**
 * The messages between the web app's service worker (`service-worker.ts`) and its pages
 * (`pwa-registration.ts`, `use-pwa.ts`), and the cache-name prefix the worker and its kill switch
 * (`service-worker-retire.ts`) share: a module of its own, importing nothing, so the page's
 * interactive tier carries only these names and the kill switch's worker bundles nothing else.
 */

/** The cache-name prefix of every cache the worker owns (`setCacheNameDetails`). */
export const cachePrefix = 'tau';

/** The runtime cache the worker fills with immutable files on first use (`service-worker-routing.ts`). */
export const assetCacheName = `${cachePrefix}-assets`;

/**
 * The caches of the retired `/usage` worker (B5, `offline-shell-worker.js`, shipped up to PL7): one per shell version,
 * `tau-offline-shell-<version>`. Deleted when the web app's worker activates and by the kill switch.
 */
export const retiredCachePrefix = `${cachePrefix}-offline-shell-`;

/** Where the retired `/usage` worker was served (scope `/`); every PL7 build ships the retiring worker there. */
export const retiredServiceWorkerUrl = '/offline-shell-worker.js';

/** `type` of the message the page sends a waiting worker to activate it (workbox-window's `messageSkipWaiting`). */
export const skipWaitingMessageType = 'SKIP_WAITING';

/** `type` of every message the worker posts to its pages. */
export const serviceWorkerMessageType = 'tau-service-worker';

/** How an install ended, as the worker reports it to its pages. */
export type ServiceWorkerInstallStatus = 'ready' | 'failed' | 'quota-exceeded';

/** What the worker posts to its pages after an install. */
export type ServiceWorkerMessage = Readonly<{
  type: typeof serviceWorkerMessageType;
  status: ServiceWorkerInstallStatus;
  detail?: string;
}>;
