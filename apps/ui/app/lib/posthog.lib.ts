import * as Cookies from 'es-cookie';
import type { PostHogConfig } from 'posthog-js';
import { ENV } from '#environment.config.js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';

/** One captured event, as much of it as this redaction reads. */
type AnalyticsEvent = Readonly<{ properties?: Record<string, unknown> }>;

/**
 * Redact invitation tokens in event properties, including replay snapshots.
 * The SDK may transport snapshots separately, so recorder masking and decoded
 * transport checks remain necessary alongside this event hook.
 *
 * @param event - The event PostHog is about to queue.
 * @returns The same event with its string properties redacted.
 * @public
 */
export const redactEventProperties = <Event extends AnalyticsEvent>(event: Event): Event => {
  if (event.properties === undefined) {
    return event;
  }
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return redactInvitationTokens(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => redact(item));
    }
    if (
      value !== null &&
      typeof value === 'object' &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    ) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
    }
    return value;
  };
  return { ...event, properties: redact(event.properties) as Record<string, unknown> };
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
    // Send while consent is still active; the SDK's batch queue otherwise flushes
    // already-captured events after a later withdrawal.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    request_batching: false,
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
    // Invitation links carry bearer credentials in href; rrweb must omit the node before compression.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    session_recording: {
      // Replays otherwise record chat messages, editor code, file names and agent output as
      // rendered text; mask every text node and input (agent usage telemetry blueprint, Q3).
      maskTextSelector: '*',
      maskAllInputs: true,
      blockSelector: 'a[href*="/invitations/"], a[href*="%2Finvitations%2F" i]',
      // The SDK calls this for rrweb Meta href before snapshot compression too.
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: redactInvitationTokens(request.name),
        requestBody:
          request.requestBody === undefined || request.requestBody === null
            ? request.requestBody
            : redactInvitationTokens(request.requestBody),
        responseBody:
          request.responseBody === undefined || request.responseBody === null
            ? request.responseBody
            : redactInvitationTokens(request.responseBody),
      }),
    },
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
