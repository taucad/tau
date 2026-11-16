/**
 * WP4 harness H1 of the auth session cookie blueprint: the cookie cache at 60 s against a real Better Auth instance,
 * the real `AuthModule`, guard and resolver. Case numbers are the blueprint's Tests table.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import {
  createSessionCacheHarness,
  dataCookie,
  setCookieNames,
  setCookiesOf,
  tokenCookie,
} from '#testing/session-cache.fixture.js';
import type { SessionCacheHarness } from '#testing/session-cache.fixture.js';
import { snapshotHeaderShapes } from '#testing.js';

const sharedSecret = 'session-cache-shared-secret-32-characters-long';

/** Advances the faked clock; jose and Better Auth's snapshot expiry both read `Date`. */
const advance = (seconds: number): void => {
  vi.setSystemTime(Date.now() + seconds * 1000);
};

/**
 * Polls with real timers (only `Date` is faked) until the predicate holds. JWE decryption runs off the main thread,
 * so a count of event-loop turns is not a bound on how long a request takes to reach the store.
 */
const waitFor = async (predicate: () => boolean, timeout = 10_000): Promise<void> => {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > deadline) {
      throw new Error('Condition not reached');
    }
    // oxlint-disable-next-line no-await-in-loop -- polling.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2);
    });
  }
};

/** The status of a pending response. */
const statusOf = async (pending: Promise<LightMyRequestResponse>): Promise<number> => {
  const response = await pending;
  return response.statusCode;
};

const snapshotEntries = (response: LightMyRequestResponse): string[] =>
  setCookiesOf(response).filter((entry) => entry.startsWith(`${dataCookie}=`) || entry.startsWith(`${dataCookie}.`));

const isExpiry = (entry: string): boolean => /;\s*max-age=0(?:;|$)/iu.test(entry);

const userIdOf = (response: LightMyRequestResponse): string | undefined =>
  response.json<{ userId: string | undefined }>().userId;

const resolutionCalls = (h: SessionCacheHarness): Array<Record<string, string>> =>
  h.metrics.authSessionResolutions.add.mock.calls.map(([, attributes]) => attributes as Record<string, string>);

