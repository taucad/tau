// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { store } from '#hooks/use-cookie.js';

/*
 * The onboarding baseline through the web analytics boundary and the installed PostHog SDK (M1, M3): `first_seen`
 * is captured once per device, only after consent is accepted, and never while it is declined. Transport is stubbed.
 */

const state = vi.hoisted(() => ({
  consent: 'declined' as 'unknown' | 'accepted' | 'declined',
}));

vi.mock('#hooks/use-cookie-consent.js', () => ({
  useCookieConsent: () => state.consent,
}));
vi.mock('#environment.config.js', () => ({
  ENV: {
    POSTHOG_CLIENT_KEY: 'phc_baseline_web',
    POSTHOG_UI_HOST: 'https://posthog.example.invalid',
  },
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: undefined, isPending: false }),
}));

vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => undefined);
vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('{}', { status: 200 })),
);
vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => {
  clearTimeout(id);
});
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: vi.fn(() => true),
});

const { posthog } = await import('posthog-js');
const { WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js');
const { firstSeenStorageName, markFirstSeen, reportFirstModelBuilt } =
  await import('#telemetry/onboarding-telemetry.js');

const capture = vi.spyOn(posthog, 'capture');
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

afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The SDK singleton is loaded once per module graph, so these run in order.
describe('onboarding baseline through the web analytics boundary', () => {
  it('captures nothing while consent is declined', async () => {
    store.remove(firstSeenStorageName);
    markFirstSeen();
    const view = render(<WebAnalyticsProvider>{undefined}</WebAnalyticsProvider>);
    await settle();
    reportFirstModelBuilt({ kernel: 'openscad' });
    expect(baselineCalls()).toStrictEqual([]);
    view.unmount();
  });

  it('captures first_seen once after consent is accepted, then the first model once', async () => {
    state.consent = 'accepted';
    const view = render(<WebAnalyticsProvider>{undefined}</WebAnalyticsProvider>);
    await vi.waitFor(() => {
      expect(baselineCalls().map(([event]) => event)).toStrictEqual(['first_seen']);
    }, sdkResponse);
    const firstSeen = baselineCalls()[0]?.[1] as Record<string, unknown> | undefined;
    expect(Object.keys(firstSeen ?? {}).toSorted()).toStrictEqual(['host', 'ms_since_first_seen']);
    expect(firstSeen).toMatchObject({ host: 'web' });
    expect(typeof firstSeen?.['ms_since_first_seen']).toBe('number');
    reportFirstModelBuilt({ kernel: 'openscad' });
    reportFirstModelBuilt({ kernel: 'openscad' });
    expect(baselineCalls().map(([event]) => event)).toStrictEqual(['first_seen', 'first_model_built']);
    view.unmount();

    // Another load on the same device sends no second first_seen.
    const again = render(<WebAnalyticsProvider>{undefined}</WebAnalyticsProvider>);
    await settle();
    expect(baselineCalls().map(([event]) => event)).toStrictEqual(['first_seen', 'first_model_built']);
    again.unmount();
  });
});
