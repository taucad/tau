// @vitest-environment jsdom
import * as Cookies from 'es-cookie';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouter from 'react-router';
import { consentCookieName } from '#constants/cookie.constants.js';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { readConsentStatus, readConsentStatusFromHeader } from '#lib/cookie-consent.lib.js';

vi.mock('react-router', async (loadOriginal) => ({
  ...(await loadOriginal<typeof ReactRouter>()),
  useRouteLoaderData: () => ({ consentStatus: 'unknown' }),
}));

afterEach(() => {
  Cookies.remove(consentCookieName);
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
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

  it('should persist accepted and withdrawn decisions in the versioned shape', () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current[1]('accepted');
    });
    expect(result.current[0]).toBe('accepted');
    expect(JSON.parse(Cookies.get(consentCookieName) ?? '')).toStrictEqual({ status: 'accepted', version: 1 });

    act(() => {
      result.current[1]('declined');
    });
    expect(result.current[0]).toBe('declined');
    expect(JSON.parse(Cookies.get(consentCookieName) ?? '')).toStrictEqual({ status: 'declined', version: 1 });
  });

  it('should migrate a valid legacy decision without changing its meaning', () => {
    Cookies.set(consentCookieName, JSON.stringify('granted'));

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current[0]).toBe('accepted');
    expect(JSON.parse(Cookies.get(consentCookieName) ?? '')).toStrictEqual({ status: 'accepted', version: 1 });
  });
});
