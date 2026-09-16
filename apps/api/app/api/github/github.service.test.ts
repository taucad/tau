/* eslint-disable @typescript-eslint/naming-convention -- fixtures preserve environment and GitHub wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const service = (
  insertRow: (row: Record<string, unknown>) => Promise<ReadonlyArray<Record<string, unknown>>> = async (row) => [row],
): GithubService => {
  const values = new Map<string, string>();
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
      query: { githubConnection: { findFirst: vi.fn(async () => undefined) } },
      insert: vi.fn(() => ({
        values: (row: Record<string, unknown>) => ({ returning: async () => insertRow(row) }),
      })),
    },
  } as unknown as DatabaseService;
  const config = {
    get: (key: keyof Environment) => configuration[key],
  } as unknown as ConfigService<Environment, true>;
  return new GithubService(config, database, redis);
};

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

    const callback = await github.callback(state, 'a'.repeat(32));
    expect(callback).toEqual({ attemptId: started.attemptId, returnTo: '/import', completionMode: 'desktop-poll' });
    await expect(github.callback(state, 'a'.repeat(32))).rejects.toThrow();

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
    await expect(github.callback(state, 'a'.repeat(32))).rejects.toThrow();
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
      repository: (repository: Record<string, unknown>) => { access: string };
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

    expect(github.repository(repository).access).toBe('read');
    expect(github.repository({ ...repository, archived: false, disabled: true }).access).toBe('read');
  });
});
