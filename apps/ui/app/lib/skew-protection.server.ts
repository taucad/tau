/**
 * Netlify skew protection for production documents (TAU-UI-S).
 *
 * Netlify keeps each deploy servable and, for requests that carry a deploy's token, answers
 * from that deploy: a tab keeps loading the chunks and `.data` of the build it
 * started on. The paths and the token's source are declared at build time
 * (`scripts/write-skew-protection-config.mts`, `.netlify/v1/skew-protection.json`); this sets
 * the token as a cookie on every document, so each later request from that page carries it.
 * Netlify drops the signal on document navigations, so a new page always loads the live deploy.
 *
 * On wherever Netlify provides a token: per request in the function context
 * (`Netlify.context.deploy.skewProtectionToken`), the only place a deployed function sees it, or
 * `NETLIFY_SKEW_PROTECTION_TOKEN` in the environment. Local, desktop and `tau serve` have neither,
 * and Netlify ignores the cookie outside production deploys (the staging alias, previews).
 * Caveat: a cookie is shared by every tab, so a newer tab's document re-pins older tabs to the
 * newer deploy. That is never worse than without protection (every request then goes to the live
 * deploy, as today), but only the most recently loaded build is fully protected.
 */

/** The cookie Netlify reads the token from; the build config names the same one. */
export const skewProtectionCookieName = 'tau_skew';

/** The part of Netlify's per-request function context that carries the deploy token. */
type NetlifyDeployContext = { readonly context?: { readonly deploy?: { readonly skewProtectionToken?: string } } };

/**
 * This deploy's skew protection token. A deployed Netlify function gets it per request in its context, not in
 * `process.env` (prod 2026-11-06: no cookie while reading the environment alone); the environment is the fallback.
 *
 * @param netlify - Netlify's runtime global (`globalThis.Netlify`), absent off Netlify.
 * @param env - The runtime environment.
 * @returns The token, or `undefined` off Netlify.
 */
export const skewProtectionToken = (
  netlify: NetlifyDeployContext | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const fromContext = netlify?.context?.deploy?.skewProtectionToken;
  if (fromContext !== undefined && fromContext !== '') {
    return fromContext;
  }
  const fromEnvironment = env['NETLIFY_SKEW_PROTECTION_TOKEN'];
  return fromEnvironment === '' ? undefined : fromEnvironment;
};

/**
 * The `Set-Cookie` value pinning this document's later requests to the deploy that rendered it.
 *
 * @param token - This deploy's token ({@link skewProtectionToken}).
 * @returns The header value, or `undefined` without a token.
 */
export const skewProtectionCookie = (token: string | undefined): string | undefined => {
  if (token === undefined || token === '') {
    return undefined;
  }
  return `${skewProtectionCookieName}=${encodeURIComponent(token)}; Path=/; Secure; HttpOnly; SameSite=Lax`;
};
