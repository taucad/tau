import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: undefined as { user: { id: string } } | undefined,
  sessionPending: false,
  device: 'unset' as unknown,
  analytics: 'unknown' as 'accepted' | 'declined' | 'unknown',
  server: undefined as boolean | undefined,
  loading: false,
  updating: false,
  gpc: false,
}));
const setDevice = vi.hoisted(() => vi.fn());
const updatePreferences = vi.hoisted(() => vi.fn());
const onConsentInputsChanged = vi.hoisted(() => vi.fn());

vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: state.session, isPending: state.sessionPending }),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [state.device, setDevice] }));
vi.mock('#hooks/use-cookie-consent.js', () => ({ useCookieConsent: () => state.analytics }));
vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: (options: { enabled?: boolean }) => ({
    preferences:
      options.enabled === true && state.server !== undefined ? { allowsUsageMetrics: state.server } : undefined,
    isLoading: options.enabled === true && state.loading,
    error: undefined,
    updatePreferences,
    isUpdating: state.updating,
  }),
}));
vi.mock('#lib/global-privacy-control.lib.js', () => ({ isGlobalPrivacyControlEnabled: () => state.gpc }));
vi.mock('#telemetry/runtime-telemetry.js', () => ({ pageTelemetry: () => ({ onConsentInputsChanged }) }));

const { useTelemetrySwitch } = await import('#hooks/use-telemetry-switch.js');

describe('useTelemetrySwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, {
      session: undefined,
      sessionPending: false,
      device: 'unset',
      analytics: 'unknown',
      server: undefined,
      loading: false,
      updating: false,
      gpc: false,
    });
  });

  it('should be on by default for a signed-out page', () => {
    const { result } = renderHook(() => useTelemetrySwitch());

    expect(result.current).toMatchObject({ checked: true, pending: false, forcedOff: false, consent: 'granted' });
  });

  it('should write only the device store when signed out', () => {
    const { result } = renderHook(() => useTelemetrySwitch());

    act(() => {
      result.current.onCheckedChange(false);
    });

    expect(setDevice).toHaveBeenCalledWith('off');
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('should write the device store first, then the account preference, when signed in', () => {
    state.session = { user: { id: 'account-1' } };
    state.server = true;
    const { result } = renderHook(() => useTelemetrySwitch());

    act(() => {
      result.current.onCheckedChange(false);
    });

    expect(setDevice).toHaveBeenCalledWith('off');
    expect(updatePreferences).toHaveBeenCalledWith({ allowsUsageMetrics: false });
    expect(setDevice.mock.invocationCallOrder[0]).toBeLessThan(updatePreferences.mock.invocationCallOrder[0]!);
  });

  it('should be pending, not on, while a signed-in preference loads', () => {
    state.session = { user: { id: 'account-1' } };
    state.loading = true;
    const { result } = renderHook(() => useTelemetrySwitch());

    expect(result.current).toMatchObject({ checked: false, pending: true });
  });

  it('should keep a sticky device off whatever the server says', () => {
    state.session = { user: { id: 'account-1' } };
    state.server = true;
    state.device = 'off';
    const { result } = renderHook(() => useTelemetrySwitch());

    expect(result.current.checked).toBe(false);
  });

  it.each([
    ['GPC', { gpc: true }],
    ['a declined analytics decision', { analytics: 'declined' }],
  ])('should force the switch off on %s', (_label, overrides) => {
    Object.assign(state, overrides);
    const { result } = renderHook(() => useTelemetrySwitch());

    expect(result.current).toMatchObject({ checked: false, forcedOff: true });
  });

  it('should tell the page composition on a change, with the update-pending state', () => {
    state.updating = true;
    renderHook(() => useTelemetrySwitch());

    expect(onConsentInputsChanged).toHaveBeenCalledWith(expect.objectContaining({ updatePending: true }));
  });

  it('should disclose the producers the switch does not stop yet', () => {
    const { result } = renderHook(() => useTelemetrySwitch());

    const details = result.current.details.join(' ');
    expect(details).toMatch(/may still be sent while this is off/u);
    expect(details).toMatch(/tau telemetry off/u);
  });
});
