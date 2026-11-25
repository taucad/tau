/**
 * The page's Tau Cloud push store, bound to this app's API origin.
 *
 * The fetch, the per-account records and the join to the held graph are
 * `@taucad/revisions-ui`'s ({@link createRevisionPushStore}). What only this
 * app can reach is handed in here, once: the API origin from `window.ENV`,
 * read on every request.
 */

import { createRevisionPushStore } from '@taucad/revisions-ui/lib/revision-pushes';
import { ENV } from '#environment.config.js';

/* Read when it is used, so a module mock or a stubbed `window.ENV` is seen as it stands then. */
const revisionPushStore = createRevisionPushStore({ apiBaseUrl: () => ENV.TAU_API_URL });

/**
 * Remember rows the page has read, so their entries can be joined to a push.
 *
 * @public
 */
export const { holdRevisionGraph } = revisionPushStore;

/* Safe mode is fixed for the page load, as the app runtime records it: read once, on first use (D0). */
/* Read inline, not through `#lib/boot-signals.js` or `#lib/desktop-safe-mode.js`: this module is on Home's critical
 * path, and importing either adds requests to it (`ui:check-critical-budget`). The same two signals the app runtime
 * reads: the web's `?safe=1` and the desktop shell's `tau.safeMode`. */
let isPageSafeMode: boolean | undefined;
const pageSafeMode = (): boolean => {
  isPageSafeMode ??=
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- no `location` during a server render.
    (globalThis.location !== undefined && new URLSearchParams(globalThis.location.search).get('safe') === '1') ||
    (globalThis as { tau?: { safeMode?: unknown } }).tau?.safeMode !== undefined;
  return isPageSafeMode;
};

/**
 * Read the push records that follow the ones held, at one of the page's refresh points. Safe mode makes no Tau Cloud
 * read (W9 R5), so there it reads nothing.
 *
 * @param input - The refresh point's project and account, as the store takes them.
 * @public
 */
export const refreshPushRecords: typeof revisionPushStore.refreshPushRecords = (input) => {
  if (!pageSafeMode()) {
    revisionPushStore.refreshPushRecords(input);
  }
};

/**
 * Subscribe to every change of the push store.
 *
 * @public
 */
export const { subscribePushRecords } = revisionPushStore;

/**
 * The push record one account reads for one project, joined to the rows held.
 *
 * @public
 */
export const { getPushRecords } = revisionPushStore;

/**
 * Forget every project's records and rows, for tests.
 *
 * @public
 */
export const { resetPushRecords } = revisionPushStore;
