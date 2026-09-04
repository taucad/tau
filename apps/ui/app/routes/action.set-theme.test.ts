// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Theme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import { action } from '#routes/action.set-theme.js';

type SetCookieExpectation = {
  requestUrl: string;
  theme: ThemeWithSystem;
  secure: boolean;
};

const unstableUrlKey = 'unstable_url';
const unstablePatternKey = 'unstable_pattern';

async function callSetThemeAction({ requestUrl, theme }: { requestUrl: string; theme: unknown }) {
  const request = new Request(requestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ theme }),
  });

  const response = await action({
    request,
    [unstableUrlKey]: new URL(request.url),
    [unstablePatternKey]: '/action/set-theme',
    params: {},
    context: {},
  });

  expect(response).toBeInstanceOf(Response);
  return response as Response;
}

function expectThemeCookieAttributes(response: Response, { secure }: Pick<SetCookieExpectation, 'secure'>): string {
  const setCookie = response.headers.get('Set-Cookie');

  expect(setCookie).toBeTruthy();
  const [cookiePair, ...attributes] = setCookie!.split(/;\s*/);

  expect(cookiePair).toMatch(/^tau-theme=/);
  expect(attributes).toContain('Path=/');
  expect(attributes).toContain('HttpOnly');
  expect(attributes).toContain('SameSite=Lax');
  expect(attributes.some((attribute) => attribute.toLowerCase().startsWith('domain='))).toBe(false);
  expect(attributes.includes('Secure')).toBe(secure);
  expect(setCookie).not.toContain('tau-color-theme');

  return setCookie!;
}

describe('/action/set-theme', () => {
  it('rejects an invalid theme without setting a cookie', async () => {
    const response = await callSetThemeAction({
      requestUrl: 'https://tau.new/action/set-theme',
      theme: 'sepia',
    });

    await expect(response.json()).resolves.toEqual({ success: false, message: 'Theme is not valid.' });
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it.each([
    { requestUrl: 'http://localhost:3000/action/set-theme', theme: Theme.LIGHT, secure: false },
    { requestUrl: 'https://taucad.dev/action/set-theme', theme: Theme.LIGHT, secure: true },
    { requestUrl: 'https://tau.new/action/set-theme', theme: Theme.DARK, secure: true },
    { requestUrl: 'https://tau.new/action/set-theme', theme: Theme.BLACK, secure: true },
    { requestUrl: 'https://tau.new/action/set-theme', theme: Theme.HIGH_CONTRAST, secure: true },
  ] satisfies SetCookieExpectation[])(
    'should commit a host-only theme cookie for $requestUrl when setting $theme',
    async ({ requestUrl, theme, secure }) => {
      const response = await callSetThemeAction({ requestUrl, theme });

      expect(response.status).toBe(200);
      expectThemeCookieAttributes(response, { secure });
    },
  );

  it.each([
    { requestUrl: 'http://localhost:3000/action/set-theme', theme: null, secure: false },
    { requestUrl: 'https://taucad.dev/action/set-theme', theme: null, secure: true },
  ] satisfies SetCookieExpectation[])(
    'should destroy the host-only theme cookie for $requestUrl when returning to system theme',
    async ({ requestUrl, theme, secure }) => {
      const response = await callSetThemeAction({ requestUrl, theme });
      const setCookie = expectThemeCookieAttributes(response, { secure });

      expect(response.status).toBe(200);
      expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    },
  );
});
