/* oxlint-disable new-cap -- NestJS test decorators use PascalCase. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Req, UseGuards, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { fromNodeHeaders } from 'better-auth/node';
import { AuthGuard } from '#auth/auth.guard.js';
import { staticAuthConfig } from '#config/auth.js';
import { authInstanceKey } from '#constants/auth.constant.js';

const testEmail = 'bearer-auth@example.test';
const testPassword = 'correct horse battery staple';
const authStore = { user: [], session: [], account: [], verification: [], apikey: [], subscription: [] };
const auth = betterAuth({
  ...staticAuthConfig,
  baseURL: 'http://127.0.0.1',
  database: memoryAdapter(authStore),
  secret: 'bearer-auth-integration-secret-32-characters',
  rateLimit: { enabled: false },
  // Email verification is orthogonal to this transport test.
  emailAndPassword: { ...staticAuthConfig.emailAndPassword, requireEmailVerification: false },
});

type AuthenticatedRequest = FastifyRequest & {
  user?: { id: string; email: string; name: string };
};

@Controller({ path: 'bearer-auth-test', version: '1' })
@UseGuards(AuthGuard)
class BearerAuthTestController {
  @Get()
  public whoAmI(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}

describe('Better Auth bearer transport', () => {
  let app: NestFastifyApplication;
  let fastify: FastifyInstance;
  let signInOrigin: string | string[] | undefined;
  let testUserId: string;

  const postAuth = async (options: { path: string; body: Record<string, string>; headers?: Record<string, string> }) =>
    fastify.inject({
      method: 'POST',
      url: `/v1/auth/${options.path}`,
      payload: options.body,
      headers: options.headers,
    });

  const signIn = async () => {
    const response = await postAuth({
      path: 'sign-in/email',
      body: { email: testEmail, password: testPassword },
    });
    const header = response.headers['set-auth-token'];
    const token = Array.isArray(header) ? header[0] : header;

    if (typeof token !== 'string' || token === '') {
      throw new Error(`Email sign-in did not return set-auth-token (HTTP ${response.statusCode}).`);
    }

    return { response, token };
  };

  const guardedRequest = async (headers: Record<string, string>) =>
    fastify.inject({
      method: 'GET',
      url: '/v1/bearer-auth-test',
      headers,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BearerAuthTestController],
      providers: [Reflector, AuthGuard, { provide: authInstanceKey, useValue: auth }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI });

    fastify = app.getHttpAdapter().getInstance();
    fastify.all('/v1/auth/*', async (request, reply) => {
      if (request.url === '/v1/auth/sign-in/email') {
        signInOrigin = request.headers.origin;
      }

      const response = await auth.handler(
        new Request(new URL(request.url, `http://${request.headers.host}`).toString(), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        }),
      );

      void reply.status(response.status);
      // oxlint-disable-next-line unicorn/no-array-for-each -- Headers are not an array or iterable in the API tsconfig.
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    });

    await app.init();
    await fastify.ready();

    const signUp = await postAuth({
      path: 'sign-up/email',
      body: {
        email: testEmail,
        name: 'Bearer Auth User',
        password: testPassword,
      },
    });
    if (signUp.statusCode < 200 || signUp.statusCode >= 300) {
      throw new Error(`Test user sign-up failed with ${signUp.statusCode}: ${signUp.body}`);
    }

    const signUpBody = JSON.parse(signUp.body) as { user?: { id?: string } };
    if (!signUpBody.user?.id) {
      throw new Error('Test user sign-up did not return a user id.');
    }
    testUserId = signUpBody.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts an origin-less email sign-in and returns a bearer session token', async () => {
    const response = await postAuth({
      path: 'sign-in/email',
      body: { email: testEmail, password: testPassword },
    });

    expect(signInOrigin).toBeUndefined();
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-auth-token']).toBeTruthy();
  });

  it('authenticates a guarded HTTP endpoint with only the bearer session token', async () => {
    const { token } = await signIn();
    const response = await guardedRequest({ authorization: `Bearer ${token}` });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ user: { id: string; email: string } }>();
    expect(body.user).toMatchObject({ id: testUserId, email: testEmail });
  });

  it('rejects a garbage bearer token at a guarded HTTP endpoint', async () => {
    const response = await guardedRequest({ authorization: 'Bearer garbage-token' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a revoked bearer session token at a guarded HTTP endpoint', async () => {
    const { token } = await signIn();

    await expect(
      auth.api.revokeSessions({ headers: new Headers({ authorization: `Bearer ${token}` }) }),
    ).resolves.toEqual({ status: true });

    const response = await guardedRequest({ authorization: `Bearer ${token}` });
    expect(response.statusCode).toBe(401);
  });

  it('keeps cookie-only browser authentication working', async () => {
    const { response: signInResponse } = await signIn();
    const setCookie = signInResponse.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.split(';', 1)[0])
      .join('; ');

    expect(cookie).not.toBe('');
    const response = await guardedRequest({ cookie });
    expect(response.statusCode).toBe(200);
  });
});
