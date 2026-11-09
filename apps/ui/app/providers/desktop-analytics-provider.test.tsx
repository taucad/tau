// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { useAnalytics } from '#hooks/use-analytics.js';
import { store } from '#hooks/use-cookie.js';

/*
 * Runs the installed PostHog SDK, as the web suite does: withdrawal has to reach the real singleton's opt-out, identity
 * and storage. Transport is stubbed so nothing leaves the process.
 */

vi.mock('#environment.config.js', () => ({
  ENV: { POSTHOG_API_HOST: 'https://us.i.posthog.com', POSTHOG_CLIENT_KEY: 'phc_desktop' },
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
    requests.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response('{"flags":{}}', { status: 200 });
  }),
);
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: vi.fn((url: string) => {
    requests.push(url);
    return true;
  }),
});

const { posthog } = await import('posthog-js');
const { DesktopAnalyticsProvider } = await import('#providers/desktop-analytics-provider.js');
const { desktopAnalyticsStorageName, useDesktopAnalytics } = await import('#hooks/use-desktop-analytics.js');

function Workspace(): React.JSX.Element {
  const analytics = useAnalytics();
  const [isEnabled, setEnabled] = useDesktopAnalytics();
  return (
    <>
      <button
        type='button'
        onClick={() => {
          analytics.capture('draft_saved');
        }}
      >
        Save
      </button>
      <button
        type='button'
        onClick={() => {
          setEnabled(!isEnabled);
        }}
      >
        {isEnabled ? 'Turn analytics off' : 'Turn analytics on'}
      </button>
    </>
  );
}

const tree = (): ReactNode => (
  <StrictMode>
    <DesktopAnalyticsProvider>
      <Workspace />
    </DesktopAnalyticsProvider>
  </StrictMode>
);

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  });
};

const posthogKeys = (): string[] => Object.keys(localStorage).filter((key) => key.startsWith('ph_phc_desktop'));

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DesktopAnalyticsProvider', () => {
  // Must run first: the SDK singleton is loaded once per module graph.
  it('should never start the SDK at launch while analytics are off, and clear what an earlier run stored', async () => {
    localStorage.setItem(desktopAnalyticsStorageName, 'false');
    localStorage.setItem('ph_phc_desktop_posthog', '{"distinct_id":"stale"}');
    const init = vi.spyOn(posthog, 'init');
    const capture = vi.spyOn(posthog, 'capture');

    render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();

    expect(screen.getByRole('button', { name: 'Turn analytics on' })).toBeInTheDocument();
    expect(init).not.toHaveBeenCalled();
    expect(posthog.__loaded).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(posthogKeys()).toEqual([]);
    expect(requests).toEqual([]);
    init.mockRestore();
    capture.mockRestore();
  });

  it('should run by default without replay, and stop, reset and clear when turned off, then resume', async () => {
    store.remove(desktopAnalyticsStorageName);
    const init = vi.spyOn(posthog, 'init');
    const capture = vi.spyOn(posthog, 'capture');

    // Default on: no decision is needed before capture.
    render(tree());
    await settle();
    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      'phc_desktop',
      expect.objectContaining({
        api_host: 'https://us.i.posthog.com',
        persistence: 'localStorage',
        disable_external_dependency_loading: true,
        disable_session_recording: true,
      }),
    );
    expect(posthog.has_opted_out_capturing()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(capture).toHaveBeenCalledWith('draft_saved', undefined);
    const anonymousId = posthog.get_distinct_id();
    expect(posthogKeys()).not.toEqual([]);

    // Off: capture stops, the identity is reset and the SDK's stored data is cleared; the choice persists.
    fireEvent.click(screen.getByRole('button', { name: 'Turn analytics off' }));
    await settle();
    expect(localStorage.getItem(desktopAnalyticsStorageName)).toBe('false');
    expect(posthog.has_opted_out_capturing()).toBe(true);
    expect(posthog.get_distinct_id()).not.toBe(anonymousId);
    expect(posthogKeys()).toEqual([]);
    capture.mockClear();
    const requestsAfterWithdrawal = requests.length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    expect(capture).not.toHaveBeenCalled();
    expect(requests.slice(requestsAfterWithdrawal)).toEqual([]);

    // On again: capture resumes on the same singleton, under a fresh identity.
    fireEvent.click(screen.getByRole('button', { name: 'Turn analytics on' }));
    await settle();
    expect(localStorage.getItem(desktopAnalyticsStorageName)).toBe('true');
    expect(init).toHaveBeenCalledOnce();
    expect(posthog.has_opted_out_capturing()).toBe(false);
    expect(posthog.get_distinct_id()).not.toBe(anonymousId);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(capture).toHaveBeenCalledWith('draft_saved', undefined);
  });
});
