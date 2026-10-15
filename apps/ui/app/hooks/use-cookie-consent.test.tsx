// @vitest-environment jsdom
import * as Cookies from 'es-cookie';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouter from 'react-router';
import { consentCookieName } from '@taucad/consent';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { readConsentStatus, readConsentStatusFromHeader } from '#lib/cookie-consent.lib.js';
import { resetRequestGlobalPrivacyControl } from '#lib/global-privacy-control.lib.js';

type LoaderData = { consentStatus: string; globalPrivacyControl: boolean };

const loader = vi.hoisted((): { data: LoaderData } => ({
  data: { consentStatus: 'unknown', globalPrivacyControl: false },
}));

vi.mock('react-router', async (loadOriginal) => ({
  ...(await loadOriginal<typeof ReactRouter>()),
  useRouteLoaderData: () => loader.data,
}));

const accepted = JSON.stringify({ status: 'accepted', version: 1 });
const declined = JSON.stringify({ status: 'declined', version: 1 });

afterEach(() => {
  Cookies.remove(consentCookieName);
  loader.data = { consentStatus: 'unknown', globalPrivacyControl: false };
  resetRequestGlobalPrivacyControl();
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
  Object.defineProperty(globalThis, 'cookieStore', { configurable: true, value: undefined });
});

describe('cookie consent', () => {
  it('should resolve absent, malformed, current, and legacy decisions', () => {
    expect(readConsentStatusFromHeader(undefined, false)).toBe('unknown');
    expect(readConsentStatusFromHeader(`${consentCookieName}=%7Bbroken`, false)).toBe('unknown');
    expect(
      readConsentStatusFromHeader(
        `${consentCookieName}=${encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 }))}`,
        false,
      ),
    ).toBe('accepted');
    expect(readConsentStatusFromHeader(`${consentCookieName}=%22granted%22`, false)).toBe('accepted');
    expect(readConsentStatusFromHeader(`${consentCookieName}=%22denied%22`, false)).toBe('declined');
    expect(readConsentStatusFromHeader(`${consentCookieName}=%22accepted%22`, false)).toBe('accepted');
    expect(readConsentStatusFromHeader(`${consentCookieName}=%22declined%22`, false)).toBe('declined');
  });

  it('should make GPC a hard declined state', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));

    expect(readConsentStatus()).toBe('declined');
    expect(readConsentStatusFromHeader(`${consentCookieName}=%22granted%22`, true)).toBe('declined');
  });

  it('should keep a request-header-only GPC signal authoritative after hydration', () => {
    Cookies.set(consentCookieName, accepted);
    loader.data = { consentStatus: 'declined', globalPrivacyControl: true };

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current).toBe('declined');
    expect(readConsentStatus()).toBe('declined');
  });

  it('should notice a decision the marketing site broadcasts', async () => {
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current).toBe('unknown');

    Cookies.set(consentCookieName, accepted);
    const channel = new BroadcastChannel('tau-cookie-consent');
    channel.postMessage('accepted');
    channel.close();

    await waitFor(() => {
      expect(result.current).toBe('accepted');
    });
  });

  it('should notice a withdrawal made in another tab when this tab regains focus', () => {
    Cookies.set(consentCookieName, accepted);
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current).toBe('accepted');

    act(() => {
      Cookies.set(consentCookieName, declined);
      globalThis.dispatchEvent(new Event('focus'));
    });

    expect(result.current).toBe('declined');
  });

  it('should return to unknown when the decision expires while the tab is hidden', () => {
    Cookies.set(consentCookieName, accepted);
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      Cookies.remove(consentCookieName);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('unknown');
  });

  it('should notice expiry while focused through Cookie Store change events', () => {
    const store = new EventTarget();
    Object.defineProperty(globalThis, 'cookieStore', { configurable: true, value: store });
    Cookies.set(consentCookieName, accepted);
    const removeListener = vi.spyOn(store, 'removeEventListener');
    const { result, unmount } = renderHook(() => useCookieConsent());
    expect(result.current).toBe('accepted');

    act(() => {
      Cookies.remove(consentCookieName);
      store.dispatchEvent(Object.assign(new Event('change'), { deleted: [{ name: consentCookieName }] }));
    });

    expect(result.current).toBe('unknown');
    unmount();
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
