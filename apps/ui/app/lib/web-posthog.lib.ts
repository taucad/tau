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
  // Drop events processed after a withdrawal in this or another tab, before React reacts,
  // and strip invitation tokens from whatever is left (charter W5, D27).
  // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
  before_send: (event) => (readConsentStatus() === 'accepted' ? redactEventProperties(event) : null),
});
