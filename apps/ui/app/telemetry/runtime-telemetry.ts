/**
 * The page's one runtime telemetry composition (`page-telemetry.ts`) over the real environment: the build signal, the
 * page's own API, the sticky device preference, GPC, the desktop bridge and the page lifecycle. Every producer on the
 * page goes through this module; nothing is composed during SSR or in a worker.
 *
 * @module
 */

import type { DevicePreference, ReportingConsent, ViewerEventInput } from '@taucad/telemetry/client';
import { onViewerEvent } from '@taucad/viewer/lib/renderer-telemetry';
import { tauTelemetryHostCloud } from '#cloud/telemetry-host.js';
import { cookieName } from '#constants/cookie.constants.js';
import { metaConfig } from '#constants/meta.constants.js';
import { requireClientEnvironmentUrl } from '#environment.config.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { store } from '#hooks/use-cookie.js';
import { readBuildRelease } from '#lib/build-identity.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';
import { reportRuntimeFailures } from '#lib/runtime-failure-reporting.js';
import { isGlobalPrivacyControlEnabled } from '#lib/global-privacy-control.lib.js';
import { createPageTelemetry } from '#telemetry/page-telemetry.js';
import type { ObservedRuntimeClient, PageCaller, PageTelemetry } from '#telemetry/page-telemetry.js';
import { osClass, platformClass } from '#telemetry/platform-class.js';

/** The device preference's storage name, the one the settings switch writes through `useCookie`. */
export const telemetryPreferenceStorageName = `${metaConfig.cookiePrefix}${cookieName.telemetry}`;

const isDocument = (): boolean => typeof document !== 'undefined' && 'addEventListener' in globalThis;

/**
 * The page's API origin, or `undefined` before the host injected it.
 *
 * @returns The origin.
 */
const apiUrl = (): string | undefined => {
  try {
    return requireClientEnvironmentUrl('TAU_API_URL');
  } catch {
    return undefined;
  }
};

const devicePreference = (value: unknown): DevicePreference => (value === 'on' || value === 'off' ? value : 'unset');

let page: PageTelemetry | undefined;

/**
 * Install the page lifecycle: `pagehide` settles in-flight attempts and sends one keepalive batch;
 * `visibilitychange: hidden` and `freeze` send what is ready.
 *
 * @param telemetry - The page composition.
 */
const installLifecycle = (telemetry: PageTelemetry): void => {
  globalThis.addEventListener('pagehide', (event: PageTransitionEvent) => {
    telemetry.pageHide(event.persisted);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void telemetry.flush();
    }
  });
  document.addEventListener('freeze', () => {
    void telemetry.flush();
  });
};

/**
 * The page composition, created on first use in a document; `undefined` during SSR and in workers.
 *
 * @returns The page composition.
 */
export const pageTelemetry = (): PageTelemetry | undefined => {
  if (page !== undefined || !isDocument()) {
    return page;
  }
  const isDesktop = isDesktopTarget();
  page = createPageTelemetry({
    cloudBuild: tauTelemetryHostCloud,
    isDesktop,
    apiUrl,
    release: readBuildRelease,
    device: () => (isMemoryConstrainedDevice() ? 'constrained' : 'standard'),
    platform: () => platformClass(undefined, isDesktop),
    os: () => osClass(),
    globalPrivacyControl: isGlobalPrivacyControlEnabled,
    readDevicePreference: () => devicePreference(store.get<unknown>(telemetryPreferenceStorageName)),
    writeDevicePreference: (value) => {
      store.update(telemetryPreferenceStorageName, value);
    },
    storage: () => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    },
    notifyDesktopMain: (consent: ReportingConsent) => {
      desktopBridge()?.telemetry?.setConsent(consent);
    },
  });
  installLifecycle(page);
  /* FR-17: the viewer emits closed events and never reports; the page decides. */
  const viewerPage = page;
  onViewerEvent((event) => {
    viewerPage.recordViewerEvent(event);
  });
  return page;
};

/**
 * Report every attempt `client` settles under `caller`. Attach before `connect()` so `initialize` is observed. Its
 * runtime failures (terminated, timed out, discarded) also go to error reporting, which no telemetry consent gates
 * (SB4, D1).
 *
 * @param client - The runtime client.
 * @param caller - Who issues its attempts.
 * @returns The unsubscribe; telemetry is a no-op outside a document.
 */
export const observeRuntimeClient = (client: ObservedRuntimeClient, caller: PageCaller): (() => void) => {
  const stopReporting = reportRuntimeFailures(client);
  const stopObserving = pageTelemetry()?.observeRuntimeClient(client, caller);
  return () => {
    stopReporting();
    stopObserving?.();
  };
};

/**
 * FR-17: record one closed viewer event.
 *
 * @param input - The viewer event.
 */
export const recordViewerEvent = (input: ViewerEventInput): void => {
  pageTelemetry()?.recordViewerEvent(input);
};