describe('session cookie cache (H1, flag 60)', () => {
  let h: SessionCacheHarness;

  beforeAll(async () => {
    h = await createSessionCacheHarness({ secret: sharedSecret });
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    h.metrics.authSessionResolutions.add.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    // A failed case must not leave a held read behind for the next one.
    h.releaseHeld();
  });

  it('case 1: should read no store and set no cookie on GET and HEAD right after sign-in', async () => {
    const { jar } = await h.signUp();
    h.resetReads();
    const get = await h.inject({ url: '/v1/cache-test', jar });
    const head = await h.inject({ method: 'HEAD', url: '/v1/cache-test', jar });
    expect([get.statusCode, head.statusCode]).toEqual([200, 200]);
    expect(h.sessionReads()).toBe(0);
    expect(setCookiesOf(get)).toEqual([]);
    expect(setCookiesOf(head)).toEqual([]);
    expect(get.headers['cache-control']).toBeUndefined();
  });

  it('case 2: should read the store once after 61 s, forward one snapshot and read none on the next GET', async () => {
    const { jar, userId } = await h.signUp();
    advance(61);
    h.resetReads();
    const response = await h.inject({ url: '/v1/cache-test', jar });
    expect(response.statusCode).toBe(200);
    expect(userIdOf(response)).toBe(userId);
    expect(h.sessionReads()).toBe(1);
    const issued = snapshotEntries(response).filter((entry) => !isExpiry(entry));
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatch(/;\s*Max-Age=60(?:;|$)/u);
    expect(setCookieNames(response)).not.toContain(tokenCookie);
    expect(response.headers['cache-control']).toBe('private, no-store');
    h.resetReads();
    expect(await statusOf(h.inject({ url: '/v1/cache-test', jar }))).toBe(200);
    expect(h.sessionReads()).toBe(0);
  });

  it('case 3: should coalesce 12 concurrent GETs after 61 s into one store read', async () => {
    const { jar } = await h.signUp();
    advance(61);
    h.resetReads();
    const cookie = jar.header();
    const resolve = vi.spyOn(h.sessions, 'resolve');
    const release = h.holdNextRead();
    let responses: LightMyRequestResponse[];
    try {
      const pending = Array.from({ length: 12 }, async () => h.inject({ url: '/v1/cache-test', cookie }));
      // Every request has reached the resolver while the leader's read is held.
      await waitFor(() => h.sessionReads() === 1 && resolve.mock.calls.length === 12);
      release();
      responses = await Promise.all(pending);
    } finally {
      release();
      resolve.mockRestore();
    }
    expect(responses.map((response) => response.statusCode)).toEqual(Array.from({ length: 12 }, () => 200));
    expect(h.sessionReads()).toBe(1);
    expect(resolutionCalls(h).filter((attributes) => attributes['coalesced'] === 'true')).toHaveLength(11);
  });

  it('case 4: should still answer a GET within 60 s of a direct row delete (the documented window)', async () => {
    const { jar, userId } = await h.signUp();
    h.deleteSessions(userId);
    const response = await h.inject({ url: '/v1/cache-test', jar });
    expect(response.statusCode).toBe(200);
    expect(userIdOf(response)).toBe(userId);
  });

  it('case 5: should refuse a POST at once after a row delete and expire only the snapshot', async () => {
    const { jar, userId } = await h.signUp();
    h.deleteSessions(userId);
    const response = await h.inject({ method: 'POST', url: '/v1/cache-test', jar });
    expect(response.statusCode).toBe(401);
    const entries = setCookiesOf(response);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.startsWith(`${dataCookie}=`)).toBe(true);
    expect(isExpiry(entries[0] ?? '')).toBe(true);
    expect(jar.get(tokenCookie)).toBeDefined();
  });

  it('case 6: should refuse a GET after 61 s once the row is deleted', async () => {
    const { jar, userId } = await h.signUp();
    h.deleteSessions(userId);
    advance(61);
    expect(await statusOf(h.inject({ url: '/v1/cache-test', jar }))).toBe(401);
  });

  it('case 7: should refuse an @AuthoritativeSession() GET at once after a row delete', async () => {
    const { jar, userId } = await h.signUp();
    h.resetReads();
    const control = await h.inject({ url: '/v1/cache-test/marked', jar });
    expect(control.statusCode).toBe(200);
    expect(h.sessionReads()).toBe(1);
    h.deleteSessions(userId);
    expect(await statusOf(h.inject({ url: '/v1/cache-test/marked', jar }))).toBe(401);
  });

  describe('case 8: replay after sign-out on endpoints that mint or read sessions', () => {
    const endpoints = [
      { method: 'GET', url: '/v1/auth/one-time-token/generate' },
      { method: 'POST', url: '/v1/auth/device/approve', payload: { userCode: 'ABCD-EFGH' } },
      { method: 'POST', url: '/v1/auth/link-social', payload: { provider: 'github', callbackURL: '/' } },
      { method: 'GET', url: '/v1/auth/list-sessions' },
    ] as const;

    it.each(endpoints)('should refuse $method $url with the old cookies', async (endpoint) => {
      const { jar } = await h.signUp();
      const saved = jar.copy();
      expect(await statusOf(h.inject({ method: 'POST', url: '/v1/auth/sign-out', jar, payload: {} }))).toBe(200);
      const response = await h.inject({
        method: endpoint.method,
        url: endpoint.url,
        cookie: saved.header(),
        ...('payload' in endpoint ? { payload: endpoint.payload } : {}),
      });
      expect(response.statusCode).toBe(401);
    });

    it('should prove the snapshot was valid: the handler itself, bypassing forwardToAuth, accepts it', async () => {
      const { jar } = await h.signUp();
      const saved = jar.copy();
      await h.inject({ method: 'POST', url: '/v1/auth/sign-out', jar, payload: {} });
      const response = await h.auth.handler(
        new Request(`http://127.0.0.1/v1/auth/one-time-token/generate`, { headers: { cookie: saved.header() } }),
      );
      expect(response.status).toBe(200);
    });
  });

  describe('case 9: adversarial header shapes after a row delete', () => {
    const targets = [
      { method: 'GET', url: '/v1/auth/one-time-token/generate' },
      { method: 'POST', url: '/v1/cache-test' },
      { method: 'GET', url: '/v1/cache-test/marked' },
    ] as const;

    it.each(targets)('should refuse every shape on $method $url', async (target) => {
      const { jar, userId } = await h.signUp();
      const data = jar.get(dataCookie);
      const token = jar.get(tokenCookie);
      expect(data).toBeDefined();
      expect(token).toBeDefined();
      h.deleteSessions(userId);
      const shapes = snapshotHeaderShapes(dataCookie, tokenCookie, { data: data ?? '', token: token ?? '' });
      expect(shapes.length).toBeGreaterThan(10);
      const statuses = await Promise.all(
        shapes.map(async ({ header }) => {
          const response = await h.inject({ method: target.method, url: target.url, cookie: header });
          return { header, status: response.statusCode };
        }),
      );
      expect(statuses.filter(({ status }) => status !== 401)).toEqual([]);
    });
  });

  it('case 11: should resolve a doubly decorated handler once and forward one snapshot', async () => {
    const { jar } = await h.signUp();
    advance(61);
    h.resetReads();
    const get = await h.inject({ url: '/v1/doubly-guarded', jar });
    expect(get.statusCode).toBe(200);
    expect(h.sessionReads()).toBe(1);
    expect(snapshotEntries(get).filter((entry) => !isExpiry(entry))).toHaveLength(1);
    expect(resolutionCalls(h)).toHaveLength(1);
    h.resetReads();
    h.metrics.authSessionResolutions.add.mockClear();
    const post = await h.inject({ method: 'POST', url: '/v1/doubly-guarded', jar });
    expect(post.statusCode).toBe(200);
    expect(h.sessionReads()).toBe(1);
    expect(resolutionCalls(h)).toHaveLength(1);
  });

  describe('case 12: snapshots that must not be honoured', () => {
    it('should read the store and send a fresh snapshot when one character is altered', async () => {
      const { jar, userId } = await h.signUp();
      const data = jar.get(dataCookie) ?? '';
      const altered = `${data.slice(0, -2)}${data.at(-2) === 'A' ? 'B' : 'A'}${data.at(-1) ?? ''}`;
      jar.set(dataCookie, altered);
      h.resetReads();
      const response = await h.inject({ url: '/v1/cache-test', jar });
      expect(response.statusCode).toBe(200);
      expect(userIdOf(response)).toBe(userId);
      expect(h.sessionReads()).toBe(1);
      expect(snapshotEntries(response).filter((entry) => !isExpiry(entry))).toHaveLength(1);
    });

    it("should resolve to B with user A's snapshot and user B's token", async () => {
      const a = await h.signUp();
      const b = await h.signUp();
      const cookie = `${tokenCookie}=${b.jar.get(tokenCookie) ?? ''}; ${dataCookie}=${a.jar.get(dataCookie) ?? ''}`;
      const response = await h.inject({ url: '/v1/cache-test', cookie });
      expect(response.statusCode).toBe(200);
      expect(userIdOf(response)).toBe(b.userId);
    });

    it('should refuse a snapshot without a session token', async () => {
      const { jar } = await h.signUp();
      const response = await h.inject({ url: '/v1/cache-test', cookie: `${dataCookie}=${jar.get(dataCookie) ?? ''}` });
      expect(response.statusCode).toBe(401);
    });

    it('should read the store and issue a new snapshot when sessionCacheVersion changes', async () => {
      const { jar } = await h.signUp();
      const bumped = await createSessionCacheHarness({ secret: sharedSecret, store: h.store, version: '2' });
      try {
        bumped.resetReads();
        const response = await bumped.inject({ url: '/v1/cache-test', jar });
        expect(response.statusCode).toBe(200);
        expect(bumped.sessionReads()).toBe(1);
        expect(snapshotEntries(response).filter((entry) => !isExpiry(entry))).toHaveLength(1);
      } finally {
        await bumped.close();
      }
    });
  });

  describe('case 13: bearer requests that also send a valid snapshot', () => {
    const bearerOf = (signIn: LightMyRequestResponse): string => {
      const header = signIn.headers['set-auth-token'];
      const token = Array.isArray(header) ? header[0] : header;
      if (typeof token !== 'string' || token === '') {
        throw new Error('sign-in returned no set-auth-token');
      }
      return token;
    };

    it.each(['/v1/cache-test', '/v1/auth/get-session'])(
      'should read the store and send no snapshot on %s',
      async (url) => {
        const { jar, signIn } = await h.signUp();
        h.resetReads();
        const response = await h.inject({
          url,
          cookie: `${dataCookie}=${jar.get(dataCookie) ?? ''}`,
          headers: { authorization: `Bearer ${bearerOf(signIn)}` },
        });
        expect(response.statusCode).toBe(200);
        expect(h.sessionReads()).toBeGreaterThanOrEqual(1);
        expect(snapshotEntries(response)).toEqual([]);
      },
    );
  });

  it('case 14: should never forward a snapshot for a rememberMe: false session', async () => {
    const { jar, userId, signIn } = await h.signUp({ rememberMe: false });
    const update = await h.inject({ method: 'POST', url: '/v1/auth/update-user', jar, payload: { name: 'Renamed' } });
    expect(update.statusCode).toBe(200);
    h.resetReads();
    const get = await h.inject({ url: '/v1/cache-test', jar });
    expect(get.statusCode).toBe(200);
    expect(h.sessionReads()).toBe(1);
    for (const response of [signIn, update, get]) {
      expect(snapshotEntries(response).filter((entry) => !isExpiry(entry))).toEqual([]);
    }
    h.deleteSessions(userId);
    h.resetReads();
    const last = await h.inject({ url: '/v1/cache-test', jar });
    expect(last.statusCode).toBe(401);
    expect(h.sessionReads()).toBe(1);
  });

  describe('case 15: a GET in flight across a session change delivers its response last', () => {
    it('should keep the new session token after a password change that revokes other sessions', async () => {
      const { jar, password } = await h.signUp();
      advance(61);
      const oldCookie = jar.header();
      h.resetReads();
      const release = h.holdNextRead();
      const inFlight = h.inject({ url: '/v1/cache-test', cookie: oldCookie });
      await waitFor(() => h.sessionReads() === 1);
      const change = await h.inject({
        method: 'POST',
        url: '/v1/auth/change-password',
        jar,
        payload: { currentPassword: password, newPassword: 'another horse battery staple', revokeOtherSessions: true },
      });
      expect(change.statusCode).toBe(200);
      const newToken = jar.get(tokenCookie);
      release();
      jar.apply(setCookiesOf(await inFlight));
      expect(jar.get(tokenCookie)).toBe(newToken);
      expect(await statusOf(h.inject({ url: '/v1/cache-test', jar }))).toBe(200);
    });

    it('should keep the new user after sign-out followed by sign-in as another user', async () => {
      const a = await h.signUp();
      const b = await h.signUp();
      advance(61);
      const oldCookie = a.jar.header();
      h.resetReads();
      const release = h.holdNextRead();
      const inFlight = h.inject({ url: '/v1/cache-test', cookie: oldCookie });
      await waitFor(() => h.sessionReads() === 1);
      await h.inject({ method: 'POST', url: '/v1/auth/sign-out', jar: a.jar, payload: {} });
      const signIn = await h.inject({
        method: 'POST',
        url: '/v1/auth/sign-in/email',
        jar: a.jar,
        payload: { email: b.email, password: b.password },
      });
      expect(signIn.statusCode).toBe(200);
      const newToken = a.jar.get(tokenCookie);
      release();
      a.jar.apply(setCookiesOf(await inFlight));
      expect(a.jar.get(tokenCookie)).toBe(newToken);
      const next = await h.inject({ url: '/v1/cache-test', jar: a.jar });
      expect(next.statusCode).toBe(200);
      expect(userIdOf(next)).toBe(b.userId);
    });
  });

  it('case 16: should issue an opaque snapshot in one cookie under 2,048 bytes', async () => {
    const { jar, email, signIn } = await h.signUp();
    const data = jar.get(dataCookie) ?? '';
    const segments = data.split('.');
    expect(segments).toHaveLength(5);
    for (const segment of segments) {
      expect(Buffer.from(segment, 'base64url').toString('latin1')).not.toContain(email);
      expect(Buffer.from(segment, 'base64').toString('latin1')).not.toContain(email);
    }
    const issued = snapshotEntries(signIn).filter((entry) => !isExpiry(entry));
    expect(issued).toHaveLength(1);
    expect(Buffer.byteLength(issued[0] ?? '')).toBeLessThan(2048);
  });

  it('case 18: should forward no snapshot, chunked or not, for a 20 KB avatar', async () => {
    const image = `data:image/png;base64,${'A'.repeat(20 * 1024)}`;
    const { jar, signIn } = await h.signUp({ image });
    expect(signIn.statusCode).toBe(200);
    const get = await h.inject({ url: '/v1/cache-test', jar });
    expect(get.statusCode).toBe(200);
    for (const response of [signIn, get]) {
      expect(snapshotEntries(response).filter((entry) => !isExpiry(entry))).toEqual([]);
    }
  });

  it('case 19: should refresh the row on the 24 h update without forwarding a session token', async () => {
    const { jar } = await h.signUp();
    const token = decodeURIComponent(jar.get(tokenCookie) ?? '').split('.')[0];
    const row = (): Record<string, unknown> | undefined =>
      (h.store['session'] ?? []).find((session) => session['token'] === token);
    expect(row()).toBeDefined();
    const before = row()?.['expiresAt'];
    advance(60 * 60 * 24 + 61);
    const response = await h.inject({ url: '/v1/cache-test', jar });
    expect(response.statusCode).toBe(200);
    expect(row()?.['expiresAt']).not.toEqual(before);
    expect(setCookieNames(response)).not.toContain(tokenCookie);
  });

  describe('case 20: authoritative mode needs both halves only as defence in depth', () => {
    it('should read the store with disableCookieCache alone', async () => {
      const { jar } = await h.signUp();
      h.resetReads();
      await h.auth.api.getSession({
        headers: new Headers({ cookie: jar.header() }),
        query: { disableCookieCache: true },
      });
      expect(h.sessionReads()).toBe(1);
    });

    it('should read the store with the strip alone', async () => {
      const { jar } = await h.signUp();
      h.resetReads();
      await h.auth.api.getSession({ headers: new Headers({ cookie: `${tokenCookie}=${jar.get(tokenCookie) ?? ''}` }) });
      expect(h.sessionReads()).toBe(1);
    });
  });

  it.each([
    { label: 'an invalid Authorization', authorization: 'Bearer not-a-valid-token' },
    { label: 'an empty Authorization', authorization: '' },
  ])('case 21: should resolve authoritatively by the cookie with $label', async ({ authorization }) => {
    const { jar, userId } = await h.signUp();
    h.resetReads();
    const response = await h.inject({ url: '/v1/cache-test', jar, headers: { authorization } });
    expect(response.statusCode).toBe(200);
    expect(userIdOf(response)).toBe(userId);
    expect(h.sessionReads()).toBe(1);
    expect(resolutionCalls(h).map((attributes) => attributes['mode'])).toEqual(['authoritative']);
    expect(setCookiesOf(response)).toEqual([]);
  });

  it('case 23: should give a POST its own read while a GET flight is held', async () => {
    const { jar, userId } = await h.signUp();
    advance(61);
    h.resetReads();
    const cookie = jar.header();
    const release = h.holdNextRead();
    const held = h.inject({ url: '/v1/cache-test', cookie });
    await waitFor(() => h.sessionReads() === 1);
    h.deleteSessions(userId);
    const post = await h.inject({ method: 'POST', url: '/v1/cache-test', cookie });
    expect(post.statusCode).toBe(401);
    expect(h.sessionReads()).toBe(2);
    release();
    await held;
  });

  it('should keep a handler-set Cache-Control instead of the default', async () => {
    const { jar } = await h.signUp();
    advance(61);
    const response = await h.inject({ url: '/v1/cache-test/own-cache-control', jar });
    expect(response.statusCode).toBe(200);
    expect(snapshotEntries(response).filter((entry) => !isExpiry(entry))).toHaveLength(1);
    expect(response.headers['cache-control']).toBe('private, max-age=5');
  });
});

