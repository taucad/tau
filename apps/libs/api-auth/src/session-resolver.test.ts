import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { betterAuth } from 'better-auth';
import type { Auth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { APIError } from 'better-auth/api';
import type { MetricsService } from '@taucad/api-observability/metrics';
import { staticAuthConfig } from '#config/auth-static.config.js';
import { SessionResolver } from '#session-resolver.js';
import type { SessionLookup, SessionResolution } from '#session-resolver.js';

type GetSessionInput = {
  headers: Headers;
  query?: { disableCookieCache?: boolean };
  returnHeaders?: boolean;
};

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
};

const signedIn = {
  session: { id: 'session-1', token: 'token-1', userId: 'user-1' },
  user: { id: 'user-1', email: 'resolver@example.test' },
};

const answer = (body: unknown = signedIn, setCookies: readonly string[] = []) => {
  const headers = new Headers();
  for (const entry of setCookies) {
    headers.append('set-cookie', entry);
  }
  return { response: body, headers };
};

/** Every header shape the request boundary is tested against (WP2), with N the snapshot and T the token. */
const adversarialCookieHeaders = (data: string, token: string): readonly string[] => [
  `a=1;${data}=J;${token}=t`,
  `a=1;\t${data}=J;   ${token}=t`,
  ` ${data}=J; ${token}=t`,
  ` ${token}=t; ${data}=J`,
  `${data}=J; ${data}=x; ${token}=t`,
  `${data}=x; ${data}=J; ${token}=t`,
  `${data}.0=J; ${data}.1=K; ${data}.99=L; ${token}=t`,
  `tau.session_data=J; __Secure-tau.session_data=J; __Host-tau.session_data=J; ${token}=t`,
  `__secure-TAU.SESSION_DATA=J; ${token}=t`,
  `${data}="J"; ${token}=t`,
  `junk; ${data}=J`,
  `=x; ${data}=J`,
  `${data}=J`,
  `a=1; \u00A0${data}=J; ${token}=t`,
  `a=1; ${data}=J; \u00A0${token}=t`,
];

const createResolver = () => {
  const getSession = vi.fn<(input: GetSessionInput) => Promise<ReturnType<typeof answer>>>();
  const auth = {
    api: { getSession },
    options: {},
    $context: Promise.resolve({ authCookies: { sessionData: { name: 'tau.session_data' } } }),
  } as unknown as Auth;
  const metrics = mockDeep<MetricsService>();
  const resolver = new SessionResolver(auth, metrics);
  const flights = (): Map<string, unknown> => Reflect.get(resolver, 'flights') as Map<string, unknown>;
  return { resolver, getSession, metrics, flights };
};

const cookieGet = (cookie = 'tau.session_token=abc.sig'): SessionLookup => ({ headers: { cookie }, method: 'GET' });

