/**
 * The messages between the web app's service worker (`service-worker.ts`) and its pages
 * (`pwa-registration.ts`, `use-pwa.ts`): a module of its own, importing nothing, so the page's
 * interactive tier carries only these names.
 */

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
