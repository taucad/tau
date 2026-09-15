// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAnalyticsProvider } from '#providers/web-analytics-provider.js';

const state = vi.hoisted(() => ({ consent: 'unknown' as 'unknown' | 'accepted' | 'declined' }));
const provider = vi.hoisted(() =>
  vi.fn(({ children }: { readonly children: React.ReactNode }): React.JSX.Element => <div>{children}</div>),
);
const posthog = vi.hoisted(() => ({
  _isIdentified: vi.fn(() => false),
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog API
  opt_in_capturing: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog API
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

vi.mock('#hooks/use-cookie-consent.js', () => ({ useCookieConsent: () => [state.consent, vi.fn()] }));
vi.mock('#lib/posthog.lib.js', () => ({ posthogConfig: { apiKey: 'ph_test', options: {} } }));
vi.mock('posthog-js/react', () => ({ PostHogProvider: provider, usePostHog: () => posthog }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined }) }));

describe('WebAnalyticsProvider', () => {
  beforeEach(() => {
    state.consent = 'unknown';
    vi.clearAllMocks();
  });

  it('should not initialize PostHog before consent', () => {
    render(<WebAnalyticsProvider>content</WebAnalyticsProvider>);

    expect(provider).not.toHaveBeenCalled();
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
  });

  it('should preserve accepted analytics and clear it on withdrawal', async () => {
    state.consent = 'accepted';
    const view = render(<WebAnalyticsProvider>content</WebAnalyticsProvider>);
    await waitFor(() => {
      expect(provider).toHaveBeenCalledOnce();
    });
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();

    state.consent = 'declined';
    view.rerender(<WebAnalyticsProvider>content</WebAnalyticsProvider>);
    await waitFor(() => {
      expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
    });
    expect(posthog.stopSessionRecording).toHaveBeenCalledOnce();
    expect(posthog.reset).toHaveBeenCalledOnce();
  });
});
