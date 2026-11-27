import { VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AuthGuard, SessionResolver } from '@taucad/api-auth';
import { fakeSessionResolver } from '@taucad/api-auth/testing';
import type { FakeSessionLookup } from '@taucad/api-auth/testing';
import { AccountController } from '#api/account/account.controller.js';
import { AccountService } from '#api/account/account.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

const instant = new Date('2026-11-27T00:00:00.000Z');
const user = {
  id: 'user-a',
  name: 'Owner',
  email: 'owner@test.invalid',
  emailVerified: true,
  createdAt: instant,
  updatedAt: instant,
  image: null,
};
const session = {
  id: 'family-a',
  userId: user.id,
  token: 'session-token-never-answered',
  expiresAt: instant,
  createdAt: instant,
  updatedAt: instant,
  ipAddress: null,
  userAgent: null,
};

const withApp = async (
  client: 'web' | 'desktop',
  run: (app: NestFastifyApplication, service: ReturnType<typeof mock<AccountService>>) => Promise<void>,
): Promise<void> => {
  const getSession = vi.fn<FakeSessionLookup>().mockResolvedValue({ user, session, client });
  const service = mock<AccountService>();
  const module = await Test.createTestingModule({
    controllers: [AccountController],
    providers: [
      Reflector,
      AuthGuard,
      { provide: SessionResolver, useValue: fakeSessionResolver(getSession) },
      { provide: AccountService, useValue: service },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableVersioning({ type: VersioningType.URI });
  try {
    await app.init();
    await run(app, service);
  } finally {
    await app.close();
  }
};

describe('AccountController', () => {
  it.each(['web', 'desktop'] as const)('should answer the %s client its identity without a token', async (client) => {
    await withApp(client, async (app) => {
      const response = await app.inject({ method: 'GET', url: '/v1/account/session' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ session: { id: 'family-a', token: '' }, user: { id: user.id } });
      expect(response.body).not.toContain('session-token-never-answered');
    });
  });

  it('should list and revoke desktop sign-ins for a web session', async () => {
    await withApp('web', async (app, service) => {
      service.listDesktopSignIns.mockResolvedValue([]);
      service.revokeDesktopSignIn.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const list = await app.inject({ method: 'GET', url: '/v1/account/desktop-sign-ins' });
      const revoked = await app.inject({ method: 'POST', url: '/v1/account/desktop-sign-ins/family-a/revoke' });
      const missing = await app.inject({ method: 'POST', url: '/v1/account/desktop-sign-ins/family-x/revoke' });

      expect(list.json()).toEqual({ signIns: [] });
      expect(revoked.statusCode).toBe(204);
      expect(service.revokeDesktopSignIn).toHaveBeenCalledWith(user.id, 'family-a');
      expect(missing.statusCode).toBe(404);
    });
  });

  it('should refuse sign-in management to Tau Desktop', async () => {
    await withApp('desktop', async (app, service) => {
      const list = await app.inject({ method: 'GET', url: '/v1/account/desktop-sign-ins' });
      const revoke = await app.inject({ method: 'POST', url: '/v1/account/desktop-sign-ins/family-a/revoke' });

      expect(list.statusCode).toBe(403);
      expect(list.json()).toMatchObject({ code: 'WEB_SESSION_REQUIRED' });
      expect(revoke.statusCode).toBe(403);
      expect(service.revokeDesktopSignIn).not.toHaveBeenCalled();
    });
  });
});
