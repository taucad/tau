/* eslint-disable @typescript-eslint/naming-convention -- Environment and RFC 8628 field names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApiOrigin, authRequest, deviceLogin, inspectSession, resolveAuthToken } from '#auth.js';
const keys = vi.hoisted(() => ({ getPassword: vi.fn(), constructor: vi.fn() }));
vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    public getPassword = keys.getPassword;
    public constructor(...args: unknown[]) {
      keys.constructor(...args);
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('CLI session custody', () => {
  it.each([
    'https://user:secret@example.test',
    'http://example.test',
    'https://example.test/v1',
    'https://example.test?token=secret',
    'file:///tmp/api',
  ])('refuses unsafe origin %s', (origin) => {
    expect(() => authApiOrigin(origin)).toThrow();
  });
  it('normalizes origin and permits explicit loopback development', () => {
    expect(authApiOrigin('https://API.example.test:443/')).toBe('https://api.example.test');
    expect(authApiOrigin('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
  });
  it('uses environment credentials without opening the OS store', async () => {
    expect(await resolveAuthToken('https://api.example.test', { TAU_AUTH_TOKEN: 'injected' })).toBe('injected');
    expect(keys.constructor).not.toHaveBeenCalled();
  });
  it('partitions saved credentials by exact origin', async () => {
    keys.getPassword.mockResolvedValue('saved');
    expect(await resolveAuthToken('https://staging.example.test', {})).toBe('saved');
    expect(keys.constructor).toHaveBeenCalledWith('Tau CLI', 'https://staging.example.test', {
      linux: { store: 'secret-service' },
    });
  });
  it('does not leak backend errors or follow redirects with a bearer', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('server echoed secret-token'));
    vi.stubGlobal('fetch', fetch);
    await expect(authRequest('https://api.example.test', 'get-session', { token: 'secret-token' })).rejects.not.toThrow(
      'secret-token',
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/auth/get-session',
      expect.objectContaining({ redirect: 'error', headers: { authorization: 'Bearer secret-token' } }),
    );
  });
  it('distinguishes expired sessions from service failures', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    expect(await inspectSession('https://api.example.test', 'token')).toBeUndefined();
    await expect(inspectSession('https://api.example.test', 'token')).rejects.toMatchObject({
      code: 'AUTH_UNAVAILABLE',
    });
  });
  it('polls only after the interval and never presents the device secret', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          device_code: 'secret-device',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://app.example.test/auth/cli',
          verification_uri_complete: 'https://app.example.test/auth/cli?user_code=ABCD-EFGH',
          expires_in: 600,
          interval: 5,
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: 'authorization_pending' }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'secret-session', token_type: 'Bearer' }));
    vi.stubGlobal('fetch', fetch);
    const present = vi.fn().mockResolvedValue(undefined);
    const result = deviceLogin('https://api.example.test', present, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await result).toBe('secret-session');
    expect(present).toHaveBeenCalledWith('https://app.example.test/auth/cli?user_code=ABCD-EFGH', 'ABCD-EFGH');
  });
});
