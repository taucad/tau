/**
 * The service worker kill switch's worker (progressive loading PL7): what `/service-worker.js` is in a build with
 * `TAU_SERVICE_WORKER_KILL_SWITCH=true` (`scripts/build-service-worker.ts`). It skips waiting, takes every open
 * page, deletes the web app's worker's caches and unregisters (`service-worker-retire.ts`), so one deploy retires a bad
 * worker. It registers no `fetch` handler: every request reaches the network.
 */
import { activateRetirement, retireServiceWorker } from '#offline/service-worker-retire.js';
import type { RetiringWorkerScope } from '#offline/service-worker-retire.js';

/** An `ExtendableEvent` (install, activate), which the DOM library does not declare. */
type LifecycleEvent = { waitUntil(promise: Promise<unknown>): void };

const scope = globalThis as unknown as RetiringWorkerScope & {
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEvent) => void): void;
};

scope.addEventListener('install', (event) => {
  event.waitUntil(activateRetirement(scope));
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(retireServiceWorker(scope));
});
