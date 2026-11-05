import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { pageOrigin } from '#lib/website-origin.js';

/**
 * The origin every link the client mints for someone *else* is built from.
 *
 * On the web that is the document's own origin, so a deploy preview keeps
 * minting preview links (ruling Q1). On desktop the document origin is
 * `app://tau` — a scheme only this app can open — so the link has to come from
 * the web deployment the shell already knows about. The API does the same for
 * publication links, and the sign-in handoff does it for `auth/desktop`: the
 * web completes, the desktop observes
 * (`docs/research/desktop-share-links-blueprint.md`, Findings 2 and 6).
 *
 * @returns The `scheme://host` a shared link belongs to.
 */
export const shareOrigin = (): string =>
  isDesktopTarget() ? new URL(ENV.TAU_FRONTEND_URL).origin : globalThis.location.origin;

/**
 * The origin auth return links point at: sign-in and OAuth callbacks, and the password reset and
 * email change redirects the API sends a visitor back to.
 *
 * On the web that is the page's own origin, so signing in on `tau.new`, `taucad.dev`, a site's
 * netlify.app address or local development returns to the same host. The API admits these through
 * Better Auth's `trustedOrigins`. A server render has no page, and desktop's `app://tau` cannot
 * receive a redirect, so both use `TAU_FRONTEND_URL`.
 *
 * @returns The `scheme://host` auth returns to.
 */
export const authReturnOrigin = (): string => {
  const origin = isDesktopTarget() ? undefined : pageOrigin();
  if (origin?.startsWith('http')) {
    return origin;
  }
  // The desktop SPA prerender runs without a frontend URL; pass it through as before rather than throw.
  return URL.canParse(ENV.TAU_FRONTEND_URL) ? new URL(ENV.TAU_FRONTEND_URL).origin : ENV.TAU_FRONTEND_URL;
};