describe('session cookie cache with the flag at 0 (H1)', () => {
  let off: SessionCacheHarness;
  let on: SessionCacheHarness;

  beforeAll(async () => {
    on = await createSessionCacheHarness({ secret: sharedSecret });
    off = await createSessionCacheHarness({ secret: sharedSecret, store: on.store, maxAgeSeconds: 0 });
  });

  afterAll(async () => {
    await off.close();
    await on.close();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('case 17: should add no Set-Cookie or Cache-Control on any Tau route and read once per request', async () => {
    const { jar, signIn } = await off.signUp();
    expect(snapshotEntries(signIn)).toEqual([]);
    advance(61);
    for (const [method, url] of [
      ['GET', '/v1/cache-test'],
      ['HEAD', '/v1/cache-test'],
      ['POST', '/v1/cache-test'],
      ['GET', '/v1/cache-test/marked'],
      ['GET', '/v1/doubly-guarded'],
      ['POST', '/v1/doubly-guarded'],
    ] as const) {
      off.resetReads();
      // oxlint-disable-next-line no-await-in-loop -- one request at a time, so reads are counted per request.
      const response = await off.inject({ method, url, jar });
      expect(response.statusCode).toBe(200);
      expect(setCookiesOf(response)).toEqual([]);
      expect(response.headers['cache-control']).toBeUndefined();
      expect(off.sessionReads()).toBe(1);
    }
  });

  it('case 17: should ignore an incoming snapshot', async () => {
    const { jar, userId } = await on.signUp();
    expect(jar.get(dataCookie)).toBeDefined();
    on.deleteSessions(userId);
    expect(await statusOf(off.inject({ url: '/v1/cache-test', jar }))).toBe(401);
  });

  it("case 22: should accept each instance's cookies on the other with one secret", async () => {
    const fromOn = await on.signUp();
    expect(await statusOf(off.inject({ url: '/v1/cache-test', jar: fromOn.jar.copy() }))).toBe(200);
    const fromOff = await off.signUp();
    expect(await statusOf(on.inject({ url: '/v1/cache-test', jar: fromOff.jar.copy() }))).toBe(200);
  });
});
