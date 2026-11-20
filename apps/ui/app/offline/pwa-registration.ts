/**
 * Registers the web app's one service worker (progressive loading PL7, `service-worker.ts`) and applies its update rule
 * (ruling OD3) and its fleet rule (PL7 service worker staging defects blueprint, FP3). Loaded on demand by `use-pwa.ts`
 * once the page is idle. The page-side modules are named without "worker": the build checks (`check-server-output.mts`,
 * the warm manifest) take a chunk named after a worker for a worker bundle.
 *
 * **Update rule.** A new deploy's worker installs beside the active one and waits: the page keeps the worker and
 * precache it loaded with. It activates silently, with no reload, once the build-skew verdict (`build-skew.ts`, the
 * one owner of the server's answer) is `replaced`, so the next document load (a navigation `stale-build-navigation.ts`
 * turns into one, a reload, a new tab) gets the new deploy. A tab that never navigates is offered the reload by the
 * sidebar's update control, which shows as soon as the verdict is `replaced`; a reload asks the network first anyway.
 *
 * | Verdict | A worker is waiting | Action |
 * | --- | --- | --- |
 * | any | yes, of this page's own build | Activate it: the page already runs the build it serves (FP3) |
 * | `replaced` | yes | Activate it |
 * | `replaced` | no | Check for the new worker (`registration.update()`), once per verdict; it activates when installed |
 * | `unknown` | yes | Ask the server now (`queryLiveBuild`), so the rule can decide |
 * | `live`, or `unknown` with none | either | Nothing |
 *
 * A page reloaded under the previous worker is the next build's document (a reload asks the network first), so its
 * verdict is `live` and, before FP3, the next worker waited for the life of the tab (D6). The waiting worker reports
 * its build ({@link workerBuildMessageType}); when it is the page's, it activates.
 *
 * One exception: a waiting worker that would replace the retired `/usage` worker (`/offline-shell-worker.js`, which
 * ui@0.3.0 and earlier registered at the same scope) activates at once, whatever the verdict. That worker serves no
 * deploy the page could be on, and once this page registers `/service-worker.js` the browser checks only the new
 * script for updates, so the retiring worker every build ships at the old URL would never reach it: left to the rule,
 * the old worker would keep its pages and its caches for as long as a tab stays open.
 *
 * **Fleet rule** (FP3). An install that started and ended `redundant` (its worker never reached `installed`; a quota
 * error is one) counts against the registration, in this browser's storage; one that installs resets the count. After
 * {@link installFailureLimit} in a row the page unregisters and deletes the worker caches, so a browser whose installs
 * keep failing ends with no worker rather than a stale one. An update check that fails (offline) starts no install and
 * never counts. A page that finds no registration and no install in progress deletes worker caches no registration
 * owns (a failed first install leaves them, 7c), before it registers.
 */
import type { ServerVerdict } from '#filesystem/build-skew.js';
import {
  retiredServiceWorkerUrl,
  serviceWorkerMessageType,
  skipWaitingMessageType,
  workerBuildMessageType,
} from '#offline/pwa-messages.js';
import type { ServiceWorkerInstallStatus, ServiceWorkerMessage } from '#offline/pwa-messages.js';
import { isWorkerCache } from '#offline/service-worker-retire.js';

/** Where the build writes the worker (`scripts/build-service-worker.ts`); its scope is the whole origin. */
export const serviceWorkerUrl = '/service-worker.js';

/** Installs that may fail in a row before the page retires the registration (FP3). */
export const installFailureLimit = 3;

/** Where this browser counts failed installs. */
export const installFailuresKey = 'tau-service-worker-install-failures';

/** Milliseconds a waiting worker has to report its build before the page decides without it. */
export const workerBuildTimeout = 2000;

/** What the page does about a new worker, by the rule in the file comment. */
export type UpdateAction = 'activate' | 'check-for-update' | 'ask-server' | 'none';

