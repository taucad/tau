import type { PostHogConfig } from 'posthog-js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';
import { posthogConfig, redactEventProperties } from '#lib/posthog.lib.js';

/**
 * PostHog options for the web host, where analytics run only after accepted consent.
 *
 * @returns Fresh options for one `posthog.init`.
 */
export const webPosthogOptions = (): Partial<PostHogConfig> => ({
  ...posthogConfig.options,
  // Send captures as text, never gzip. The web host posts through `/api/ph`, and the hosted
  // (Netlify) path decodes a request body declared `text/plain` as text and re-encodes it as
  // UTF-8 — lossless for text, fatal to a gzip stream. `posthog-js` labels its gzip payloads
  // `text/plain`, so every capture arrived at PostHog as `invalid GZIP data` and was dropped.
  // The decode happens before the proxy route runs, so it cannot be repaired there.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
  disable_compression: true,
  // Drop events processed after a withdrawal in this or another tab, before React reacts,
  // and strip invitation tokens from whatever is left (charter W5, D27).
  // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
  before_send: (event) => (readConsentStatus() === 'accepted' ? redactEventProperties(event) : null),
});
