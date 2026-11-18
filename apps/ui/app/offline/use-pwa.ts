/**
 * The page side of the web app's service worker that every document carries (progressive loading PL7): when to start
 * the registration (`pwa-registration.ts`, loaded on demand, so the interactive tier carries only this), and
 * the last install outcome it heard, which the offline usage notice shows (`offline-shell.tsx`).
 *
 * **When.** Once the page has loaded and the main thread is idle, so the precache download never competes with the
 * requests a first visit needs. Inside a project workspace the registration only attaches to a worker an earlier page
 * installed (B-27, D-UI-26: installing there competed with the kernel, wasm and editor downloads of an opening
 * project); the visitor's next page outside it installs.
 *
 * Web builds only: `TAU_SERVICE_WORKER` is defined by `apps/ui/vite.config.ts` alone, so the desktop (`tau://`) and
 * `tau serve --ui` bundles, which boot offline from their packaged index fallback, never register anything.
 *
 * **Kill switch.** A build with `TAU_SERVICE_WORKER_KILL_SWITCH=true` (`TAU_SERVICE_WORKER` is `retired`) registers
 * nothing: its `/service-worker.js` is the retiring worker (`service-worker-kill-switch.ts`). The page only asks an
 * existing registration to check for it (`registration.update()`), so a page that loaded without the old worker (a
 * forced reload) still retires it; a page the old worker served gets it from the browser's own update check.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Topic } from '@taucad/events';
import { queryLiveBuild, readServerVerdict, subscribeServerVerdict } from '#filesystem/build-skew.js';
import { isDesktopTarget } from '#lib/build-target.js';
import type { ServiceWorkerInstallStatus } from '#offline/pwa-messages.js';

/** Longest wait for an idle period after load before registering anyway. Milliseconds. */
export const registerIdleLimit = 10_000;

/**
 * Whether this bundle registers the worker. Three gates: `PROD` (a dev server has no built worker),
 * `TAU_SERVICE_WORKER` (only the web build defines it; dotted access, since Vite substitutes `import.meta.env.X`
 * textually) and `isDesktopTarget()` (belt and braces for the Electron build).
 *
 * @returns `true` in a production web bundle.
 */
export const isServiceWorkerBuild = (): boolean =>
  import.meta.env.PROD && import.meta.env.TAU_SERVICE_WORKER === 'enabled' && !isDesktopTarget();

/**
 * Whether this bundle ships the kill switch: a production web bundle whose `/service-worker.js` retires the worker.
 *
 * @returns `true` in a production web bundle built with `TAU_SERVICE_WORKER_KILL_SWITCH=true`.
 */
export const isServiceWorkerRetiredBuild = (): boolean =>
  import.meta.env.PROD && import.meta.env.TAU_SERVICE_WORKER === 'retired' && !isDesktopTarget();

/**
 * Ask an existing registration to fetch the retiring worker (kill switch). Never registers.
 */
const checkForRetiringWorker = async (): Promise<void> => {
  try {
    const registration = await globalThis.navigator.serviceWorker.getRegistration();
    await registration?.update();
  } catch {
    // Offline or refused: the browser's next update check fetches the retiring worker.
  }
};

/** Project workspace routes: `/w/{workspace}/{project}` and its sub-routes. */
export const isWorkspacePath = (pathname: string): boolean => pathname.startsWith('/w/');

let installStatus: ServiceWorkerInstallStatus | undefined;
const installStatusTopic = new Topic<void>({ name: 'service-worker-install-status' });

/**
 * Record an install outcome the worker or the registration reported.
 *
 * @param status - The outcome.
 */
const setInstallStatus = (status: ServiceWorkerInstallStatus): void => {
  installStatus = status;
  installStatusTopic.emit();
};

/** The last install outcome this page heard: an install or quota failure is shown, never swallowed. */
export const readInstallStatus = (): ServiceWorkerInstallStatus | undefined => installStatus;

/**
 * Subscribe to {@link readInstallStatus}.
 *
 * @param listener - Called after each change.
 * @returns Unsubscribes.
 */
export const subscribeInstallStatus = (listener: () => void): (() => void) => installStatusTopic.subscribe(listener);

/**
 * Run `start` once the page has loaded and the main thread is idle.
 *
 * @param start - Called once, after load and idle.
 * @returns Cancels a start that has not run yet.
 */
const afterLoadAndIdle = (start: () => void): (() => void) => {
  let cancelIdle: (() => void) | undefined;
  const scheduleIdle = (): void => {
    if ('requestIdleCallback' in globalThis) {
      const idleCallback = requestIdleCallback(start, { timeout: registerIdleLimit });
      cancelIdle = () => {
        cancelIdleCallback(idleCallback);
      };
      return;
    }
    const idleTimer = setTimeout(start, 0);
    cancelIdle = () => {
      clearTimeout(idleTimer);
    };
  };
  if (document.readyState === 'complete') {
    scheduleIdle();
  } else {
    globalThis.addEventListener('load', scheduleIdle, { once: true });
  }
  return () => {
    globalThis.removeEventListener('load', scheduleIdle);
    cancelIdle?.();
  };
};

/**
 * Start the service worker's registration from a page's document chrome (`offline-shell.tsx` and its self-host
 * variant) once the page is idle, and restart it when the visitor leaves or enters a project workspace.
 */
export function useServiceWorker(): void {
  const { pathname } = useLocation();
  const inWorkspace = isWorkspacePath(pathname);
  useEffect(() => {
    if (!('serviceWorker' in globalThis.navigator)) {
      return;
    }
    if (isServiceWorkerRetiredBuild()) {
      return afterLoadAndIdle(() => {
        // async-iife: bootstrap -- retiring must never block the view the visitor came for.
        void checkForRetiringWorker();
      });
    }
    if (!isServiceWorkerBuild()) {
      return;
    }
    let stop: (() => void) | undefined;
    let stopped = false;
    const cancelStart = afterLoadAndIdle(() => {
      // async-iife: bootstrap -- registering must never block the view the visitor came for.
      void (async () => {
        try {
          const { startServiceWorker } = await import('#offline/pwa-registration.js');
          if (!stopped) {
            stop = startServiceWorker({
              inWorkspace,
              verdict: { readServerVerdict, subscribeServerVerdict, queryLiveBuild },
              onInstallStatus: setInstallStatus,
            });
          }
        } catch {
          // The module did not load (a replaced build's chunk): the build-skew recovery owns that page.
        }
      })();
    });
    return () => {
      stopped = true;
      cancelStart();
      stop?.();
    };
  }, [inWorkspace]);
}
