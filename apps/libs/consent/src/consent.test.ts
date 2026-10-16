// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  consentChannelName,
  consentCookieName,
  parseConsent,
  readConsentCookie,
  serializeConsentCookie,
  writeConsent,
} from '#consent.js';

const accepted = encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 }));

afterEach(() => {
  writeConsent(undefined);
});

describe('parseConsent', () => {
  it('should resolve absent, malformed, versioned and legacy values', () => {
    expect(parseConsent(undefined)).toStrictEqual({ legacy: false, status: 'unknown' });
    expect(parseConsent('{broken')).toStrictEqual({ legacy: false, status: 'unknown' });
    expect(parseConsent('{"status":"accepted","version":2}')).toStrictEqual({ legacy: false, status: 'unknown' });
    expect(parseConsent('{"status":"declined","version":1}')).toStrictEqual({ legacy: false, status: 'declined' });
    expect(parseConsent('"granted"')).toStrictEqual({ legacy: true, status: 'accepted' });
    expect(parseConsent('denied')).toStrictEqual({ legacy: true, status: 'declined' });
  });
});

describe('readConsentCookie', () => {
  it('should find the decision among other cookies and ignore look-alike names', () => {
    expect(readConsentCookie(`theme=dark; ${consentCookieName}=${accepted}`)).toBe('accepted');
    expect(readConsentCookie(`x-${consentCookieName}=${accepted}`)).toBe('unknown');
    expect(readConsentCookie(`${consentCookieName}=%E0%A4%A`)).toBe('unknown');
    expect(readConsentCookie(undefined)).toBe('unknown');
  });
});

describe('serializeConsentCookie', () => {
  it('should store the versioned decision for a year and delete it on withdrawal', () => {
    expect(serializeConsentCookie('accepted', true)).toBe(
      `${consentCookieName}=${accepted}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
    expect(serializeConsentCookie(undefined, false)).toBe(`${consentCookieName}=; Path=/; Max-Age=0; SameSite=Lax`);
  });
});

describe('writeConsent', () => {
  it('should write the cookie and announce the change to other documents', async () => {
    const listener = new BroadcastChannel(consentChannelName);
    const message = new Promise((resolve) => {
      listener.addEventListener('message', ({ data }) => {
        resolve(data);
      });
    });

    writeConsent('declined');

    expect(readConsentCookie(document.cookie)).toBe('declined');
    await expect(message).resolves.toBe('declined');
    listener.close();
  });
});
