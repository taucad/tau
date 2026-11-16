import { describe, expect, it, vi } from 'vitest';
import type { betterAuth } from 'better-auth';
import { BetterAuthService } from '#better-auth.service.js';

type AuthInstance = ReturnType<typeof betterAuth>;

const data = 'tau.session_data';

const serviceWith = () => {
  const getAccessToken = vi.fn(async (_input: { headers: Headers; body: unknown }) => ({ accessToken: 'a' }));
  const auth = {
    $context: Promise.resolve({ authCookies: { sessionData: { name: data } } }),
    api: { getAccessToken },
  } as unknown as AuthInstance;
  return { service: new BetterAuthService(auth), getAccessToken };
};

describe('BetterAuthService.getAccessToken', () => {
  it('should pass the headers to Better Auth without the session snapshot', async () => {
    const { service, getAccessToken } = serviceWith();
    const headers = new Headers({ cookie: `tau.session_token=t; ${data}=J; ${data}.0=K`, 'x-other': '1' });
    await service.getAccessToken(headers, { accountId: 'acc' });
    const passed = getAccessToken.mock.calls[0]?.[0];
    expect(passed?.headers.get('cookie')).toBe('tau.session_token=t');
    expect(passed?.headers.get('x-other')).toBe('1');
    expect(passed?.body).toEqual({ accountId: 'acc' });
  });

  it('should leave the caller headers unchanged', async () => {
    const { service } = serviceWith();
    const cookie = `tau.session_token=t; ${data}=J`;
    const headers = new Headers({ cookie });
    await service.getAccessToken(headers, { accountId: 'acc' });
    expect(headers.get('cookie')).toBe(cookie);
  });

  it('should not add a cookie header when none was sent', async () => {
    const { service, getAccessToken } = serviceWith();
    await service.getAccessToken(new Headers({ authorization: 'Bearer x' }), { accountId: 'acc' });
    expect(getAccessToken.mock.calls[0]?.[0].headers.has('cookie')).toBe(false);
  });
});
