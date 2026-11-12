// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { cleanup, render } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { store } from '#hooks/use-cookie.js';

/*
 * The onboarding baseline through the desktop analytics boundary (M1): with Data controls' analytics switch off,
 * the SDK never starts and no baseline event is captured. Transport is stubbed.
 */

vi.mock('#environment.config.js', () => ({
  ENV: {
    POSTHOG_API_HOST: 'https://us.i.posthog.com',
    POSTHOG_CLIENT_KEY: 'phc_baseline_desktop',
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
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: vi.fn(() => true),
});

const { posthog } = await import('posthog-js');
const { DesktopAnalyticsProvider } = await import('#providers/desktop-analytics-provider.js');
const { desktopAnalyticsStorageName } = await import('#hooks/use-desktop-analytics.js');
const { firstSeenStorageName, reportFirstExport, reportFirstModelBuilt } =
  await import('#telemetry/onboarding-telemetry.js');

const capture = vi.spyOn(posthog, 'capture');

afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('onboarding baseline through the desktop analytics boundary', () => {
  it('captures no baseline event while analytics are off in Data controls', async () => {
    store.remove(firstSeenStorageName);
    store.update(desktopAnalyticsStorageName, false);
    const view = render(<DesktopAnalyticsProvider>{undefined}</DesktopAnalyticsProvider>);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    reportFirstModelBuilt({ kernel: 'openscad' });
    reportFirstExport({ kernel: 'openscad' });
    expect(capture).not.toHaveBeenCalled();
    view.unmount();
  });
});
