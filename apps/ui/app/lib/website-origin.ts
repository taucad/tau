import { ENV } from '#environment.config.js';
import { canonicalProductionUrl } from '#lib/canonical-url.js';

/** Hosted deployments whose edge serves the website (`apps/www`) on the app's own hostname. */
const websiteHosts = new Set([canonicalProductionUrl.hostname, 'taucad.dev']);

/**
 * The origin that serves Tau's website and legal documents for this client.
 *
 * Production and staging (web and desktop) use their own bound origin, where the edge serves the
 * website. Every other build — local development, deploy previews and self-hosted instances, which run
 * no website — links to the public site rather than to pages it does not have. The value comes from the environment, so the server and
 * the browser render the same `href`.
 *
 * @returns The website's `scheme://host`.
 */
export const websiteOrigin = (): string => {
  const frontendUrl = ENV.TAU_FRONTEND_URL ? new URL(ENV.TAU_FRONTEND_URL) : undefined;
  if (frontendUrl?.protocol === 'https:' && websiteHosts.has(frontendUrl.hostname)) {
    return frontendUrl.origin;
  }
  return canonicalProductionUrl.origin;
};

/**
 * The origin serving this document, where there is one.
 *
 * A document render has no `location`: Node defines no such global, so every `globalThis.location`
 * read there yields undefined and the property access after it throws. A caller comparing an origin
 * against the page's own needs that answer absent on the server rather than an exception.
 *
 * @returns The page's `scheme://host`, or undefined outside a browser.
 */
export const pageOrigin = (): string | undefined => ('location' in globalThis ? globalThis.location.origin : undefined);
