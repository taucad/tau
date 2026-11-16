// @vitest-environment node
import { createCookie, RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Theme } from '#hooks/use-theme.js';
import { action } from '#routes/action.migrate-theme.js';

const migrate = async (headers: Record<string, string>): Promise<Response> => {
  const request = new Request('https://tau.new/action/migrate-theme', { method: 'POST', headers });
  const response: unknown = await action({
    request,
    url: new URL(request.url),
    pattern: '/action/migrate-theme',
    params: {},
    context: new RouterContextProvider(),
  });
  return response as Response;
};

const themeCookie = async (theme: string): Promise<string> => {
  const setCookie = await createCookie('tau-theme').serialize(theme);
  return setCookie.split(';', 1)[0] ?? '';
};

describe('/action/migrate-theme', () => {
  it('answers the theme the cookie carried and expires the cookie', async () => {
    const response = await migrate({ origin: 'https://tau.new', cookie: await themeCookie(Theme.BLACK) });

    await expect(response.json()).resolves.toEqual({ theme: Theme.BLACK });
    expect(response.headers.get('Set-Cookie')).toMatch(/^tau-theme=; .*Expires=Thu, 01 Jan 1970/u);
  });

  it('answers System, and sets no cookie, for a visitor who never chose', async () => {
    const response = await migrate({ origin: 'https://tau.new' });

    await expect(response.json()).resolves.toEqual({ theme: null });
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it.each([
    ['another origin', { origin: 'https://evil.example' }],
    ['no Origin', {}],
  ])('refuses %s, so no other site can expire the cookie', async (_label, headers) => {
    const response = await migrate({ ...headers, cookie: await themeCookie(Theme.DARK) });

    expect(response.status).toBe(403);
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });
});
