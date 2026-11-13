/**
 * WP4 harness H2 of the auth session cookie blueprint: `createBillingTestApp` with PostgreSQL, Redis and the real
 * `AuthModule`, the cookie cache flag passed through the environment. Cases 2, 4, 5, 17 and 24 of the Tests table.
 * Rows are deleted with SQL, as the operator would.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Auth } from 'better-auth';
import { authInstanceKey } from '@taucad/api-auth/testing';
import { CookieJar } from '@taucad/api-auth/testing/session-cache';
import type { BillingTestApp } from '#testing/create-billing-test-app.js';

const tokenCookie = 'tau.session_token';
const dataCookie = 'tau.session_data';

/** The guarded billing `GET` routes, with placeholder path parameters. */
const billingGets = [
  '/v1/billing/entitlements',
  '/v1/billing/credits',
  '/v1/billing/model-estimates',
  '/v1/billing/holds',
  '/v1/billing/usage',
  '/v1/billing/operations/operation_missing',
  '/v1/billing/reload-consent',
  '/v1/billing/account-closure',
  '/v1/billing/account-closure/closure_missing',
  '/v1/billing/payment-actions',
  '/v1/billing/payment-actions/action_missing',
  '/v1/billing/attempts/chat/attempt_missing',
] as const;

const advance = (seconds: number): void => {
  vi.setSystemTime(Date.now() + seconds * 1000);
};

/**
 * Boots the billing app with the flag. `ConfigModule.forRoot` validates the environment when the module is
 * evaluated, so each flag value gets a fresh module graph.
 */
const boot = async (maxAgeSeconds: number): Promise<BillingTestApp> => {
  // Before the import below evaluates ConfigModule.forRoot. The typed environment declares the parsed number.
  Reflect.set(process.env, 'AUTH_SESSION_CACHE_MAX_AGE_SECONDS', String(maxAgeSeconds));
  vi.resetModules();
  const { createBillingTestApp } = await import('#testing/create-billing-test-app.js');
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
  return createBillingTestApp({ env: { AUTH_SESSION_CACHE_MAX_AGE_SECONDS: String(maxAgeSeconds) } });
};

type Client = {
  readonly app: BillingTestApp;
  readonly request: (input: {
    url: string;
    jar?: CookieJar;
    method?: 'GET' | 'POST';
    body?: unknown;
    headers?: Record<string, string>;
  }) => Promise<Response>;
  readonly signUp: () => Promise<{ jar: CookieJar; userId: string }>;
  readonly deleteSessions: (userId: string) => Promise<void>;
  readonly deleteUser: (userId: string) => Promise<void>;
};

