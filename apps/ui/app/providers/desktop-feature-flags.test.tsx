// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { store } from '#hooks/use-cookie.js';

/*
 * Runs the installed PostHog SDK through the desktop analytics boundary with the desktop options, where no remote
 * script loads, so the SDK's own JSON remote-config fallback requests flags on init. Transport is stubbed.
 */

vi.mock('#environment.config.js', () => ({
  ENV: { POSTHOG_API_HOST: 'https://us.i.posthog.com', POSTHOG_CLIENT_KEY: 'phc_desktop_flags' },
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined, isPending: false }) }));

const requests: string[] = [];
vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation((_method, url) => {
  requests.push(String(url));
});
vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    const body = url.includes('/flags/')
      ? { flags: { 'viewer-controls': { key: 'viewer-controls', enabled: true } } }
      : { hasFeatureFlags: true };
    return new Response(JSON.stringify(body), { status: 200 });
  }),
);
Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) });

const { DesktopAnalyticsProvider } = await import('#providers/desktop-analytics-provider.js');
const { desktopAnalyticsStorageName, useDesktopAnalytics } = await import('#hooks/use-desktop-analytics.js');
const { useFeature } = await import('#flags/use-feature.js');

function Workspace(): React.JSX.Element {
  const [isEnabled, setEnabled] = useDesktopAnalytics();
  return (
    <button
      type='button'
      onClick={() => {
        setEnabled(!isEnabled);
      }}
    >
      {`viewerControls=${String(useFeature('viewerControls'))}`}
    </button>
  );
}

/** The real SDK debounces and fetches asynchronously; a loaded CI runner can take longer than the 1 s default. */
const sdkResponse = { timeout: 10_000 };

afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PostHog-backed flags through the desktop analytics boundary', () => {
  it('loads flags on init while analytics are on, and returns to defaults when they are turned off', async () => {
    store.remove(desktopAnalyticsStorageName);
    render(
      <DesktopAnalyticsProvider>
        <Workspace />
      </DesktopAnalyticsProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('viewerControls=false');
    await vi.waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('viewerControls=true');
    }, sdkResponse);
    expect(requests.some((url) => url.startsWith('https://us.i.posthog.com/flags/'))).toBe(true);

    act(() => {
      screen.getByRole('button').click();
    });
    await vi.waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('viewerControls=false');
    }, sdkResponse);
  });
});
