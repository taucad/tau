// @vitest-environment node
import { createCookie } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Theme } from '#hooks/use-theme.js';
import { destroyThemeCookie, serializeThemeCookie } from '#theme-cookie.server.js';
import { readThemeCookie } from '#theme-cookie.js';

const cookieHeaderFromSetCookie = (setCookie: string): string => setCookie.split(';', 1)[0] ?? '';

const requestWithCookie = (cookie?: string): Request =>
  new Request('https://tau.new/', cookie ? { headers: { cookie } } : undefined);

const expectThemeCookieAttributes = (setCookie: string, secure: boolean): void => {
  const [cookiePair, ...attributes] = setCookie.split(/;\s*/);

  expect(cookiePair).toMatch(/^tau-theme=/);
  expect(attributes).toContain('Path=/');
  expect(attributes).toContain('HttpOnly');
  expect(attributes).toContain('SameSite=Lax');
  expect(attributes.some((attribute) => attribute.toLowerCase().startsWith('domain='))).toBe(false);
  expect(attributes.includes('Secure')).toBe(secure);
};

describe('theme cookie', () => {
  it.each([
    ['localhost HTTP', 'http://localhost:3000/action/set-theme', false],
    ['loopback HTTP', 'http://127.0.0.1:3000/action/set-theme', false],
    ['staging HTTPS', 'https://taucad.dev/action/set-theme', true],
    ['production HTTPS', 'https://tau.new/action/set-theme', true],
    ['preview HTTPS', 'https://deploy-preview-123--taucad.netlify.app/action/set-theme', true],
  ])('serializes a host-only cookie for %s', async (_label, requestUrl, secure) => {
    const setCookie = await serializeThemeCookie({ requestUrl, theme: Theme.DARK });

    expectThemeCookieAttributes(setCookie, secure);
  });

  it('serializes an unsigned scalar value', async () => {
    const setCookie = await serializeThemeCookie({ requestUrl: 'https://tau.new/', theme: Theme.DARK });
    const unsignedCookie = createCookie('tau-theme');

    await expect(unsignedCookie.parse(cookieHeaderFromSetCookie(setCookie))).resolves.toBe(Theme.DARK);
    expect(unsignedCookie.isSigned).toBe(false);
  });

  it.each(Object.values(Theme))('round-trips the %s theme', async (theme) => {
    const setCookie = await serializeThemeCookie({ requestUrl: 'https://tau.new/', theme });
    const request = requestWithCookie(cookieHeaderFromSetCookie(setCookie));

    await expect(readThemeCookie(request)).resolves.toBe(theme);
  });

  it('maps missing, malformed, and unsupported values to system theme', async () => {
    const unsignedCookie = createCookie('tau-theme');
    const unsupportedScalar = cookieHeaderFromSetCookie(await unsignedCookie.serialize('sepia'));
    const oldSessionShape = cookieHeaderFromSetCookie(await unsignedCookie.serialize({ theme: Theme.DARK }));

    const themes = await Promise.all(
      [undefined, 'tau-theme=not-base64', unsupportedScalar, oldSessionShape].map(async (cookie) =>
        readThemeCookie(requestWithCookie(cookie)),
      ),
    );

    expect(themes).toEqual([null, null, null, null]);
  });

  it('expires the cookie when returning to system theme', async () => {
    const setCookie = await destroyThemeCookie('https://tau.new/action/set-theme');

    expectThemeCookieAttributes(setCookie, true);
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});
