/* eslint-disable @typescript-eslint/naming-convention -- fixtures preserve environment and GitHub wire names. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import { GithubService } from '#api/github/github.service.js';

const configuration: Partial<Environment> = {
  GITHUB_REPOSITORY_APP_CLIENT_ID: 'client-id',
  GITHUB_REPOSITORY_APP_CLIENT_SECRET: 'client-secret',
  GITHUB_REPOSITORY_APP_CALLBACK_URL: 'https://api.tau.test/v1/github/callback',
  GITHUB_REPOSITORY_APP_SLUG: 'tau-test',
  GITHUB_REPOSITORY_CONNECTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
  GITHUB_REPOSITORY_CONNECTION_KEY_VERSION: 1,
  TAU_FRONTEND_URL: 'https://tau.test',
};

type Row = Record<string, unknown>;

/** In-memory Redis and one-table database behind a real `GithubService`. */
const harness = (
  insertRow: (row: Row) => Promise<readonly Row[]> = async (row) => [row],
  environment: Partial<Environment> = configuration,
) => {
  const values = new Map<string, string>();
  const rows: Row[] = [];
  const updates: Row[] = [];
  const redis = {
    client: {
      set: vi.fn(async (key: string, value: string, ...options: unknown[]) => {
        if (options.includes('NX') && values.has(key)) {
          return null;
        }
        values.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      exists: vi.fn(async (key: string) => Number(values.has(key))),
      getdel: vi.fn(async (key: string) => {
        const value = values.get(key) ?? null;
        values.delete(key);
        return value;
      }),
      del: vi.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) {
          deleted += Number(values.delete(key));
        }
        return deleted;
      }),
      eval: vi.fn(async (script: string, _keys: number, ...arguments_: string[]) => {
        if (script.includes("redis.call('EXISTS'")) {
          const [cancelled, pending, value] = arguments_;
          if (cancelled === undefined || pending === undefined || value === undefined || values.has(cancelled)) {
            return 0;
          }
          values.set(pending, value);
          return 1;
        }
        const [key, expected] = arguments_;
        if (key === undefined || expected === undefined) {
          return 0;
        }
        if (values.get(key) !== expected) {
          return 0;
        }
        values.delete(key);
        return 1;
      }),
    },
  } as unknown as RedisService;
  const database = {
    database: {
      query: { githubConnection: { findFirst: vi.fn(async () => rows[0]) } },
      insert: vi.fn(() => ({
        values: (row: Row) => ({
          returning: async () => {
            const inserted = await insertRow(row);
            rows.push(...inserted);
            return inserted;
          },
        }),
      })),
      update: vi.fn(() => ({
        set: (patch: Row) => ({
          // Drizzle's where() result is awaited directly by some callers and chained with returning() by others.
          // oxlint-disable-next-line promise-function-async -- the result must stay a Promise with returning().
          where: () => {
            updates.push(patch);
            const [row] = rows;
            if (row !== undefined) {
              Object.assign(row, patch);
            }
            return Object.assign(Promise.resolve(), { returning: async () => (row === undefined ? [] : [row]) });
          },
        }),
      })),
      delete: vi.fn(() => ({
        where: async () => {
          rows.length = 0;
        },
      })),
    },
  } as unknown as DatabaseService;
  const config = {
    get: (key: keyof Environment) => environment[key],
  } as unknown as ConfigService<Environment, true>;
  const github = new GithubService(config, database, redis);
  const seal = (value: unknown, userId: string, purpose: string): string =>
    (github as unknown as { seal: (value: unknown, userId: string, purpose: string) => string }).seal(
      value,
      userId,
      purpose,
    );
  /** Stores one connection row whose tokens are sealed exactly as `complete` seals them. */
  const connect = (accessTokenExpiresAt: Date): Row => {
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      userId: 'tau-user',
      githubSubject: 42,
      login: 'octo',
      avatarUrl: null,
      accessToken: seal('stored-access', 'tau-user', 'access:00000000-0000-4000-8000-000000000001'),
      refreshToken: seal('stored-refresh', 'tau-user', 'refresh:00000000-0000-4000-8000-000000000001'),
      accessTokenExpiresAt,
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
      keyVersion: 1,
      generation: 3,
    };
    rows.push(row);
    return row;
  };
  return { github, values, rows, updates, database, connect };
};

