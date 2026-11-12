// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

/*
 * Runs the installed PostHog SDK through the web analytics boundary, as `web-analytics-provider.test.tsx` does, so
 * the flag source is proven against the SDK's real `/flags` handling, `onFeatureFlags` and console overrides.
 * Transport is stubbed so nothing leaves the process.
 */

const state = vi.hoisted(() => ({ consent: 'declined' as 'unknown' | 'accepted' | 'declined' }));

vi.mock('#hooks/use-cookie-consent.js', () => ({ useCookieConsent: () => state.consent }));
vi.mock('#environment.config.js', () => ({
  ENV: { POSTHOG_CLIENT_KEY: 'phc_test_key', POSTHOG_UI_HOST: 'https://posthog.example.invalid' },
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined, isPending: false }) }));

const requests: string[] = [];
const flagsResponse = JSON.stringify({
  flags: {
    onboarding: { key: 'onboarding', enabled: true },
    'onboarding-auto-open': { key: 'onboarding-auto-open', enabled: false },
  },
});

vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation((_method, url) => {
  requests.push(String(url));
});
vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    return new Response(url.includes('/flags/') ? flagsResponse : '{}', { status: 200 });
  }),
);
vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => {
  clearTimeout(id);
});
Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) });

const { posthog } = await import('posthog-js');
const { WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js');
const { useFeature } = await import('#flags/use-feature.js');

type ConsoleWindow = { posthog?: typeof posthog };

const Flags = (): React.JSX.Element => (
  <p>
    {`onboarding=${String(useFeature('onboarding'))} viewerControls=${String(useFeature('viewerControls'))} autoOpen=${String(useFeature('onboardingAutoOpen'))}`}
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

afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The SDK singleton is loaded once per module graph, so these run in order.
describe('PostHog-backed flags through the web analytics boundary', () => {
  it('resolves to defaults and requests no flags when analytics are declined', async () => {
    const view = render(tree());
    await settle();
    expect(screen.getByText('onboarding=false viewerControls=false autoOpen=false')).toBeInTheDocument();
    expect(requests.some((url) => url.includes('/flags/'))).toBe(false);
    expect((globalThis as ConsoleWindow).posthog).toBeUndefined();
    view.unmount();
  });

  it("follows PostHog's evaluation after consent and console overrides live", async () => {
    state.consent = 'accepted';
    const view = render(tree());
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
