import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: undefined as { user: { id: string } } | undefined,
  sessionPending: false,
  device: 'unset' as unknown,
  analytics: 'unknown' as 'accepted' | 'declined' | 'unknown',
  server: undefined as boolean | undefined,
  gpc: false,
}));

vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: state.session, isPending: state.sessionPending }),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [state.device, vi.fn()] }));
vi.mock('#hooks/use-cookie-consent.js', () => ({ useCookieConsent: () => state.analytics }));
vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: (options: { enabled?: boolean }) => ({
    preferences:
      options.enabled === true && state.server !== undefined ? { allowsUsageMetrics: state.server } : undefined,
    isLoading: false,
    error: undefined,
    updatePreferences: vi.fn(),
    isUpdating: false,
  }),
}));
vi.mock('@taucad/ui-core/lib/global-privacy-control.lib', () => ({ isGlobalPrivacyControlEnabled: () => state.gpc }));

const { useTelemetryConsent } = await import('#hooks/use-telemetry-consent.js');

describe('useTelemetryConsent', () => {
  beforeEach(() => {
    Object.assign(state, {
      session: undefined,
      sessionPending: false,
      device: 'unset',
      analytics: 'unknown',
      server: undefined,
      gpc: false,
    });
  });

  it('should grant a signed-out page with no device preference', () => {
    const { result } = renderHook(() => useTelemetryConsent());

    expect(result.current).toMatchObject({ consent: 'granted', server: 'none', device: 'unset' });
  });

  it('should deny a device off even when the account allows usage metrics', () => {
    state.session = { user: { id: 'account-1' } };
    state.server = true;
    state.device = 'off';
    const { result } = renderHook(() => useTelemetryConsent());

    expect(result.current.consent).toBe('denied');
  });

  it('should deny when the account disallows usage metrics', () => {
    state.session = { user: { id: 'account-1' } };
    state.server = false;
    const { result } = renderHook(() => useTelemetryConsent());

    expect(result.current.consent).toBe('denied');
  });

  it('should stay unknown while a signed-in preference loads or the session resolves', () => {
    state.session = { user: { id: 'account-1' } };
    const signedIn = renderHook(() => useTelemetryConsent());
    state.session = undefined;
    state.sessionPending = true;
    const resolving = renderHook(() => useTelemetryConsent());

    expect(signedIn.result.current.consent).toBe('unknown');
    expect(resolving.result.current.consent).toBe('unknown');
  });

  it.each([
    ['GPC', { gpc: true }],
    ['a declined analytics decision', { analytics: 'declined' }],
  ])('should deny on %s', (_label, overrides) => {
    Object.assign(state, overrides);
    const { result } = renderHook(() => useTelemetryConsent());

    expect(result.current.consent).toBe('denied');
  });
});