/**
 * The update rule (ruling OD3, with its exceptions).
 *
 * @param verdict - What the server last said about this build.
 * @param hasWaiting - Whether a newer worker is installed and waiting.
 * @param activatesAnyway - Whether the waiting worker activates whatever the verdict: it replaces the retired `/usage`
 *   worker, or it reported this page's own build (FP3).
 * @returns What to do.
 */
export const updateAction = (verdict: ServerVerdict, hasWaiting: boolean, activatesAnyway = false): UpdateAction => {
  if (hasWaiting && activatesAnyway) {
    return 'activate';
  }
  if (verdict === 'replaced') {
    return hasWaiting ? 'activate' : 'check-for-update';
  }
  return hasWaiting && verdict === 'unknown' ? 'ask-server' : 'none';
};

/**
 * The fleet rule's count after an install ended.
 *
 * @param previous - Failed installs in a row so far.
 * @param outcome - `installed` when the worker installed, `redundant` when an install that started never did.
 * @returns The new count, and whether the registration is to be retired.
 */
export const countInstall = (
  previous: number,
  outcome: 'installed' | 'redundant',
): Readonly<{ failures: number; retire: boolean }> => {
  const failures = outcome === 'installed' ? 0 : previous + 1;
  return { failures, retire: failures >= installFailureLimit };
};

const isServiceWorkerMessage = (data: unknown): data is ServiceWorkerMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === serviceWorkerMessageType;

const readFailures = (): number => {
  try {
    const stored = Number(globalThis.localStorage.getItem(installFailuresKey));
    return Number.isInteger(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
};

const writeFailures = (failures: number): void => {
  try {
    if (failures === 0) {
      globalThis.localStorage.removeItem(installFailuresKey);
    } else {
      globalThis.localStorage.setItem(installFailuresKey, String(failures));
    }
  } catch {
    // Storage refused: the count restarts, which only delays the retirement.
  }
};

/** Delete every cache the web app's worker owns (the kill switch's set, `service-worker-retire.ts`). */
const deleteWorkerCaches = async (): Promise<void> => {
  try {
    const names = await globalThis.caches.keys();
    await Promise.all(names.filter((name) => isWorkerCache(name)).map(async (name) => globalThis.caches.delete(name)));
  } catch {
    // Storage unavailable: nothing to delete.
  }
};

/**
 * The build a waiting worker serves, as it reports it, or `undefined` when it does not answer in time (a worker
 * from before FP3 never does).
 */
const askWorkerBuild = async (worker: ServiceWorker): Promise<number | undefined> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(undefined);
    }, workerBuildTimeout);
    channel.port1.addEventListener('message', (event: MessageEvent) => {
      clearTimeout(timer);
      channel.port1.close();
      const build = (event.data as { build?: unknown } | undefined)?.build;
      resolve(typeof build === 'number' ? build : undefined);
    });
    channel.port1.start();
    worker.postMessage({ type: workerBuildMessageType }, [channel.port2]);
  });

/**
 * The build-skew verdict, as `build-skew.ts` exports it. Handed in by the caller, which already holds the module in the
 * interactive tier, so this module, loaded on demand, adds no edge to the page's static graph.
 */
export type VerdictSource = Readonly<{
  /** This page's build (`build-skew.ts` `buildId`); `0` for a bundle without one. */
  buildId: number;
  readServerVerdict: () => ServerVerdict;
  subscribeServerVerdict: (listener: () => void) => () => void;
  queryLiveBuild: () => Promise<void>;
}>;

/**
 * Register the worker (or, inside a workspace, attach to an existing registration) and apply the update and fleet
 * rules for as long as the page lives.
 *
 * @param options - Whether a project workspace is open, the build-skew verdict, and where install outcomes go.
 * @returns Stops listening; the registration itself stays.
 */
