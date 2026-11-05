/**
 * Netlify skew protection for production documents (TAU-UI-S).
 *
 * Netlify keeps each deploy servable and, for requests that carry a deploy's token, answers
 * from that deploy: a tab keeps loading the chunks, `.data` and `/__manifest` of the build it
 * started on. The paths and the token's source are declared at build time
 * (`scripts/write-skew-protection-config.mts`, `.netlify/v1/skew-protection.json`); this sets
 * the token as a cookie on every document, so each later request from that page carries it.
 * Netlify drops the signal on document navigations, so a new page always loads the live deploy.
 *
 * On wherever Netlify provides `NETLIFY_SKEW_PROTECTION_TOKEN`; local, desktop and `tau serve`
 * have none, and Netlify ignores the cookie outside production deploys (the staging alias, previews).
 * Caveat: a cookie is shared by every tab, so a newer tab's document re-pins older tabs to the
 * newer deploy. That is never worse than without protection (every request then goes to the live
 * deploy, as today), but only the most recently loaded build is fully protected.
 */

/** The cookie Netlify reads the token from; the build config names the same one. */
export const skewProtectionCookieName = 'tau_skew';

/**
 * The `Set-Cookie` value pinning this document's later requests to the deploy that rendered it.
 *
 * @param env - The runtime environment.
 * @returns The header value, or `undefined` without a token.
 */
export const skewProtectionCookie = (env: Readonly<Record<string, string | undefined>>): string | undefined => {
  const token = env['NETLIFY_SKEW_PROTECTION_TOKEN'];
  if (token === undefined || token === '') {
    return undefined;
  }
  return `${skewProtectionCookieName}=${encodeURIComponent(token)}; Path=/; Secure; HttpOnly; SameSite=Lax`;
};
