import { isDesktopTarget } from '#lib/build-target.js';
import { shareOrigin } from '#lib/share-origin.js';

/**
 * Link to one of Tau's legal pages on the deployment this client belongs to.
 *
 * The web app serves `/legal/*` itself, so a root-relative path keeps staging,
 * deploy previews and production each on their own pages, and the server and
 * the browser render the same `href`. The desktop build does not ship those
 * routes and its document origin is `app://tau`, so desktop links to the web
 * deployment its shell is bound to, through `shareOrigin`.
 *
 * @param page - Page and optional anchor, for example `privacy#9.2.1`.
 * @returns `/legal/<page>` on the web, or that path on the bound web origin on desktop.
 */
export const legalUrl = (page: string): string => {
  const path = `/legal/${page}`;
  return isDesktopTarget() ? `${shareOrigin()}${path}` : path;
};
