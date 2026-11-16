// @vitest-environment jsdom
import * as Cookies from 'es-cookie';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { consentCookieName } from '@taucad/consent';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';

const accepted = JSON.stringify({ status: 'accepted', version: 1 });
const declined = JSON.stringify({ status: 'declined', version: 1 });

afterEach(() => {
  Cookies.remove(consentCookieName);
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
  Object.defineProperty(globalThis, 'cookieStore', { configurable: true, value: undefined });
});

describe('cookie consent', () => {
  it('should resolve absent, malformed, current, and legacy decisions', () => {
    expect(readConsentStatus()).toBe('unknown');
    Cookies.set(consentCookieName, '{broken');
    expect(readConsentStatus()).toBe('unknown');
    Cookies.set(consentCookieName, accepted);
    expect(readConsentStatus()).toBe('accepted');
    for (const [legacy, status] of [
      ['"granted"', 'accepted'],
      ['"denied"', 'declined'],
      ['"accepted"', 'accepted'],
      ['"declined"', 'declined'],
    ] as const) {
      Cookies.set(consentCookieName, legacy);
      expect(readConsentStatus()).toBe(status);
    }
  });

  it('should make GPC a hard declined state', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));

    expect(readConsentStatus()).toBe('declined');
  });

  it('should render unknown on the server whatever the cookie says, so the document admits no analytics', () => {
    Cookies.set(consentCookieName, accepted);
    const probe = (): React.JSX.Element => createElement('span', null, useCookieConsent());

    expect(renderToString(createElement(probe))).toContain('unknown');
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
