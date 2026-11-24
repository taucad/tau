/**
 * The page side of the web app's service worker that every document carries (progressive loading PL7): when to start
 * the registration (`pwa-registration.ts`, loaded on demand, so the interactive tier carries only this), and safe
 * mode's departure from it.
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
import { buildId, queryLiveBuild, readServerVerdict, subscribeServerVerdict } from '#filesystem/build-skew.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { readReportedBuildFloor, subscribeReportedBuildFloor } from '#lib/build-identity.js';
import { isSafeModeRequested } from '#lib/boot-signals.js';
import { stopCachingMessageType } from '#offline/pwa-messages.js';

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
 * Ask an existing registration to fetch the retiring worker (kill switch), or, with none left, delete the worker caches
 * nothing owns. Never registers.
 */
export const checkForRetiringWorker = async (): Promise<void> => {
  try {
    const registration = await globalThis.navigator.serviceWorker.getRegistration();
    if (registration === undefined) {
      // Retired already: delete what no worker owns, such as the empty asset cache an in-flight fetch of the retired
      // worker re-created after it deleted its caches (FP3).
      if ('caches' in globalThis) {
        // Loaded here, off Home's critical tier: only a page with no registration needs it.
        const { deleteOrphanWorkerCaches } = await import('#offline/pwa-caches.js');
        await deleteOrphanWorkerCaches(globalThis.caches);
      }
      return;
    }
    await registration.update();
  } catch {
    // Offline or refused: the browser's next update check fetches the retiring worker.
  }
};

/** Project workspace routes: `/w/{workspace}/{project}` and its sub-routes. */
export const isWorkspacePath = (pathname: string): boolean => pathname.startsWith('/w/');

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

/** How long safe mode waits for the controlling worker to confirm it has stopped writing caches. Milliseconds. */
export const stopCachingTimeoutMilliseconds = 10_000;

/**
 * Ask the worker that controls this page to stop writing caches for the rest of its life (FP5), and wait for its
 * answer: it comes once no write of the worker can follow. A worker that predates the message never answers; the
 * wait then ends at the timeout.
 *
 * @param worker - The controlling worker.
 * @param timeoutMilliseconds - The longest wait.
 * @returns Whether the worker confirmed.
 */
export const stopWorkerCaching = async (
  worker: Pick<ServiceWorker, 'postMessage'>,
  timeoutMilliseconds = stopCachingTimeoutMilliseconds,
): Promise<boolean> => {
  const channel = new MessageChannel();
  try {
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, timeoutMilliseconds);
      channel.port1.addEventListener('message', () => {
        clearTimeout(timer);
        resolve(true);
      });
      channel.port1.start();
      worker.postMessage({ type: stopCachingMessageType }, [channel.port2]);
    });
  } finally {
    channel.port1.close();
  }
};

/**
 * Safe mode (`?safe=1`) under a worker: stop the controlling worker's cache writes, unregister every registration and
 * then delete the worker caches, so the next load reaches the network as if no worker were there (FP5). The worker
 * keeps controlling this page until it navigates, but writes nothing more, so the one sweep is final. A page in safe
 * mode registers nothing.
 */
export const leaveServiceWorker = async (): Promise<void> => {
  try {
    const { controller } = globalThis.navigator.serviceWorker;
    if (controller !== null) {
      await stopWorkerCaching(controller);
    }
    const registrations = await globalThis.navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => registration.unregister()));
    if ('caches' in globalThis) {
      // Loaded here, off Home's critical tier: only a page in safe mode needs it.
      const { deleteOrphanWorkerCaches } = await import('#offline/pwa-caches.js');
      await deleteOrphanWorkerCaches(globalThis.caches);
    }
  } catch {
    // Storage refused: the next safe-mode load tries again.
  }
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
    if (isSafeModeRequested(globalThis.location.search)) {
      // async-iife: bootstrap -- leaving the worker must never block safe mode's view.
      void leaveServiceWorker();
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
              buildFloor: { readReportedBuildFloor, subscribeReportedBuildFloor },
              /* No page shows the install outcome since the offline usage shell was retired (W12). */
              onInstallStatus: () => undefined,
              buildId,
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
