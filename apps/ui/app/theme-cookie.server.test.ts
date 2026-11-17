// @vitest-environment node
import { createCookie } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Theme } from '#hooks/use-theme.js';
import { destroyThemeCookie } from '#theme-cookie.server.js';
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

describe('theme cookie from before the client facts', () => {
  it.each(Object.values(Theme))('reads the %s theme a visitor chose before', async (theme) => {
    const cookie = cookieHeaderFromSetCookie(await createCookie('tau-theme').serialize(theme));

    await expect(readThemeCookie(requestWithCookie(cookie))).resolves.toBe(theme);
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

  it.each([
    ['localhost HTTP', 'http://localhost:3000/action/migrate-theme', false],
    ['production HTTPS', 'https://tau.new/action/migrate-theme', true],
  ])('expires the host-only cookie for %s', async (_label, requestUrl, secure) => {
    const setCookie = await destroyThemeCookie(requestUrl);

    expectThemeCookieAttributes(setCookie, secure);
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});
