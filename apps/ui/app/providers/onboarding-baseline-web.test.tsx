// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { MemoryRouter } from 'react-router';
import type { PostHog } from 'posthog-js';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { store as preferenceStore } from '#hooks/use-cookie.js';
import type { WebAnalyticsProvider as WebAnalyticsProviderComponent } from '#providers/web-analytics-provider.js';
import type * as OnboardingTelemetry from '#telemetry/onboarding-telemetry.js';
import { restoreSdkPlatform, stubSdkPlatform } from '#providers/posthog-sdk.test-utils.js';

/*
 * The onboarding baseline through the web analytics boundary and the installed PostHog SDK (M1, M3): `first_seen`
 * is captured once per device, only after consent is accepted, and never while it is declined. Transport is stubbed.
 */

const state = vi.hoisted(() => ({
  consent: 'declined' as 'unknown' | 'accepted' | 'declined',
}));

vi.mock('#hooks/use-privacy-choices.js', () => ({
  useCookieConsent: () => state.consent,
}));
vi.mock('#environment.config.js', () => ({
  ENV: {
    POSTHOG_CLIENT_KEY: 'phc_baseline_web',
    POSTHOG_UI_HOST: 'https://posthog.example.invalid',
  },
}));
/* Replay's content decision reads the account's "Improve Tau for everyone" value; this suite does not. */
vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: () => ({ preferences: undefined, isLoading: false, error: null }),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: undefined, isPending: false }),
}));

// Transform the module graph once, outside any hook's timeout; each test evaluates its own copy below.
await import('#providers/web-analytics-provider.js');
await import('#telemetry/onboarding-telemetry.js');
await import('posthog-js');

let posthog: PostHog;
let WebAnalyticsProvider: typeof WebAnalyticsProviderComponent;
let telemetry: typeof OnboardingTelemetry;
let store: typeof preferenceStore;
let capture: MockInstance<PostHog['capture']>;

// Each test gets its own SDK instance, baseline reporter, device store and document.
beforeEach(async () => {
  state.consent = 'declined';
  stubSdkPlatform({ fetch: async () => new Response('{}', { status: 200 }), sendBeacon: () => true });
  ({ posthog } = await import('posthog-js'));
  ({ WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js'));
  telemetry = await import('#telemetry/onboarding-telemetry.js');
  ({ store } = await import('#hooks/use-cookie.js'));
  capture = vi.spyOn(posthog, 'capture');
});

afterEach(() => {
  cleanup();
  restoreSdkPlatform(posthog);
});

const baselineCalls = (): unknown[][] =>
  capture.mock.calls.filter(([event]) => ['first_seen', 'first_model_built', 'first_export'].includes(event));

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
};

/** The real SDK loads asynchronously; a loaded CI runner can take longer than the 1 s default. */
const sdkResponse = { timeout: 10_000 };

describe('onboarding baseline through the web analytics boundary', () => {
  it('captures nothing while consent is declined', async () => {
    store.remove(telemetry.firstSeenStorageName);
    telemetry.markFirstSeen();
    const view = render(<WebAnalyticsProvider>{undefined}</WebAnalyticsProvider>, { wrapper: MemoryRouter });
    await settle();
    telemetry.reportFirstModelBuilt({ kernel: 'openscad' });
    expect(baselineCalls()).toStrictEqual([]);
    view.unmount();
  });

  it('captures first_seen once after consent is accepted, then the first model once', async () => {
    state.consent = 'accepted';
    const view = render(<WebAnalyticsProvider>{undefined}</WebAnalyticsProvider>, { wrapper: MemoryRouter });
    await vi.waitFor(() => {
      expect(baselineCalls().map(([event]) => event)).toStrictEqual(['first_seen']);
    }, sdkResponse);
    const firstSeen = baselineCalls()[0]?.[1] as Record<string, unknown> | undefined;
    expect(Object.keys(firstSeen ?? {}).toSorted()).toStrictEqual(['host', 'ms_since_first_seen']);
    expect(firstSeen).toMatchObject({ host: 'web' });
    expect(typeof firstSeen?.['ms_since_first_seen']).toBe('number');
    telemetry.reportFirstModelBuilt({ kernel: 'openscad' });
    telemetry.reportFirstModelBuilt({ kernel: 'openscad' });
    expect(baselineCalls().map(([event]) => event)).toStrictEqual(['first_seen', 'first_model_built']);
    view.unmount();

    // Another load on the same device sends no second first_seen.
    const again = render(<WebAnalyticsProvider>{undefined}</WebAnalyticsProvider>, { wrapper: MemoryRouter });
    await settle();
    expect(baselineCalls().map(([event]) => event)).toStrictEqual(['first_seen', 'first_model_built']);
    again.unmount();
  });
});
