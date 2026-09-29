// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import * as Cookies from 'es-cookie';
import { gunzipSync } from 'node:zlib';
import { StrictMode, useState } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { useAnalytics } from '#hooks/use-analytics.js';

/*
 * Runs the installed PostHog SDK, not a mock: the defects this suite guards
 * (re-initialisation no-ops, pre-init identify, remounts) only exist in the real
 * singleton. Transport is stubbed so nothing leaves the process.
 */

type TestUser = { id: string; email: string; name: string; image: string };

const state = vi.hoisted(() => ({
  consent: 'unknown' as 'unknown' | 'accepted' | 'declined',
  isPending: true,
  user: undefined as TestUser | undefined,
}));

vi.mock('#hooks/use-cookie-consent.js', () => ({ useCookieConsent: () => [state.consent, vi.fn()] }));
vi.mock('#environment.config.js', () => ({
  ENV: { POSTHOG_CLIENT_KEY: 'phc_test_key', POSTHOG_UI_HOST: 'https://posthog.example.invalid' },
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: state.user ? { user: state.user } : undefined, isPending: state.isPending }),
}));

const userA: TestUser = { id: 'user-a', email: 'a@example.invalid', name: 'A', image: '' };
const userB: TestUser = { id: 'user-b', email: 'b@example.invalid', name: 'B', image: '' };

const transport = {
  requests: [] as string[],
  bodies: [] as Array<{ url: string; body: BodyInit | undefined }>,
  pendingFlags: [] as Array<() => void>,
  holdFlags: false as boolean,
};

vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation((_method, url) => {
  transport.requests.push(String(url));
});
vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    transport.requests.push(url);
    transport.bodies.push({ url, body: init?.body ?? undefined });
    if (url.includes('/flags/') && transport.holdFlags) {
      await new Promise<void>((resolve) => {
        transport.pendingFlags.push(resolve);
      });
    }
    return new Response('{"flags":{},"sessionRecording":{"sampleRate":1,"minimumDurationMilliseconds":0}}', {
      status: 200,
    });
  }),
);
vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => {
  clearTimeout(id);
});
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: vi.fn((url: string, body: BodyInit) => {
    transport.requests.push(url);
    transport.bodies.push({ url, body });
    return true;
  }),
});

const { posthog } = await import('posthog-js');
const { WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js');

const transmittedEvents = (): Array<{
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
}> =>
  transport.bodies
    .filter(({ url, body }) => url.includes('/e/') && body instanceof ArrayBuffer)
    .map(
      ({ body }) =>
        JSON.parse(gunzipSync(new Uint8Array(body as ArrayBuffer)).toString()) as {
          event: string;
          properties: Record<string, unknown>;
          $set?: Record<string, unknown>;
        },
    );

afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const Draft = (): React.JSX.Element => {
  const [draft, setDraft] = useState('');
  const analytics = useAnalytics();
  return (
    <>
      <input
        aria-label='Draft'
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <button
        type='button'
        onClick={() => {
          analytics.capture('draft_saved');
        }}
      >
        Save
      </button>
    </>
  );
};

const tree = (): ReactNode => (
  <StrictMode>
    <WebAnalyticsProvider>
      <Draft />
    </WebAnalyticsProvider>
  </StrictMode>
);

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  });
};

const pageviews = (calls: ReadonlyArray<readonly unknown[]>): number =>
  calls.filter((call) => call[0] === '$pageview').length;

