import { isDesktopTarget } from '#lib/build-target.js';
import { shareOrigin } from '#lib/share-origin.js';

/**
 * Link to one of Tau's legal pages on the deployment this client belongs to.
 *
 * The marketing site (`apps/www`) owns `/legal/*`, and the app's Netlify edge
 * function serves it on the app's own hostname, so a root-relative path keeps
 * staging and production each on their own pages, and the server and the
 * browser render the same `href`. The desktop document origin is `app://tau`,
 * so desktop links to the web deployment its shell is bound to, through
 * `shareOrigin`.
 *
 * @param page - Page and optional anchor, for example `privacy#9.2.1-ai-service-improvement`.
 * @returns `/legal/<page>` on the web, or that path on the bound web origin on desktop.
 */
export const legalUrl = (page: string): string => {
  const path = `/legal/${page}`;
  return isDesktopTarget() ? `${shareOrigin()}${path}` : path;
};
