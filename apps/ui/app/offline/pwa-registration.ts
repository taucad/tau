/**
 * Registers the web app's one service worker (progressive loading PL7, `service-worker.ts`) and applies its update rule
 * (ruling OD3). Loaded on demand by `use-pwa.ts` once the page is idle. The page-side modules are named without
 * "worker": the build checks (`check-server-output.mts`, the warm manifest) take a chunk named after a worker for a
 * worker bundle.
 *
 * **Update rule.** A new deploy's worker installs beside the active one and waits: the page keeps the worker and
 * precache it loaded with. It activates silently, with no reload, once the build-skew verdict (`build-skew.ts`, the
 * one owner of the server's answer) is `replaced`, so the next document load (a navigation `stale-build-navigation.ts`
 * turns into one, a reload, a new tab) gets the new deploy. A tab that never navigates is offered the reload by the
 * sidebar's update control, which shows as soon as the verdict is `replaced`; a reload asks the network first anyway.
 *
 * | Verdict | A worker is waiting | Action |
 * | --- | --- | --- |
 * | `replaced` | yes | Activate it |
 * | `replaced` | no | Check for the new worker (`registration.update()`), once per verdict; it activates when installed |
 * | `unknown` | yes | Ask the server now (`queryLiveBuild`), so the rule can decide |
 * | `live`, or `unknown` with none | either | Nothing |
 *
 * One exception: a waiting worker that would replace the retired `/usage` worker (`/offline-shell-worker.js`, which
 * ui@0.3.0 and earlier registered at the same scope) activates at once, whatever the verdict. That worker serves no
 * deploy the page could be on, and once this page registers `/service-worker.js` the browser checks only the new
 * script for updates, so the retiring worker every build ships at the old URL would never reach it: left to the rule,
 * the old worker would keep its pages and its caches for as long as a tab stays open.
 */
import type { ServerVerdict } from '#filesystem/build-skew.js';
import { retiredServiceWorkerUrl, serviceWorkerMessageType, skipWaitingMessageType } from '#offline/pwa-messages.js';
import type { ServiceWorkerInstallStatus, ServiceWorkerMessage } from '#offline/pwa-messages.js';

/** Where the build writes the worker (`scripts/build-service-worker.ts`); its scope is the whole origin. */
export const serviceWorkerUrl = '/service-worker.js';

/** What the page does about a new worker, by the rule in the file comment. */
export type UpdateAction = 'activate' | 'check-for-update' | 'ask-server' | 'none';

/**
 * The update rule (ruling OD3).
 *
 * @param verdict - What the server last said about this build.
 * @param hasWaiting - Whether a newer worker is installed and waiting.
 * @param replacesRetiredWorker - Whether the active worker is the retired `/usage` worker.
 * @returns What to do.
 */
export const updateAction = (
  verdict: ServerVerdict,
  hasWaiting: boolean,
  replacesRetiredWorker = false,
): UpdateAction => {
  if (hasWaiting && replacesRetiredWorker) {
    return 'activate';
  }
  if (verdict === 'replaced') {
    return hasWaiting ? 'activate' : 'check-for-update';
  }
  return hasWaiting && verdict === 'unknown' ? 'ask-server' : 'none';
};

const isServiceWorkerMessage = (data: unknown): data is ServiceWorkerMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === serviceWorkerMessageType;

/**
 * Register the worker (or, inside a workspace, attach to an existing registration) and apply the update rule for as
 * long as the page lives.
 *
 * @param options - Whether a project workspace is open, the build-skew verdict, and where install outcomes go.
 * @returns Stops listening; the registration itself stays.
 */
/**
 * The build-skew verdict, as `build-skew.ts` exports it. Handed in by the caller, which already holds the module in the
 * interactive tier, so this module, loaded on demand, adds no edge to the page's static graph.
 */
export type VerdictSource = Readonly<{
  readServerVerdict: () => ServerVerdict;
  subscribeServerVerdict: (listener: () => void) => () => void;
  queryLiveBuild: () => Promise<void>;
}>;

export const startServiceWorker = (
  options: Readonly<{
    inWorkspace: boolean;
    verdict: VerdictSource;
    onInstallStatus: (status: ServiceWorkerInstallStatus) => void;
  }>,
): (() => void) => {
  const { readServerVerdict, subscribeServerVerdict, queryLiveBuild } = options.verdict;
  if (!('serviceWorker' in globalThis.navigator)) {
    return () => undefined;
  }
  const container = globalThis.navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let checkedForVerdict = false;
  let stopped = false;

  const applyRule = (): void => {
    if (registration === undefined || stopped) {
      return;
    }
    const verdict = readServerVerdict();
    if (verdict !== 'replaced') {
      checkedForVerdict = false;
    }
    const { waiting } = registration;
    const activeScript = registration.active?.scriptURL;
    const replacesRetiredWorker =
      activeScript !== undefined && new URL(activeScript).pathname === retiredServiceWorkerUrl;
    const action = updateAction(verdict, waiting !== null, replacesRetiredWorker);
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

  const watchInstalls = (current: ServiceWorkerRegistration): void => {
    // oxlint-disable-next-line typescript/no-restricted-types -- The platform's `installing` is `null` when absent.
    const watch = (worker: ServiceWorker | null): void => {
      worker?.addEventListener('statechange', applyRule);
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
      const current = options.inWorkspace
        ? await container.getRegistration()
        : await container.register(serviceWorkerUrl);
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
