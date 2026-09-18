import * as Cookies from 'es-cookie';
import type { PostHogConfig } from 'posthog-js';
import { ENV } from '#environment.config.js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';

/**
 * An invitation path and the token that follows it, plain or percent-encoded.
 *
 * The separator is captured rather than assumed so one pass covers both forms:
 * `/invitations/<token>` as it appears in `$current_url` and `$pathname`, and
 * `%2Finvitations%2F<token>` as the sign-in round trip carries it back inside
 * `?redirectTo=`. A token is 32 random bytes in base64url, so its characters are
 * exactly the ones excluded here from ending it.
 */
const invitationTokenPattern = /(\/|%2F)invitations(\/|%2F)[^/?#&%\s"']+/giu;

/**
 * Strip every invitation token out of one string.
 *
 * An invitation token is a bearer credential that happens to live in a URL
 * (charter W5, D27): whoever reads it can accept the invitation. Analytics
 * records URLs by design — `history_change` pageviews, autocaptured `href`s,
 * referrers — so the token is removed before an event is queued rather than
 * trusted to stay out of one.
 *
 * @param value - Any string an event carries.
 * @returns The same string with each token replaced by `[redacted]`.
 * @public
 */
export const redactInvitationTokens = (value: string): string =>
  value.replaceAll(
    invitationTokenPattern,
    (_match, lead: string, separator: string) => `${lead}invitations${separator}[redacted]`,
  );

/** One captured event, as much of it as this redaction reads. */
type AnalyticsEvent = Readonly<{ properties?: Record<string, unknown> }>;

/**
 * Redact every string property an event carries.
 *
 * A shallow pass over the property bag rather than a list of known keys, because
 * the key list is the part that goes stale: `$current_url`, `$pathname`,
 * `$referrer`, `$initial_current_url`, `$prev_pageview_pathname` and
 * autocapture's `attr__href` all hold the same URL, and PostHog adds more.
 *
 * The ceiling is deliberate: it does not walk nested structures, so an rrweb
 * session-replay snapshot would keep a URL inside `$snapshot_data`. Replay is
 * off at init in this build and is started by the analytics lifecycle; a
 * recursive walk on every event is the upgrade path if that changes.
 *
 * @param event - The event PostHog is about to queue.
 * @returns The same event with its string properties redacted.
 * @public
 */
export const redactEventProperties = <Event extends AnalyticsEvent>(event: Event): Event => {
  if (event.properties === undefined) {
    return event;
  }
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties)) {
    properties[key] = typeof value === 'string' ? redactInvitationTokens(value) : value;
  }
  return { ...event, properties };
};

/**
 * PostHog options for accepted web analytics. The SDK is initialised only after
 * acceptance, so these are the plain BAU options with no opt-out defaults.
 */
export const posthogConfig: { options: Partial<PostHogConfig>; apiKey: string } = {
  options: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    api_host: '/api/ph',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    get ui_host() {
      return ENV.POSTHOG_UI_HOST;
    },
    defaults: '2025-11-30',
    autocapture: true,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    capture_dead_clicks: true,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    capture_pageleave: true,
    // `true` captures only the initial load; `history_change` also captures SPA navigation.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    capture_pageview: 'history_change',
    persistence: 'localStorage+cookie',
    // Drop events processed after a withdrawal in this or another tab, before React reacts,
    // and strip invitation tokens from whatever is left (charter W5, D27).
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    before_send: (event) =>
      readConsentStatus() === 'accepted' && event !== null ? redactEventProperties(event) : null,
    // Defer extension initialization (session recording, autocapture, dead-click detection, etc.)
    // to off-main-thread tasks with 30ms time-sliced budgets, reducing startup blocking.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    __preview_deferred_init_extensions: true,
    // Prevent rrweb DOM snapshot on init — the snapshot scales super-linearly with DOM node count
    // and freezes the main thread for ~2.5s on the homepage (1,974 nodes). Session recording
    // is started manually by the web analytics lifecycle after the page is idle.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    disable_session_recording: true,
  },
  // When no API key is set, the web analytics boundary remains a no-op.
  // This is useful for development and self-hosted configurations.
  get apiKey() {
    return ENV.POSTHOG_CLIENT_KEY ?? '';
  },
};

/**
 * Removes PostHog identifiers left by an earlier accepted session without
 * starting the SDK. Only keys for this project are touched; the SDK's opt-out
 * marker (`__ph_opt_in_out_*`) holds no identifier and is kept.
 *
 * @param apiKey - The PostHog project key whose storage is removed.
 */
export const clearPostHogStorage = (apiKey: string): void => {
  const prefix = `ph_${apiKey}`;
  for (const readStorage of [(): Storage => globalThis.localStorage, (): Storage => globalThis.sessionStorage]) {
    try {
      const storage = readStorage();
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const key of keys) {
        if (key?.startsWith(prefix)) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Blocked storage holds nothing to clear.
    }
  }

  if (typeof document === 'undefined') {
    return;
  }
  // PostHog may scope its cookie to a parent domain (`cross_subdomain_cookie`).
  const labels = globalThis.location.hostname.split('.');
  const domains = labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
  for (const name of Object.keys(Cookies.getAll())) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    Cookies.remove(name, { path: '/' });
    for (const domain of domains) {
      Cookies.remove(name, { domain, path: '/' });
    }
  }
};