const service = (insertRow?: (row: Row) => Promise<readonly Row[]>): GithubService => harness(insertRow).github;

const tokenBody = {
  access_token: 'access-secret',
  expires_in: 28_800,
  refresh_token: 'refresh-secret',
  refresh_token_expires_in: 15_897_600,
};
const json = (body: unknown, init?: ResponseInit): Response => new Response(JSON.stringify(body), init);
const stubGithub = (tokenResponse: () => Response): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).endsWith('/user') ? json({ id: 42, login: 'octo', avatar_url: null }) : tokenResponse(),
    ),
  );
};
const stateOf = (authorizationUrl: string): string => {
  const state = new URL(authorizationUrl).searchParams.get('state');
  if (state === null) {
    throw new Error('Missing OAuth state');
  }
  return state;
};

// Failure paths log for the operator; keep test output quiet.
beforeAll(() => {
  Logger.overrideLogger(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('GithubService connection completion', () => {
  it('uses PKCE, consumes callback state once, and leaves a wrong-session completion recoverable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/user')
          ? new Response(JSON.stringify({ id: 42, login: 'octo', avatar_url: null }))
          : new Response(
              JSON.stringify({
                access_token: 'access-secret',
                expires_in: 28_800,
                refresh_token: 'refresh-secret',
                refresh_token_expires_in: 15_897_600,
              }),
            ),
      ),
    );
    let attemptedWrites = 0;
    let persisted: Record<string, unknown> | undefined;
    const github = service(async (row) => {
      attemptedWrites += 1;
      if (attemptedWrites === 1) {
        throw new Error('database unavailable');
      }
      persisted = row;
      return [row];
    });
    const started = await github.start('tau-user', 'session-1', '/import', 'desktop-poll');
    const authorization = new URL(started.authorizationUrl);
    const state = authorization.searchParams.get('state');
    expect(state).toBeTruthy();
    if (state === null) {
      throw new Error('Missing OAuth state');
    }
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');

    const callback = new URL(await github.callback({ state, code: 'a'.repeat(32) }));
    expect(Object.fromEntries(callback.searchParams)).toStrictEqual({
      attempt: started.attemptId,
      returnTo: '/import',
      mode: 'desktop-poll',
    });
    const replay = new URL(await github.callback({ state, code: 'a'.repeat(32) }));
    expect(Object.fromEntries(replay.searchParams)).toStrictEqual({ error: 'GITHUB_CALLBACK_EXPIRED' });

    await expect(github.complete('tau-user', 'session-2', started.attemptId)).rejects.toThrow();
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toThrow('database unavailable');
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).resolves.toMatchObject({
      subject: 42,
      login: 'octo',
      generation: 1,
    });
    expect(JSON.stringify(persisted)).not.toContain('access-secret');
    expect(JSON.stringify(persisted)).not.toContain('refresh-secret');
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toThrow();
  });

  it('lets only the initiating session cancel an OAuth attempt', async () => {
    const github = service();
    const started = await github.start('tau-user', 'session-1', '/import', 'desktop-poll');
    const state = new URL(started.authorizationUrl).searchParams.get('state');
    if (state === null) {
      throw new Error('Missing OAuth state');
    }

    await expect(github.cancel('tau-user', 'session-2', started.attemptId)).rejects.toThrow();
    await expect(github.cancel('tau-user', 'session-1', started.attemptId)).resolves.toBeUndefined();
    await expect(github.callback({ state, code: 'a'.repeat(32) })).resolves.toBe(
      'https://tau.test/github/complete?error=GITHUB_CALLBACK_EXPIRED',
    );
  });
});

