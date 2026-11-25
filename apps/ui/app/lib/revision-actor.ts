/**
 * The salt request and the who context, bound to this app's services.
 *
 * Who this document records revisions as — the anonymity preference, the
 * session-user store, the salts and `revisionUserActor` — is
 * `@taucad/revisions-ui/lib/revision-actor`'s, imported from there. What only
 * this app can reach is handed in here, once: the API origin from
 * `window.ENV`, the `tauDebug` flag and the push store of `lib/revision-pushes`.
 */

import { createRevisionActorHooks } from '@taucad/revisions-ui/lib/revision-actor';
import { ENV } from '#environment.config.js';
import { useFeature } from '#flags/use-feature.js';
import { getPushRecords, subscribePushRecords } from '#lib/revision-pushes.js';

/* Read when it is used, so a module mock or a stubbed `window.ENV` is seen as it stands then. */
const revisionActorHooks = createRevisionActorHooks({
  apiBaseUrl: () => ENV.TAU_API_URL,
  useDebugFlag: () => useFeature('tauDebug'),
  pushRecords: { getPushRecords, subscribePushRecords },
});

/**
 * Ask the API for the account's salt once per account and workspace while nothing is held.
 *
 * @public
 */
export const { requestRevisionSalt } = revisionActorHooks;

/**
 * One project's who context: the session, the push record and the debug setting.
 *
 * @public
 */
export const { useRevisionWhoContext } = revisionActorHooks;
