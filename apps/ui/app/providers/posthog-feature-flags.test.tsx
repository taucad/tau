// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import type { PostHog } from 'posthog-js';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useFeatureState as useFeatureStateHook } from '#flags/use-feature.js';
import type { WebAnalyticsProvider as WebAnalyticsProviderComponent } from '#providers/web-analytics-provider.js';
import { requestUrl, restoreSdkPlatform, stubSdkPlatform } from '#providers/posthog-sdk.test-utils.js';

/*
 * Runs the installed PostHog SDK through the web analytics boundary, as `web-analytics-provider.test.tsx` does, so
 * the flag source is proven against the SDK's real `/flags` handling, `onFeatureFlags` and console overrides.
 * Transport is stubbed so nothing leaves the process.
 */

const state = vi.hoisted(() => ({ consent: 'declined' as 'unknown' | 'accepted' | 'declined' }));

vi.mock('#hooks/use-privacy-choices.js', () => ({ useCookieConsent: () => state.consent }));
vi.mock('#environment.config.js', () => ({
  ENV: { POSTHOG_CLIENT_KEY: 'phc_test_key', POSTHOG_UI_HOST: 'https://posthog.example.invalid' },
}));
/* Replay's content decision reads the account's "Improve Tau for everyone" value; this suite does not. */
vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: () => ({ preferences: undefined, isLoading: false, error: null }),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined, isPending: false }) }));

const flagsResponse = JSON.stringify({
  flags: {
    onboarding: { key: 'onboarding', enabled: true },
    'onboarding-auto-open': { key: 'onboarding-auto-open', enabled: false },
  },
});

// Transform the module graph once, outside any hook's timeout; each test evaluates its own copy below.
await import('#providers/web-analytics-provider.js');
await import('#flags/use-feature.js');
await import('posthog-js');

/** The requests this test's SDK instance sent. */
let requests: string[];
let posthog: PostHog;
let WebAnalyticsProvider: typeof WebAnalyticsProviderComponent;
let useFeatureState: typeof useFeatureStateHook;

// Each test gets its own SDK instance, flag source, transport and document.
beforeEach(async () => {
  state.consent = 'declined';
  const sent: string[] = [];
  requests = sent;
  stubSdkPlatform({
    open: (url) => {
      sent.push(url);
    },
    fetch: async (input) => {
      const url = requestUrl(input);
      sent.push(url);
      return new Response(url.includes('/flags/') ? flagsResponse : '{}', { status: 200 });
    },
    sendBeacon: () => true,
  });
  ({ posthog } = await import('posthog-js'));
  ({ WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js'));
  ({ useFeatureState } = await import('#flags/use-feature.js'));
});

afterEach(() => {
  cleanup();
  restoreSdkPlatform(posthog);
});

type ConsoleWindow = { posthog?: PostHog };

const Flags = (): React.JSX.Element => (
  <p>
    {`onboarding=${String(useFeatureState('onboarding') === 'on')} viewerControls=${String(useFeatureState('viewerControls') === 'on')} autoOpen=${String(useFeatureState('onboardingAutoOpen') === 'on')}`}
  </p>
);

const tree = (): ReactNode => (
  <WebAnalyticsProvider>
    <Flags />
  </WebAnalyticsProvider>
);

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
};

/** The real SDK debounces and fetches asynchronously; a loaded CI runner can take longer than the 1 s default. */
const sdkResponse = { timeout: 10_000 };

describe('PostHog-backed flags through the web analytics boundary', () => {
  it('resolves to defaults and requests no flags when analytics are declined', async () => {
    const view = render(tree(), { wrapper: MemoryRouter });
    await settle();
    expect(screen.getByText('onboarding=false viewerControls=false autoOpen=false')).toBeInTheDocument();
    expect(requests.some((url) => url.includes('/flags/'))).toBe(false);
    expect((globalThis as ConsoleWindow).posthog).toBeUndefined();
    view.unmount();
  });

  it("follows PostHog's evaluation after consent and console overrides live", async () => {
    state.consent = 'accepted';
    const view = render(tree(), { wrapper: MemoryRouter });
    await vi.waitFor(() => {
      expect((globalThis as ConsoleWindow).posthog).toBe(posthog);
    }, sdkResponse);
    // In a browser the remote config's `ensureFlagsLoaded` makes this request; jsdom never loads that config script.
    posthog.reloadFeatureFlags();
    await vi.waitFor(() => {
      expect(screen.getByText('onboarding=true viewerControls=false autoOpen=false')).toBeInTheDocument();
    }, sdkResponse);
    expect(requests.some((url) => url.includes('/flags/'))).toBe(true);

    const consoleClient = (globalThis as ConsoleWindow).posthog;
    expect(consoleClient).toBe(posthog);
    act(() => {
      consoleClient?.featureFlags.overrideFeatureFlags({
        flags: { 'viewer-controls': true, 'onboarding-auto-open': true },
      });
    });
    expect(screen.getByText('onboarding=true viewerControls=true autoOpen=true')).toBeInTheDocument();

    act(() => {
      consoleClient?.featureFlags.overrideFeatureFlags({ flags: { onboarding: false } });
    });
    // Replacing the overrides drops the earlier ones, and auto-open needs onboarding.
    expect(screen.getByText('onboarding=false viewerControls=false autoOpen=false')).toBeInTheDocument();

    act(() => {
      consoleClient?.featureFlags.overrideFeatureFlags(false);
    });
    expect(screen.getByText('onboarding=true viewerControls=false autoOpen=false')).toBeInTheDocument();

    state.consent = 'declined';
    view.rerender(tree());
    await vi.waitFor(() => {
      expect(screen.getByText('onboarding=false viewerControls=false autoOpen=false')).toBeInTheDocument();
    }, sdkResponse);
    expect((globalThis as ConsoleWindow).posthog).toBeUndefined();
    view.unmount();
  });
});
