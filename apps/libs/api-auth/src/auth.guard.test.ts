/* oxlint-disable new-cap -- NestJS test decorators use PascalCase. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import type { Auth } from 'better-auth';
import { AuthGuard } from '#auth.guard.js';
import { authInstanceKey } from '#auth.constant.js';
import { AuthoritativeSession, PublicAuth, UseAuth, User } from '#decorators/auth.decorator.js';
import { SessionResolver } from '#session-resolver.js';
import { MetricsService } from '@taucad/api-observability/metrics';

const signedIn = {
  session: { id: 'session-1', token: 'token-1', userId: 'user-1' },
  user: { id: 'user-1', email: 'guard@example.test' },
};

@Controller('doubly-guarded')
@UseGuards(AuthGuard)
class DoublyGuardedController {
  @Get()
  @UseAuth()
  public read(@User('id') userId: string): { userId: string } {
    return { userId };
  }

  @Post()
  @UseAuth()
  public write(@User('id') userId: string): { userId: string } {
    return { userId };
  }

  @Get('marked')
  @AuthoritativeSession()
  public marked(@User('id') userId: string): { userId: string } {
    return { userId };
  }

  @Get('public')
  @PublicAuth()
  public open(): { ok: true } {
    return { ok: true };
  }
}

@Controller('marked-class')
@UseGuards(AuthGuard)
@AuthoritativeSession()
class MarkedController {
  @Get()
  public read(@User('id') userId: string): { userId: string } {
    return { userId };
  }
}

describe('AuthGuard', () => {
  const getSession = vi.fn();
  const metrics = mockDeep<MetricsService>();
  let app: NestFastifyApplication;
  let fastify: FastifyInstance;
  let resolve: MockInstance<SessionResolver['resolve']>;

  beforeAll(async () => {
    const auth = {
      api: { getSession },
      options: {},
      $context: Promise.resolve({ authCookies: { sessionData: { name: 'tau.session_data' } } }),
    } as unknown as Auth;
    const moduleRef = await Test.createTestingModule({
      controllers: [DoublyGuardedController, MarkedController],
      providers: [
        Reflector,
        AuthGuard,
        SessionResolver,
        { provide: authInstanceKey, useValue: auth },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();
    resolve = vi.spyOn(moduleRef.get(SessionResolver), 'resolve');
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
  });

  beforeEach(() => {
    getSession.mockImplementation(async () => ({ response: signedIn, headers: new Headers() }));
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['GET', 'POST'] as const)(
    'should resolve once and count once for a %s on a handler guarded at class and method level',
    async (method) => {
      const response = await fastify.inject({ method, url: '/doubly-guarded', headers: { cookie: 'a=1' } });

      expect(response.statusCode).toBe(method === 'GET' ? 200 : 201);
      expect(response.json()).toEqual({ userId: 'user-1' });
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(metrics.authSessionResolutions.add).toHaveBeenCalledTimes(1);
    },
  );

  it('should demand an authoritative read for a handler marked @AuthoritativeSession()', async () => {
    await fastify.inject({ method: 'GET', url: '/doubly-guarded/marked', headers: { cookie: 'a=1' } });

    expect(resolve.mock.calls[0]?.[0].authoritative).toBe(true);
  });

  it('should demand an authoritative read for a controller marked @AuthoritativeSession()', async () => {
    await fastify.inject({ method: 'GET', url: '/marked-class', headers: { cookie: 'a=1' } });

    expect(resolve.mock.calls[0]?.[0].authoritative).toBe(true);
  });

  it('should not demand an authoritative read for an unmarked GET', async () => {
    await fastify.inject({ method: 'GET', url: '/doubly-guarded', headers: { cookie: 'a=1' } });

    expect(resolve.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', authoritative: false });
  });

  it('should not resolve a session on a @PublicAuth() route', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/doubly-guarded/public' });

    expect(response.statusCode).toBe(200);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('should refuse a request without a session', async () => {
    getSession.mockImplementation(async () => ({ response: null, headers: new Headers() }));

    const response = await fastify.inject({ method: 'GET', url: '/doubly-guarded' });

    expect(response.statusCode).toBe(401);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
