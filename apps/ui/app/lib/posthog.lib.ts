import type { PostHog, PostHogConfig } from 'posthog-js';
import { ENV } from '#environment.config.js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';

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
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    capture_pageview: true,
    persistence: 'localStorage+cookie',
    // Provider initialization is deferred until acceptance; keep initialization fail-closed as well.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    opt_out_capturing_by_default: true,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    opt_out_persistence_by_default: true,
    // Close the narrow withdrawal race before React's cleanup effect runs.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    before_send: (event) => (readConsentStatus() === 'accepted' ? event : null),
    loaded: (posthog) => {
      // PostHogConfig exposes the narrower @posthog/types interface here even though
      // the runtime value is the concrete SDK instance.
      const sdk = posthog as unknown as PostHog;
      // PostHog's opt_in_capturing captures a pageview itself when this is enabled, then
      // PostHog's loaded lifecycle schedules another. Toggle it around opt-in
      // so the SDK's normal loaded pageview is the single initial event.
      // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
      sdk.set_config({ capture_pageview: false });
      sdk.opt_in_capturing({ captureEventName: false });
      // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
      sdk.set_config({ capture_pageview: true });
    },
    // Defer extension initialization (session recording, autocapture, dead-click detection, etc.)
    // to off-main-thread tasks with 30ms time-sliced budgets, reducing startup blocking.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    __preview_deferred_init_extensions: true,
    // Prevent rrweb DOM snapshot on init — the snapshot scales super-linearly with DOM node count
    // and freezes the main thread for ~2.5s on the homepage (1,974 nodes). Session recording
    // is started manually via DeferredSessionRecording after the page is idle.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- posthog-js Options
    disable_session_recording: true,
  },
  // When no API key is set, the web analytics boundary remains a no-op.
  // This is useful for development and self-hosted configurations.
  get apiKey() {
    return ENV.POSTHOG_CLIENT_KEY ?? '';
  },
};
