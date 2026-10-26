// @vitest-environment jsdom
import * as Cookies from 'es-cookie';
import { afterEach, describe, expect, it } from 'vitest';
import { consentCookieName } from '@taucad/consent';
import { useCookieConsent } from '#hooks/use-cookie-consent.desktop.js';

afterEach(() => {
  Cookies.remove(consentCookieName);
});

describe('desktop useCookieConsent', () => {
  it('should report no analytics-cookie decision even when a web consent cookie is present', () => {
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));
    expect(useCookieConsent()).toBe('unknown');
  });
});
