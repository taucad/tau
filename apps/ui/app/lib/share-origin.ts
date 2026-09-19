import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#lib/build-target.js';

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