describe('GithubService REST cache and refusals', () => {
  const requestJson = async (github: GithubService, key: string): Promise<unknown> =>
    (
      github as unknown as {
        githubJson: (url: string, init: RequestInit, cacheKey: string) => Promise<unknown>;
      }
    ).githubJson('https://api.github.com/example', {}, key);

  it('revalidates a private catalog page by ETag without retaining a token in the cache key', async () => {
    const requests: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        requests.push(headers);
        return requests.length === 1
          ? new Response(JSON.stringify({ repositories: [] }), { headers: { etag: '"catalog-1"' } })
          : new Response(undefined, { status: 304 });
      }),
    );
    const github = service();

    await expect(requestJson(github, 'user:connection:1:page')).resolves.toEqual({ repositories: [] });
    await expect(requestJson(github, 'user:connection:1:page')).resolves.toEqual({ repositories: [] });
    expect(requests[0]?.has('if-none-match')).toBe(false);
    expect(requests[1]?.get('if-none-match')).toBe('"catalog-1"');
  });

  it('retries an orphaned 304 unconditionally and distinguishes rate-limit refusal', async () => {
    const requests: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        requests.push(headers);
        return requests.length === 1
          ? new Response(undefined, { status: 304 })
          : new Response(JSON.stringify({ message: 'limited' }), {
              status: 429,
              headers: { 'retry-after': '12', 'x-ratelimit-reset': '42' },
            });
      }),
    );

    await expect(requestJson(service(), 'user:connection:1:missing')).rejects.toMatchObject({ status: 429 });
    expect(requests).toHaveLength(2);
    expect(requests.every((headers) => !headers.has('if-none-match'))).toBe(true);
  });

  it('keeps archived and disabled repositories readable without claiming write access', () => {
    const github = service() as unknown as {
      repositorySummary: (repository: Record<string, unknown>) => { access: string };
    };
    const repository = {
      id: 1,
      name: 'design',
      full_name: 'octo/design',
      private: true,
      visibility: 'private',
      archived: true,
      disabled: false,
      description: null,
      default_branch: 'main',
      html_url: 'https://github.com/octo/design',
      clone_url: 'https://github.com/octo/design.git',
      owner: { id: 1, login: 'octo', avatar_url: null, type: 'User' },
      permissions: { pull: true, push: true },
    };

    expect(github.repositorySummary(repository).access).toBe('read');
    expect(github.repositorySummary({ ...repository, archived: false, disabled: true }).access).toBe('read');
  });
});