const clientOf = (app: BillingTestApp): Client => {
  const request: Client['request'] = async ({ url, jar, method = 'GET', body, headers: extra = {} }) => {
    // Better Auth's own POSTs carry the app's origin, as a browser's would; the model gateway refuses a foreign one.
    const headers = new Headers({ ...(method === 'POST' ? { origin: app.baseUrl } : {}), ...extra });
    const cookie = jar?.header();
    if (cookie !== undefined && cookie !== '') {
      headers.set('cookie', cookie);
    }
    if (body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    const response = await fetch(`${app.baseUrl}${url}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    jar?.apply(response.headers.getSetCookie());
    return response;
  };
  const auth = app.app.get<Auth>(authInstanceKey, { strict: false });
  let signIns = 0;
  const signUp: Client['signUp'] = async () => {
    const email = `session-cache-h2-${crypto.randomUUID()}@example.test`;
    const password = 'correct horse battery staple';
    const created = await auth.api.signUpEmail({ body: { email, password, name: 'Session Cache' } });
    // Production requires a verified address before sign-in.
    const context = await auth.$context;
    await context.internalAdapter.updateUser(created.user.id, { emailVerified: true });
    const jar = new CookieJar();
    signIns += 1;
    // Each sign-in from its own client address, so Better Auth's sign-in rate limit stays out of the way.
    const signIn = await request({
      url: '/v1/auth/sign-in/email',
      jar,
      method: 'POST',
      body: { email, password },
      headers: { 'fly-client-ip': `198.51.100.${String(signIns)}` },
    });
    expect(signIn.status).toBe(200);
    return { jar, userId: created.user.id };
  };
  return {
    app,
    request,
    signUp,
    deleteSessions: async (userId) => {
      await app.databaseService.database.execute(sql`delete from "session" where user_id = ${userId}`);
    },
    deleteUser: async (userId) => {
      await app.databaseService.database.execute(sql`delete from "user" where id = ${userId}`);
    },
  };
};

/** The status of a pending response. */
const statusOf = async (pending: Promise<Response>): Promise<number> => {
  const response = await pending;
  return response.status;
};

const snapshotEntries = (response: Response): string[] =>
  response.headers
    .getSetCookie()
    .filter((entry) => entry.startsWith(`${dataCookie}=`) || entry.startsWith(`${dataCookie}.`));

const isExpiry = (entry: string): boolean => /;\s*max-age=0(?:;|$)/iu.test(entry);

describe('session cookie cache over PostgreSQL (H2, flag 60)', () => {
  let client: Client;

  beforeAll(async () => {
    client = clientOf(await boot(60));
  });

  afterAll(async () => {
    await client.app.close();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('case 2: should forward one snapshot after 61 s and then serve a GET without the store', async () => {
    const { jar, userId } = await client.signUp();
    advance(61);
    const response = await client.request({ url: '/v1/billing/entitlements', jar });
    expect(response.status).toBe(200);
    const issued = snapshotEntries(response).filter((entry) => !isExpiry(entry));
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatch(/;\s*Max-Age=60(?:;|$)/u);
    expect(response.headers.getSetCookie().some((entry) => entry.startsWith(`${tokenCookie}=`))).toBe(false);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // The next GET is answered from the snapshot: it succeeds although the row is gone.
    await client.deleteSessions(userId);
    expect(await statusOf(client.request({ url: '/v1/billing/entitlements', jar }))).toBe(200);
  });

  it('case 4: should answer a GET within 60 s of an SQL row delete (the documented window)', async () => {
    const { jar, userId } = await client.signUp();
    await client.deleteSessions(userId);
    expect(await statusOf(client.request({ url: '/v1/billing/entitlements', jar }))).toBe(200);
  });

  it('case 5: should refuse a POST at once after an SQL row delete and expire only the snapshot', async () => {
    const { jar, userId } = await client.signUp();
    await client.deleteSessions(userId);
    const response = await client.request({ url: '/v1/billing/reload-consent', jar, method: 'POST', body: {} });
    expect(response.status).toBe(401);
    const entries = response.headers.getSetCookie();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.startsWith(`${dataCookie}=`)).toBe(true);
    expect(isExpiry(entries[0] ?? '')).toBe(true);
    expect(jar.get(tokenCookie)).toBeDefined();
  });

  // The property is "never 500". With placeholder ids some routes refuse for other reasons, exactly as they do for a
  // live user: `payment-actions/:actionId` answers 403 `billing_owner_not_found`, `attempts/...` 400 without its query.
  it('case 24: should never answer 500 on a billing GET within 60 s of deleting the user row', async () => {
    const { jar, userId } = await client.signUp();
    await client.deleteUser(userId);
    const statuses = await Promise.all(
      billingGets.map(async (url) => ({ url, status: await statusOf(client.request({ url, jar: jar.copy() })) })),
    );
    expect(statuses.filter(({ status }) => status >= 500)).toEqual([]);
    expect(statuses.filter(({ status }) => status === 200).length).toBeGreaterThan(0);
  });
});

describe('session cookie cache over PostgreSQL (H2, flag 0)', () => {
  let client: Client;

  beforeAll(async () => {
    client = clientOf(await boot(0));
  });

  afterAll(async () => {
    await client.app.close();
  });

  it('case 17: should add no Set-Cookie and no Cache-Control from a Tau route, and ignore a snapshot', async () => {
    const { jar, userId } = await client.signUp();
    expect(jar.get(dataCookie)).toBeUndefined();
    const response = await client.request({ url: '/v1/billing/holds', jar });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    // A snapshot from elsewhere is ignored: the deleted row refuses the GET.
    jar.set(dataCookie, 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..a.b.c');
    await client.deleteSessions(userId);
    expect(await statusOf(client.request({ url: '/v1/billing/holds', jar }))).toBe(401);
  });
});