describe('SessionResolver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Better Auth headers', () => {
    it('should return each Set-Cookie entry separately and in Better Auth order', async () => {
      const store = { user: [], session: [] as unknown[], account: [], verification: [], apikey: [], subscription: [] };
      const auth = betterAuth({
        ...staticAuthConfig,
        baseURL: 'http://127.0.0.1',
        database: memoryAdapter(store),
        secret: 'session-resolver-unit-test-secret-32-chars',
        rateLimit: { enabled: false },
        emailAndPassword: { ...staticAuthConfig.emailAndPassword, requireEmailVerification: false },
      });
      const signUp = await auth.api.signUpEmail({
        body: { email: 'headers@example.test', password: 'correct horse battery staple', name: 'Headers' },
        returnHeaders: true,
      });
      const cookie = signUp.headers
        .getSetCookie()
        .map((entry) => entry.split(';')[0])
        .join('; ');
      // The row is gone, so Better Auth expires its cookies by name: several entries.
      store.session.length = 0;

      const resolution = await new SessionResolver(auth as unknown as Auth, mockDeep<MetricsService>()).resolve({
        headers: { cookie },
        method: 'GET',
      });
      const direct = await auth.handler(new Request('http://127.0.0.1/v1/auth/get-session', { headers: { cookie } }));

      expect(resolution.session).toBeNull();
      expect(resolution.setCookies.length).toBeGreaterThan(1);
      expect(resolution.setCookies).toEqual(direct.headers.getSetCookie());
    });
  });

  describe('read mode', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it.each(['GET', 'HEAD'])('should read a cookie %s in cached mode', async (method) => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      const resolution = await resolver.resolve({ headers: { cookie: 'a=1' }, method });

      expect(resolution.mode).toBe('cached');
      expect(getSession.mock.calls[0]?.[0].query).toBeUndefined();
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('should read a cookie %s authoritatively', async (method) => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      const resolution = await resolver.resolve({ headers: { cookie: 'a=1' }, method });

      expect(resolution.mode).toBe('authoritative');
      expect(getSession.mock.calls[0]?.[0].query).toEqual({ disableCookieCache: true });
    });

    it.each(['Bearer x', '', 'Bearer not-a-signed-token'])(
      'should read a GET with Authorization %j beside cookies authoritatively',
      async (authorization) => {
        const { resolver, getSession } = createResolver();
        getSession.mockResolvedValue(answer());

        const resolution = await resolver.resolve({
          headers: { cookie: 'tau.session_token=abc.sig; tau.session_data=J', authorization },
          method: 'GET',
        });

        expect(resolution.mode).toBe('authoritative');
        expect(getSession.mock.calls[0]?.[0].query).toEqual({ disableCookieCache: true });
      },
    );

    it.each([{ cookie: 'a=1' }, { cookie: 'a=1', authorization: 'Bearer x' }])(
      'should read a GET the caller marked authoritative from the store and never share it (%j)',
      async (headers) => {
        const { resolver, getSession, flights } = createResolver();
        const pending = deferred<ReturnType<typeof answer>>();
        getSession.mockReturnValue(pending.promise);

        const first = resolver.resolve({ headers, method: 'GET', authoritative: true });
        const second = resolver.resolve({ headers, method: 'GET', authoritative: true });

        expect(flights().size).toBe(0);
        pending.resolve(answer());
        const resolutions = await Promise.all([first, second]);

        expect(getSession).toHaveBeenCalledTimes(2);
        expect(resolutions.map((resolution) => resolution.mode)).toEqual(['authoritative', 'authoritative']);
        expect(getSession.mock.calls.every(([input]) => input.query?.disableCookieCache === true)).toBe(true);
      },
    );

    it('should decide the mode without parsing any adversarial cookie header', async () => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      for (const cookie of adversarialCookieHeaders('tau.session_data', 'tau.session_token')) {
        // oxlint-disable-next-line no-await-in-loop -- one lookup at a time keeps the call index exact.
        await resolver.resolve({ headers: { cookie }, method: 'POST' });
      }

      expect(getSession).toHaveBeenCalledTimes(adversarialCookieHeaders('', '').length);
      expect(getSession.mock.calls.every(([input]) => input.query?.disableCookieCache === true)).toBe(true);
    });

    it('should remove the snapshot from what an authoritative lookup hands Better Auth', async () => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      await resolver.resolve({ headers: { cookie: 'a=1;tau.session_data=J; tau.session_token=t' }, method: 'POST' });
      await resolver.resolve({ headers: { cookie: 'tau.session_data=J' }, method: 'GET', authoritative: true });

      expect(getSession.mock.calls.map(([input]) => input.headers.get('cookie'))).toEqual([
        'a=1; tau.session_token=t',
        '',
      ]);
      expect(getSession.mock.calls.every(([input]) => input.headers.has('cookie'))).toBe(true);
    });

    it('should leave the snapshot in a cached lookup', async () => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      await resolver.resolve(cookieGet('tau.session_data=J; tau.session_token=t'));

      expect(getSession.mock.calls[0]?.[0].headers.get('cookie')).toBe('tau.session_data=J; tau.session_token=t');
    });

    it('should ask Better Auth for its response headers', async () => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      await resolver.resolve(cookieGet());

      expect(getSession.mock.calls[0]?.[0].returnHeaders).toBe(true);
      expect(getSession.mock.calls[0]?.[0].headers.get('cookie')).toBe('tau.session_token=abc.sig');
    });
  });

  describe('single-flight', () => {
    it('should share one lookup among twelve concurrent identical GETs', async () => {
      const { resolver, getSession, flights } = createResolver();
      const pending = deferred<ReturnType<typeof answer>>();
      getSession.mockReturnValue(pending.promise);

      const requests = Array.from({ length: 12 }, async () => resolver.resolve(cookieGet()));
      pending.resolve(answer());
      const resolutions = await Promise.all(requests);

      expect(getSession).toHaveBeenCalledTimes(1);
      expect(resolutions.filter((resolution) => resolution.coalesced)).toHaveLength(11);
      expect(resolutions.every((resolution) => resolution.user?.id === 'user-1')).toBe(true);
      expect(flights().size).toBe(0);
    });

    it('should give a concurrent POST its own lookup', async () => {
      const { resolver, getSession } = createResolver();
      const pending = deferred<ReturnType<typeof answer>>();
      getSession.mockReturnValueOnce(pending.promise).mockResolvedValue(answer());

      const get = resolver.resolve(cookieGet());
      const post = await resolver.resolve({ ...cookieGet(), method: 'POST' });
      pending.resolve(answer());
      await get;

      expect(getSession).toHaveBeenCalledTimes(2);
      expect(post.coalesced).toBe(false);
    });

    it('should not share a lookup between different cookies', async () => {
      const { resolver, getSession } = createResolver();
      getSession.mockResolvedValue(answer());

      await Promise.all([resolver.resolve(cookieGet('a=1')), resolver.resolve(cookieGet('a=2'))]);

      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('should keep no flight for a request with neither cookie nor authorization', async () => {
      const { resolver, getSession, flights } = createResolver();
      const pending = deferred<ReturnType<typeof answer>>();
      getSession.mockReturnValue(pending.promise);

      const first = resolver.resolve({ headers: {}, method: 'GET' });
      const second = resolver.resolve({ headers: {}, method: 'GET' });

      expect(flights().size).toBe(0);
      pending.resolve(answer(null));
      await Promise.all([first, second]);
      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('should not join a flight older than 250 ms, and keep the newer flight when the old one settles', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { resolver, getSession, flights } = createResolver();
      const old = deferred<ReturnType<typeof answer>>();
      const newer = deferred<ReturnType<typeof answer>>();
      getSession.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);

      const first = resolver.resolve(cookieGet());
      vi.advanceTimersByTime(251);
      const second = resolver.resolve(cookieGet());

      expect(getSession).toHaveBeenCalledTimes(2);
      old.resolve(answer());
      await first;
      expect(flights().size).toBe(1);

      newer.resolve(answer());
      const settled = await second;
      expect(settled.coalesced).toBe(false);
      expect(flights().size).toBe(0);
    });

    it('should resolve an UNAUTHORIZED lookup as unauthenticated for the leader and every joiner', async () => {
      const { resolver, getSession } = createResolver();
      const pending = deferred<ReturnType<typeof answer>>();
      getSession.mockReturnValue(pending.promise);

      const requests = Array.from({ length: 3 }, async () => resolver.resolve(cookieGet()));
      pending.reject(new APIError('UNAUTHORIZED', { message: 'Failed to get session' }));
      const resolutions = await Promise.all(requests);

      expect(getSession).toHaveBeenCalledTimes(1);
      expect(resolutions.map((resolution) => resolution.session)).toEqual([null, null, null]);
      expect(resolutions.every((resolution) => resolution.setCookies.length === 0)).toBe(true);
    });

    it('should fail the leader and let each joiner retry once by itself on any other rejection', async () => {
      const { resolver, getSession, flights } = createResolver();
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const pending = deferred<ReturnType<typeof answer>>();
        getSession.mockReturnValueOnce(pending.promise).mockResolvedValue(answer());

        const leader = resolver.resolve(cookieGet());
        const joiners = Array.from({ length: 3 }, async () => resolver.resolve(cookieGet()));
        const failure = new Error('connection refused');
        pending.reject(failure);

        await expect(leader).rejects.toBe(failure);
        const resolutions = await Promise.all(joiners);
        await new Promise((resolve) => {
          setImmediate(resolve);
        });

        expect(getSession).toHaveBeenCalledTimes(4);
        expect(resolutions.every((resolution) => resolution.user?.id === 'user-1')).toBe(true);
        expect(flights().size).toBe(0);
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });

  it('should freeze the resolution and what it carries', async () => {
    const { resolver, getSession } = createResolver();
    getSession.mockResolvedValue(answer(signedIn, ['a=1; Path=/']));

    const resolution: SessionResolution = await resolver.resolve(cookieGet());

    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution.session)).toBe(true);
    expect(Object.isFrozen(resolution.user)).toBe(true);
    expect(Object.isFrozen(resolution.setCookies)).toBe(true);
    expect(resolution.setCookies).toEqual(['a=1; Path=/']);
  });

  describe('counter', () => {
    it('should count one resolution per call with its mode, credential, outcome and sharing', async () => {
      const { resolver, getSession, metrics } = createResolver();
      const pending = deferred<ReturnType<typeof answer>>();
      getSession.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(answer(null));

      const first = resolver.resolve(cookieGet());
      const second = resolver.resolve(cookieGet());
      pending.resolve(answer());
      await Promise.all([first, second]);
      await resolver.resolve({ headers: { authorization: 'Bearer x' }, method: 'POST' });

      expect(metrics.authSessionResolutions.add.mock.calls).toEqual([
        [1, { mode: 'cached', credential: 'cookie', outcome: 'authenticated', coalesced: 'false' }],
        [1, { mode: 'cached', credential: 'cookie', outcome: 'authenticated', coalesced: 'true' }],
        [1, { mode: 'authoritative', credential: 'authorization', outcome: 'unauthenticated', coalesced: 'false' }],
      ]);
    });

    it('should count a failed lookup as an error once and rethrow it', async () => {
      const { resolver, getSession, metrics } = createResolver();
      const failure = new Error('boom');
      getSession.mockRejectedValue(failure);

      await expect(resolver.resolve({ headers: {}, method: 'GET' })).rejects.toBe(failure);

      expect(metrics.authSessionResolutions.add.mock.calls).toEqual([
        [1, { mode: 'cached', credential: 'none', outcome: 'error', coalesced: 'false' }],
      ]);
    });
  });
});
