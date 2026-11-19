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

/**
 * Read the push records that follow the ones held, at one of the page's refresh points.
 *
 * @public
 */
export const { refreshPushRecords } = revisionPushStore;

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
