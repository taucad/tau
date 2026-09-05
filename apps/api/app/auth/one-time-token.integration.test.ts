/* oxlint-disable new-cap -- NestJS test decorators use PascalCase. */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { fromNodeHeaders } from 'better-auth/node';
import { AuthGuard } from '#auth/auth.guard.js';
import { staticAuthConfig } from '#config/auth.js';
import { authInstanceKey } from '#constants/auth.constant.js';

const testEmail = 'one-time-token@example.test';
const testPassword = 'correct horse battery staple';

type VerificationRow = { identifier: string; value: string; expiresAt: Date };

const authStore: { verification: VerificationRow[] } & Record<string, unknown[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
  apikey: [],
  subscription: [],
};

const auth = betterAuth({
  ...staticAuthConfig,
  baseURL: 'http://127.0.0.1',
  database: memoryAdapter(authStore),
  secret: 'one-time-token-integration-secret-32-chars',
  rateLimit: { enabled: false },
  // Email verification is orthogonal to this handoff transport test.
  emailAndPassword: { ...staticAuthConfig.emailAndPassword, requireEmailVerification: false },
});

/** Mirrors the plugin's `defaultKeyHasher`: unpadded base64url of SHA-256. */
const hashOneTimeToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

/**
 * The exact header set Electron main injects via `onBeforeSendHeaders` (batch A
 * item A4 + the batch U client-compat header). No cookie ever rides along.
 */
const injectedDesktopHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- wire header name
  'tau-client': 'tau-desktop/0.0.0',
});

describe('Better Auth one-time-token desktop handoff', () => {
  let app: NestFastifyApplication;
  let fastify: FastifyInstance;
  let testUserId: string;

  const callAuth = async (options: {
    method: 'GET' | 'POST';
    path: string;
    body?: Record<string, string>;
    headers?: Record<string, string>;
  }) =>
    fastify.inject({
      method: options.method,
      url: `/v1/auth/${options.path}`,
      payload: options.body,
      headers: options.headers,
    });

  const signIn = async () => {
    const response = await callAuth({
      method: 'POST',
      path: 'sign-in/email',
      body: { email: testEmail, password: testPassword },
    });
    const header = response.headers['set-auth-token'];
    const token = Array.isArray(header) ? header[0] : header;

    if (typeof token !== 'string' || token === '') {
      throw new Error(`Email sign-in did not return set-auth-token (HTTP ${response.statusCode}).`);
    }

    return token;
  };

  /** Everything the `/auth/desktop` web route does, minus the browser navigation. */
  const generateOneTimeToken = async (sessionToken: string) => {
    const response = await callAuth({
      method: 'GET',
      path: 'one-time-token/generate',
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    if (response.statusCode !== 200) {
      throw new Error(`one-time-token/generate failed with ${response.statusCode}: ${response.body}`);
    }

    return response.json<{ token: string }>().token;
  };

  /** Everything Electron main's loopback handler does: cookie-less, origin-less POST. */
  const verifyOneTimeToken = async (oneTimeTokenValue: string) =>
    callAuth({ method: 'POST', path: 'one-time-token/verify', body: { token: oneTimeTokenValue } });

  /** What every authenticated Tau surface does with the desktop's injected headers. */
  const sessionFor = async (headers: Record<string, string>) =>
    auth.api.getSession({ headers: fromNodeHeaders(headers) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [Reflector, AuthGuard, { provide: authInstanceKey, useValue: auth }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI });

    fastify = app.getHttpAdapter().getInstance();
    fastify.all('/v1/auth/*', async (request, reply) => {
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

    const signUp = await callAuth({
      method: 'POST',
      path: 'sign-up/email',
      body: { email: testEmail, name: 'One Time Token User', password: testPassword },
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

  it('refuses to mint a one-time token without a session', async () => {
    const response = await callAuth({ method: 'GET', path: 'one-time-token/generate' });

    expect(response.statusCode).toBe(401);
  });

  it('mints a one-time token for a bearer-authenticated session', async () => {
    const sessionToken = await signIn();
    const response = await callAuth({
      method: 'GET',
      path: 'one-time-token/generate',
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ token: string }>().token).toEqual(expect.any(String));
  });

  it('stores only a hash of the one-time token in the verification table', async () => {
    const oneTimeTokenValue = await generateOneTimeToken(await signIn());
    const identifiers = authStore.verification.map((row) => row.identifier);

    expect(identifiers).toContain(`one-time-token:${hashOneTimeToken(oneTimeTokenValue)}`);
    expect(identifiers).not.toContain(`one-time-token:${oneTimeTokenValue}`);
    expect(JSON.stringify(authStore.verification)).not.toContain(oneTimeTokenValue);
  });

  it('exchanges a one-time token for a bearer session token via set-auth-token', async () => {
    const oneTimeTokenValue = await generateOneTimeToken(await signIn());
    const response = await verifyOneTimeToken(oneTimeTokenValue);

    expect(response.statusCode).toBe(200);
    const header = response.headers['set-auth-token'];
    const exchanged = Array.isArray(header) ? header[0] : header;
    expect(exchanged).toEqual(expect.any(String));
    expect(exchanged).not.toBe('');
  });

  it('rejects a replayed one-time token', async () => {
    const oneTimeTokenValue = await generateOneTimeToken(await signIn());
    const first = await verifyOneTimeToken(oneTimeTokenValue);
    const replay = await verifyOneTimeToken(oneTimeTokenValue);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(400);
  });

  it('rejects an expired one-time token', async () => {
    const oneTimeTokenValue = await generateOneTimeToken(await signIn());
    const identifier = `one-time-token:${hashOneTimeToken(oneTimeTokenValue)}`;
    const row = authStore.verification.find((candidate) => candidate.identifier === identifier);
    if (!row) {
      throw new Error('Generated one-time token was not persisted.');
    }
    row.expiresAt = new Date(Date.now() - 1000);
    const response = await verifyOneTimeToken(oneTimeTokenValue);

    expect(response.statusCode).toBe(400);
  });

  it('rejects a garbage one-time token', async () => {
    const response = await verifyOneTimeToken('not-a-real-one-time-token');

    expect(response.statusCode).toBe(400);
  });

  // A5: the desktop path end to end — main exchanges the OTT for a bearer token
  // and injects it into every request the renderer cannot decorate itself.
  it('authenticates the injected desktop headers with the exchanged token', async () => {
    const oneTimeTokenValue = await generateOneTimeToken(await signIn());
    const response = await verifyOneTimeToken(oneTimeTokenValue);
    const header = response.headers['set-auth-token'];
    const exchanged = Array.isArray(header) ? header[0] : header;
    if (typeof exchanged !== 'string' || exchanged === '') {
      throw new Error('One-time-token verification did not emit set-auth-token.');
    }

    const headers = injectedDesktopHeaders(exchanged);
    const session = await sessionFor(headers);

    expect(session?.user.id).toBe(testUserId);
    expect(headers).not.toHaveProperty('cookie');
  });

  it('rejects a one-time token presented as a bearer token', async () => {
    const oneTimeTokenValue = await generateOneTimeToken(await signIn());

    await expect(sessionFor(injectedDesktopHeaders(oneTimeTokenValue))).resolves.toBeNull();
  });
});
