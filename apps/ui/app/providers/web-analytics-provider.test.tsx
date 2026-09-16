// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import * as Cookies from 'es-cookie';
import { StrictMode, useState } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { posthog } from 'posthog-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAnalytics } from '#hooks/use-analytics.js';
import { WebAnalyticsProvider } from '#providers/web-analytics-provider.js';

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

const transport = { requests: 0 };

beforeAll(() => {
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {
    transport.requests += 1;
  });
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      transport.requests += 1;
      return new Response('{}', { status: 200 });
    }),
  );
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => {
    clearTimeout(id);
  });
});

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
    expect(transport.requests).toBe(0);
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

    // Accept while the session is still resolving: capture starts, identity waits.
    state.consent = 'accepted';
    view.rerender(tree());
    await settle();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(input).toHaveValue('unsaved design');
    expect(init).toHaveBeenCalledOnce();
    expect(posthog.has_opted_out_capturing()).toBe(false);
    expect(posthog._isIdentified()).toBe(false);
    const initialPageviews = pageviews(capture.mock.calls);
    expect(initialPageviews).toBeLessThanOrEqual(1);

    // Session resolves after initialisation: identified exactly as this user.
    state.isPending = false;
    state.user = userA;
    view.rerender(tree());
    expect(posthog.get_distinct_id()).toBe('user-a');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(capture).toHaveBeenCalledWith('draft_saved', undefined);

    // Withdrawal: opted out, identity reset, product untouched.
    state.consent = 'declined';
    view.rerender(tree());
    await settle();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(posthog.has_opted_out_capturing()).toBe(true);
    expect(posthog._isIdentified()).toBe(false);
    capture.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(capture).not.toHaveBeenCalled();

    // Re-acceptance resumes without re-initialising or repeating the initial pageview.
    state.consent = 'accepted';
    view.rerender(tree());
    await settle();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(init).toHaveBeenCalledOnce();
    expect(posthog.has_opted_out_capturing()).toBe(false);
    expect(posthog.get_distinct_id()).toBe('user-a');
    expect(pageviews(capture.mock.calls)).toBe(0);

    // Account switch and logout.
    state.user = userB;
    view.rerender(tree());
    expect(posthog.get_distinct_id()).toBe('user-b');
    state.isPending = true;
    state.user = undefined;
    view.rerender(tree());
    expect(posthog._isIdentified()).toBe(true);
    state.isPending = false;
    view.rerender(tree());
    expect(posthog._isIdentified()).toBe(false);

    view.unmount();
  });
});
