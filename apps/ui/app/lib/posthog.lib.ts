import * as Cookies from 'es-cookie';
import type { PostHogConfig } from 'posthog-js';
import { ENV } from '#environment.config.js';
import { redactUrlCredentials } from '@taucad/ui-core/lib/url-credential.lib';

/** One captured event, as much of it as this redaction reads. */
type AnalyticsEvent = Readonly<{ properties?: Record<string, unknown> }>;

/**
 * Redact URL credentials (invitation and sign-in tokens) in event properties, including replay snapshots.
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
      return redactUrlCredentials(value);
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
 * PostHog options shared by the web and desktop hosts. The SDK is initialised only once
 * the host allows analytics, so these are the plain BAU options with no opt-out defaults.
 * This module stays free of web consent code so the desktop renderer can load it.
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
    // Errors go to Sentry only (browser observability blueprint, D4). `false` also overrides the project's
    // remote exception-autocapture setting, so PostHog never receives `$exception` events from any host.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    capture_exceptions: false,
    // Send while consent is still active; the SDK's batch queue otherwise flushes
    // already-captured events after a later withdrawal.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    request_batching: false,
    // Strip invitation and sign-in tokens from URLs (charter W5, D27); the web host also gates on consent (`#lib/web-posthog.lib`).
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    before_send: (event) => redactEventProperties(event),
    // Defer extension initialization (session recording, autocapture, dead-click detection, etc.)
    // to off-main-thread tasks with 30ms time-sliced budgets, reducing startup blocking.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    __preview_deferred_init_extensions: true,
    // Prevent rrweb DOM snapshot on init — the snapshot scales super-linearly with DOM node count
    // and freezes the main thread for ~2.5s on the homepage (1,974 nodes). Session recording
    // is started manually by the web analytics lifecycle after the page is idle.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    disable_session_recording: true,
    // Replays record rendered text, including chat, editor code and file names, so they can be used to
    // debug what a user saw (session replay fidelity blueprint, 2026-11-13). Typed input values stay
    // masked. Credentials never reach a replay: invitation links carry bearer tokens in href, and
    // elements that show one (a new API key, the device sign-in code) carry `ph-no-capture`.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    session_recording: {
      maskAllInputs: true,
      blockSelector: 'a[href*="/invitations/"], a[href*="%2Finvitations%2F" i]',
      // The SDK calls this for rrweb Meta href before snapshot compression too.
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: redactUrlCredentials(request.name),
        requestBody:
          request.requestBody === undefined || request.requestBody === null
            ? request.requestBody
            : redactUrlCredentials(request.requestBody),
        responseBody:
          request.responseBody === undefined || request.responseBody === null
            ? request.responseBody
            : redactUrlCredentials(request.responseBody),
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
 * PostHog options for the desktop renderer, where analytics run unless turned off in Data controls. Built on the web
 * options with the differences an `app://` document needs: events post straight to the PostHog host (the renderer has
 * no `/api/ph` route) and persist in local storage, no cookie consent applies, and the SDK loads no remote
 * extension scripts, which the desktop Content-Security-Policy refuses — so dead-click capture is off and
 * session replay never starts. Invitation tokens are redacted as on the web.
 *
 * @returns Fresh options for one `posthog.init`.
 */
export const desktopPosthogOptions = (): Partial<PostHogConfig> => ({
  ...posthogConfig.options,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
  api_host: ENV.POSTHOG_API_HOST,
  persistence: 'localStorage',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
  capture_dead_clicks: false,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
  disable_external_dependency_loading: true,
});

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