export const startServiceWorker = (
  options: Readonly<{
    inWorkspace: boolean;
    verdict: VerdictSource;
    onInstallStatus: (status: ServiceWorkerInstallStatus) => void;
  }>,
): (() => void) => {
  const { buildId, readServerVerdict, subscribeServerVerdict, queryLiveBuild } = options.verdict;
  if (!('serviceWorker' in globalThis.navigator)) {
    return () => undefined;
  }
  const container = globalThis.navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let checkedForVerdict = false;
  let stopped = false;
  /** The waiting worker whose build was asked, and its answer. */
  const askedBuilds = new WeakMap<ServiceWorker, number | undefined>();

  const applyRule = (): void => {
    if (registration === undefined || stopped) {
      return;
    }
    const verdict = readServerVerdict();
    if (verdict !== 'replaced') {
      checkedForVerdict = false;
    }
    const { waiting } = registration;
    if (waiting !== null && buildId !== 0 && !askedBuilds.has(waiting)) {
      askedBuilds.set(waiting, undefined);
      // async-iife: bootstrap -- the answer re-enters the rule.
      void (async () => {
        askedBuilds.set(waiting, await askWorkerBuild(waiting));
        applyRule();
      })();
    }
    const activeScript = registration.active?.scriptURL;
    const replacesRetiredWorker =
      activeScript !== undefined && new URL(activeScript).pathname === retiredServiceWorkerUrl;
    const servesPageBuild = waiting !== null && buildId !== 0 && askedBuilds.get(waiting) === buildId;
    const action = updateAction(verdict, waiting !== null, replacesRetiredWorker || servesPageBuild);
    if (action === 'activate') {
      waiting?.postMessage({ type: skipWaitingMessageType });
    } else if (action === 'check-for-update' && !checkedForVerdict) {
      checkedForVerdict = true;
      const current = registration;
      // async-iife: bootstrap -- a verdict listener cannot await; an installed worker re-enters through `statechange`.
      void (async () => {
        try {
          await current.update();
        } catch {
          // Offline: the rule waits for the next verdict change or the browser's own update check.
        }
      })();
    } else if (action === 'ask-server') {
      // async-iife: bootstrap -- the answer arrives through `subscribeServerVerdict`.
      void queryLiveBuild();
    }
  };

  const retire = async (current: ServiceWorkerRegistration): Promise<void> => {
    writeFailures(0);
    try {
      await current.unregister();
    } catch {
      // Already gone.
    }
    await deleteWorkerCaches();
    options.onInstallStatus('failed');
  };

  const watchInstalls = (current: ServiceWorkerRegistration): void => {
    // oxlint-disable-next-line typescript/no-restricted-types -- The platform's `installing` is `null` when absent.
    const watch = (worker: ServiceWorker | null): void => {
      if (worker === null) {
        return;
      }
      let counted = false;
      worker.addEventListener('statechange', () => {
        if (!counted && (worker.state === 'installed' || worker.state === 'redundant')) {
          counted = true;
          const { failures, retire: retiring } = countInstall(
            readFailures(),
            worker.state === 'installed' ? 'installed' : 'redundant',
          );
          writeFailures(failures);
          if (retiring) {
            // async-iife: bootstrap -- a state listener cannot await; the page keeps running without a worker.
            void retire(current);
            return;
          }
        }
        applyRule();
      });
    };
    watch(current.installing);
    current.addEventListener('updatefound', () => {
      watch(current.installing);
    });
  };

  const onMessage = (event: MessageEvent): void => {
    if (isServiceWorkerMessage(event.data)) {
      options.onInstallStatus(event.data.status);
    }
  };
  container.addEventListener('message', onMessage);
  const unsubscribeVerdict = subscribeServerVerdict(applyRule);

  const attach = async (): Promise<void> => {
    try {
      const existing = await container.getRegistration();
      if (existing === undefined) {
        // No registration and so no install in progress: any worker cache left is an orphan.
        await deleteWorkerCaches();
      }
      const current = options.inWorkspace ? existing : await container.register(serviceWorkerUrl);
      if (current === undefined || stopped) {
        return;
      }
      registration = current;
      watchInstalls(current);
      applyRule();
    } catch {
      options.onInstallStatus('failed');
    }
  };
  // async-iife: bootstrap -- the caller does not wait for the registration; failures surface as the install status.
  void attach();

  return () => {
    stopped = true;
    unsubscribeVerdict();
    container.removeEventListener('message', onMessage);
  };
};
