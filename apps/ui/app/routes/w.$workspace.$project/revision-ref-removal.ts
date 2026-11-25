/**
 * The Hosted Remote's audited ref removal, bound to this app's API origin.
 *
 * The request and how its answer reads are `@taucad/revisions-ui`'s
 * ({@link createRevisionRefRemoval}). What only this app can reach is handed in
 * here, once: the API origin from the client environment, read on every request.
 */

import { createRevisionRefRemoval } from '@taucad/revisions-ui/lib/revision-ref-removal';
import { requireClientEnvironmentUrl } from '#environment.config.js';

/* Read when it is used, so a module mock or a stubbed `window.ENV` is seen as it stands then. */
const revisionRefRemoval = createRevisionRefRemoval({ apiBaseUrl: () => requireClientEnvironmentUrl('TAU_API_URL') });

/**
 * Ask the Hosted Remote to remove a conflict line through its audited verb.
 *
 * @public
 */
export const { requestRefRemoval } = revisionRefRemoval;