describe('WebAnalyticsProvider', () => {
  // Must run first: the SDK singleton is loaded once per module graph.
  it('should clear stale PostHog storage on a declined cold load without starting the SDK', async () => {
    localStorage.setItem('ph_phc_test_key_posthog', '{"distinct_id":"stale"}');
    localStorage.setItem('tau-sidebar', 'true');
    sessionStorage.setItem('ph_phc_test_key_window_id', 'stale');
    Cookies.set('ph_phc_test_key_posthog', 'stale', { path: '/' });
    const capture = vi.spyOn(posthog, 'capture');
    state.consent = 'declined';

    const view = render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();

    expect(localStorage.getItem('ph_phc_test_key_posthog')).toBeNull();
    expect(sessionStorage.getItem('ph_phc_test_key_window_id')).toBeNull();
    expect(Cookies.get('ph_phc_test_key_posthog')).toBeUndefined();
    expect(localStorage.getItem('tau-sidebar')).toBe('true');
    expect(posthog.__loaded).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(transport.requests).toHaveLength(0);
    view.unmount();
    capture.mockRestore();
  });

  it('should keep product state and apply accept, withdrawal, re-acceptance and identity to the real SDK', async () => {
    const init = vi.spyOn(posthog, 'init');
    const capture = vi.spyOn(posthog, 'capture');
    state.consent = 'unknown';
    state.isPending = true;
    state.user = undefined;

    const view = render(tree());
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'unsaved design' } });
    const input = screen.getByRole('textbox', { name: 'Draft' });
    localStorage.setItem('tau-sidebar', 'true');
    Cookies.set('tau-auth-test', 'essential', { path: '/' });

    // Accept while the session is still resolving: capture starts, identity waits.
    Cookies.set('tau-cookie-consent', JSON.stringify({ status: 'accepted', version: 1 }), { path: '/' });
    state.consent = 'accepted';
    view.rerender(tree());
    await settle();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect((input as HTMLInputElement).value).toBe('unsaved design');
    expect(init).toHaveBeenCalledOnce();
    expect(posthog.has_opted_out_capturing()).toBe(false);
    expect(posthog._isIdentified()).toBe(false);
    const initialPageviews = pageviews(capture.mock.calls);
    expect(initialPageviews).toBe(1);
    await vi.waitFor(() => {
      expect(transmittedEvents().filter(({ event }) => event === '$pageview')).toHaveLength(1);
    });

    // Session resolves after initialisation: identified exactly as this user.
    state.isPending = false;
    state.user = userA;
    view.rerender(tree());
    expect(posthog.get_distinct_id()).toBe('user-a');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(capture).toHaveBeenCalledWith('draft_saved', undefined);
    await settle();
    await vi.waitFor(() => {
      expect(
        transmittedEvents().some(
          ({ event, properties }) => event === 'draft_saved' && properties['distinct_id'] === 'user-a',
        ),
      ).toBe(true);
    });
    await vi.waitFor(() => {
      expect(
        transmittedEvents().some(
          ({ event, properties }) => event === '$identify' && properties['distinct_id'] === 'user-a',
        ),
      ).toBe(true);
    });
    await vi.waitFor(() => {
      expect(
        transmittedEvents().some(({ event, $set }) => event === '$identify' && $set?.['email'] === userA.email),
      ).toBe(true);
    });

    // Withdrawal: opted out, identity reset, product untouched.
    Cookies.set('tau-cookie-consent', JSON.stringify({ status: 'declined', version: 1 }), { path: '/' });
    state.consent = 'declined';
    transport.holdFlags = true;
    posthog.reloadFeatureFlags();
    await settle();
    expect(transport.pendingFlags.length).toBeGreaterThan(0);
    const requestsBeforeWithdrawal = transport.requests.length;
    view.rerender(tree());
    for (const resolve of transport.pendingFlags.splice(0)) {
      resolve();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    globalThis.dispatchEvent(new Event('focus'));
    history.pushState({}, '', '/after-withdrawal');
    globalThis.dispatchEvent(new Event('pagehide'));
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10_100);
      });
    });
    expect(transport.requests.slice(requestsBeforeWithdrawal)).toEqual([]);
    expect(localStorage.getItem('ph_phc_test_key_posthog')).toBeNull();
    expect(Cookies.get('ph_phc_test_key_posthog')).toBeUndefined();
    expect(Object.keys(sessionStorage).filter((key) => key.startsWith('ph_phc_test_key'))).toEqual([]);
    expect(Cookies.get('tau-cookie-consent')).toBeDefined();
    expect(Cookies.get('tau-auth-test')).toBe('essential');
    expect(localStorage.getItem('tau-sidebar')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(posthog.has_opted_out_capturing()).toBe(true);
    expect(posthog._isIdentified()).toBe(false);
    capture.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(capture.mock.calls.filter(([event]) => event === 'draft_saved')).toEqual([]);

    // Re-acceptance resumes without re-initialising or repeating the initial pageview.
    Cookies.set('tau-cookie-consent', JSON.stringify({ status: 'accepted', version: 1 }), { path: '/' });
    state.consent = 'accepted';
    view.rerender(tree());
    await settle();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(init).toHaveBeenCalledOnce();
    expect(posthog.has_opted_out_capturing()).toBe(false);
    expect(posthog.get_distinct_id()).toBe('user-a');
    await vi.waitFor(() => {
      expect(transmittedEvents().filter(({ event }) => event === '$pageview')).toHaveLength(1);
    });
    const deliveredBeforeReaccept = transmittedEvents().filter(({ event }) => event === 'draft_saved').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    await vi.waitFor(() => {
      expect(transmittedEvents().filter(({ event }) => event === 'draft_saved')).toHaveLength(
        deliveredBeforeReaccept + 1,
      );
    });

    // Account switch and logout.
    state.user = userB;
    view.rerender(tree());
    expect(posthog.get_distinct_id()).toBe('user-b');
    const savedBeforeSwitch = transmittedEvents().filter(({ event }) => event === 'draft_saved').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(transmittedEvents().filter(({ event }) => event === 'draft_saved')).toHaveLength(savedBeforeSwitch + 1);
    });
    expect(transmittedEvents().findLast(({ event }) => event === 'draft_saved')?.properties['distinct_id']).toBe(
      'user-b',
    );
    state.isPending = true;
    state.user = undefined;
    view.rerender(tree());
    expect(posthog._isIdentified()).toBe(true);
    const savedWhilePending = transmittedEvents().filter(({ event }) => event === 'draft_saved').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(transmittedEvents().filter(({ event }) => event === 'draft_saved')).toHaveLength(savedWhilePending + 1);
    });
    expect(transmittedEvents().findLast(({ event }) => event === 'draft_saved')?.properties['distinct_id']).toBe(
      'user-b',
    );
    state.isPending = false;
    view.rerender(tree());
    expect(posthog._isIdentified()).toBe(false);
    const savedAfterLogout = transmittedEvents().filter(({ event }) => event === 'draft_saved').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(transmittedEvents().filter(({ event }) => event === 'draft_saved')).toHaveLength(savedAfterLogout + 1);
    });
    expect(transmittedEvents().findLast(({ event }) => event === 'draft_saved')?.properties['distinct_id']).not.toBe(
      'user-b',
    );

    view.unmount();
  }, 20_000);
});
