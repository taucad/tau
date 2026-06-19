import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import cookie from '@fastify/cookie';
import fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Mirrors apps/api/app/main.ts: cookie registration must accept signing secrets from env schema (≥32 chars). */
describe('@fastify/cookie registration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify();
    await app.register(cookie, {
      secret: 'test-view-cookie-secret-min-32-chars',
      hook: 'onRequest',
    });
    app.get('/set', (_request: FastifyRequest, reply: FastifyReply) => {
      void reply.setCookie('tau_view_id', 'signed-value', {
        signed: true,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
      return reply.send('ok');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should emit a signed Set-Cookie header without throwing', async () => {
    const response = await app.inject({ method: 'GET', url: '/set' });
    expect(response.statusCode).toBe(200);
    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const headerValue = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(headerValue).toContain('tau_view_id=');
  });
});
