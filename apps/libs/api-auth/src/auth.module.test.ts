/**
 * WP2 request boundary at `forwardToAuth`: only a cookie `GET` of `get-session` itself may carry the session
 * snapshot to Better Auth. Every other path and method, plugin endpoints included, reaches the handler without it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import type { MockInstance } from 'vitest';
import { parseCookies as parseCookiesBetterCall } from 'better-call';
import { parseCookies as parseCookiesBetterAuth } from 'better-auth/cookies';
import { createSessionCacheHarness, dataCookie, tokenCookie } from '#testing/session-cache.fixture.js';
import type { SessionCacheHarness } from '#testing/session-cache.fixture.js';
import { isSnapshotName, snapshotHeaderShapes } from '#testing.js';

/** The status of a pending response. */
const statusOf = async (pending: Promise<LightMyRequestResponse>): Promise<number> => {
  const response = await pending;
  return response.statusCode;
};

type Endpoint = { readonly method: 'GET' | 'POST'; readonly path: string };

const hasSnapshot = (cookie: string | undefined): boolean =>
  cookie !== undefined &&
  [parseCookiesBetterCall, parseCookiesBetterAuth].some((parse) =>
    [...parse(cookie).keys()].some((name) => isSnapshotName(name, dataCookie)),
  );

describe('AuthModule forwardToAuth', () => {
  let h: SessionCacheHarness;
  let handler: MockInstance<SessionCacheHarness['auth']['handler']>;

  beforeAll(async () => {
    h = await createSessionCacheHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    handler = vi.spyOn(h.auth, 'handler');
    handler.mockClear();
  });

  const lastRequest = (): Request => {
    const request = handler.mock.calls.at(-1)?.[0];
    if (request === undefined) {
      throw new Error('auth.handler was not called');
    }
    return request;
  };

  /** Every endpoint registered on the instance, with path parameters filled in. */
  const endpoints = (): Endpoint[] => {
    const seen = new Set<string>();
    const list: Endpoint[] = [];
    for (const endpoint of Object.values(h.auth.api) as unknown[]) {
      if (typeof endpoint !== 'function') {
        continue;
      }
      const { path, options } = endpoint as { path?: unknown; options?: { method?: unknown } };
      if (typeof path !== 'string' || options?.method === undefined) {
        continue;
      }
      const methods = (Array.isArray(options.method) ? options.method : [options.method]) as unknown[];
      for (const method of methods) {
        if (method !== 'GET' && method !== 'POST') {
          continue;
        }
        const filled = path.replaceAll(/:[^/]+/gu, 'x');
        const key = `${method} ${filled}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ method, path: filled });
        }
      }
    }
    return list;
  };

  it('should strip the snapshot for every registered endpoint and every header shape', async () => {
    handler.mockImplementation(async () => new Response(null, { status: 204 }));
    const registered = endpoints();
    expect(registered.length).toBeGreaterThan(30);
    const shapes = ['', '__Secure-'].flatMap((prefix) =>
      snapshotHeaderShapes(`${prefix}${dataCookie}`, `${prefix}${tokenCookie}`),
    );
    const leaks: string[] = [];
    for (const { method, path } of registered) {
      for (const { header } of shapes) {
        // oxlint-disable-next-line no-await-in-loop -- one request at a time, so the spy's last call is this one.
        await h.inject({ method, url: `/v1/auth${path}`, cookie: header, headers: { origin: 'http://127.0.0.1' } });
        const cookie = lastRequest().headers.get('cookie') ?? undefined;
        if (!(method === 'GET' && path === '/get-session') && hasSnapshot(cookie)) {
          leaks.push(`${method} ${path} ${JSON.stringify(header)}`);
        }
      }
    }
    expect(handler).toHaveBeenCalledTimes(registered.length * shapes.length);
    expect(leaks).toEqual([]);
    handler.mockRestore();
  });

  describe('get-session', () => {
    const cookie = `${tokenCookie}=t; ${dataCookie}=J`;

    beforeEach(() => {
      handler.mockImplementation(async () => new Response(null, { status: 204 }));
    });

    it.each(['/v1/auth/get-session', '/v1/auth/get-session?x=1', '/v1/auth/./get-session'])(
      'should keep the snapshot on a cookie GET of %s',
      async (url) => {
        await h.inject({ url, cookie });
        expect(lastRequest().headers.get('cookie')).toBe(cookie);
      },
    );

    it.each([
      { label: 'get-session/', method: 'GET', url: '/v1/auth/get-session/' },
      { label: 'get-session-x', method: 'GET', url: '/v1/auth/get-session-x' },
      { label: 'POST get-session', method: 'POST', url: '/v1/auth/get-session' },
      {
        label: 'GET get-session with Authorization',
        method: 'GET',
        url: '/v1/auth/get-session',
        headers: { authorization: 'Bearer x' },
      },
      {
        label: 'GET get-session with an empty Authorization',
        method: 'GET',
        url: '/v1/auth/get-session',
        headers: { authorization: '' },
      },
    ] as const)('should strip the snapshot on $label', async (input) => {
      await h.inject({
        method: input.method,
        url: input.url,
        cookie,
        ...('headers' in input ? { headers: input.headers } : {}),
      });
      expect(lastRequest().headers.get('cookie')).toBe(`${tokenCookie}=t`);
    });
  });

  it('should keep an empty cookie header when the snapshot was the only cookie', async () => {
    handler.mockImplementation(async () => new Response(null, { status: 204 }));
    await h.inject({ url: '/v1/auth/list-sessions', cookie: `${dataCookie}=J` });
    expect(lastRequest().headers.has('cookie')).toBe(true);
    expect(lastRequest().headers.get('cookie')).toBe('');
  });

  it('should refuse a cross-site sign-in whose only cookie is the snapshot', async () => {
    handler.mockRestore();
    const checked = await createSessionCacheHarness({ originCheck: true });
    try {
      const { email, password } = await checked.signUp();
      const signIn = async (origin: string) =>
        checked.inject({
          method: 'POST',
          url: '/v1/auth/sign-in/email',
          cookie: `${dataCookie}=J`,
          headers: { origin },
          payload: { email, password },
        });
      expect(await statusOf(signIn('https://attacker.example'))).toBe(403);
      // Positive control: the same request from the API's own origin signs in.
      expect(await statusOf(signIn('http://127.0.0.1'))).toBe(200);
    } finally {
      await checked.close();
    }
  });
});