describe('GithubService callback failures', () => {
  it('should redirect a consent denial to the completion page and answer the poll with it once', async () => {
    const { github } = harness();
    const started = await github.start('tau-user', 'session-1', '/import', 'desktop-poll');

    const redirect = new URL(
      await github.callback({ state: stateOf(started.authorizationUrl), error: 'access_denied' }),
    );

    expect(redirect.origin + redirect.pathname).toBe('https://tau.test/github/complete');
    expect(Object.fromEntries(redirect.searchParams)).toStrictEqual({
      attempt: started.attemptId,
      returnTo: '/import',
      mode: 'desktop-poll',
      error: 'GITHUB_CONSENT_DENIED',
    });
    await expect(github.complete('tau-user', 'session-2', started.attemptId)).rejects.toMatchObject({
      response: { code: 'GITHUB_COMPLETION_OWNER_MISMATCH' },
    });
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toMatchObject({
      status: 400,
      response: { code: 'GITHUB_CONSENT_DENIED' },
    });
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toMatchObject({
      status: 400,
      response: { code: 'GITHUB_COMPLETION_EXPIRED' },
    });
  });

  it('should answer GITHUB_COMPLETION_PENDING while GitHub has not redirected back', async () => {
    const { github } = harness();
    const started = await github.start('tau-user', 'session-1', '/import', 'desktop-poll');

    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'GITHUB_COMPLETION_PENDING' },
    });
  });

  it('should answer GITHUB_COMPLETION_PENDING while the callback is still exchanging the code', async () => {
    const { promise: exchanged, resolve: answerExchange } = Promise.withResolvers<Response>();
    const { promise: exchanging, resolve: exchangeStarted } = Promise.withResolvers<undefined>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/user')) {
          return json({ id: 42, login: 'octo', avatar_url: null });
        }
        exchangeStarted(undefined);
        return exchanged;
      }),
    );
    const { github } = harness();
    const started = await github.start('tau-user', 'session-1', '/import', 'desktop-poll');

    const callback = github.callback({ state: stateOf(started.authorizationUrl), code: 'a'.repeat(32) });
    await exchanging;

    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'GITHUB_COMPLETION_PENDING' },
    });
    answerExchange(json(tokenBody));
    expect(new URL(await callback).searchParams.get('error')).toBeNull();
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).resolves.toMatchObject({
      subject: 42,
      login: 'octo',
    });
  });

  it('should redirect an unknown, missing or malformed state as expired without an attempt', async () => {
    const { github } = harness();

    await expect(github.callback({ state: 'b'.repeat(32), code: 'a'.repeat(32) })).resolves.toBe(
      'https://tau.test/github/complete?error=GITHUB_CALLBACK_EXPIRED',
    );
    await expect(github.callback({})).resolves.toBe('https://tau.test/github/complete?error=GITHUB_CALLBACK_EXPIRED');
    await expect(github.callback({ state: ['x'], code: 5 })).resolves.toBe(
      'https://tau.test/github/complete?error=GITHUB_CALLBACK_EXPIRED',
    );
  });

  it('should still answer every callback with a completion redirect when the App is not configured', async () => {
    const { github } = harness(undefined, { TAU_FRONTEND_URL: 'https://tau.test' });

    await expect(github.callback({ state: 'b'.repeat(32), code: 'a'.repeat(32) })).resolves.toBe(
      'https://tau.test/github/complete?error=GITHUB_CALLBACK_EXPIRED',
    );
    await expect(github.callback({ error: 'redirect_uri_mismatch' })).resolves.toBe(
      'https://tau.test/github/complete?error=GITHUB_CALLBACK_FAILED',
    );
  });

  it.each([
    ['bad_verification_code', () => json({ error: 'bad_verification_code' }), 'GITHUB_CALLBACK_EXPIRED'],
    [
      'incorrect_client_credentials',
      () => json({ error: 'incorrect_client_credentials' }),
      'GITHUB_APP_CREDENTIALS_INVALID',
    ],
    ['unverified_user_email', () => json({ error: 'unverified_user_email' }), 'GITHUB_APP_CREDENTIALS_INVALID'],
    [
      'non-expiring token',
      () => json({ access_token: 'access-secret', token_type: 'bearer' }),
      'GITHUB_EXPIRING_TOKENS_REQUIRED',
    ],
    [
      'expiring token without a refresh token',
      () => json({ access_token: 'access-secret', expires_in: 28_800 }),
      'GITHUB_EXPIRING_TOKENS_REQUIRED',
    ],
    ['GitHub outage', () => new Response('unavailable', { status: 503 }), 'GITHUB_CALLBACK_FAILED'],
  ])('should map a %s token exchange to %s and record it against the attempt', async (_case, response, code) => {
    stubGithub(response);
    const { github } = harness();
    const started = await github.start('tau-user', 'session-1', '/w/project', 'browser');

    const redirect = new URL(await github.callback({ state: stateOf(started.authorizationUrl), code: 'a'.repeat(32) }));

    expect(redirect.searchParams.get('error')).toBe(code);
    expect(redirect.searchParams.get('attempt')).toBe(started.attemptId);
    await expect(github.complete('tau-user', 'session-1', started.attemptId)).rejects.toMatchObject({
      response: { code },
    });
  });
});

