/* eslint-disable @typescript-eslint/naming-convention -- fixtures preserve environment variable names. */
import { HttpException, HttpStatus, Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { GithubController } from '#api/github/github.controller.js';
import { GithubService } from '#api/github/github.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import type { Environment } from '#config/environment.config.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import type { DatabaseService } from '#database/database.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import type { RedisService } from '#redis/redis.service.js';

const frontend = 'https://tau.test';
const configured: Partial<Environment> = {
  GITHUB_REPOSITORY_APP_CLIENT_ID: 'client-id',
  GITHUB_REPOSITORY_APP_CLIENT_SECRET: 'client-secret',
  GITHUB_REPOSITORY_APP_CALLBACK_URL: 'https://api.tau.test/v1/github/callback',
  GITHUB_REPOSITORY_APP_SLUG: 'tau-test',
  GITHUB_REPOSITORY_CONNECTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
  GITHUB_REPOSITORY_CONNECTION_KEY_VERSION: 1,
  TAU_FRONTEND_URL: frontend,
};
const instant = new Date('2026-09-23T00:00:00.000Z');
const signedIn = {
  user: {
    id: 'tau-user',
    name: 'Tau',
    email: 'tau@test.invalid',
    emailVerified: true,
    createdAt: instant,
    updatedAt: instant,
    image: null,
  },
  session: {
    id: 'session-1',
    userId: 'tau-user',
    token: 'test-session',
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    createdAt: instant,
    updatedAt: instant,
    ipAddress: null,
    userAgent: null,
  },
};

const withApp = async (
  environment: Partial<Environment>,
  run: (context: {
    app: NestFastifyApplication;
    auth: ReturnType<typeof mockDeep<Auth>>;
    github: GithubService;
  }) => Promise<void>,
): Promise<void> => {
  const config = mock<ConfigService<Environment, true>>();
  config.get.mockImplementation((key: keyof Environment) => environment[key]);
  const redis = mockDeep<RedisService>();
  redis.client.set.mockResolvedValue('OK');
  redis.client.getdel.mockResolvedValue(null);
  const github = new GithubService(config, mockDeep<DatabaseService>(), redis);
  const auth = mockDeep<Auth>();
  auth.api.getSession.mockResolvedValue(null);
  const module = await Test.createTestingModule({
    controllers: [GithubController],
    providers: [
      Reflector,
      AuthGuard,
      { provide: authInstanceKey, useValue: auth },
      { provide: ConfigService, useValue: config },
      { provide: GithubService, useValue: github },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ ...corsBaseConfiguration, origin: true });
  app.enableVersioning({ type: VersioningType.URI });
  try {
    await app.init();
    await run({ app, auth, github });
  } finally {
    await app.close();
  }
};

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('GithubController over HTTP', () => {
  it('should reach authentication (401, not a 400 body error) for bodiless token, remove and cancel requests', async () => {
    await withApp(configured, async ({ app, github }) => {
      const token = vi.spyOn(github, 'token');
      const remove = vi.spyOn(github, 'remove');
      const cancel = vi.spyOn(github, 'cancel');

      const responses = await Promise.all([
        app.inject({ method: 'POST', url: '/v1/github/connections/connection-1/token' }),
        app.inject({ method: 'DELETE', url: '/v1/github/connections/connection-1' }),
        app.inject({ method: 'DELETE', url: '/v1/github/connection-attempts/00000000-0000-4000-8000-000000000001' }),
      ]);

      expect(responses.map((response) => [response.statusCode, response.json<{ code: string }>().code])).toStrictEqual([
        [401, 'UNAUTHORIZED'],
        [401, 'UNAUTHORIZED'],
        [401, 'UNAUTHORIZED'],
      ]);
      expect(token).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    });
  });

  it('should pass a signed-in bodiless token request to the service', async () => {
    await withApp(configured, async ({ app, auth, github }) => {
      auth.api.getSession.mockResolvedValue(signedIn);
      const token = vi
        .spyOn(github, 'token')
        .mockResolvedValue({ accessToken: 'app-token', expiresAt: instant.toISOString(), generation: 2 });

      const response = await app.inject({ method: 'POST', url: '/v1/github/connections/connection-1/token' });

      expect(response.statusCode).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(token).toHaveBeenCalledWith('tau-user', 'connection-1');
    });
  });

  it('should answer a signed-in disconnect and attempt cancel with 204 and no body', async () => {
    await withApp(configured, async ({ app, auth, github }) => {
      auth.api.getSession.mockResolvedValue(signedIn);
      const remove = vi.spyOn(github, 'remove').mockResolvedValue();
      const cancel = vi.spyOn(github, 'cancel').mockResolvedValue();
      const attemptId = '00000000-0000-4000-8000-000000000001';

      const [removed, cancelled] = await Promise.all([
        app.inject({ method: 'DELETE', url: '/v1/github/connections/connection-1' }),
        app.inject({ method: 'DELETE', url: `/v1/github/connection-attempts/${attemptId}` }),
      ]);

      expect([removed.statusCode, removed.body, cancelled.statusCode, cancelled.body]).toStrictEqual([
        204,
        '',
        204,
        '',
      ]);
      expect(remove).toHaveBeenCalledWith('tau-user', 'connection-1');
      expect(cancel).toHaveBeenCalledWith('tau-user', 'session-1', attemptId);
    });
  });

  it('should answer 503 GITHUB_CONNECTION_UNAVAILABLE for the configuration probe when the App is unconfigured', async () => {
    await withApp({ TAU_FRONTEND_URL: frontend }, async ({ app, auth }) => {
      auth.api.getSession.mockResolvedValue(signedIn);

      const response = await app.inject({ method: 'GET', url: '/v1/github/configuration' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'GITHUB_CONNECTION_UNAVAILABLE' });
    });
  });

  it.each([
    [{ returnTo: 5 }, 'RETURN_LOCATION_INVALID'],
    [{ returnTo: ['/import'] }, 'RETURN_LOCATION_INVALID'],
    [{ returnTo: '/\\evil.example' }, 'RETURN_LOCATION_INVALID'],
    [{ returnTo: '//evil.example' }, 'RETURN_LOCATION_INVALID'],
    [{ returnTo: '/import', completionMode: 'popup' }, 'GITHUB_COMPLETION_MODE_INVALID'],
  ])('should refuse the start body %j with 400 %s', async (payload, code) => {
    await withApp(configured, async ({ app, auth }) => {
      auth.api.getSession.mockResolvedValue(signedIn);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/github/connections/start',
        headers: { origin: frontend },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code });
    });
  });

  it('should start a bodiless request with the default return location', async () => {
    await withApp(configured, async ({ app, auth }) => {
      auth.api.getSession.mockResolvedValue(signedIn);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/github/connections/start',
        headers: { origin: frontend },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ attemptId: string; authorizationUrl: string }>();
      expect(new URL(body.authorizationUrl).origin).toBe('https://github.com');
      expect(body.attemptId).toMatch(/^[0-9a-f-]{36}$/u);
    });
  });

  it.each([
    [`/v1/github/callback?error=access_denied&state=${'s'.repeat(32)}`, 'GITHUB_CONSENT_DENIED'],
    ['/v1/github/callback', 'GITHUB_CALLBACK_EXPIRED'],
    [`/v1/github/callback?state=${'s'.repeat(32)}&code=${'c'.repeat(32)}`, 'GITHUB_CALLBACK_EXPIRED'],
  ])('should redirect the signed-out callback %s to the completion page with %s', async (url, code) => {
    await withApp(configured, async ({ app }) => {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`${frontend}/github/complete?error=${code}`);
      expect(response.body).toBe('');
    });
  });

  it('should route the repository and single-branch lookups by stable id', async () => {
    await withApp(configured, async ({ app, auth, github }) => {
      auth.api.getSession.mockResolvedValue(signedIn);
      const repository = vi.spyOn(github, 'repository').mockResolvedValue({ id: 7 });
      const branch = vi.spyOn(github, 'branch').mockResolvedValue({ name: 'feature/x', head: 'c'.repeat(40) });

      const [byId, byName, invalidId] = await Promise.all([
        app.inject({ method: 'GET', url: '/v1/github/repositories/7?connectionId=connection-1' }),
        app.inject({
          method: 'GET',
          url: '/v1/github/repositories/7/branch?connectionId=connection-1&name=feature%2Fx',
        }),
        app.inject({ method: 'GET', url: '/v1/github/repositories/seven?connectionId=connection-1' }),
      ]);

      expect(byId.json()).toStrictEqual({ id: 7 });
      expect(byName.json()).toStrictEqual({ name: 'feature/x', head: 'c'.repeat(40) });
      expect(repository).toHaveBeenCalledWith('tau-user', 'connection-1', 7);
      expect(branch).toHaveBeenCalledWith('tau-user', 'connection-1', 7, 'feature/x');
      expect(invalidId.statusCode).toBe(400);
      expect(invalidId.json()).toMatchObject({ code: 'GITHUB_ID_INVALID' });
    });
  });

  it('should expose the retry estimate of a rate-limited answer to the cross-origin client', async () => {
    await withApp(configured, async ({ app, auth, github }) => {
      auth.api.getSession.mockResolvedValue(signedIn);
      vi.spyOn(github, 'installations').mockRejectedValue(
        new HttpException(
          { code: 'GITHUB_RATE_LIMITED', message: 'GitHub rate limit reached.', retryAfterSeconds: 12 },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/github/installations?connectionId=connection-1',
        headers: { origin: frontend },
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('12');
      expect(String(response.headers['access-control-expose-headers']).split(/,\s*/u)).toContain('retry-after');
    });
  });
});