describe('GithubService start validation', () => {
  it.each([
    [5, 'browser', 'RETURN_LOCATION_INVALID'],
    [null, 'browser', 'RETURN_LOCATION_INVALID'],
    [String.raw`/\evil.example`, 'browser', 'RETURN_LOCATION_INVALID'],
    ['//evil.example', 'browser', 'RETURN_LOCATION_INVALID'],
    ['/import//evil', 'browser', 'RETURN_LOCATION_INVALID'],
    ['https://evil.example/', 'browser', 'RETURN_LOCATION_INVALID'],
    ['/\t/evil.example', 'browser', 'RETURN_LOCATION_INVALID'],
    ['/import\n', 'browser', 'RETURN_LOCATION_INVALID'],
    ['/import\u007F', 'browser', 'RETURN_LOCATION_INVALID'],
    ['/import', 'popup', 'GITHUB_COMPLETION_MODE_INVALID'],
    ['/import', 7, 'GITHUB_COMPLETION_MODE_INVALID'],
  ])('should refuse returnTo %j with mode %j as 400 %s', async (returnTo, completionMode, code) => {
    await expect(service().start('tau-user', 'session-1', returnTo, completionMode)).rejects.toMatchObject({
      status: 400,
      response: { code },
    });
  });
});

describe('GithubService concurrent completion', () => {
  it('should create one connection and bump the generation once for two concurrent completers', async () => {
    stubGithub(() => json(tokenBody));
    const { github, database } = harness();
    const started = await github.start('tau-user', 'session-1', '/import', 'browser');
    await github.callback({ state: stateOf(started.authorizationUrl), code: 'a'.repeat(32) });

    const [first, second] = await Promise.all([
      github.complete('tau-user', 'session-1', started.attemptId),
      github.complete('tau-user', 'session-1', started.attemptId),
    ]);

    expect(first).toStrictEqual(second);
    expect(first).toMatchObject({ subject: 42, login: 'octo', generation: 1 });
    expect(database.database.insert).toHaveBeenCalledOnce();
    expect(database.database.update).not.toHaveBeenCalled();
  });
});

describe('GithubService refresh token retention', () => {
  const refreshWith = async (answer: () => Promise<Response>) => {
    vi.stubGlobal('fetch', vi.fn(answer));
    const context = harness();
    context.connect(new Date(Date.now() - 1000));
    const outcome = context.github.token('tau-user', '00000000-0000-4000-8000-000000000001');
    return { ...context, outcome };
  };
  const cleared = (updates: readonly Row[]): boolean => updates.some((patch) => patch['refreshToken'] === null);

  it.each([
    [
      'DNS failure before sending',
      async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
      },
      'GITHUB_UPSTREAM_UNAVAILABLE',
    ],
    [
      'refused connection',
      async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      },
      'GITHUB_UPSTREAM_UNAVAILABLE',
    ],
    ['server error', async () => new Response('bad gateway', { status: 502 }), 'GITHUB_UPSTREAM_FAILED'],
    ['rate limit', async () => new Response('slow down', { status: 429 }), 'GITHUB_RATE_LIMITED'],
    [
      'refused App credentials',
      async () => json({ error: 'incorrect_client_credentials' }),
      'GITHUB_APP_CREDENTIALS_INVALID',
    ],
  ])('should keep the refresh token after a %s', async (_case, answer, code) => {
    const { outcome, updates } = await refreshWith(answer);

    await expect(outcome).rejects.toMatchObject({ response: { code } });
    expect(cleared(updates)).toBe(false);
  });

  it.each([
    ['bad_refresh_token', async () => json({ error: 'bad_refresh_token' })],
    [
      'timeout after sending',
      async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    ],
    [
      'reset connection',
      async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      },
    ],
    ['unreadable success', async () => json({ access_token: 'rotated' })],
  ])('should clear the refresh token and require reconnect after a %s', async (_case, answer) => {
    const { outcome, updates } = await refreshWith(answer);

    await expect(outcome).rejects.toMatchObject({ status: 401, response: { code: 'GITHUB_RECONNECT_REQUIRED' } });
    expect(cleared(updates)).toBe(true);
  });

  it('should persist the rotated pair after a successful refresh', async () => {
    const { outcome, updates } = await refreshWith(async () => json(tokenBody));

    await expect(outcome).resolves.toMatchObject({ accessToken: 'access-secret', generation: 4 });
    expect(updates).toHaveLength(1);
    expect(JSON.stringify(updates)).not.toContain('refresh-secret');
  });
});

describe('GithubService connection removal', () => {
  it('should revoke the grant at GitHub with the App credentials before deleting the row', async () => {
    const requests: Array<{ url: string; init: RequestInit; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
        return new Response(undefined, { status: 204 });
      }),
    );
    const { github, rows, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    await github.remove('tau-user', '00000000-0000-4000-8000-000000000001');

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.github.com/applications/client-id/grant');
    expect(requests[0]?.init.method).toBe('DELETE');
    expect(new Headers(requests[0]?.init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(requests[0]?.body).toStrictEqual({ access_token: 'stored-access' });
    expect(rows).toHaveLength(0);
  });

  it.each([
    ['GitHub refuses', async () => new Response('gone', { status: 422 })],
    [
      'GitHub is unreachable',
      async () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('should still delete the row when %s', async (_case, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer));
    const { github, rows, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    await expect(github.remove('tau-user', '00000000-0000-4000-8000-000000000001')).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });
});

describe('GithubService lookup by stable id', () => {
  const connectionId = '00000000-0000-4000-8000-000000000001';
  const head = 'c'.repeat(40);
  const lookups = (body: unknown, init?: ResponseInit): string[] => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return json(body, init);
      }),
    );
    return urls;
  };

  const movedRepository = {
    id: 7,
    name: 'renamed',
    full_name: 'new-owner/renamed',
    private: true,
    visibility: 'private',
    archived: false,
    disabled: false,
    description: null,
    default_branch: 'main',
    html_url: 'https://github.com/new-owner/renamed',
    clone_url: 'https://github.com/new-owner/renamed.git',
    owner: { id: 9, login: 'new-owner', avatar_url: null, type: 'Organization' },
    permissions: { pull: true, push: true },
  };
  const installation = (accountId: number, selection: 'all' | 'selected', suspendedAt?: string) => ({
    id: 70,
    account: { id: accountId, login: 'owner', avatar_url: null, type: 'Organization' },
    repository_selection: selection,
    suspended_at: suspendedAt ?? null,
    permissions: { contents: 'write', metadata: 'read' },
  });
  /** Answers each GitHub path from `routes` (by path and query) and records the requested URLs. */
  const routed = (routes: Record<string, unknown>): string[] => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        const { pathname, search } = new URL(url);
        const body = routes[`${pathname}${search}`];
        return body === undefined ? json({ message: 'Not Found' }, { status: 404 }) : json(body);
      }),
    );
    return urls;
  };
  const installationsPage = '/user/installations?per_page=100&page=1';
  const selectedPage = (page: number): string =>
    `/user/installations/70/repositories?per_page=100&page=${String(page)}`;
  const accessOf = async (): Promise<unknown> => {
    const { github, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));
    return ((await github.repository('tau-user', connectionId, 7)) as { access: unknown }).access;
  };

  it('should resolve a moved repository by id in the catalog shape', async () => {
    const urls = routed({
      '/repositories/7': movedRepository,
      [installationsPage]: { total_count: 1, installations: [installation(9, 'all')] },
    });
    const { github, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    await expect(github.repository('tau-user', connectionId, 7)).resolves.toStrictEqual({
      id: 7,
      name: 'renamed',
      fullName: 'new-owner/renamed',
      owner: { id: 9, login: 'new-owner', avatarUrl: null, type: 'Organization' },
      visibility: 'private',
      access: 'write',
      archived: false,
      disabled: false,
      description: null,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/new-owner/renamed',
      cloneUrl: 'https://github.com/new-owner/renamed.git',
    });
    expect(urls).toStrictEqual(['https://api.github.com/repositories/7', `https://api.github.com${installationsPage}`]);
  });

  it('should report unknown access for a repository the user can push to but no installation holds', async () => {
    const other = { ...installation(10, 'all'), id: 71 };
    routed({
      '/repositories/7': { ...movedRepository, private: false, visibility: 'public' },
      [installationsPage]: { total_count: 1, installations: [other] },
    });

    await expect(accessOf()).resolves.toBe('unknown');
  });

  it('should report unknown access when the owner installation is suspended', async () => {
    routed({
      '/repositories/7': movedRepository,
      [installationsPage]: { total_count: 1, installations: [installation(9, 'all', '2026-09-01T00:00:00Z')] },
    });

    await expect(accessOf()).resolves.toBe('unknown');
  });

  it('should find a repository on a later page of a selected-repositories installation', async () => {
    const filler = Array.from({ length: 100 }, (_, index) => ({ ...movedRepository, id: 1000 + index }));
    const urls = routed({
      '/repositories/7': movedRepository,
      [installationsPage]: { total_count: 1, installations: [installation(9, 'selected')] },
      [selectedPage(1)]: { total_count: 101, repositories: filler },
      [selectedPage(2)]: { total_count: 101, repositories: [movedRepository] },
    });

    await expect(accessOf()).resolves.toBe('write');
    expect(urls.at(-1)).toBe(`https://api.github.com${selectedPage(2)}`);

    routed({
      '/repositories/7': movedRepository,
      [installationsPage]: { total_count: 1, installations: [installation(9, 'selected')] },
      [selectedPage(1)]: { total_count: 1, repositories: [{ ...movedRepository, id: 8 }] },
    });
    await expect(accessOf()).resolves.toBe('unknown');
  });

  it('should read one branch whose name contains a slash', async () => {
    const urls = lookups({ name: 'feature/deep', commit: { sha: head } });
    const { github, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    await expect(github.branch('tau-user', connectionId, 7, 'feature/deep')).resolves.toStrictEqual({
      name: 'feature/deep',
      head,
    });
    expect(urls).toStrictEqual(['https://api.github.com/repositories/7/branches/feature/deep']);
  });

  it.each([undefined, '', '..', 'feature/../main', 'a//b', '/main'])(
    'should refuse the branch name %j without calling GitHub',
    async (name) => {
      const urls = lookups({});
      const { github, connect } = harness();
      connect(new Date(Date.now() + 3_600_000));

      await expect(github.branch('tau-user', connectionId, 7, name)).rejects.toMatchObject({
        status: 400,
        response: { code: 'GITHUB_BRANCH_INVALID' },
      });
      expect(urls).toStrictEqual([]);
    },
  );

  it('should answer 404 GITHUB_NOT_FOUND_OR_DENIED for a branch GitHub does not show', async () => {
    lookups({ message: 'Branch not found' }, { status: 404 });
    const { github, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    await expect(github.branch('tau-user', connectionId, 7, 'gone')).rejects.toMatchObject({
      status: 404,
      response: { code: 'GITHUB_NOT_FOUND_OR_DENIED' },
    });
  });
});

describe('GithubService rate limits', () => {
  it.each([
    { case: '429 with retry-after', status: 429, header: 'retry-after', value: '30', seconds: 30 },
    { case: 'secondary 403 with retry-after', status: 403, header: 'retry-after', value: '45', seconds: 45 },
    {
      case: 'primary 403 with no quota left',
      status: 403,
      header: 'x-ratelimit-remaining',
      value: '0',
      seconds: undefined,
    },
  ])('should map a $case to 429 GITHUB_RATE_LIMITED', async ({ status, header, value, seconds }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'limited' }, { status, headers: { [header]: value } })),
    );
    const { github, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    const rejection = github.repository('tau-user', '00000000-0000-4000-8000-000000000001', 7);
    await expect(rejection).rejects.toMatchObject({ status: 429, response: { code: 'GITHUB_RATE_LIMITED' } });
    await expect(rejection).rejects.toSatisfy(
      (error: { response: { retryAfterSeconds?: number } }) => error.response.retryAfterSeconds === seconds,
    );
  });

  it('should keep a plain 403 as GITHUB_ACCESS_REFUSED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'forbidden' }, { status: 403 })),
    );
    const { github, connect } = harness();
    connect(new Date(Date.now() + 3_600_000));

    await expect(github.repository('tau-user', '00000000-0000-4000-8000-000000000001', 7)).rejects.toMatchObject({
      status: 403,
      response: { code: 'GITHUB_ACCESS_REFUSED' },
    });
  });
});
